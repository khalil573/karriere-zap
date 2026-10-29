// Gemeinsame Bausteine des Bewerbungs-Eingangs (Formspree-Ersatz seit 29.10.2026).
//
// Liegt bewusst NEBEN dem functions/-Ordner: Netlify betrachtet jede Datei direkt in
// netlify/functions/ als eigene Function. Ein Helfer-Modul dort würde als (kaputte)
// Function veröffentlicht.
//
// Origin-Allowlist + Drossel sind 1:1 aus zap-umfrage (netlify/shared/umfrage.mjs)
// übernommen — dort live gemessen und mehrfach gehärtet. Lehren stehen an den Stellen.
// 🔴 v2-Format (`export default async (req, context)`) ist Pflicht: nur dort bekommt
// Netlify Blobs seine Zugangsdaten aus der Laufzeitumgebung.
import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';

export const WARTESCHLANGE = 'bewerbungen-warteschlange';

// Trailing Slash wird abgeschnitten: ein "…app/" in der Env sperrte sonst die eigene Seite aus.
export function normalizeOrigin(value) {
  return String(value || '').trim().replace(/\/+$/, '').toLowerCase();
}

// Netlify setzt URL (PRIMARY domain der Site), DEPLOY_PRIME_URL (Branch/Deploy-Preview) und
// DEPLOY_URL (eindeutige Adresse dieses Deploys) selbst. SITE_NAME hält die netlify.app-Adresse in der Liste, egal welche Domain primär ist.
export function allowedOrigins() {
  const list = [process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL, process.env.APP_ORIGIN];
  if (process.env.SITE_NAME) list.push(`https://${process.env.SITE_NAME}.netlify.app`);
  if (process.env.NETLIFY_DEV === 'true') list.push('http://localhost:8888');
  return [...new Set(list.filter(Boolean).map(normalizeOrigin))];
}

// Die Formulare posten immer an dieselbe Domain → gleiche Herkunft wie die Request-URL reicht.
// (Live gemessen 29.10.2026: im Deploy-Preview kam 403 — DEPLOY_PRIME_URL & Co. stehen in
// v2-Functions zur Laufzeit nicht zuverlässig bereit. Die Env-Liste bleibt als Zusatz.)
export function originAllowed(origin, req) {
  const norm = normalizeOrigin(origin);
  if (norm === '') return false;
  if (req) {
    try { if (norm === normalizeOrigin(new URL(req.url).origin)) return true; } catch { /* ungültige URL */ }
  }
  return allowedOrigins().includes(norm);
}

export function json(status, payload, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });
}

// Nur die von Netlify gesetzte IP ist vertrauenswürdig — x-forwarded-for ist client-setzbar.
// Gespeichert wird nur ein Tages-Hash, nie die rohe IP (DSGVO-Datenminimierung).
export function rateLimitKey(req, context, prefix) {
  const ip = req.headers.get('x-nf-client-connection-ip') || (context && context.ip) || '';
  if (!ip) return null;
  const tag = new Date().toISOString().slice(0, 10);
  const digest = crypto.createHash('sha256').update(`${tag}:${ip}`).digest('hex').slice(0, 32);
  return `${prefix}:${digest}`;
}

// Bedingter Write (Compare-and-Set, @netlify/blobs >= 11) — Begründung und Messwerte in
// zap-umfrage/CLAUDE.md „Rate-Limits“. Kurz: consistency 'strong' ist Pflicht (sonst liest jeder
// Aufruf einen veralteten Zähler), onlyIfMatch/onlyIfNew verhindert, dass ein paralleler Burst
// die Drossel passiert, und ein bedingter Write ohne ETag wird nachgelesen statt geraten.
const RL_RETRIES = 2;
const rlBackoff = () => new Promise((resolve) => setTimeout(resolve, 15 + Math.floor(Math.random() * 35)));

export async function isRateLimited(key, limit, windowSec) {
  if (!key) return process.env.NETLIFY_DEV !== 'true'; // keine vertrauenswürdige IP => fail-closed
  try {
    const store = getStore({ name: 'rate-limits', consistency: 'strong' });
    for (let attempt = 0; attempt <= RL_RETRIES; attempt++) {
      if (attempt > 0) await rlBackoff();
      const now = Date.now();
      const res = await store.getWithMetadata(key, { type: 'json' });
      const recent = ((res && res.data && Array.isArray(res.data.t) && res.data.t) || []).filter((x) => x > now - windowSec * 1000);
      if (recent.length >= limit) return true;
      const stamp = now + Math.random();
      recent.push(stamp);
      if (res && !res.etag) console.warn('rate-limit entry without etag, write unconditional');
      const write = await store.setJSON(key, { t: recent }, res ? { onlyIfMatch: res.etag } : { onlyIfNew: true });
      if (write && write.modified === false) continue;   // 412: Rennen verloren -> neu lesen
      if (!write || write.etag) return false;              // 200 + ETag = sauber geschrieben
      const check = await store.getWithMetadata(key, { type: 'json' });
      const written = check && check.data && Array.isArray(check.data.t) ? check.data.t : [];
      if (written.includes(stamp)) return false;                                   // doch angekommen
      if ((check ? check.etag : null) !== (res ? res.etag : null)) continue;        // fremder Write -> Rennen verloren
      console.error('rate-limit write failed (no etag, entry unchanged), fail-open');
      return false;
    }
    console.warn('rate-limit write lost race 3x, treating as limited');
    return true;
  } catch (err) {
    console.error('rate-limit store unavailable:', err.name || 'error');
    // Verfügbarkeit vor Drossel: eine Bewerbung ist wichtiger als ein Bot-Treffer mehr.
    return false;
  }
}

// Fail-closed: ohne Ziel-URL und Schlüssel nimmt der Eingang nichts an (500), statt
// Bewerbungen ins Leere zu schicken.
export function webhookKonfiguriert() {
  return Boolean(process.env.BEWERBER_WEBHOOK_URL && process.env.BEWERBER_WEBHOOK_KEY);
}

// Übergabe an n8n „Bewerber Pipeline“ (FxzN9PrjPTBKizYu). Der Webhook antwortet erst NACH
// dem Karriere-Guard — ok heißt also „Schlüssel geprüft, Lauf gestartet“, nicht nur „angekommen“.
export async function weiterleiten(paket, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(process.env.BEWERBER_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ZAP-Karriere-Key': process.env.BEWERBER_WEBHOOK_KEY,
      },
      body: JSON.stringify(paket),
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: err.name === 'AbortError' ? 'timeout' : 'netz' };
  } finally {
    clearTimeout(timer);
  }
}

export function warteschlange() {
  return getStore({ name: WARTESCHLANGE, consistency: 'strong' });
}

// Schlüssel beginnt mit dem Eingangszeitpunkt (kompakt, sortierbar) — die Status-Function
// liest das Alter der ältesten Bewerbung so allein aus der Schlüsselliste, ohne Inhalte zu laden.
export function warteschlangenKey(eingang, id) {
  return `${eingang.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}_${id}`;
}

export function eingangAusKey(key) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z_/.exec(key);
  return m ? new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`) : null;
}
