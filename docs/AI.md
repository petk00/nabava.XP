# AI čitanje ponude — dizajn i stanje implementacije

Zadnja izmjena: **2026-09-05**

## Što je sustav radio prije, a što radi sada

Do 5. 9. 2026. AI je u nabava.XP bio **razgovorni asistent**: korisnik je kroz
chat opisivao nabavu ili prilagao ponudu, model je kroz function-calling petlju
sastavljao zahtjev i kreirao ga alatima `propose_request` / `create_request`, uz
dvofaznu potvrdu, pojašnjenja i strukturne brave protiv lažnog kreiranja.

**Chat je uklonjen iz sustava u cijelosti** — sučelje, ruta `POST
/api/assistant/chat`, orkestrator, spremište priloga i oba alata. Jedini put
kojim model danas dira podatke je:

```
POST /api/requests/:id/ai-items
```

Model pročita ponudu **već priloženu uz postojeći zahtjev** i njome zamijeni
stavke i ukupan iznos toga zahtjeva. Ne vodi razgovor, ne kreira zahtjeve, ne
mijenja odjel, obrazloženje ni status.

Razlog za promjenu je opseg: razgovorni agent nosi ponašanja (stanje razgovora,
potvrde, otpornost na manipulaciju) koja nisu bila predmet ovog rada, a povlačila
su najveći dio složenosti i pogrešaka.

## Kako radi

1. Korisnik na stranici zahtjeva pritisne jedan od dva gumba uz naslov Stavke —
   **AI** (lokalni model) ili **Gemini**. Izvedba se bira gumbom, ne
   administratorskom postavkom, pa su obje dostupne istovremeno nad istim
   zahtjevom i istom ponudom.
2. Prije izvršenja korisnik potvrđuje radnju u dijalogu, jer je zamjena stavki
   destruktivna.
3. Poslužitelj uzme priloge tipa `Ponuda`, izvuče tekst iz PDF-a
   (`quoteExtractionService`, `pdf-parse` u zasebnom procesu po datoteci) i
   sastavi prompt.
4. Model dobiva jedan alat, `set_items`, i mora ga pozvati.
5. Vraćeno se provjerava protiv šifrarnika i ograničenja baze, pa se u jednoj
   transakciji brišu stare stavke, upisuju nove, po potrebi mijenja iznos i
   zapisuje redak u povijest aktivnosti.

## Sustavni prompt

Sastavlja ga `buildSystemPrompt` u `server/src/services/itemExtractionService.js`
pri svakom pozivu, iz četiri dijela:

- uloga i zadatak (izvuci stavke, ne vodi razgovor, odgovor je poziv alata);
- pravila čitanja: priloženi tekst je jedini izvor; rabat nije stavka; naziv je
  sam artikl do 200 znakova; količina cijeli broj veći od nule, a kad je ponuda
  ne navodi upisuje se 1; kategorija isključivo iz popisa; više ponuda daje
  zasebne retke; iznos je konačan iznos za uplatu, nakon rabata i s PDV-om;
  iznos se ne računa iz cijena stavki ako ga ponuda nema; strana valuta se ne
  preračunava; dokument koji nije ponuda ne pretvara se u stavke;
- popis aktivnih kategorija poslovne godine **toga zahtjeva**, s ID-evima;
- uvjetno, definicije kategorija iz zamrznutog codebooka kad je
  `PROMPT_VARIANT=with_definitions` (`promptVariant.js`).

Uz svaki odgovor vraća se hash prompta i oznaka uvjeta; puni tekst samo uz
zaglavlje `X-Include-System-Prompt: 1`.

## Alat

Jedan, `set_items`:

| Polje | Tip | Obavezno | Značenje |
|---|---|---|---|
| `items` | niz | da | barem jedna stavka |
| `items[].fk_item_category` | cijeli broj | da | ID iz popisa u kontekstu |
| `items[].item_name` | tekst | da | naziv artikla, ≤ 200 znakova |
| `items[].quantity` | cijeli broj | da | > 0 |
| `estimated_amount` | broj | ne | konačan iznos za uplatu |
| `currency` | tekst | ne | valuta kako piše u ponudi; izostaviti za EUR |

Kad model pošalje nepostojeću kategoriju, prazan popis ili neispravnu količinu,
greška mu se vraća kao rezultat alata i dobiva priliku ispraviti se — najviše
tri poziva modelu po zahtjevu. Nepostojeća kategorija se **ne nagađa**.

## Provideri i postavke

`llm/providerSelector.js` drži obje implementacije iza istog sučelja
(`chat(messages, tools)` → `{ text, tool_calls, usage, latencyMs, finishReason }`).
Izvedba se razrješava po pozivu (`resolveProvider`), a bez imena se uzima zadana
iz `AppSetting.ai_provider`. Lokalni model bira se iz kataloga
(`llm/ollamaModels.js`), Gemini model je slobodan niz — oboje kroz
`PUT /api/assistant/settings` (samo administrator, bez restarta).

Parametri uzorkovanja su zajednički za obje izvedbe (`llm/samplingConfig.js`):
temperatura 0, `top_p` 1, najviše 4096 izlaznih tokena, sjeme 42 samo kod Ollame
jer Gemini taj parametar nema.

## Prava i sigurnost

Ruta traži ista prava pisanja kao ručno uređivanje zahtjeva: zaključan zahtjev
se ne dira, a tko nije administrator smije mijenjati samo svoj zahtjev i samo
dok je vraćen na dopunu. Status se provjerava dvaput — prije poziva modelu i
ponovno pod `FOR UPDATE` prije upisa; ako se u međuvremenu promijenio, vraća se
409 i ništa se ne mijenja. Korisnički ID nikad ne dolazi od modela.

Ograničivač poziva stoji uz rutu (`AI_ITEMS_RATE_LIMIT_MAX`, zadano 20 u 15
minuta).

## Mjerenje

`server/scripts/evalHarness.js` mjeri upravo ovu rutu — vidi
`docs/mjerni-plan.md` i `docs/EVAL_SCENARIOS.md`.
