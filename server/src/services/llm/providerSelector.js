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

const PROVIDER_KEYS = Object.keys(PROVIDERS);

async function getActiveProvider() {
  const providerKey = await getSetting(SETTING_KEYS.AI_PROVIDER);
  const provider = PROVIDERS[providerKey];
  if (!provider) {
    throw new Error(`Nepoznat AI provider u postavkama: "${providerKey}".`);
  }
  return provider;
}

/**
 * Provider biran IMENOM, mimo runtime postavke. Postoji zbog dva gumba uz
 * stavke zahtjeva (lokalni model i Gemini), koji moraju biti dostupni
 * istovremeno — postavka `ai_provider` bira samo zadanog, ne i jedinog.
 *
 * @param {string} providerKey 'ollama' | 'gemini'
 * @returns {{ provider: object, key: string }}
 * @throws {Error} kod nepoznatog imena
 */
function getProviderByKey(providerKey) {
  const provider = PROVIDERS[providerKey];
  if (!provider) {
    throw new Error(`Nepoznat AI provider: "${providerKey}". Dopušteno: ${PROVIDER_KEYS.join(', ')}.`);
  }
  return { provider, key: providerKey };
}

/** Imenovani provider ako je ime dano, inače onaj iz postavke. */
async function resolveProvider(providerKey) {
  if (providerKey) return getProviderByKey(providerKey);
  const key = await getSetting(SETTING_KEYS.AI_PROVIDER);
  return getProviderByKey(key);
}

module.exports = { getActiveProvider, getProviderByKey, resolveProvider, PROVIDERS, PROVIDER_KEYS };
