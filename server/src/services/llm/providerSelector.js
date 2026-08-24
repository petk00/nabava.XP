// Bira aktivnu LlmProvider implementaciju prema runtime postavci
// AppSetting.ai_provider (docs/AI.md) — čita se pri svakom pozivu, pa se
// toggle mijenja bez restarta servera.

const { getSetting, SETTING_KEYS } = require('../../config/appSettings');
const ollamaProvider = require('./ollamaProvider');
const geminiProvider = require('./geminiProvider');

const PROVIDERS = {
  ollama: ollamaProvider,
  gemini: geminiProvider,
};

async function getActiveProvider() {
  const providerKey = await getSetting(SETTING_KEYS.AI_PROVIDER);
  const provider = PROVIDERS[providerKey];
  if (!provider) {
    throw new Error(`Nepoznat AI provider u postavkama: "${providerKey}".`);
  }
  return provider;
}

module.exports = { getActiveProvider, PROVIDERS };
