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
-- FiscalYear — aktivna poslovna godina
-- Mora postojati PRIJE Departmenta i ItemCategory: oboje je vežu stranim
-- ključem (fk_fiscal_year NOT NULL, ON DELETE RESTRICT).
-- ------------------------------------------------------------
INSERT INTO `FiscalYear` (`id_fiscal_year`, `year`, `is_closed`, `total_budget`) VALUES
(1, 2026, 0, 100000.00);

-- ------------------------------------------------------------
-- Department — ustrojstvene jedinice Veleučilišta
--
-- `department_limit` je jedinstven (4000.00) jer ga seed ne može pogoditi:
-- stvarni iznosi ovise o proračunu godine i dodjeljuju se kroz aplikaciju.
-- Zbroj (80000 €) je NAMJERNO ispod ukupnog proračuna
-- (100.000 €), da `total_allocated` u pregledu poslovne godine
-- (fiscalYearRoutes.js) ne pokazuje prekoračenje na svježoj bazi.
-- ------------------------------------------------------------
INSERT INTO `Department` (`id_department`, `fk_fiscal_year`, `name`, `department_limit`, `is_active`) VALUES
(1, 1, 'Knjižnica', 4000.00, 1),
(2, 1, 'Računovodstvo i financije', 4000.00, 1),
(3, 1, 'Studentska referada', 4000.00, 1),
(4, 1, 'Informatička služba', 4000.00, 1),
(5, 1, 'Održavanje i tehnička služba', 4000.00, 1),
(6, 1, 'Ekonomat', 4000.00, 1),
(7, 1, 'Poslovni odjel', 4000.00, 1),
(8, 1, 'Prometni odjel', 4000.00, 1),
(9, 1, 'Poljoprivredni odjel', 4000.00, 1),
(10, 1, 'Odjel sigurnosti na radu', 4000.00, 1),
(11, 1, 'Elektrotehnički odjel', 4000.00, 1),
(12, 1, 'Odjel za informacijske i komunikacijske tehnologije', 4000.00, 1),
(13, 1, 'Ured za kvalitetu', 4000.00, 1),
(14, 1, 'Ured za projekte i međunarodnu suradnju', 4000.00, 1),
(15, 1, 'Kadrovska služba', 4000.00, 1),
(16, 1, 'Pravna služba', 4000.00, 1),
(17, 1, 'Ured za nastavu', 4000.00, 1),
(18, 1, 'Ured za studentski standard', 4000.00, 1),
(19, 1, 'Odjel za istraživanje i razvoj', 4000.00, 1),
(20, 1, 'Služba za odnose s javnošću', 4000.00, 1);

-- ------------------------------------------------------------
-- ItemCategory — predmeti nabave
--
-- `category_limit` je jedinstven (2500.00) iz istog razloga kao kod
-- Departmenta: seed ne može znati stvarnu raspodjelu proračuna. Zbroj
-- (82500 €) je ispod ukupnog proračuna (100.000 €).
-- ------------------------------------------------------------
INSERT INTO `ItemCategory` (`id_item_category`, `fk_fiscal_year`, `name`, `category_limit`, `is_active`) VALUES
(1, 1, 'Namještaj', 2500.00, 1),
(2, 1, 'Nastavna i laboratorijska oprema', 2500.00, 1),
(3, 1, 'Programska oprema i licence', 2500.00, 1),
(4, 1, 'Računalna oprema', 2500.00, 1),
(5, 1, 'Uredski materijal', 2500.00, 1),
(6, 1, 'Usluge održavanja', 2500.00, 1),
(7, 1, 'Laboratorijski potrošni materijal', 2500.00, 1),
(8, 1, 'Kemikalije i laboratorijsko posuđe', 2500.00, 1),
(9, 1, 'Nastavne potrepštine', 2500.00, 1),
(10, 1, 'Uredska oprema i potrepštine', 2500.00, 1),
(11, 1, 'Toneri i potrošni materijal za pisače', 2500.00, 1),
(12, 1, 'Sredstva za čišćenje i higijenu', 2500.00, 1),
(13, 1, 'Knjige i stručna literatura', 2500.00, 1),
(14, 1, 'Tiskani materijali', 2500.00, 1),
(15, 1, 'Studentske iskaznice i diplome', 2500.00, 1),
(16, 1, 'Audio-vizualna oprema', 2500.00, 1),
(17, 1, 'Elektronička i elektrotehnička oprema', 2500.00, 1),
(18, 1, 'Mjerna i ispitna oprema', 2500.00, 1),
(19, 1, 'Mrežna i telekomunikacijska oprema', 2500.00, 1),
(20, 1, 'Klima-uređaji i ventilacijska oprema', 2500.00, 1),
(21, 1, 'Sitni inventar', 2500.00, 1),
(22, 1, 'Zaštitna oprema i sredstva zaštite na radu', 2500.00, 1),
(23, 1, 'Materijal za održavanje objekata', 2500.00, 1),
(24, 1, 'Elektroinstalacijski materijal', 2500.00, 1),
(25, 1, 'Usluge čišćenja', 2500.00, 1),
(26, 1, 'Usluge prijevoza', 2500.00, 1),
(27, 1, 'Grafičke i tiskarske usluge', 2500.00, 1),
(28, 1, 'Stručne i savjetodavne usluge', 2500.00, 1),
(29, 1, 'Edukacije i stručno usavršavanje', 2500.00, 1),
(30, 1, 'Promidžbeni materijal', 2500.00, 1),
(31, 1, 'Usluge projektiranja i tehničke dokumentacije', 2500.00, 1),
(32, 1, 'Usluge razvoja i održavanja informacijskih sustava', 2500.00, 1),
(33, 1, 'Ostale usluge', 2500.00, 1);

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
-- su iz kataloga OLLAMA_MODELS (server/src/services/llm/ollamaModels.js).
-- ------------------------------------------------------------
INSERT INTO `AppSetting` (`setting_key`, `setting_value`) VALUES
('ai_provider', 'ollama'),
('gemini_model', 'gemini-2.5-flash'),
('ollama_model', 'gemma4:e2b');

-- ============================================================
-- Kraj seed.sql
-- ============================================================
