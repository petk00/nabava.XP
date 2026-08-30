/**
 * Unit testovi: assistantAttachmentStore (docs/AI.md).
 *
 * Spremište postoji da izvorni bajtovi priloga NE putuju kroz klijenta kao
 * base64 (prije je 5 priloga x 5 MB probijalo express.json limit u svakom
 * sljedećem potezu razgovora, i davalo krivotvorenoj carrier poruci moć da
 * podmetne proizvoljan sadržaj u formalni prilog). Ovdje se testira ugovor
 * koji orkestrator koristi: spremi -> dohvati po ID-u -> oslobodi, uz
 * provjeru vlasništva, isteka i gornje granice memorije.
 */

const {
  putAttachments,
  getAttachments,
  dropAttachments,
  _resetForTests,
  ENTRY_TTL_MS,
} = require('../src/services/assistantAttachmentStore');

const fileOf = (name, content) => ({
  fileName: name,
  mimeType: 'application/pdf',
  buffer: Buffer.from(content),
});

beforeEach(() => {
  _resetForTests();
  jest.restoreAllMocks();
});

describe('putAttachments / getAttachments', () => {
  test('spremi pa dohvati po ID-u — vraća iste datoteke, bajt po bajt', () => {
    const files = [fileOf('ponuda.pdf', '%PDF-1.4 ponuda'), fileOf('ponuda2.pdf', '%PDF-1.4 druga')];
    const id = putAttachments(2, files);

    expect(typeof id).toBe('string');
    expect(getAttachments(id, 2)).toEqual(files);
  });

  test('svaki poziv daje NOVI ID — dva razgovora se ne miješaju', () => {
    const a = putAttachments(2, [fileOf('a.pdf', 'A')]);
    const b = putAttachments(2, [fileOf('b.pdf', 'B')]);

    expect(a).not.toBe(b);
    expect(getAttachments(a, 2)[0].fileName).toBe('a.pdf');
    expect(getAttachments(b, 2)[0].fileName).toBe('b.pdf');
  });

  test('prazan ulaz se ne sprema — vraća null umjesto ID-a', () => {
    expect(putAttachments(2, [])).toBeNull();
    expect(putAttachments(2, undefined)).toBeNull();
    // Datoteka bez sadržaja nema što priložiti.
    expect(putAttachments(2, [{ fileName: 'prazno.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(0) }])).toBeNull();
  });

  test('nepoznat ID, prazan ID i null vraćaju prazan niz (nikad iznimku)', () => {
    expect(getAttachments('ne-postoji', 2)).toEqual([]);
    expect(getAttachments('', 2)).toEqual([]);
    expect(getAttachments(null, 2)).toEqual([]);
  });
});

describe('vlasništvo (ID prolazi kroz klijenta, pa se mora provjeriti)', () => {
  test('tuđi korisnik s valjanim ID-em ne dobiva datoteke', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const id = putAttachments(2, [fileOf('tajna-ponuda.pdf', 'X')]);

    expect(getAttachments(id, 7)).toEqual([]);
    expect(getAttachments(id, 2)).toHaveLength(1); // vlasniku i dalje radi
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('istek (TTL)', () => {
  test('unos stariji od TTL-a se ne vraća', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000_000);
    const id = putAttachments(2, [fileOf('ponuda.pdf', 'X')]);

    nowSpy.mockReturnValue(1_000_000 + ENTRY_TTL_MS - 1);
    expect(getAttachments(id, 2)).toHaveLength(1);

    nowSpy.mockReturnValue(1_000_000 + ENTRY_TTL_MS);
    expect(getAttachments(id, 2)).toEqual([]);
  });

  test('istek jednog unosa ne dira ostale', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000_000);
    const stari = putAttachments(2, [fileOf('stari.pdf', 'X')]);

    nowSpy.mockReturnValue(1_000_000 + ENTRY_TTL_MS);
    const novi = putAttachments(2, [fileOf('novi.pdf', 'Y')]);

    expect(getAttachments(stari, 2)).toEqual([]);
    expect(getAttachments(novi, 2)).toHaveLength(1);
  });
});

describe('dropAttachments', () => {
  test('oslobođeni unos više ne postoji', () => {
    const id = putAttachments(2, [fileOf('ponuda.pdf', 'X')]);
    dropAttachments(id);

    expect(getAttachments(id, 2)).toEqual([]);
  });

  test('null/nepoznat ID je bezopasan (poziva se i kad priloga nije ni bilo)', () => {
    expect(() => dropAttachments(null)).not.toThrow();
    expect(() => dropAttachments('ne-postoji')).not.toThrow();
  });
});

describe('gornja granica memorije', () => {
  test('probijanje granice izbacuje NAJSTARIJI unos, ne najnoviji', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { MAX_TOTAL_BYTES } = require('../src/services/assistantAttachmentStore');
    const pola = Math.ceil(MAX_TOTAL_BYTES / 2) + 1;

    const prvi = putAttachments(2, [{ fileName: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(pola) }]);
    const drugi = putAttachments(2, [{ fileName: 'b.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(pola) }]);

    expect(getAttachments(prvi, 2)).toEqual([]);
    expect(getAttachments(drugi, 2)).toHaveLength(1);
  });
});
