// Runtime postavke iz tablice AppSetting (key/value) — čita se pri svakom
// pozivu, bez cachea, tako da se npr. AI provider može promijeniti kroz
// admin API bez restarta servera. Vidi docs/BAZA_PODATAKA.md.

const db = require('./db');

const SETTING_KEYS = {
  AI_PROVIDER: 'ai_provider',
  GEMINI_MODEL: 'gemini_model',
  OLLAMA_MODEL: 'ollama_model',
};

// Koristi se samo ako ključ još nije zapisan u bazi (npr. postojeća baza
// prije migracije) — vidi docs/BAZA_PODATAKA.md.
const DEFAULTS = {
  [SETTING_KEYS.AI_PROVIDER]: 'ollama',
  [SETTING_KEYS.GEMINI_MODEL]: 'gemini-2.5-flash',
  [SETTING_KEYS.OLLAMA_MODEL]: 'gemma4:e2b',
};

async function getSetting(key) {
  const [rows] = await db.query(
    'SELECT setting_value FROM AppSetting WHERE setting_key = ? LIMIT 1',
    [key]
  );
  if (rows.length === 0) return DEFAULTS[key] ?? null;
  return rows[0].setting_value;
}

async function setSetting(key, value) {
  await db.query(
    `
    INSERT INTO AppSetting (setting_key, setting_value)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
    `,
    [key, value]
  );
}

module.exports = { getSetting, setSetting, SETTING_KEYS };
