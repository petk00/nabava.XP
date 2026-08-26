/**
 * Sigurno renderiranje AI asistentovih odgovora (Markdown -> sanitizirani HTML)
 * — izdvojeno radi testiranja. Koristi se SAMO za bot poruke (AI izlaz), nikad
 * za korisnikov vlastiti unos — korisnikova poruka se ne interpretira kao
 * Markdown/HTML.
 *
 * DOMPurify sanitizacija je namjerna: AI tekst nije izravno korisnički unos,
 * ali može biti neizravno pod utjecajem sadržaja priložene ponude (prompt
 * injection, docs/AI.md) — v-html bez sanitizacije bio bi XSS rizik.
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ breaks: true }); // jednostruki novi red u AI odgovoru = <br>, ne zahtijeva prazan red za novi paragraf

export function renderMarkdown(text) {
  if (!text) return '';
  const html = marked.parse(text);
  return DOMPurify.sanitize(html);
}
