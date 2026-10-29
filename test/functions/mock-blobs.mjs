// In-Memory-Ersatz fuer @netlify/blobs (Kopie aus zap-umfrage, hier um list/delete ergaenzt) mit der Semantik von v11: ETag je Version, bedingte
// Writes (`onlyIfMatch` / `onlyIfNew`) und WriteResult `{ etag, modified }`. Ein verlorenes
// Rennen liefert wie im echten Client `{ modified: false }` (HTTP 412) statt einer Exception.
// Zusaetzlich: Aufruf-Protokoll (getStore-Argumente, jeder Write mit Bedingung + Ergebnis),
// Fault-Injection (`hooks.beforeWrite`, um Races deterministisch zu erzwingen), optionale
// Latenz-Streuung (`hooks.latency` in ms, damit parallele Aufrufe nicht im Gleichschritt laufen)
// `hooks.stripEtag` (Lesen ohne ETag, wie ein Edge ohne ETag-Header) und ein Ausfall-Schalter (`MOCK_BLOBS_FAIL=1` -> MissingBlobsEnvironmentError wie ohne Kontext).
const stores = new Map();
let seq = 0;

export const calls = [];   // Argumente jedes getStore()-Aufrufs
export const writes = [];  // { store, key, condition, modified } je setJSON()
export const hooks = { beforeWrite: null, latency: 0, stripEtag: false, putNoEtag: false, putConflict: false };

export class MissingBlobsEnvironmentError extends Error {
  constructor() {
    super('The environment has not been configured to use Netlify Blobs.');
    this.name = 'MissingBlobsEnvironmentError';
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = async () => { if (hooks.latency > 0) await sleep(Math.random() * hooks.latency); };

function storeMap(name) {
  if (!stores.has(name)) stores.set(name, new Map());
  return stores.get(name);
}

// Unbedingter Write "von aussen" (simuliert einen parallelen Request) — neue Version, neuer ETag.
export function _rawSet(name, key, data) {
  const etag = `"mock-${(++seq).toString(16)}"`;
  storeMap(name).set(key, { body: JSON.stringify(data), etag });
  return etag;
}
export function _entry(name, key) {
  const v = storeMap(name).get(key);
  return v ? { data: JSON.parse(v.body), etag: v.etag } : null;
}
export function _dump() {
  return Object.fromEntries([...stores].map(([n, m]) => [n, Object.fromEntries([...m].map(([k, v]) => [k, JSON.parse(v.body)]))]));
}
export function _reset() {
  stores.clear(); calls.length = 0; writes.length = 0; hooks.beforeWrite = null; hooks.latency = 0; hooks.stripEtag = false; hooks.putNoEtag = false; hooks.putConflict = false;
}

export function getStore(input) {
  calls.push(input);
  if (process.env.MOCK_BLOBS_FAIL === '1') throw new MissingBlobsEnvironmentError();
  const name = typeof input === 'string' ? input : input && input.name;
  const m = storeMap(name);
  return {
    async get(key, { type } = {}) {
      await jitter();
      const v = m.get(key);
      if (!v) return null;
      return type === 'json' ? JSON.parse(v.body) : v.body;
    },
    async getWithMetadata(key, { type } = {}) {
      await jitter();
      const v = m.get(key);
      if (!v) return null;
      return { data: type === 'json' ? JSON.parse(v.body) : v.body, etag: hooks.stripEtag ? undefined : v.etag, metadata: {} };
    },
    // list/delete: nur was die Warteschlange braucht (Schlüssel + ETag, keine Verzeichnisse).
    async list() {
      await jitter();
      return { blobs: [...m.entries()].map(([key, v]) => ({ key, etag: v.etag })), directories: [] };
    },
    async delete(key) {
      await jitter();
      m.delete(key);
    },
    async setJSON(key, data, options = {}) {
      await jitter();
      if (hooks.beforeWrite) await hooks.beforeWrite({ store: name, key, options });
      // Spiegelt Store.getConditions() aus @netlify/blobs v11 (falsy Werte = keine Bedingung).
      if ('onlyIfMatch' in options && 'onlyIfNew' in options) {
        throw new Error("The 'onlyIfMatch' and 'onlyIfNew' options are mutually exclusive.");
      }
      let condition = null;
      if ('onlyIfMatch' in options && options.onlyIfMatch) {
        if (typeof options.onlyIfMatch !== 'string') throw new Error("The 'onlyIfMatch' property expects a string representing an ETag.");
        condition = { onlyIfMatch: options.onlyIfMatch };
      } else if ('onlyIfNew' in options && options.onlyIfNew) {
        if (typeof options.onlyIfNew !== 'boolean') throw new Error("The 'onlyIfNew' property expects a boolean.");
        condition = { onlyIfNew: true };
      }
      const cur = m.get(key);
      let modified = true;
      if (condition && condition.onlyIfNew && cur) modified = false;                                   // if-none-match: * -> 412
      if (condition && condition.onlyIfMatch && (!cur || cur.etag !== condition.onlyIfMatch)) modified = false; // if-match -> 412
      writes.push({ store: name, key, condition, modified, applied: modified && !hooks.putConflict });
      if (!modified) return { modified: false };
      // putConflict: wie ein bedingter PUT, den der Edge mit einem Nicht-412-Fehler (409-artig) ablehnt —
      // nichts geschrieben, der v11-Client meldet trotzdem { modified: true } ohne ETag.
      if (hooks.putConflict) return { modified: true };
      const etag = _rawSet(name, key, data);
      // putNoEtag: Write kam an, aber die Antwort traegt keinen ETag (Client meldet modified:true ohne ETag)
      return hooks.putNoEtag ? { modified: true } : { etag, modified: true };
    },
  };
}
