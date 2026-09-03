-- ============================================================
-- 03_demo_seed.sql — Demo podaci za prezentaciju
-- Sustav za upravljanje zahtjevima za nabavu (Veleučilište u Rijeci)
--
-- BRIŠE sve transakcijske podatke i šifrarnike odjela/kategorija
-- te ih zamjenjuje konzistentnim demo skupom:
--   - fiskalna godina 2026 s budžetom 100.000 €
--   - 6 odjela i 6 kategorija s limitima
--   - 4 korisnika (admin, zaposlenik + 2 demo zaposlenika)
--   - 14 zahtjeva raspoređenih po svim statusima workflow-a,
--     s povijesti statusa i prilozima (Ponuda/Otpremnica)
--
-- NE dira: Role, RequestStatus (osnovni šifrarnici iz 02_seed.sql).
--
-- Pripadajuće PDF datoteke priloga nalaze se u db/demo_files/ —
-- pokreni sve zajedno preko db/reset_demo.sh koji ih kopira u
-- server/uploads/. Backup stare baze: db/backup/.
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE RequestStatusHistory;
TRUNCATE TABLE Attachment;
TRUNCATE TABLE PurchaseRequestItem;
TRUNCATE TABLE PurchaseRequest;
TRUNCATE TABLE Department;
TRUNCATE TABLE ItemCategory;
TRUNCATE TABLE AppUser;

SET FOREIGN_KEY_CHECKS = 1;

-- ------------------------------------------------------------
-- FiscalYear — 2026, budžet 100.000 €
-- ------------------------------------------------------------
UPDATE FiscalYear SET total_budget = 100000.00, is_closed = 0 WHERE year = 2026;
INSERT INTO FiscalYear (id_fiscal_year, year, is_closed, total_budget)
SELECT 1, 2026, 0, 100000.00
WHERE NOT EXISTS (SELECT 1 FROM FiscalYear WHERE year = 2026);

-- ------------------------------------------------------------
-- AppUser — lozinke iste kao u 02_seed.sql
-- (admin@veleri.hr / zaposlenik@veleri.hr; demo korisnici
--  Ivana i Marko koriste istu lozinku kao zaposlenik)
-- ------------------------------------------------------------
INSERT INTO AppUser (id_user, fk_role, first_name, last_name, email, password_hash, is_active, invite_token, invite_token_expires) VALUES
(1, 1, 'Admin', 'Korisnik', 'admin@veleri.hr', '$2b$10$LwdoCm.pIlh1/hz5xH.NluYORW0qKrb7UC7ULHZFrRz2Yv4JIMDGC', 1, NULL, NULL),
(2, 2, 'Zaposlenik', 'Korisnik', 'zaposlenik@veleri.hr', '$2b$10$c1sci8OhP4.UnhmuY/1nh.ri3NWIEKsHrfzsZzuAQcTDY76KfJLZS', 1, NULL, NULL),
(3, 2, 'Ivana', 'Horvat', 'ivana.horvat@veleri.hr', '$2b$10$c1sci8OhP4.UnhmuY/1nh.ri3NWIEKsHrfzsZzuAQcTDY76KfJLZS', 1, NULL, NULL),
(4, 2, 'Marko', 'Novak', 'marko.novak@veleri.hr', '$2b$10$c1sci8OhP4.UnhmuY/1nh.ri3NWIEKsHrfzsZzuAQcTDY76KfJLZS', 1, NULL, NULL);

-- ------------------------------------------------------------
-- Department — svih 20 ustrojstvenih jedinica (isti popis kao 02_seed.sql)
-- Limiti: odjeli koje demo zahtjevi KORISTE zadržavaju izvorne iznose, da
-- prikaz iskorištenosti proračuna ostane smislen; ostali dobivaju 2.000 €.
-- Zbroj 94000 € ≤ proračun 100.000 €.
-- ------------------------------------------------------------
INSERT INTO Department (id_department, fk_fiscal_year, name, department_limit, is_active) VALUES
(1, 1, 'Knjižnica', 10000.00, 1),
(2, 1, 'Računovodstvo i financije', 8000.00, 1),
(3, 1, 'Studentska referada', 5000.00, 1),
(4, 1, 'Informatička služba', 25000.00, 1),
(5, 1, 'Održavanje i tehnička služba', 12000.00, 1),
(6, 1, 'Ekonomat', 6000.00, 1),
(7, 1, 'Poslovni odjel', 2000.00, 1),
(8, 1, 'Prometni odjel', 2000.00, 1),
(9, 1, 'Poljoprivredni odjel', 2000.00, 1),
(10, 1, 'Odjel sigurnosti na radu', 2000.00, 1),
(11, 1, 'Elektrotehnički odjel', 2000.00, 1),
(12, 1, 'Odjel za informacijske i komunikacijske tehnologije', 2000.00, 1),
(13, 1, 'Ured za kvalitetu', 2000.00, 1),
(14, 1, 'Ured za projekte i međunarodnu suradnju', 2000.00, 1),
(15, 1, 'Kadrovska služba', 2000.00, 1),
(16, 1, 'Pravna služba', 2000.00, 1),
(17, 1, 'Ured za nastavu', 2000.00, 1),
(18, 1, 'Ured za studentski standard', 2000.00, 1),
(19, 1, 'Odjel za istraživanje i razvoj', 2000.00, 1),
(20, 1, 'Služba za odnose s javnošću', 2000.00, 1);

-- ------------------------------------------------------------
-- ItemCategory — svih 33 predmeta nabave (isti popis kao 02_seed.sql)
-- Limiti po istom pravilu kao odjeli. Zbroj 91000 € ≤ proračun 100.000 €.
-- ------------------------------------------------------------
INSERT INTO ItemCategory (id_item_category, fk_fiscal_year, name, category_limit, is_active) VALUES
(1, 1, 'Namještaj', 6000.00, 1),
(2, 1, 'Nastavna i laboratorijska oprema', 8000.00, 1),
(3, 1, 'Programska oprema i licence', 15000.00, 1),
(4, 1, 'Računalna oprema', 20000.00, 1),
(5, 1, 'Uredski materijal', 5000.00, 1),
(6, 1, 'Usluge održavanja', 10000.00, 1),
(7, 1, 'Laboratorijski potrošni materijal', 1000.00, 1),
(8, 1, 'Kemikalije i laboratorijsko posuđe', 1000.00, 1),
(9, 1, 'Nastavne potrepštine', 1000.00, 1),
(10, 1, 'Uredska oprema i potrepštine', 1000.00, 1),
(11, 1, 'Toneri i potrošni materijal za pisače', 1000.00, 1),
(12, 1, 'Sredstva za čišćenje i higijenu', 1000.00, 1),
(13, 1, 'Knjige i stručna literatura', 1000.00, 1),
(14, 1, 'Tiskani materijali', 1000.00, 1),
(15, 1, 'Studentske iskaznice i diplome', 1000.00, 1),
(16, 1, 'Audio-vizualna oprema', 1000.00, 1),
(17, 1, 'Elektronička i elektrotehnička oprema', 1000.00, 1),
(18, 1, 'Mjerna i ispitna oprema', 1000.00, 1),
(19, 1, 'Mrežna i telekomunikacijska oprema', 1000.00, 1),
(20, 1, 'Klima-uređaji i ventilacijska oprema', 1000.00, 1),
(21, 1, 'Sitni inventar', 1000.00, 1),
(22, 1, 'Zaštitna oprema i sredstva zaštite na radu', 1000.00, 1),
(23, 1, 'Materijal za održavanje objekata', 1000.00, 1),
(24, 1, 'Elektroinstalacijski materijal', 1000.00, 1),
(25, 1, 'Usluge čišćenja', 1000.00, 1),
(26, 1, 'Usluge prijevoza', 1000.00, 1),
(27, 1, 'Grafičke i tiskarske usluge', 1000.00, 1),
(28, 1, 'Stručne i savjetodavne usluge', 1000.00, 1),
(29, 1, 'Edukacije i stručno usavršavanje', 1000.00, 1),
(30, 1, 'Promidžbeni materijal', 1000.00, 1),
(31, 1, 'Usluge projektiranja i tehničke dokumentacije', 1000.00, 1),
(32, 1, 'Usluge razvoja i održavanja informacijskih sustava', 1000.00, 1),
(33, 1, 'Ostale usluge', 1000.00, 1);

-- ------------------------------------------------------------
-- PurchaseRequest — 14 zahtjeva kroz sve statuse
-- Statusi: 1 Poslano, 2 Na odobrenju, 3 Vraćeno, 5 Odbijeno,
--          6 Naručeno, 7 Zatvoreno
-- ------------------------------------------------------------
INSERT INTO PurchaseRequest (id_purchase_request, request_number, fk_fiscal_year, fk_department, fk_request_status, fk_created_by_user, total_amount, justification, comment, created_at, updated_at) VALUES
(1, 'NAB-2026-0001', 1, 4, 7, 2, 6850.00,
 'Postojeća računala u informatičkoj učionici 208 starija su od 7 godina i ne zadovoljavaju zahtjeve izvođenja nastave. Nabava 5 novih prijenosnih računala s priključnim stanicama.',
 NULL, '2026-06-16 09:12:00', '2026-06-24 14:20:00'),
(2, 'NAB-2026-0002', 1, 6, 7, 3, 1240.00,
 'Redovna kvartalna nabava uredskog materijala za potrebe svih službi Veleučilišta.',
 NULL, '2026-06-17 08:40:00', '2026-06-26 11:45:00'),
(3, 'NAB-2026-0003', 1, 1, 7, 3, 4500.00,
 'Obnova godišnje pretplate na digitalnu bazu znanstvenih časopisa za potrebe studenata i nastavnika.',
 'Pretplata istječe 30.06.2026. — molim prioritetnu obradu.', '2026-06-18 10:20:00', '2026-06-30 16:10:00'),
(4, 'NAB-2026-0004', 1, 5, 7, 4, 2980.00,
 'Redovni godišnji servis klimatizacijskih uređaja u zgradi A prije ljetnog razdoblja.',
 NULL, '2026-06-19 11:05:00', '2026-07-02 13:25:00'),
(5, 'NAB-2026-0005', 1, 4, 5, 2, 1200.00,
 'Opremanje studentskog kutka igraćim konzolama za slobodno vrijeme studenata.',
 NULL, '2026-06-20 14:50:00', '2026-06-22 10:05:00'),
(6, 'NAB-2026-0006', 1, 2, 6, 4, 3600.00,
 'Obnova godišnjih licenci računovodstvenog softvera za 10 korisnika — postojeće licence istječu 15.07.2026.',
 NULL, '2026-06-23 09:35:00', '2026-06-25 08:55:00'),
(7, 'NAB-2026-0007', 1, 3, 6, 4, 1850.00,
 'Zamjena dotrajalih uredskih stolica u studentskoj referadi — 8 radnih mjesta.',
 NULL, '2026-06-25 10:10:00', '2026-06-29 11:20:00'),
(8, 'NAB-2026-0008', 1, 6, 5, 3, 620.00,
 'Dodatna nabava fotokopirnog papira za potrebe službi.',
 NULL, '2026-06-26 13:30:00', '2026-06-29 09:10:00'),
(9, 'NAB-2026-0009', 1, 5, 3, 4, 5400.00,
 'Zamjena neonske rasvjete LED panelima u predavaonicama 101–105 radi uštede energije.',
 NULL, '2026-06-29 08:50:00', '2026-06-30 10:25:00'),
(10, 'NAB-2026-0010', 1, 4, 2, 2, 2700.00,
 'Opremanje nove informatičke učionice mrežnom opremom — 3 preklopnika s PoE napajanjem.',
 NULL, '2026-06-30 11:40:00', '2026-07-01 09:20:00'),
(11, 'NAB-2026-0011', 1, 1, 2, 3, 1980.00,
 'Proširenje arhivskog prostora knjižnice — nabava 10 metalnih arhivskih polica.',
 NULL, '2026-07-01 14:05:00', '2026-07-02 10:30:00'),
(12, 'NAB-2026-0012', 1, 3, 1, 4, 450.00,
 'Postojeći pisač u studentskoj referadi je neispravan i popravak nije isplativ. Nabava novog multifunkcijskog uređaja.',
 NULL, '2026-07-02 09:25:00', NULL),
(13, 'NAB-2026-0013', 1, 6, 1, 3, 380.00,
 'Mjesečna zaliha sredstava za čišćenje i higijenu za sve zgrade Veleučilišta.',
 NULL, '2026-07-03 10:45:00', NULL),
(14, 'NAB-2026-0014', 1, 4, 1, 2, 7200.00,
 'Opremanje laboratorija za elektrotehniku mjernom opremom za izvođenje laboratorijskih vježbi.',
 'Vezano uz akreditaciju studija — oprema potrebna do početka zimskog semestra.', '2026-07-03 15:30:00', NULL);

-- ------------------------------------------------------------
-- PurchaseRequestItem — stavke (kategorija na razini stavke)
-- ------------------------------------------------------------
INSERT INTO PurchaseRequestItem (id_purchase_request_item, fk_purchase_request, fk_item_category, item_name, quantity) VALUES
(1, 1, 4, 'Prijenosno računalo Dell Latitude 5550', 5),
(2, 1, 4, 'Priključna stanica USB-C', 5),
(3, 2, 5, 'Fotokopirni papir A4 80g (kutija 5/1)', 40),
(4, 2, 11, 'Toner HP 415A (crni)', 6),
(5, 2, 5, 'Registrator A4 široki', 50),
(6, 3, 3, 'Godišnja pretplata — digitalna baza znanstvenih časopisa', 1),
(7, 4, 6, 'Redovni servis klimatizacijskog uređaja — zgrada A', 12),
(8, 5, 4, 'Igraća konzola PlayStation 5', 2),
(9, 5, 4, 'Dodatni kontroler DualSense', 4),
(10, 6, 3, 'Godišnja licenca — računovodstveni softver (10 korisnika)', 1),
(11, 7, 1, 'Ergonomska uredska stolica', 8),
(12, 8, 5, 'Fotokopirni papir A4 80g (kutija 5/1)', 20),
(13, 9, 6, 'LED panel 60×60 cm s ugradnjom', 40),
(14, 10, 19, 'Mrežni preklopnik 48-port PoE', 3),
(15, 11, 1, 'Metalna arhivska polica 200×100 cm', 10),
(16, 12, 4, 'Multifunkcijski laserski pisač', 1),
(17, 13, 12, 'Sredstva za čišćenje i higijenu (mjesečni paket)', 25),
(18, 14, 18, 'Digitalni osciloskop 100 MHz', 4),
(19, 14, 18, 'Laboratorijski izvor napajanja 0–30 V', 4);

-- ------------------------------------------------------------
-- RequestStatusHistory — puni trag kroz workflow
-- (komentari odgovaraju defaultima iz aplikacije)
-- ------------------------------------------------------------
INSERT INTO RequestStatusHistory (id_request_status_history, fk_purchase_request, fk_request_status, fk_changed_by_user, changed_at, comment) VALUES
-- NAB-2026-0001: Poslano → Na odobrenju → Naručeno → Zatvoreno
(1,  1, 1, 2, '2026-06-16 09:12:00', 'Zahtjev kreiran i poslan.'),
(2,  1, 2, 1, '2026-06-16 11:30:00', 'Zahtjev preuzet na obradu.'),
(3,  1, 6, 1, '2026-06-17 10:05:00', 'Zahtjev odobren.'),
(4,  1, 7, 1, '2026-06-24 14:20:00', 'Oprema isporučena i preuzeta — zahtjev završen.'),
-- NAB-2026-0002: puni ciklus
(5,  2, 1, 3, '2026-06-17 08:40:00', 'Zahtjev kreiran i poslan.'),
(6,  2, 2, 1, '2026-06-17 13:15:00', 'Zahtjev preuzet na obradu.'),
(7,  2, 6, 1, '2026-06-18 09:00:00', 'Zahtjev odobren.'),
(8,  2, 7, 1, '2026-06-26 11:45:00', 'Zahtjev označen kao završen.'),
-- NAB-2026-0003: puni ciklus
(9,  3, 1, 3, '2026-06-18 10:20:00', 'Zahtjev kreiran i poslan.'),
(10, 3, 2, 1, '2026-06-18 15:00:00', 'Zahtjev preuzet na obradu.'),
(11, 3, 6, 1, '2026-06-19 09:30:00', 'Zahtjev odobren.'),
(12, 3, 7, 1, '2026-06-30 16:10:00', 'Pristup bazi aktiviran — zahtjev završen.'),
-- NAB-2026-0004: puni ciklus
(13, 4, 1, 4, '2026-06-19 11:05:00', 'Zahtjev kreiran i poslan.'),
(14, 4, 2, 1, '2026-06-22 09:15:00', 'Zahtjev preuzet na obradu.'),
(15, 4, 6, 1, '2026-06-23 10:40:00', 'Zahtjev odobren.'),
(16, 4, 7, 1, '2026-07-02 13:25:00', 'Servis izvršen po radnom nalogu — zahtjev završen.'),
-- NAB-2026-0005: Poslano → Na odobrenju → (storno) Odbijeno
(17, 5, 1, 2, '2026-06-20 14:50:00', 'Zahtjev kreiran i poslan.'),
(18, 5, 2, 1, '2026-06-22 10:00:00', 'Zahtjev preuzet na obradu.'),
(19, 5, 5, 1, '2026-06-22 10:05:00', 'Nije predviđeno planom nabave za 2026. godinu.'),
-- NAB-2026-0006: Poslano → Na odobrenju → Naručeno
(20, 6, 1, 4, '2026-06-23 09:35:00', 'Zahtjev kreiran i poslan.'),
(21, 6, 2, 1, '2026-06-23 14:20:00', 'Zahtjev preuzet na obradu.'),
(22, 6, 6, 1, '2026-06-25 08:55:00', 'Zahtjev odobren.'),
-- NAB-2026-0007: Poslano → Na odobrenju → Naručeno
(23, 7, 1, 4, '2026-06-25 10:10:00', 'Zahtjev kreiran i poslan.'),
(24, 7, 2, 1, '2026-06-26 09:40:00', 'Zahtjev preuzet na obradu.'),
(25, 7, 6, 1, '2026-06-29 11:20:00', 'Zahtjev odobren.'),
-- NAB-2026-0008: Poslano → Odbijeno
(26, 8, 1, 3, '2026-06-26 13:30:00', 'Zahtjev kreiran i poslan.'),
(27, 8, 5, 1, '2026-06-29 09:10:00', 'Duplikat zahtjeva NAB-2026-0002 — papir je već naručen u kvartalnoj nabavi.'),
-- NAB-2026-0009: Poslano → Na odobrenju → Vraćeno na dopunu
(28, 9, 1, 4, '2026-06-29 08:50:00', 'Zahtjev kreiran i poslan.'),
(29, 9, 2, 1, '2026-06-30 10:15:00', 'Zahtjev preuzet na obradu.'),
(30, 9, 3, 1, '2026-06-30 10:25:00', 'Molim dopuniti specifikaciju: tip i broj LED panela po pojedinoj predavaonici.'),
-- NAB-2026-0010: Poslano → Na odobrenju
(31, 10, 1, 2, '2026-06-30 11:40:00', 'Zahtjev kreiran i poslan.'),
(32, 10, 2, 1, '2026-07-01 09:20:00', 'Zahtjev preuzet na obradu.'),
-- NAB-2026-0011: Poslano → Na odobrenju
(33, 11, 1, 3, '2026-07-01 14:05:00', 'Zahtjev kreiran i poslan.'),
(34, 11, 2, 1, '2026-07-02 10:30:00', 'Zahtjev preuzet na obradu.'),
-- NAB-2026-0012 do 0014: Poslano
(35, 12, 1, 4, '2026-07-02 09:25:00', 'Zahtjev kreiran i poslan.'),
(36, 13, 1, 3, '2026-07-03 10:45:00', 'Zahtjev kreiran i poslan.'),
(37, 14, 1, 2, '2026-07-03 15:30:00', 'Zahtjev kreiran i poslan.');

-- ------------------------------------------------------------
-- Attachment — ponude i otpremnice (PDF-ovi u db/demo_files/)
-- ------------------------------------------------------------
INSERT INTO Attachment (id_attachment, fk_purchase_request, fk_uploaded_by_user, file_name, file_path, file_type, document_type, uploaded_at) VALUES
(1, 1, 1, 'Ponuda_NAB-2026-0001.pdf', 'attachments/1/1781683080000-Ponuda_NAB-2026-0001.pdf', 'application/pdf', 'Ponuda', '2026-06-17 09:58:00'),
(2, 1, 1, 'Otpremnica_NAB-2026-0001.pdf', 'attachments/1/1782303120000-Otpremnica_NAB-2026-0001.pdf', 'application/pdf', 'Otpremnica', '2026-06-24 14:12:00'),
(3, 2, 1, 'Ponuda_NAB-2026-0002.pdf', 'attachments/2/1781765520000-Ponuda_NAB-2026-0002.pdf', 'application/pdf', 'Ponuda', '2026-06-18 08:52:00'),
(4, 2, 1, 'Otpremnica_NAB-2026-0002.pdf', 'attachments/2/1782466680000-Otpremnica_NAB-2026-0002.pdf', 'application/pdf', 'Otpremnica', '2026-06-26 11:38:00'),
(5, 3, 1, 'Ponuda_NAB-2026-0003.pdf', 'attachments/3/1781853720000-Ponuda_NAB-2026-0003.pdf', 'application/pdf', 'Ponuda', '2026-06-19 09:22:00'),
(6, 3, 1, 'Otpremnica_NAB-2026-0003.pdf', 'attachments/3/1782828120000-Otpremnica_NAB-2026-0003.pdf', 'application/pdf', 'Otpremnica', '2026-06-30 16:02:00'),
(7, 4, 1, 'Ponuda_NAB-2026-0004.pdf', 'attachments/4/1782203460000-Ponuda_NAB-2026-0004.pdf', 'application/pdf', 'Ponuda', '2026-06-23 10:31:00'),
(8, 4, 1, 'Otpremnica_NAB-2026-0004.pdf', 'attachments/4/1782991020000-Otpremnica_NAB-2026-0004.pdf', 'application/pdf', 'Otpremnica', '2026-07-02 13:17:00'),
(9, 6, 1, 'Ponuda_NAB-2026-0006.pdf', 'attachments/6/1782370020000-Ponuda_NAB-2026-0006.pdf', 'application/pdf', 'Ponuda', '2026-06-25 08:47:00'),
(10, 7, 1, 'Ponuda_NAB-2026-0007.pdf', 'attachments/7/1782724320000-Ponuda_NAB-2026-0007.pdf', 'application/pdf', 'Ponuda', '2026-06-29 11:12:00');

-- ============================================================
-- Kraj 03_demo_seed.sql
-- ============================================================
