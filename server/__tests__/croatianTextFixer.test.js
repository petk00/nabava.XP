/**
 * Unit testovi: croatianTextFixer.fixEkavica — deterministički safety net
 * protiv ekavica/srbizam proklizivanja u AI odgovorima (docs/AI.md).
 */

const { fixEkavica } = require('../src/services/croatianTextFixer');

describe('fixEkavica', () => {
  test('null/undefined/prazan string prolaze nepromijenjeni', () => {
    expect(fixEkavica(null)).toBeNull();
    expect(fixEkavica(undefined)).toBeUndefined();
    expect(fixEkavica('')).toBe('');
  });

  test('stvaran slučaj opažen uživo: "zahtev" u istoj rečenici gdje je "zahtjeva" već ispravno', () => {
    expect(fixEkavica('Vaš zahtev za nabavu je uspješno kreiran. Broj zahtjeva je NAB-2026-0095.'))
      .toBe('Vaš zahtjev za nabavu je uspješno kreiran. Broj zahtjeva je NAB-2026-0095.');
  });

  test('zahtjev osnova — različiti padeži/nastavci', () => {
    expect(fixEkavica('Zahtev je kreiran.')).toBe('Zahtjev je kreiran.');
    expect(fixEkavica('Ne mogu izmijeniti zahteve koji su već poslani.'))
      .toBe('Ne mogu izmijeniti zahtjeve koji su već poslani.');
    expect(fixEkavica('Pregledajte sve zahteve u sustavu.')).toBe('Pregledajte sve zahtjeve u sustavu.');
  });

  test('mjesto, cijena, vrijeme, prije, uvjet — jat/leksičke varijante', () => {
    expect(fixEkavica('Molim vas navedite mesto stanovanja.')).toBe('Molim vas navedite mjesto stanovanja.');
    expect(fixEkavica('Cena je 100 eura.')).toBe('Cijena je 100 eura.');
    expect(fixEkavica('Vreme isporuke je 7 dana.')).toBe('Vrijeme isporuke je 7 dana.');
    expect(fixEkavica('To je bilo davno, pre nego što je počelo.')).toBe('To je bilo davno, prije nego što je počelo.');
    expect(fixEkavica('Koji su uslovi za ovu nabavu?')).toBe('Koji su uvjeti za ovu nabavu?');
  });

  test('čuva veliko početno slovo kad je riječ na početku rečenice', () => {
    expect(fixEkavica('Zahtev je kreiran.')).toMatch(/^Zahtjev/);
    expect(fixEkavica('Vreme ističe.')).toMatch(/^Vrijeme/);
  });

  test('NE dira nepovezane riječi koje slučajno sadrže istu osnovu (lažni pozitivi)', () => {
    expect(fixEkavica('Ovo je cenzura, ne cena.')).toBe('Ovo je cenzura, ne cijena.');
    expect(fixEkavica('Molim vas navedite prezime i mesto stanovanja.'))
      .toBe('Molim vas navedite prezime i mjesto stanovanja.');
    expect(fixEkavica('Predsjednik je najavio novu preporuku.')).toBe('Predsjednik je najavio novu preporuku.');
  });

  test('ispravan hrvatski tekst prolazi potpuno nepromijenjen', () => {
    const text = 'Zahtjev je uspješno kreiran. Vrijeme isporuke je 7 dana, cijena 100 eura.';
    expect(fixEkavica(text)).toBe(text);
  });
});
