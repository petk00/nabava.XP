const express = require('express');
const router = express.Router();
const multer = require('multer');
const authenticateToken = require('../middleware/authMiddleware');
const { runAssistantChat } = require('../services/assistantOrchestrator');
const { extractQuoteText, QuoteExtractionError } = require('../services/quoteExtractionService');
const { detectMimeTypeFromBuffer } = require('../services/fileTypeService');
const { getSetting, setSetting, SETTING_KEYS } = require('../config/appSettings');

// Slika ponude ide izravno modelu (vision), PDF se i dalje čita server-side
// (quoteExtractionService) — vidi assistantOrchestrator.js.
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png'];

const ALLOWED_PROVIDERS = ['ollama', 'gemini'];
// 'tool' i assistant-s-tool_calls poruke se pojavljuju kad klijent ponovno
// šalje tool_trace iz prijašnjeg odgovora (vidi assistantOrchestrator.js) —
// bez toga se strukturna potvrda za priloge (propose_request -> create_request)
// ne bi mogla provjeriti u idućem zahtjevu.
const ALLOWED_ROLES_IN_MESSAGE = ['user', 'assistant', 'system', 'tool'];

// Ponuda je tipično kratak (1-2 stranice) PDF — manji limit nego kod
// formalnih Ponuda/Otpremnica dokumenata na zahtjevu (requestAttachmentRoutes.js: 10MB).
const MAX_QUOTE_FILE_SIZE = 5 * 1024 * 1024;

// Datoteka se drži samo u memoriji — koristi se isključivo za ekstrakciju
// teksta, ne persistira se na disk (nije formalni "Ponuda" dokument na
// zahtjevu, zahtjev u ovom trenutku razgovora još ni ne postoji).
const uploadQuote = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_QUOTE_FILE_SIZE },
});

const requireAdmin = (req, res, next) => {
  if (req.user?.role_name !== 'Administrator') {
    return res.status(403).json({ message: 'Pristup dozvoljen samo administratoru.' });
  }
  next();
};

/**
 * POST /api/assistant/chat
 * Chat kroz aktivni LlmProvider (Ollama ili Gemini, ovisno o runtime
 * postavci), s function-calling petljom koja agentu omogućuje da stvarno
 * kreira zahtjev za nabavu (create_request tool, docs/AI.md) — uvijek u
 * autentikacijskom kontekstu prijavljenog korisnika, nikad s većim pravima.
 *
 * Prihvaća ili obični JSON ({ messages }) ili multipart/form-data s
 * dodatnim opcionalnim prilogom (polje "file") — PDF ili slika (JPG/PNG), u
 * tom slučaju "messages" stiže kao JSON string u istom form polju. PDF tekst
 * se izvlači JEDNOM, server-side (quoteExtractionService), prije poziva
 * providera — isti tekst ide oba providera, bez oslanjanja na vlastitu
 * vision sposobnost pojedinog modela. Slika NE prolazi kroz OCR/ekstrakciju
 * — sirovi bajtovi idu izravno providerovom nativnom vision parametru
 * (namjerno — ovdje se upravo testira vizualna sposobnost modela).
 *
 * Odgovor sadrži i "tool_trace" (nove assistant/tool poruke iz ovog poteza,
 * npr. propose_request poziv i rezultat) — klijent ih MORA dodati u svoju
 * povijest poruka prije sljedećeg zahtjeva. Bez toga server u idućem
 * zahtjevu ne može provjeriti da je korisnik stvarno vidio i potvrdio
 * prijedlog prije create_request kad razgovor kreće od priloga.
 */
router.post('/chat', authenticateToken, uploadQuote.single('file'), async (req, res) => {
  let messages = req.body.messages;
  if (typeof messages === 'string') {
    try {
      messages = JSON.parse(messages);
    } catch {
      return res.status(400).json({
        message: '"messages" mora biti valjan JSON niz kad se šalje kao multipart polje.',
      });
    }
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      message: '"messages" je obavezno polje i mora biti neprazan niz.',
    });
  }

  for (const [idx, m] of messages.entries()) {
    if (!m || typeof m.content !== 'string' || !ALLOWED_ROLES_IN_MESSAGE.includes(m.role)) {
      return res.status(400).json({
        message: `Poruka #${idx + 1}: "role" (user/assistant/system/tool) i "content" (string) su obavezni.`,
      });
    }
    // Prazan content je dozvoljen samo za echo tool_trace poruke: assistant
    // poruke koje su bile tool_call (content je tad tipično prazan) i tool
    // rezultate (uvijek imaju JSON u contentu, ali tehnički mogu biti "{}").
    const isToolTraceMessage = m.role === 'tool' || (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0);
    if (!isToolTraceMessage && !m.content.trim()) {
      return res.status(400).json({
        message: `Poruka #${idx + 1}: "content" ne smije biti prazan.`,
      });
    }
  }

  let quoteText = null;
  let quoteImage = null;
  if (req.file) {
    // Magic-bytes odlučuje granu, ne deklarirani mimetype — isti princip kao
    // i za PDF do sad. PDF ide postojećim tekstualnim putem
    // (quoteExtractionService); slika NE prolazi kroz njega — sirovi bajtovi
    // idu izravno providerovom nativnom vision parametru (docs/AI.md).
    const detectedMime = await detectMimeTypeFromBuffer(req.file.buffer).catch(() => null);

    if (detectedMime === 'application/pdf') {
      try {
        quoteText = await extractQuoteText(req.file.buffer);
      } catch (error) {
        if (error instanceof QuoteExtractionError) {
          return res.status(400).json({ message: error.message });
        }
        console.error('POST /api/assistant/chat quote extraction error:', error);
        return res.status(500).json({ message: 'Greška pri obradi priložene ponude.' });
      }
    } else if (IMAGE_MIME_TYPES.includes(detectedMime)) {
      quoteImage = { mimeType: detectedMime, base64: req.file.buffer.toString('base64') };
    } else {
      return res.status(400).json({ message: 'Priložena datoteka mora biti PDF ili slika (JPG/PNG).' });
    }
  }

  try {
    const result = await runAssistantChat({ messages, userId: req.user.id_user, quoteText, quoteImage });
    return res.json({
      text: result.text,
      created_request: result.created_request,
      tool_trace: result.tool_trace,
    });
  } catch (error) {
    console.error('POST /api/assistant/chat error:', error);
    return res.status(502).json({
      message: 'AI asistent trenutno nije dostupan. Pokušajte ponovno.',
    });
  }
});

/**
 * GET /api/assistant/settings
 * Trenutni AI toggle (samo administrator).
 */
router.get('/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const provider = await getSetting(SETTING_KEYS.AI_PROVIDER);
    const geminiModel = await getSetting(SETTING_KEYS.GEMINI_MODEL);
    return res.json({ provider, gemini_model: geminiModel });
  } catch (error) {
    console.error('GET /api/assistant/settings error:', error);
    return res.status(500).json({ message: 'Greška pri dohvaćanju AI postavki.' });
  }
});

/**
 * PUT /api/assistant/settings
 * Mijenja aktivni provider i/ili Gemini model — runtime, bez restarta
 * servera (samo administrator).
 */
router.put('/settings', authenticateToken, requireAdmin, async (req, res) => {
  const { provider, gemini_model: geminiModel } = req.body;

  if (provider === undefined && geminiModel === undefined) {
    return res.status(400).json({
      message: 'Barem jedno polje ("provider" ili "gemini_model") mora biti poslano.',
    });
  }

  if (provider !== undefined && !ALLOWED_PROVIDERS.includes(provider)) {
    return res.status(400).json({
      message: `Nepoznat provider. Dozvoljeno: ${ALLOWED_PROVIDERS.join(', ')}.`,
    });
  }

  if (geminiModel !== undefined && (typeof geminiModel !== 'string' || !geminiModel.trim())) {
    return res.status(400).json({
      message: '"gemini_model" mora biti neprazan niz znakova.',
    });
  }

  try {
    if (provider !== undefined) {
      await setSetting(SETTING_KEYS.AI_PROVIDER, provider);
    }
    if (geminiModel !== undefined) {
      await setSetting(SETTING_KEYS.GEMINI_MODEL, geminiModel.trim());
    }

    return res.json({
      message: 'AI postavke ažurirane.',
      provider: await getSetting(SETTING_KEYS.AI_PROVIDER),
      gemini_model: await getSetting(SETTING_KEYS.GEMINI_MODEL),
    });
  } catch (error) {
    console.error('PUT /api/assistant/settings error:', error);
    return res.status(500).json({ message: 'Greška pri ažuriranju AI postavki.' });
  }
});

// Multer greške (npr. prevelika datoteka) inače padaju na generički 500
// handler u index.js — ovdje ih mapiramo na jasan, korisniku razumljiv odgovor.
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      message: `Priložena datoteka je prevelika (maksimalno ${MAX_QUOTE_FILE_SIZE / (1024 * 1024)} MB).`,
    });
  }
  next(err);
});

module.exports = router;
