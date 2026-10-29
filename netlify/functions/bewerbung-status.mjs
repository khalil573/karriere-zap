// bewerbung-status.mjs — Messpunkt fürs Monitoring: Wie viele Bewerbungen warten auf Zustellung
// an n8n, und wie alt ist die älteste? Liefert NUR Zahlen (keine Inhalte, keine IDs) und liest
// das Alter aus den Schlüsseln, ohne Bewerbungsdaten zu laden.
// Normalzustand: {"wartend":0,"aelteste_min":null}.
import {
  json, rateLimitKey, isRateLimited, warteschlange, eingangAusKey,
} from '../shared/karriere.mjs';

export const config = { path: '/api/bewerbung-status' };

export default async (req, context) => {
  if (req.method !== 'GET') return json(405, { ok: false });
  if (await isRateLimited(rateLimitKey(req, context, 'bewerbung-status'), 30, 60)) {
    return json(429, { ok: false }, { 'Retry-After': '60' });
  }
  try {
    const { blobs } = await warteschlange().list();
    const zeiten = blobs.map((b) => eingangAusKey(b.key)).filter(Boolean).map((d) => d.getTime());
    const aelteste = zeiten.length ? Math.round((Date.now() - Math.min(...zeiten)) / 60000) : null;
    return json(200, { wartend: blobs.length, aelteste_min: aelteste });
  } catch (err) {
    console.error('bewerbung-status: store unavailable:', err.name || 'error');
    return json(503, { ok: false });
  }
};
