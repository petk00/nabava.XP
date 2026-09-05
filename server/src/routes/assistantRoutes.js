// Postavke AI asistenta (docs/AI.md). Ovdje je ostala SAMO administratorska
// runtime konfiguracija — koji je provider zadani, koji lokalni model iz
// kataloga i koji Gemini model.
//
// Chat asistenta (POST /api/assistant/chat, function-calling petlja s
// alatima create_request/propose_request) uklonjen je iz sustava: jedini put
// kojim model danas dira podatke je POST /api/requests/:id/ai-items — čitanje
// već priložene ponude i zamjena stavki i iznosa postojećeg zahtjeva
// (itemExtractionService.js). Ta ruta provider bira PO POZIVU, pa ova
// postavka za nju znači samo "zadani ako ime nije poslano".

const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware');
const { getSetting, setSetting, SETTING_KEYS } = require('../config/appSettings');
const { OLLAMA_MODELS } = require('../services/llm/ollamaModels');
const { PROVIDER_KEYS } = require('../services/llm/providerSelector');

// Katalog lokalnih modela je jedini izvor istine u ollamaModels.js — ovdje se
// samo validira, a cijeli se popis šalje klijentu (GET /settings) da UI ne
// mora držati vlastitu, koja bi se s vremenom razišla.
const ALLOWED_OLLAMA_MODELS = OLLAMA_MODELS.map((m) => m.value);

const requireAdmin = (req, res, next) => {
  if (req.user?.role_name !== 'Administrator') {
    return res.status(403).json({ message: 'Pristup dozvoljen samo administratoru.' });
  }
  next();
};

/**
 * GET /api/assistant/settings
 * Trenutne AI postavke (samo administrator).
 */
router.get('/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const provider = await getSetting(SETTING_KEYS.AI_PROVIDER);
    const geminiModel = await getSetting(SETTING_KEYS.GEMINI_MODEL);
    const ollamaModel = await getSetting(SETTING_KEYS.OLLAMA_MODEL);
    return res.json({
      provider,
      gemini_model: geminiModel,
      ollama_model: ollamaModel,
      ollama_models: OLLAMA_MODELS,
    });
  } catch (error) {
    console.error('GET /api/assistant/settings error:', error);
    return res.status(500).json({ message: 'Greška pri dohvaćanju AI postavki.' });
  }
});

/**
 * PUT /api/assistant/settings
 * Mijenja zadani provider i/ili model (Gemini ili Ollama) — runtime, bez
 * restarta servera (samo administrator).
 */
router.put('/settings', authenticateToken, requireAdmin, async (req, res) => {
  const { provider, gemini_model: geminiModel, ollama_model: ollamaModel } = req.body;

  if (provider === undefined && geminiModel === undefined && ollamaModel === undefined) {
    return res.status(400).json({
      message: 'Barem jedno polje ("provider", "gemini_model" ili "ollama_model") mora biti poslano.',
    });
  }

  if (provider !== undefined && !PROVIDER_KEYS.includes(provider)) {
    return res.status(400).json({
      message: `Nepoznat provider. Dozvoljeno: ${PROVIDER_KEYS.join(', ')}.`,
    });
  }

  if (geminiModel !== undefined && (typeof geminiModel !== 'string' || !geminiModel.trim())) {
    return res.status(400).json({
      message: '"gemini_model" mora biti neprazan niz znakova.',
    });
  }

  // Za razliku od Gemini modela (slobodan niz — Google ih dodaje bez našeg
  // znanja), lokalni model mora biti IZ kataloga: svaki nosi supportsTools
  // zastavicu o kojoj ovisi smije li se uopće slati alat, a nepoznat model bi
  // tu zastavicu pogodio krivo i srušio svaki poziv na Ollamin HTTP 400.
  if (ollamaModel !== undefined && !ALLOWED_OLLAMA_MODELS.includes(ollamaModel)) {
    return res.status(400).json({
      message: `Nepoznat Ollama model. Dozvoljeno: ${ALLOWED_OLLAMA_MODELS.join(', ')}.`,
    });
  }

  try {
    if (provider !== undefined) {
      await setSetting(SETTING_KEYS.AI_PROVIDER, provider);
    }
    if (geminiModel !== undefined) {
      await setSetting(SETTING_KEYS.GEMINI_MODEL, geminiModel.trim());
    }
    if (ollamaModel !== undefined) {
      await setSetting(SETTING_KEYS.OLLAMA_MODEL, ollamaModel);
    }

    return res.json({
      message: 'AI postavke ažurirane.',
      provider: await getSetting(SETTING_KEYS.AI_PROVIDER),
      gemini_model: await getSetting(SETTING_KEYS.GEMINI_MODEL),
      ollama_model: await getSetting(SETTING_KEYS.OLLAMA_MODEL),
    });
  } catch (error) {
    console.error('PUT /api/assistant/settings error:', error);
    return res.status(500).json({ message: 'Greška pri ažuriranju AI postavki.' });
  }
});

module.exports = router;
