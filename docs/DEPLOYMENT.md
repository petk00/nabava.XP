# Deployment na produkcijski server

Upute za instalaciju aplikacije `nabava.XP` na stvarni server pomoću Dockera.
Postava je verificirana lokalno; koraci ispod opisuju instalaciju na Linux server.

## Arhitektura

```text
[korisnik] ──HTTPS──> [nginx (frontend container, port 80/443)]
                         ├── statički SPA build (Quasar)
                         └── /api/ ──proxy──> [backend container :3000]
                                                  └──> [MySQL container :3306]
```

- Port 3000 (backend) i 3306 (MySQL) **nisu izloženi** na hostu — dostupni su samo unutar Docker mreže.
- HTTP (80) se automatski preusmjerava na HTTPS (443).
- Backend ima health endpoint `/health` koji vraća status `ok` kada je aplikacija i baza dostupne.
- Podaci žive u dva Docker volumena: `mysql_data` (baza) i `uploads` (dokumenti).

## 1. Preduvjeti

- Linux server s Dockerom i Docker Compose pluginom (`docker compose version`).
- Git.
- Otvoreni portovi 80 i 443 prema korisnicima.

## 2. Instalacija

```bash
git clone <repo-url> nabava.XP
cd nabava.XP

# Konfiguracija — obavezne tajne
cp .env.example .env
```

U `.env` postaviti:

| Varijabla | Kako |
|---|---|
| `JWT_SECRET` | `openssl rand -base64 48` |
| `DB_ROOT_PASSWORD` | `openssl rand -base64 24` |
| `DB_PASSWORD` | `openssl rand -base64 24` |
| `SERVER_IP` | IP adresa ili hostname servera (koristi se za CORS i API URL u buildu frontenda) |

Zatim:

```bash
docker compose up -d --build
```

Prvo pokretanje traje nekoliko minuta (build + inicijalizacija baze iz `db/01_schema.sql` i `db/02_seed.sql`).

> **Napomena:** MySQL primjenjuje lozinke samo pri **prvoj** inicijalizaciji volumena.
> Promjena lozinki kasnije zahtijeva `docker compose down -v` (briše podatke!) ili ručni `ALTER USER` u bazi.

## 3. Prva prijava

Seed kreira dva računa (`admin@veleri.hr`, `zaposlenik@veleri.hr`) s razvojnom lozinkom.

**Odmah nakon instalacije:**

1. prijaviti se kao `admin@veleri.hr`,
2. na stranici Korisnici generirati **reset link za admin račun** i postaviti jaku lozinku,
3. demo račun `zaposlenik@veleri.hr` deaktivirati ili mu također resetirati lozinku,
4. kreirati prave korisnike kroz stranicu Korisnici (invite link).

## 4. Provjera nakon deploya

Nakon prvog pokretanja napraviti kratku provjeru osnovnih funkcija:

- otvoriti aplikaciju preko HTTPS adrese i potvrditi da se login ekran učitava,
- provjeriti health endpoint backenda: `curl -fsS https://localhost/health` ili `docker compose exec frontend wget -qO- http://backend:3000/health`,
- prijaviti se kao administrator i promijeniti početnu lozinku,
- kreirati testni zahtjev kao zaposlenik ili admin testnim računom,
- uploadati testnu ponudu i provjeriti da se dokument može preuzeti,
- pokrenuti probni backup: `./scripts/backup.sh`.

Ako svi koraci prođu, aplikacija je spremna za unos stvarnih korisnika i šifrarnika.

## 5. TLS certifikat

Frontend image u buildu generira **self-signed certifikat** (browser prikazuje upozorenje).
Za produkciju zamijeniti pravim certifikatom — mountati ga preko postojeće putanje u `docker-compose.yml`:

```yaml
  frontend:
    # ...
    volumes:
      - /etc/ssl/veleri:/etc/nginx/ssl:ro   # mora sadržavati selfsigned.crt i selfsigned.key
```

U mapu `/etc/ssl/veleri` staviti pravi certifikat i ključ pod imenima `selfsigned.crt` / `selfsigned.key`
(ili prilagoditi `ssl_certificate` putanje u `client/nginx.conf` pa rebuildati).

Za javno dostupan server s domenom preporuka je Let's Encrypt (`certbot certonly --standalone`,
uz cron za obnovu i `docker compose restart frontend` nakon obnove).

## 6. Backup

Skripta `scripts/backup.sh` radi dump baze i arhivu uploada iz kontejnera:

```bash
./scripts/backup.sh            # sprema u ./backups/ (default 14 dana retencije)
BACKUP_DIR=/mnt/backup ./scripts/backup.sh
```

Preporučeni cron (svaku noć u 02:30):

```cron
30 2 * * * cd /putanja/do/nabava.XP && ./scripts/backup.sh >> /var/log/veleri-backup.log 2>&1
```

### Restore

```bash
# Baza
gunzip -c backups/db_YYYY-MM-DD_HHMM.sql.gz | docker compose exec -T mysql \
  sh -c 'mysql -u root -p"$MYSQL_ROOT_PASSWORD" XP'

# Dokumenti
docker compose cp backups/uploads_YYYY-MM-DD_HHMM.tar.gz backend:/tmp/u.tar.gz
docker compose exec backend sh -c 'rm -rf /app/uploads/attachments && tar -xzf /tmp/u.tar.gz -C / && rm /tmp/u.tar.gz'
```

## 7. Ažuriranje aplikacije

```bash
git pull
docker compose up -d --build   # rebuilda samo izmijenjene slojeve
```

Migracije sheme: `db/01_schema.sql` se primjenjuje **samo pri prvoj inicijalizaciji** volumena.
Za izmjene sheme na postojećoj bazi pokrenuti pripadajući `ALTER TABLE` ručno
(izmjene su dokumentirane u `docs/BAZA_PODATAKA.md`).

## 8. Dijagnostika

| Provjera | Naredba |
|---|---|
| Status kontejnera | `docker compose ps` |
| Health backenda (uklj. bazu) | `docker compose exec frontend wget -qO- http://backend:3000/health` |
| Logovi backenda | `docker compose logs -f backend` |
| Logovi nginxa | `docker compose logs -f frontend` |
| Ulaz u bazu | `docker compose exec mysql sh -c 'mysql -u root -p"$MYSQL_ROOT_PASSWORD" XP'` |

Backend na startu **odbija pokretanje** ako nedostaje `JWT_SECRET` (ili je kraći od 32 znaka),
`DB_HOST`, `DB_USER` ili `DB_NAME` — poruka je u `docker compose logs backend`.

## Opcionalno: email obavijesti (invite linkovi)

U `docker-compose.yml` odkomentirati `SMTP_*` varijable i upisati podatke SMTP računa.
Bez SMTP konfiguracije sustav normalno radi — admin ručno prosljeđuje invite linkove.

## Opcionalno: AI asistent (Ollama / Gemini)

Sustav radi i bez AI asistenta — bez konfiguracije ispod chat jednostavno vrati poruku da
asistent nije dostupan. Detalji modula: `docs/AI.md`.

Aktivni provider (`ollama` ili `gemini`) i Gemini model **nisu** env varijable nego runtime
postavke u tablici `AppSetting`; administrator ih mijenja kroz `PUT /api/assistant/settings`
(ili prekidačem u chat prozoru) bez restarta servera. Iz okoline dolaze samo adresa Ollame i
Gemini ključ.

### Varijanta A — Ollama radi na hostu (preporučeno kad server ima GPU)

Ništa se ne konfigurira: backend po defaultu gađa `http://host.docker.internal:11434`, a
`docker-compose.yml` za to na Linuxu mapira `host-gateway`. Provjera iz kontejnera:

```bash
docker compose exec backend node -e "fetch('http://host.docker.internal:11434/api/tags').then(r=>r.json()).then(d=>console.log(d.models.map(m=>m.name)))"
```

### Varijanta B — Ollama kao kontejner

```bash
# u .env
OLLAMA_BASE_URL=http://ollama:11434

docker compose --profile ollama up -d
docker compose exec ollama ollama pull gemma4:12b   # ~8 GB, jednom
```

Servis `ollama` ima vlastiti profil, pa ga obični `docker compose up -d` **ne** pokreće.
Bez GPU-a je generiranje presporo za stvarnu upotrebu.

### Gemini

```bash
# u .env
GEMINI_API_KEY=...
```

Ključ se čita tek pri stvarnom pozivu, pa njegov izostanak ne blokira pokretanje servera.

### Timeout

`client/nginx.conf` za `/api/assistant/` ima `proxy_read_timeout 660s` — namjerno mnogo više od
60 s koliko vrijedi za ostatak `/api/`. Jedan potez razgovora s lokalnim modelom traje minutama
(izmjereni medijani 100-900 s, `docs/eval-runs/`), a backend čeka do 10 minuta po pozivu modelu.
Ako se taj limit smanji, asistent kroz nginx počne vraćati 504 iako backend uredno radi.
