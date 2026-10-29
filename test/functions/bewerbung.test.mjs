// Lokaler Test des Bewerbungs-Eingangs OHNE `netlify dev`: @netlify/blobs wird per Loader-Hook durch
// den In-Memory-Mock ersetzt (register.mjs), fetch (= Übergabe an n8n) wird abgefangen, die Handler
// werden direkt mit Request/Response aufgerufen. Aufruf (Repo-Root):  npm test
// Deckt ab: Env fail-closed, Methode/Origin/Drossel, Feldregeln, Honeypot, Lebenslauf-Prüfung,
// Paketform für n8n, Warteschlange bei n8n-Ausfall, Nachsenden, Status-Messpunkt.
// NICHT abgedeckt: Konsistenz des echten Blobs-Edge und das 6-MB-Limit von Netlify (nur live messbar).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { _reset, _dump } from './mock-blobs.mjs';

const FN = new URL('../../netlify/functions/', import.meta.url).href;
// Fake-Werte — bewusst KEINE echten Env-Werte (Netlify-Secrets-Scan liest Repo-Dateien).
const ORIGIN = 'https://karriere.test';
const ENV = { BEWERBER_WEBHOOK_URL: 'http://127.0.0.1:9/hook', BEWERBER_WEBHOOK_KEY: 'test-key', APP_ORIGIN: ORIGIN };
for (const k of ['URL', 'DEPLOY_PRIME_URL', 'SITE_NAME', 'NETLIFY_DEV', 'APP_ORIGIN', 'BEWERBER_WEBHOOK_URL', 'BEWERBER_WEBHOOK_KEY']) delete process.env[k];

const bewerbung = (await import(FN + 'bewerbung.mjs')).default;
const nachsenden = (await import(FN + 'bewerbung-nachsenden.mjs')).default;
const status = (await import(FN + 'bewerbung-status.mjs')).default;

// fetch-Attrappe für den n8n-Webhook: antwortet mit `antwort.status` (oder wirft bei `antwort.fehler`).
const gesendet = [];
const antwort = { status: 200, fehler: null };
globalThis.fetch = async (url, opts) => {
  gesendet.push({ url, headers: opts.headers, paket: JSON.parse(opts.body) });
  if (antwort.fehler) throw Object.assign(new Error('x'), { name: antwort.fehler });
  return new Response('{"ok":true}', { status: antwort.status });
};

const logs = { error: [], warn: [] };
console.error = (...a) => { logs.error.push(a.join(' ')); };
console.warn = (...a) => { logs.warn.push(a.join(' ')); };
console.log = () => {};

let ipSeq = 10;
const freshIp = () => `203.0.113.${ipSeq++}`;

function formular(felder = {}, datei = null) {
  const fd = new FormData();
  const basis = { name: '🔌 Elektriker-FFM — TEST FUNMAXXING 2026 #999', telefon: '0541 000000', email: 'khalil+systemtest@zap-pruefstelle.de',
    _quelle: 'elektriker-frankfurt.html', _gotcha: '', consent_marketing: 'false', event_id: '3f1c2b9a-0000-4000-8000-000000000001' };
  for (const [k, v] of Object.entries({ ...basis, ...felder })) {
    if (v === undefined) continue;
    for (const x of [].concat(v)) fd.append(k, x);
  }
  if (datei) fd.append('lebenslauf', datei);
  return fd;
}
function req(body, { method = 'POST', origin = ORIGIN, accept = 'application/json' } = {}) {
  const h = new Headers();
  if (origin !== null) h.set('origin', origin);
  if (accept) h.set('accept', accept);
  return new Request('https://karriere.test/api/bewerbung', { method, headers: h, body: method === 'POST' ? body : undefined });
}
async function call(fn, r, ip = freshIp()) {
  const res = await fn(r, { ip });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
}
const pdf = (bytes) => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, ...new Array(Math.max(0, bytes - 6)).fill(0x20)])], 'Mein Lebenslauf.pdf', { type: 'application/pdf' });

beforeEach(() => { _reset(); gesendet.length = 0; antwort.status = 200; antwort.fehler = null; logs.error.length = 0; logs.warn.length = 0; });

test('Env fail-closed: ohne Webhook-Env 500, nichts gesendet', async () => {
  const r = await call(bewerbung, req(formular()));
  assert.equal(r.status, 500); assert.deepEqual(r.body, { ok: false });
  assert.equal(gesendet.length, 0);
  Object.assign(process.env, ENV);
});

test('gleiche Herkunft wie die Request-URL reicht (ohne Env-Liste, wie im Deploy-Preview)', async () => {
  delete process.env.APP_ORIGIN;
  try {
    const h = new Headers({ origin: 'https://deploy-preview-1--site.netlify.app', accept: 'application/json' });
    const r = await call(bewerbung, new Request('https://deploy-preview-1--site.netlify.app/api/bewerbung', { method: 'POST', headers: h, body: formular() }));
    assert.equal(r.status, 200);
    const fremd = new Headers({ origin: 'https://evil.example' });
    assert.equal((await call(bewerbung, new Request('https://deploy-preview-1--site.netlify.app/api/bewerbung', { method: 'POST', headers: fremd, body: formular() }))).status, 403);
  } finally { process.env.APP_ORIGIN = ORIGIN; }
});

test('GET 405, fremder/fehlender Origin 403', async () => {
  assert.equal((await call(bewerbung, req(null, { method: 'GET' }))).status, 405);
  assert.equal((await call(bewerbung, req(formular(), { origin: 'https://evil.example' }))).status, 403);
  assert.equal((await call(bewerbung, req(formular(), { origin: null }))).status, 403);
  assert.equal(gesendet.length, 0);
});

test('gültige Bewerbung: Paket in Formspree-Form mit Schlüssel-Header an n8n, 200 ok', async () => {
  const r = await call(bewerbung, req(formular({ montage: 'ja', gesellenbrief: 'ja' })));
  assert.equal(r.status, 200); assert.deepEqual(r.body, { ok: true });
  assert.equal(gesendet.length, 1);
  const { url, headers, paket } = gesendet[0];
  assert.equal(url, ENV.BEWERBER_WEBHOOK_URL);
  assert.equal(headers['X-ZAP-Karriere-Key'], 'test-key');
  assert.equal(paket.submission.montage, 'ja');
  assert.equal(paket.submission._quelle, 'elektriker-frankfurt.html');
  assert.equal(paket.submission.consent_marketing, 'false');
  assert.equal(paket.cv, undefined);
  assert.equal(paket.version, 1);
  assert.equal(paket.id, '3f1c2b9a-0000-4000-8000-000000000001');
  assert.match(paket.eingang, /^\d{4}-\d{2}-\d{2}T/);
});

test('ohne JavaScript (kein Accept: json): Danke-Seite statt JSON; ohne event_id eigene id', async () => {
  const res = await bewerbung(req(formular({ event_id: undefined }), { accept: 'text/html' }), { ip: freshIp() });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(await res.text(), /Bewerbung ist angekommen/);
  assert.match(gesendet[0].paket.id, /^[0-9a-f-]{36}$/);
});

test('DOCX: nur ZIP mit word/-Ordner gilt als Word-Datei', async () => {
  const zip = (inhalt) => new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...Buffer.from(inhalt)])], 'cv.docx');
  await call(bewerbung, req(formular({}, zip('[Content_Types].xml word/document.xml'))));
  await call(bewerbung, req(formular({}, zip('irgendwas/evil.exe'))));
  assert.equal(gesendet[0].paket.cv.typ, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(gesendet[1].paket.cv, undefined);
  assert.match(gesendet[1].paket.submission.nachricht, /Dateityp nicht erlaubt/);
});

test('Honeypot gefüllt: 200 ok, aber NICHTS an n8n', async () => {
  const r = await call(bewerbung, req(formular({ _gotcha: 'bot' })));
  assert.equal(r.status, 200); assert.equal(gesendet.length, 0);
});

test('ohne Telefon UND E-Mail: 400; Großschreibung Telefon (vertrieb-dunkel) reicht', async () => {
  assert.equal((await call(bewerbung, req(formular({ telefon: undefined, email: undefined })))).status, 400);
  assert.equal((await call(bewerbung, req(formular({ telefon: undefined, email: undefined, Telefon: '0541 1' })))).status, 200);
});

test('Feldregeln: ungültige Namen verworfen, Mehrfachwerte verbunden, Überlänge gekürzt + Hinweis', async () => {
  await call(bewerbung, req(formular({ 'bad-name': 'x', 'q<1>': 'y', verkauft_heute: ['B2B', 'Telefon'], warum_vertrieb: 'a'.repeat(6000) })));
  const s = gesendet[0].paket.submission;
  assert.equal('bad-name' in s, false); assert.equal('q<1>' in s, false);
  assert.equal(s.verkauft_heute, 'B2B, Telefon');
  assert.equal(s.warum_vertrieb.length, 5000);
  assert.match(s.nachricht, /gekürzt/);
});

test('Feldnamen __proto__/toString/constructor: normale Felder, kein Prototyp-Effekt', async () => {
  await call(bewerbung, req(formular({ __proto__x: 'a', toString: 'b', constructor: 'c' })));
  const fd = new FormData(); fd.append('__proto__', 'p'); fd.append('telefon', '1');
  await call(bewerbung, req(fd));
  const [a, b] = gesendet.map((g) => g.paket.submission);
  assert.equal(a.toString, 'b'); assert.equal(a.constructor, 'c');
  assert.equal(b.__proto__, 'p'); assert.equal(Object.getPrototypeOf(b), Object.prototype); // JSON.parse = eigenes Feld
  assert.equal({}.polluted, undefined);
});

test('höchstens 80 Felder', async () => {
  const viele = Object.fromEntries(Array.from({ length: 120 }, (_, i) => [`f${i}`, 'x']));
  await call(bewerbung, req(formular(viele)));
  assert.equal(Object.keys(gesendet[0].paket.submission).length <= 81, true); // 80 + evtl. nachricht
});

test('Lebenslauf PDF: als base64 mit erkanntem Typ und bereinigtem Namen', async () => {
  await call(bewerbung, req(formular({}, pdf(2048))));
  const { cv, submission } = gesendet[0].paket;
  assert.equal(cv.typ, 'application/pdf'); assert.equal(cv.groesse, 2048);
  assert.equal(cv.dateiname, 'Mein Lebenslauf.pdf');
  assert.equal(Buffer.from(cv.base64, 'base64').subarray(0, 4).toString(), '%PDF');
  assert.equal(submission.lebenslauf, undefined);
});

test('Lebenslauf zu groß / falscher Typ: Bewerbung geht trotzdem durch, Hinweis statt Datei', async () => {
  await call(bewerbung, req(formular({ nachricht: 'Hallo' }, pdf(4 * 1024 * 1024 + 1))));
  let p = gesendet[0].paket;
  assert.equal(p.cv, undefined); assert.match(p.submission.nachricht, /^Hallo\n\n⚠️ Lebenslauf nicht übernommen: zu groß/);
  const exe = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 1, 2, 3])], 'cv.pdf', { type: 'application/pdf' });
  await call(bewerbung, req(formular({}, exe)));
  p = gesendet[1].paket;
  assert.equal(p.cv, undefined); assert.match(p.submission.nachricht, /Dateityp nicht erlaubt/);
});

test('Dateiname: Pfad, Sonderzeichen und falsche Endung werden bereinigt', async () => {
  const f = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])], '../../<script>foto.exe', { type: 'image/jpeg' });
  await call(bewerbung, req(formular({}, f)));
  assert.equal(gesendet[0].paket.cv.dateiname, 'scriptfoto.jpg');
  assert.equal(gesendet[0].paket.cv.typ, 'image/jpeg');
});

test('n8n antwortet 500 (z. B. Guard lehnt ab): Bewerbung geparkt, Bewerber sieht Erfolg', async () => {
  antwort.status = 500;
  const r = await call(bewerbung, req(formular()));
  assert.equal(r.status, 200); assert.deepEqual(r.body, { ok: true });
  const q = _dump()['bewerbungen-warteschlange'];
  const keys = Object.keys(q);
  assert.equal(keys.length, 1);
  assert.match(keys[0], /^\d{8}T\d{6}Z_3f1c2b9a-0000-4000-8000-000000000001$/);
  assert.equal(q[keys[0]].versuche, 1); assert.equal(q[keys[0]].letzter_status, 500);
  assert.equal(q[keys[0]].paket.submission.telefon, '0541 000000');
});

test('n8n Timeout/Netzfehler: ebenfalls geparkt', async () => {
  antwort.fehler = 'AbortError';
  await call(bewerbung, req(formular()));
  const q = _dump()['bewerbungen-warteschlange'];
  assert.equal(Object.values(q)[0].letzter_status, 'timeout');
});

test('n8n UND Warteschlange kaputt: 502 (Seite zeigt Telefonnummer)', async () => {
  antwort.status = 503;
  process.env.MOCK_BLOBS_FAIL = '1';
  try {
    const r = await call(bewerbung, req(formular()));
    assert.equal(r.status, 502); assert.deepEqual(r.body, { ok: false });
    assert.ok(logs.error.some((l) => l.includes('Warteschlange fehlgeschlagen')));
  } finally { delete process.env.MOCK_BLOBS_FAIL; }
});

test('Nachsenden: höchstens 3 je Lauf, zufällige Auswahl, Rest bleibt erhalten', async () => {
  antwort.status = 500;
  for (let i = 0; i < 5; i++) await call(bewerbung, req(formular({ event_id: `cccccccc-${i}` })));
  antwort.status = 200; gesendet.length = 0;
  await nachsenden();
  assert.equal(gesendet.length, 3);
  assert.equal(Object.keys(_dump()['bewerbungen-warteschlange']).length, 2);
  await nachsenden();
  assert.equal(Object.keys(_dump()['bewerbungen-warteschlange']).length, 0);
});

test('Nachsenden: stellt zu und löscht erst nach Erfolg; Fehlschlag zählt Versuche hoch', async () => {
  antwort.status = 500;
  await call(bewerbung, req(formular({ event_id: 'aaaaaaaa-1' })));
  await call(bewerbung, req(formular({ event_id: 'bbbbbbbb-2' })));
  assert.equal(Object.keys(_dump()['bewerbungen-warteschlange']).length, 2);

  gesendet.length = 0;
  await nachsenden();                              // n8n weiter kaputt
  let q = _dump()['bewerbungen-warteschlange'];
  assert.equal(Object.keys(q).length, 2);
  assert.ok(Object.values(q).every((e) => e.versuche === 2));

  antwort.status = 200;
  gesendet.length = 0;
  await nachsenden();
  q = _dump()['bewerbungen-warteschlange'];
  assert.equal(Object.keys(q).length, 0);
  assert.equal(gesendet.length, 2);
  assert.equal(gesendet[0].headers['X-ZAP-Karriere-Key'], 'test-key');
  assert.deepEqual(gesendet.map((g) => g.paket.id).sort(), ['aaaaaaaa-1', 'bbbbbbbb-2']);
});

test('Status: nur Zahlen, Alter der ältesten Bewerbung aus dem Schlüssel', async () => {
  let r = await call(status, new Request('https://karriere.test/api/bewerbung-status'));
  assert.equal(r.status, 200); assert.deepEqual(r.body, { wartend: 0, aelteste_min: null });
  antwort.status = 500;
  await call(bewerbung, req(formular()));
  r = await call(status, new Request('https://karriere.test/api/bewerbung-status'));
  assert.equal(r.body.wartend, 1); assert.equal(r.body.aelteste_min, 0);
  assert.equal(JSON.stringify(r.body).includes('0541'), false);
});

test('Drossel: ab der 9. Sendung derselben IP in 10 Min 429 mit Retry-After', async () => {
  const ip = freshIp();
  for (let i = 0; i < 8; i++) assert.equal((await call(bewerbung, req(formular()), ip)).status, 200, `Sendung ${i + 1}`);
  const r = await call(bewerbung, req(formular()), ip);
  assert.equal(r.status, 429); assert.equal(r.headers.get('retry-after'), '600');
  assert.equal(gesendet.length, 8);
});

test('ohne vertrauenswürdige IP: fail-closed 429', async () => {
  const res = await bewerbung(req(formular()), {});
  assert.equal(res.status, 429);
});

test('Logs enthalten keine Bewerberdaten', async () => {
  antwort.status = 500;
  await call(bewerbung, req(formular()));
  const alles = [...logs.error, ...logs.warn].join('\n');
  assert.equal(/0541|khalil\+systemtest|FUNMAXXING/.test(alles), false);
});
