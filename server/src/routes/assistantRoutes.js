const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware');
const { runAssistantChat } = require('../services/assistantOrchestrator');
const { getSetting, setSetting, SETTING_KEYS } = require('../config/appSettings');

const ALLOWED_PROVIDERS = ['ollama', 'gemini'];
const ALLOWED_ROLES_IN_MESSAGE = ['user', 'assistant', 'system'];

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
 * Klijent šalje samo obični razgovor (user/assistant/system poruke) — cijela
 * tool-calling petlja odvija se server-side unutar ovog jednog zahtjeva.
 */
router.post('/chat', authenticateToken, async (req, res) => {
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      message: '"messages" je obavezno polje i mora biti neprazan niz.',
    });
  }

  for (const [idx, m] of messages.entries()) {
    if (!m || typeof m.content !== 'string' || !m.content.trim() || !ALLOWED_ROLES_IN_MESSAGE.includes(m.role)) {
      return res.status(400).json({
        message: `Poruka #${idx + 1}: "role" (user/assistant/system) i neprazan "content" su obavezni.`,
      });
    }
  }

  try {
    const result = await runAssistantChat({ messages, userId: req.user.id_user });
    return res.json({ text: result.text, created_request: result.created_request });
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

module.exports = router;
