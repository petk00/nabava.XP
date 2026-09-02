-- ============================================================
-- seed.sql — Inicijalni obvezni podaci
-- Sustav za upravljanje zahtjevima za nabavu (Veleučilište u Rijeci)
--
-- Sadrži minimalni skup podataka bez kojeg sustav ne može raditi:
-- šifrarnike (Role, RequestStatus, FiscalYear, Department, ItemCategory)
-- i inicijalne korisničke račune.
-- ============================================================

SET NAMES utf8mb4;

-- ------------------------------------------------------------
-- Role
-- ------------------------------------------------------------
INSERT INTO `Role` (`id_role`, `name`) VALUES
(1, 'Administrator'),
(2, 'Zaposlenik');

-- ------------------------------------------------------------
-- RequestStatus — svih 7 statusa workflow-a (obavezno)
-- ------------------------------------------------------------
INSERT INTO `RequestStatus` (`id_request_status`, `name`) VALUES
(1, 'Poslano'),
(2, 'Na odobrenju'),
(3, 'Zahtjeva izmjene'),
(4, 'Odobreno'),
(5, 'Odbijeno'),
(6, 'Naručeno'),
(7, 'Zatvoreno');

-- ------------------------------------------------------------
-- AppUser — 2 inicijalna korisnika
-- Lozinke su bcrypt hashevi — korisnici ih postavljaju
-- putem invite linka pri prvom pristupu.
-- admin@veleri.hr     → uloga: Administrator
-- zaposlenik@veleri.hr → uloga: Zaposlenik
-- ------------------------------------------------------------
INSERT INTO `AppUser` (`id_user`, `fk_role`, `first_name`, `last_name`, `email`, `password_hash`, `is_active`, `invite_token`, `invite_token_expires`) VALUES
(1, 1, 'Admin', 'Korisnik', 'admin@veleri.hr', '$2b$10$LwdoCm.pIlh1/hz5xH.NluYORW0qKrb7UC7ULHZFrRz2Yv4JIMDGC', 1, NULL, NULL),
(2, 2, 'Zaposlenik', 'Korisnik', 'zaposlenik@veleri.hr', '$2b$10$c1sci8OhP4.UnhmuY/1nh.ri3NWIEKsHrfzsZzuAQcTDY76KfJLZS', 1, NULL, NULL);

-- ------------------------------------------------------------
-- AppSetting — zadane runtime postavke AI asistenta (docs/AI.md).
-- Aktivni provider te Gemini i Ollama model mijenjaju se kroz admin API,
-- ovo su samo početne vrijednosti. Dozvoljene vrijednosti za 'ollama_model'
-- su iz kataloga OLLAMA_MODELS (server/src/services/llm/ollamaProvider.js).
-- ------------------------------------------------------------
INSERT INTO `AppSetting` (`setting_key`, `setting_value`) VALUES
('ai_provider', 'ollama'),
('gemini_model', 'gemini-2.5-flash'),
('ollama_model', 'gemma4:e2b');

-- ============================================================
-- Kraj seed.sql
-- ============================================================
