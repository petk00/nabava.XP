// Čitanje stavki i iznosa iz ponude priložene uz POSTOJEĆI zahtjev
// (RequestDetailsPage, gumbi "AI" i "Gemini" uz naslov Stavke -> POST
// /api/requests/:id/ai-items).
//
// Ovo je JEDINI put kojim model u sustavu dira podatke. Razgovorni asistent
// (assistantOrchestrator, alati create_request/propose_request, dvofazna
// potvrda) uklonjen je 5. 9. 2026 — vidi docs/AI.md. Ovdje nema razgovora:
// zahtjev već postoji, model dobiva tekst ponude i šifrarnik kategorija, i
// mijenja mu se samo popis stavki i ukupan iznos. Potvrdu daje korisnik u UI-u
// prije poziva rute, jer je zamjena destruktivna.
//
// Zajedničko sa starim putem je namjerno: isti quoteExtractionService za PDF
// tekst, isti LlmProvider iza istog sučelja (providerSelector), isti
// prompt-uvjet za definicije kategorija (promptVariant) i ista granica duljine
// naziva kao requestService.
//
// DVA OBLIKA ULAZA. PDF prilog prolazi kroz poslužiteljsku ekstrakciju teksta i obje
// izvedbe dobivaju ISTI niz znakova. Slikovni prilog ide modelu izravno, u izvornim
// bajtovima — ondje poslužiteljske ekstrakcije NEMA, pa svaka izvedba radi vlastito
// očitanje i ulaz VIŠE NIJE IZJEDNAČEN. To je razlika u nacrtu mjerenja, ne tehnički
// detalj: rezultati slikovnih priloga izvještavaju se u zasebnoj tablici točnosti i
// tokeni im se broje odvojeno. Zapis pokušaja zato nosi `server_text_extraction`.
//
// Ova ruta JEST mjereni put: evalHarness.js mjeri upravo nju (docs/mjerni-plan.md).

const crypto = require('node:crypto');
const { resolveProvider } = require('./llm/providerSelector');
const { getPromptVariant, categoryDefinitionsBlock } = require('./promptVariant');
const { fixEkavica } = require('./croatianTextFixer');
const { ITEM_NAME_MAX_LENGTH } = require('./requestService');

// Koliko puta smijemo pitati model unutar jednog poziva rute. Prvi poziv +
// najviše dva ispravka (nije pozvao alat / poslao nepostojeću kategoriju).
// Više od toga kod lokalnog modela znači minute čekanja bez izgleda za uspjeh.
const MAX_MODEL_CALLS = 3;

// Kočnica protiv modela koji krene generirati stavke u nedogled — stvarne
// ponude u fixtures/ imaju do desetak redaka.
const MAX_ITEMS = 50;

// Širina stupca PurchaseRequest.total_amount je decimal(14,2) — iznos iznad
// ovoga ne stane u bazu i pao bi tek na UPDATE-u, bez razumljivog razloga.
const MAX_AMOUNT = 999999999999.99;

// Iznos se upisuje SAMO ako je ponuda u eurima. Ponuda u drugoj valuti nosi
// broj koji bi bez preračuna bio kriva vrijednost u bazi (isto pravilo kao
// pravilo 7 u assistantOrchestrator.js), pa se tada iznos ne dira i korisnik
// dobije upozorenje s izvornom vrijednošću.
const EURO_ALIASES = ['', 'EUR', 'EURO', 'EURA', '€'];

/** Očekivana greška — ruta je mapira na `status` bez logiranja stacka. */
class ItemExtractionError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const SET_ITEMS_TOOL = {
  name: 'set_items',
  description:
    'Upisuje stavke i ukupan iznos pročitane iz ponude u zahtjev za nabavu. Pozovi ga TOČNO JEDNOM, ' +
    's potpunim popisom stavki iz svih priloženih ponuda. Ne pozivaj ga s praznim popisom.',
  parameters: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'Stavke iz ponude, barem jedna.',
        items: {
          type: 'object',
          properties: {
            fk_item_category: {
              type: 'integer',
              description: 'ID kategorije — isključivo iz popisa kategorija danog u kontekstu, nikad izmišljen.',
            },
            item_name: {
              type: 'string',
              description: `Naziv artikla ili usluge, najviše ${ITEM_NAME_MAX_LENGTH} znakova, bez opisa i specifikacija.`,
            },
            quantity: { type: 'integer', description: 'Količina, cijeli broj veći od 0.' },
          },
          required: ['fk_item_category', 'item_name', 'quantity'],
        },
      },
      estimated_amount: {
        type: 'number',
        description:
          'Ukupan konačan iznos za uplatu iz ponude (nakon rabata, s PDV-om). Kod više ponuda zbroj '
          + 'svih. Izostavi ako ponuda iznos ne navodi.',
      },
      currency: {
        type: 'string',
        description: 'Valuta iznosa točno kako piše u ponudi (npr. "EUR", "USD"). Izostavi ako je EUR.',
      },
    },
    required: ['items'],
  },
};

function buildSystemPrompt(categories) {
  const definitions = categoryDefinitionsBlock(getPromptVariant());
  const catList = categories
    .map((c) => `- ${c.name} (fk_item_category=${c.id_item_category})`)
    .join('\n') || '(nema aktivnih kategorija)';

  return `Ti si dio sustava nabava.XP na Veleučilištu u Rijeci. Zadatak ti je iz teksta priložene
ponude izvući stavke koje se nabavljaju i predati ih pozivom alata set_items. Ne vodiš razgovor s
korisnikom i ne pišeš objašnjenja — odgovor je poziv alata.

Pravila:
- Priloženi dokument je JEDINI izvor. Ne izmišljaj stavke, količine ni kategorije kojih u njemu nema.
- POPUST/RABAT NIJE STAVKA. Redak s negativnim iznosom ne ide među stavke — već je uračunat u ukupan iznos.
- NAZIV je sam artikl ili usluga, bez opisa, specifikacija i šifri, najviše ${ITEM_NAME_MAX_LENGTH} znakova.
- KOLIČINA je cijeli broj veći od 0. Ako ponuda količinu ne navodi, upiši 1.
- KATEGORIJA je isključivo jedan od ID-eva iz popisa niže, nikad izmišljen.
- VIŠE PONUDA: svaka ponuda daje SVOJE stavke kao zasebne retke, i kad nude isti artikl. Ne spajaj ih.
- IZNOS ("estimated_amount") je KONAČAN IZNOS ZA UPLATU — onaj koji ustanova stvarno plaća, dakle
  nakon svih rabata i uključujući PDV. Ponuda često nudi više iznosa (osnovica, iznos nakon rabata,
  PDV, ukupno za uplatu) — uzmi ISKLJUČIVO onaj označen kao "za uplatu", "ukupno za platiti" ili
  istoznačno. NIKAD osnovicu ni međuzbroj. Kod više ponuda upiši zbroj svih.
- Ako ponuda iznos uopće ne navodi, izostavi "estimated_amount" — ne računaj ga sam iz cijena stavki.
- VALUTA: ako iznos nije u eurima, upiši izvorni broj i valutu u "currency" ("USD", "GBP"…). Ne
  preračunavaj. Pazi na zapis: "1,250.00" je tisuću dvjesto pedeset, decimalna točka.
- Ako priloženi dokument nije ponuda (ugovor, dopis, račun, obavijest), NE pretvaraj ga u stavke —
  ne pozivaj alat, nego kratko napiši što dokument zapravo jest.
- SLIKA: ako je ponuda priložena kao slika, čitaj je izravno. Ako je dio teksta nečitljiv, radije
  izostavi tu stavku nego da nagađaš; nepotpun popis je bolji od izmišljenog.

Kategorije artikala (koristi TOČNO ove ID-eve):
${catList}${definitions.text}`;
}

/**
 * Korisnička poruka nosi tekstualne priloge doslovno, a slikovne samo najavljuje —
 * njihovi bajtovi idu zasebnim putem (`images` na poruci), koji svaki provider
 * preslikava u svoj oblik (Ollamin `images`, Geminijev `inlineData`).
 */
function buildUserMessage(attachments) {
  const multiple = attachments.length > 1;
  let imageOrdinal = 0;

  const blocks = attachments.map((a, idx) => {
    const label = multiple ? `Ponuda ${idx + 1} (dokument: ${a.filename})` : `Ponuda (dokument: ${a.filename})`;
    if (a.kind === 'image') {
      imageOrdinal += 1;
      return `${label} — priložena je kao SLIKA (${imageOrdinal}. slika po redoslijedu), pogledaj je izravno.`;
    }
    return [`${label} — tekst izvučen iz PDF-a:`, '"""', a.text, '"""'].join('\n');
  }).join('\n\n');

  return `${blocks}

Izvuci stavke i pozovi set_items.`;
}

/**
 * Model vraća što stigne — ovdje se to svodi na ono što baza smije primiti.
 * Sve što se dade popraviti bez nagađanja (višak razmaka, predug naziv,
 * količina kao string) popravlja se i prijavljuje kao upozorenje; nepostojeća
 * kategorija se NE nagađa nego vraća modelu na ispravak.
 *
 * @returns {{ ok: true, items: Array, amount: number|null, warnings: string[] }|{ ok: false, message: string }}
 */
function normalizePayload(args, categories) {
  const rawItems = args?.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, message: 'Popis "items" je prazan. Pozovi set_items s barem jednom stavkom iz ponude.' };
  }
  if (rawItems.length > MAX_ITEMS) {
    return { ok: false, message: `Poslao si ${rawItems.length} stavki, najviše je dopušteno ${MAX_ITEMS}. Vrati samo stvarne artikle iz ponude.` };
  }

  const allowedIds = new Set(categories.map((c) => c.id_item_category));
  const items = [];
  const warnings = [];

  for (const [idx, raw] of rawItems.entries()) {
    const position = idx + 1;

    const categoryId = Number(raw?.fk_item_category);
    if (!Number.isInteger(categoryId) || !allowedIds.has(categoryId)) {
      const allowed = categories.map((c) => `${c.id_item_category} (${c.name})`).join(', ');
      return {
        ok: false,
        message: `Stavka #${position}: fk_item_category=${raw?.fk_item_category} ne postoji. `
          + `Dopušteni ID-evi su: ${allowed}. Pozovi set_items ponovno s ispravnim kategorijama.`,
      };
    }

    const name = typeof raw?.item_name === 'string' ? raw.item_name.replace(/\s+/g, ' ').trim() : '';
    if (!name) {
      return { ok: false, message: `Stavka #${position}: nedostaje "item_name". Pozovi set_items ponovno.` };
    }
    let finalName = name;
    if (finalName.length > ITEM_NAME_MAX_LENGTH) {
      finalName = finalName.slice(0, ITEM_NAME_MAX_LENGTH).trim();
      warnings.push(`Naziv stavke #${position} je skraćen na ${ITEM_NAME_MAX_LENGTH} znakova.`);
    }

    // Model zna vratiti količinu kao string ("6") ili decimalu ("2.0") —
    // oboje je jednoznačno pretvorivo, pa nema razloga zbog toga vraćati
    // cijeli poziv na ispravak.
    const quantityNumber = Number(raw?.quantity);
    let quantity;
    if (Number.isFinite(quantityNumber) && quantityNumber >= 1) {
      quantity = Math.round(quantityNumber);
      if (quantity !== quantityNumber) {
        warnings.push(`Količina stavke #${position} zaokružena je s ${quantityNumber} na ${quantity}.`);
      }
    } else {
      return {
        ok: false,
        message: `Stavka #${position}: "quantity" mora biti cijeli broj veći od 0, a poslano je `
          + `${JSON.stringify(raw?.quantity)}. Pozovi set_items ponovno.`,
      };
    }

    items.push({ fk_item_category: categoryId, item_name: finalName, quantity });
  }

  // Iznos je NEOBAVEZAN: ponuda ga ne mora imati, a model ga ne smije izmisliti.
  // `null` znači "ne diraj postojeći iznos zahtjeva", ne "nula eura".
  let amount = null;
  // Zašto iznos nije upisan — korisniku se poslije "ponuda ga nema" i "ponuda
  // je u drugoj valuti" ne smiju javiti kao ista stvar.
  let amountStatus = 'missing';
  const rawAmount = args?.estimated_amount;
  if (rawAmount !== null && rawAmount !== undefined && rawAmount !== '') {
    const amountNumber = Number(rawAmount);
    if (!Number.isFinite(amountNumber) || amountNumber < 0) {
      return {
        ok: false,
        message: `"estimated_amount" mora biti pozitivan broj, a poslano je ${JSON.stringify(rawAmount)}. `
          + 'Pozovi set_items ponovno, ili izostavi iznos ako ga ponuda ne navodi.',
      };
    }
    if (amountNumber > MAX_AMOUNT) {
      return {
        ok: false,
        message: `"estimated_amount" (${amountNumber}) je izvan dopuštenog raspona. Provjeri jesi li `
          + 'pročitao ukupan iznos za uplatu, a ne neki drugi broj iz ponude.',
      };
    }

    const currency = String(args?.currency ?? '').trim().toUpperCase();
    if (EURO_ALIASES.includes(currency)) {
      amount = Math.round(amountNumber * 100) / 100;
      amountStatus = 'read';
    } else {
      amountStatus = 'foreign_currency';
      // Preračun tečaja nije posao ovog poziva — iznos ostaje kakav je bio,
      // a korisnik dobiva izvornu vrijednost da je sam provjeri.
      warnings.push(
        `Ponuda je u valuti ${currency} (${amountNumber}), ne u eurima — iznos zahtjeva nije promijenjen.`
      );
    }
  }

  return { ok: true, items, amount, amountStatus, warnings };
}

/**
 * Pita aktivni model da iz teksta ponuda složi popis stavki.
 *
 * @param {Array<{filename: string, kind: 'pdf'|'image', text?: string, mimeType?: string, base64?: string}>} attachments
 *   Prilozi redoslijedom kojim su dodani uz zahtjev. PDF nosi već izvučen `text`;
 *   slika nosi `mimeType` i `base64` i ide modelu izravno, bez ekstrakcije.
 * @param {Array<{id_item_category: number, name: string}>} categories kategorije POSLOVNE GODINE ZAHTJEVA
 * @param {string} [providerKey] 'ollama' | 'gemini'; bez njega se uzima provider iz postavke
 * @returns {Promise<{ items: Array, amount: number|null, amountStatus: string, warnings: string[],
 *   usage: object, server_text_extraction: boolean, input_kinds: string[], provider: string,
 *   model: string|null, prompt_meta: object, text: string|null }>} `amount` je null kad ponuda iznos ne navodi ili nije
 *   u eurima — tada postojeći iznos zahtjeva ostaje nepromijenjen.
 * @throws {ItemExtractionError}
 */
async function extractItemsFromQuotes({ attachments, categories, providerKey = null }) {
  if (categories.length === 0) {
    throw new ItemExtractionError(400, 'Poslovna godina ovog zahtjeva nema nijednu aktivnu kategoriju artikala.');
  }

  let provider;
  let resolvedKey;
  try {
    ({ provider, key: resolvedKey } = await resolveProvider(providerKey));
  } catch (error) {
    throw new ItemExtractionError(400, error.message);
  }

  const capabilities = await provider.getCapabilities();
  if (!capabilities.supportsTools) {
    throw new ItemExtractionError(
      400,
      `Odabrani AI model (${capabilities.model}) ne podržava pozivanje alata, pa ne može upisati stavke. `
        + 'Administrator mora u postavkama asistenta odabrati model koji ih podržava.'
    );
  }

  const systemPrompt = buildSystemPrompt(categories);
  // Prompt NIJE konstanta: popis kategorija dolazi iz baze, a definicije se
  // umeću uvjetno. Hash i uvjet vraćaju se uz svaki odgovor da se ishod može
  // pripisati konkretnom sastavljenom promptu (isti razlog kao u mjernom
  // planu §3) — puni tekst samo kad ga pozivatelj izričito zatraži.
  const definitions = categoryDefinitionsBlock(getPromptVariant());
  const promptMeta = {
    prompt_variant: getPromptVariant(),
    system_prompt_hash: crypto.createHash('sha256').update(systemPrompt, 'utf8').digest('hex').slice(0, 16),
    category_codebook_sha256: definitions.codebookSha256,
    codebook_excerpt_sha256: definitions.codebookExcerptSha256,
    system_prompt: systemPrompt,
  };

  // Slike putuju kao dio korisnikove poruke, ne kao zasebna poruka — to je oblik koji
  // oba providera nativno razumiju (Ollamin `images`, Geminijev `inlineData`).
  const images = attachments
    .filter((a) => a.kind === 'image')
    .map((a) => ({ mimeType: a.mimeType, data: a.base64 }));

  const userMessage = { role: 'user', content: buildUserMessage(attachments) };
  if (images.length > 0) userMessage.images = images;

  const convo = [
    { role: 'system', content: systemPrompt },
    userMessage,
  ];

  const usage = {
    promptTokens: 0,
    completionTokens: 0,
    modelLatencyMs: 0,
    modelCalls: 0,
    modelCallLatenciesMs: [],
    truncated: false,
  };

  let lastText = null;

  for (let call = 0; call < MAX_MODEL_CALLS; call++) {
    const result = await provider.chat(convo, [SET_ITEMS_TOOL]);

    usage.promptTokens += result.usage?.promptTokens || 0;
    usage.completionTokens += result.usage?.completionTokens || 0;
    usage.modelLatencyMs += result.latencyMs || 0;
    usage.modelCalls += 1;
    usage.modelCallLatenciesMs.push(result.latencyMs ?? null);
    if (result.finishReason === 'length' || result.finishReason === 'MAX_TOKENS') usage.truncated = true;
    lastText = result.text ?? lastText;

    const toolCall = (result.tool_calls || []).find((tc) => tc.name === SET_ITEMS_TOOL.name);

    if (!toolCall) {
      // Bez poziva alata nema stavki. Model koji je umjesto toga objasnio da
      // dokument nije ponuda ima pravo — njegov tekst ide korisniku, ne još
      // jedno navaljivanje. Zato se ponavlja samo kad odgovora nema uopće.
      if (result.text && result.text.trim()) {
        // Modelov tekst ide izravno korisniku, pa prolazi kroz isti hrvatski
        // safety net koji je prije čuvao odgovore asistenta.
        throw new ItemExtractionError(
          422,
          `Model nije izvukao stavke iz ponude. Njegov odgovor: ${fixEkavica(result.text.trim())}`
        );
      }
      convo.push({ role: 'assistant', content: '' });
      convo.push({ role: 'user', content: 'Nisi vratio ništa. Pozovi alat set_items sa stavkama iz ponude.' });
      continue;
    }

    const normalized = normalizePayload(toolCall.arguments, categories);
    if (normalized.ok) {
      return {
        items: normalized.items,
        amount: normalized.amount,
        amountStatus: normalized.amountStatus,
        warnings: normalized.warnings,
        usage,
        // Je li model dobio tekst koji je izvukao poslužitelj, ili je sam čitao sliku.
        // Kad je false, ulaz NIJE izjednačen među izvedbama — vidi napomenu na vrhu.
        server_text_extraction: images.length === 0,
        input_kinds: attachments.map((a) => a.kind),
        provider: resolvedKey,
        model: capabilities.model ?? null,
        prompt_meta: promptMeta,
        text: result.text ?? null,
      };
    }

    // Isti obrazac kao u orkestratoru: greška se vraća MODELU kao tool
    // rezultat, da se može sam ispraviti, umjesto da poziv rute odmah padne.
    convo.push({ role: 'assistant', content: result.text || '', tool_calls: [toolCall] });
    convo.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      name: toolCall.name,
      content: JSON.stringify({ ok: false, message: normalized.message }),
    });
  }

  throw new ItemExtractionError(
    422,
    'Model nakon više pokušaja nije vratio ispravan popis stavki'
      + (lastText && lastText.trim() ? `. Njegov zadnji odgovor: ${fixEkavica(lastText.trim())}` : '.')
  );
}

module.exports = { extractItemsFromQuotes, ItemExtractionError, MAX_ITEMS };
