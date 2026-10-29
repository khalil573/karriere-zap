// bewerbung.mjs — eigener Eingang für alle Bewerbungsformulare (ersetzt Formspree xqewlovo, 29.10.2026).
//
// Seite → POST /api/bewerbung (FormData, gleiche Domain) → prüfen → n8n FxzN9PrjPTBKizYu.
// Das Paket hat bewusst dieselbe Form wie früher der Formspree-Webhook (`body.submission.*`),
// damit Trello-Karten, Eingangsmail und das Conversion-Gate in n8n unverändert bleiben.
// Antwortet n8n nicht, landet die Bewerbung in der Warteschlange (Netlify Blobs) und
// bewerbung-nachsenden.mjs stellt sie zu — eine Bewerbung geht nie verloren.
//
// 🔴 Keine PII in Logs: nur Status, Gründe, Größen.
import crypto from 'node:crypto';
import {
  json, originAllowed, rateLimitKey, isRateLimited, webhookKonfiguriert,
  weiterleiten, warteschlange, warteschlangenKey,
} from '../shared/karriere.mjs';

export const config = { path: '/api/bewerbung' };

const FELDNAME = /^[A-Za-z0-9_]{1,40}$/;
const MAX_FELDER = 80;
const MAX_WERT = 5000;
// Netlify kappt Function-Requests bei 6 MB inklusive Kodierung → Lebenslauf höchstens 4 MB.
// Die Seiten prüfen das schon im Browser (und verkleinern Fotos); hier ist die harte Grenze.
const MAX_CV = 4 * 1024 * 1024;
const MAX_BODY = 6 * 1024 * 1024;
// Function-Limit 10 s: n8n-Wartezeit + Drossel + (im Fehlerfall) Warteschlangen-Write müssen hineinpassen.
const TIMEOUT_MS = 4500;
const PAKET_VERSION = 1;

// Dateityp nur über die Signatur der ersten Bytes, nie über Endung oder Browser-Angabe.
const CV_TYPEN = [
  { typ: 'application/pdf', endung: 'pdf', passt: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
  { typ: 'image/jpeg', endung: 'jpg', passt: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { typ: 'image/png', endung: 'png', passt: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { typ: 'application/msword', endung: 'doc', passt: (b) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 },
  // DOCX = ZIP mit word/-Ordner (ein beliebiges ZIP reicht nicht).
  { typ: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', endung: 'docx', passt: (b) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04 && Buffer.from(b.buffer, b.byteOffset, b.byteLength).includes('word/') },
];

function dateiname(roh, endung) {
  const basis = String(roh || '').split(/[\\/]/).pop().replace(/\.[^.]*$/, '')
    .replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 80);
  return `${basis || 'Lebenslauf'}.${endung}`;
}

async function lebenslaufLesen(datei) {
  if (datei.size > MAX_CV) return { grund: `zu groß (${(datei.size / 1048576).toFixed(1)} MB, erlaubt 4 MB)` };
  const bytes = new Uint8Array(await datei.arrayBuffer());
  const art = CV_TYPEN.find((t) => t.passt(bytes));
  if (!art) return { grund: 'Dateityp nicht erlaubt (nur PDF, Word, JPG, PNG)' };
  return { cv: { dateiname: dateiname(datei.name, art.endung), typ: art.typ, groesse: bytes.length, base64: Buffer.from(bytes).toString('base64') } };
}

// Ohne JavaScript schickt der Browser das Formular klassisch ab und zeigt die Antwort an —
// dann eine kurze Danke-Seite statt rohem JSON (früher lieferte Formspree eine eigene Seite).
function erfolg(req) {
  if ((req.headers.get('accept') || '').includes('application/json')) return json(200, { ok: true });
  return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Danke – ZAP Prüfstelle</title><body style="font-family:system-ui,sans-serif;max-width:34rem;margin:15vh auto;padding:0 16px;line-height:1.5">'
    + '<h1>Danke, deine Bewerbung ist angekommen.</h1><p>Wir melden uns in Kürze telefonisch bei dir.</p>'
    + '<p><a href="/">Zurück zur Karriereseite</a></p></body>', { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { ok: false });

  if (!webhookKonfiguriert()) {
    console.error('Missing required env vars');
    return json(500, { ok: false });
  }
  if (!originAllowed(req.headers.get('origin'), req)) return json(403, { ok: false });
  if (await isRateLimited(rateLimitKey(req, context, 'bewerbung'), 8, 600)) {
    return json(429, { ok: false }, { 'Retry-After': '600' });
  }
  if (Number(req.headers.get('content-length') || 0) > MAX_BODY) return json(413, { ok: false });

  let form;
  try { form = await req.formData(); } catch { return json(400, { ok: false }); }

  // Ohne Prototyp: Feldnamen wie __proto__/toString/constructor werden normale eigene Felder.
  const submission = Object.create(null);
  let felder = 0;
  let cvDatei = null;
  let gekuerzt = false;
  for (const [name, wert] of form.entries()) {
    if (typeof wert !== 'string') {
      if (name === 'lebenslauf' && wert.size > 0 && !cvDatei) cvDatei = wert;
      continue;
    }
    if (!FELDNAME.test(name)) continue;
    if (!(name in submission)) {
      if (felder >= MAX_FELDER) continue;
      felder++;
    }
    let text = wert;
    if (text.length > MAX_WERT) { text = text.slice(0, MAX_WERT); gekuerzt = true; }
    // Mehrfachwerte (z. B. Chips) wie früher bei Formspree zusammenfassen.
    submission[name] = name in submission ? `${submission[name]}, ${text}` : text;
  }

  // Honeypot: Bots bekommen dieselbe Erfolgsantwort, aber nichts wird weitergegeben.
  if (String(submission._gotcha || '').trim() !== '') {
    console.warn('bewerbung: honeypot gefüllt, verworfen');
    return erfolg(req);
  }

  const kontakt = ['telefon', 'Telefon', 'email'].some((k) => String(submission[k] || '').trim() !== '');
  if (!kontakt) return json(400, { ok: false });

  const hinweise = [];
  if (gekuerzt) hinweise.push(`⚠️ Ein Freitext war länger als ${MAX_WERT} Zeichen und wurde gekürzt.`);
  let cv = null;
  if (cvDatei) {
    const ergebnis = await lebenslaufLesen(cvDatei);
    if (ergebnis.cv) cv = ergebnis.cv;
    else hinweise.push(`⚠️ Lebenslauf nicht übernommen: ${ergebnis.grund}. Beim Telefonat nachfragen.`);
  }
  if (hinweise.length) {
    submission.nachricht = [submission.nachricht, ...hinweise].filter(Boolean).join('\n\n');
  }

  const eingang = new Date();
  const id = /^[0-9A-Za-z-]{8,64}$/.test(submission.event_id || '') ? submission.event_id : crypto.randomUUID();
  // id reist mit (Nachverfolgung/Dubletten-Erkennung, falls n8n einen Lauf schon gestartet hatte).
  const paket = { version: PAKET_VERSION, id, submission, ...(cv ? { cv } : {}), eingang: eingang.toISOString() };

  const zustellung = await weiterleiten(paket, TIMEOUT_MS);
  if (zustellung.ok) return erfolg(req);

  // n8n nicht erreichbar oder Guard hat abgelehnt → parken, Nachsende-Function übernimmt.
  try {
    await warteschlange().setJSON(warteschlangenKey(eingang, id), { paket, versuche: 1, letzter_status: zustellung.status });
    console.warn('bewerbung: n8n-Zustellung fehlgeschlagen, in Warteschlange:', zustellung.status);
    return erfolg(req);
  } catch (err) {
    console.error('bewerbung: n8n UND Warteschlange fehlgeschlagen:', zustellung.status, err.name || 'error');
    return json(502, { ok: false });
  }
};
