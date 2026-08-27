import { describe, expect, test } from 'vitest';
import { renderMarkdown } from '../utils/renderMarkdown';

describe('renderMarkdown', () => {
  test('prazan/null tekst vraća prazan string', () => {
    expect(renderMarkdown('')).toBe('');
    expect(renderMarkdown(null)).toBe('');
    expect(renderMarkdown(undefined)).toBe('');
  });

  test('markdown lista (odjeli) renderira se kao <ul>/<li>', () => {
    const html = renderMarkdown('Odjeli:\n- Informatička služba\n- Knjižnica');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>Informatička služba</li>');
    expect(html).toContain('<li>Knjižnica</li>');
  });

  test('**bold** postaje <strong>', () => {
    expect(renderMarkdown('**Odjel:** Informatička služba')).toContain('<strong>Odjel:</strong>');
  });

  test('opasan <script> tag se ukloni (sanitizacija, prompt injection zaštita)', () => {
    const html = renderMarkdown('Tekst <script>alert(1)</script> nastavak.');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('alert(1)');
  });

  test('onerror/onclick atributi se uklone (XSS preko markdown/HTML miješanja)', () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">');
    expect(html).not.toContain('onerror');
  });

  test('obična rečenica bez markdown sintakse i dalje čitljiva (omotana u <p>)', () => {
    const html = renderMarkdown('Zahtjev je uspješno kreiran.');
    expect(html).toContain('Zahtjev je uspješno kreiran.');
  });
});
