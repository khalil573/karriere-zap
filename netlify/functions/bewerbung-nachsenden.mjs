// bewerbung-nachsenden.mjs — stellt geparkte Bewerbungen alle 10 Minuten erneut an n8n zu.
// Ein Eintrag wird erst NACH erfolgreicher Zustellung gelöscht. Scheduled Functions haben 30 s,
// deshalb höchstens 3 Versuche je Lauf (je 4 s Timeout). Auswahl zufällig statt „älteste zuerst“:
// so blockieren ein paar dauerhaft scheiternde Einträge nie den Rest der Warteschlange.
// Hängt die Warteschlange, zeigt /api/bewerbung-status das Alter der ältesten Bewerbung.
import { webhookKonfiguriert, weiterleiten, warteschlange } from '../shared/karriere.mjs';

export const config = { schedule: '*/10 * * * *' };

const PRO_LAUF = 3;
const TIMEOUT_MS = 4000;

export default async () => {
  if (!webhookKonfiguriert()) {
    console.error('Missing required env vars');
    return;
  }
  const store = warteschlange();
  const { blobs } = await store.list();
  if (!blobs.length) return;

  const keys = blobs.map((b) => b.key);
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  let zugestellt = 0;
  for (const key of keys.slice(0, PRO_LAUF)) {
    const eintrag = await store.get(key, { type: 'json' });
    if (!eintrag || !eintrag.paket) continue;
    const r = await weiterleiten(eintrag.paket, TIMEOUT_MS);
    if (r.ok) {
      await store.delete(key);
      zugestellt++;
    } else {
      await store.setJSON(key, { ...eintrag, versuche: (eintrag.versuche || 0) + 1, letzter_status: r.status });
    }
  }
  const offen = blobs.length - zugestellt; // gesamte Warteschlange nach diesem Lauf
  if (offen > 0) console.warn(`bewerbung-nachsenden: ${zugestellt} zugestellt, ${offen} weiter in der Warteschlange`);
  else console.log(`bewerbung-nachsenden: ${zugestellt} zugestellt, Warteschlange leer`);
};
