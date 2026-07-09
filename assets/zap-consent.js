/*!
 * ZAP Consent Manager v2
 * --------------------------
 * Zentrale Verwaltung des Cookie-Consent-Status fuer alle ZAP-Karriere-Landingpages.
 *
 * Eingebunden in jeder LP im <head> VOR den Pixel-Snippets (Meta, ggf. TikTok).
 *
 * Speicherort: localStorage['zap_cookie_consent']
 *
 * Schema v2 (JSON):
 *   {
 *     version:   2,
 *     marketing: true|false,   // → Meta Pixel + CAPI und TikTok Pixel + Events API
 *     analytics: true|false,   // → Plausible (technisch cookieless, der Vollstaendigkeit halber gefuehrt)
 *     timestamp: "2026-05-28T14:00:00.000Z"
 *   }
 *
 * Rueckwaertskompatibilitaet (v1 String-Format):
 *   - "accepted"  → wird interpretiert als { marketing: true,  analytics: true }
 *   - "declined"  → wird interpretiert als { marketing: false, analytics: false }
 *   - Beim naechsten Set wird auf v2-JSON umgeschrieben.
 *
 * DSGVO-Konformitaet:
 *   - "Marketing" ist Opt-in (default false fuer User ohne Entscheidung).
 *   - Bei "Ablehnen" werden beide Flags auf false gesetzt.
 *   - Cookieless-Plausible laeuft unabhaengig, ist hier nur zur Status-Transparenz gefuehrt.
 *
 * Public API (globals: window.ZAPConsent):
 *   .get()                              → State-Objekt oder null
 *   .hasMarketing()                     → boolean
 *   .hasAnalytics()                     → boolean
 *   .hasDecided()                       → boolean
 *   .set({marketing, analytics})        → speichert + returnt Objekt
 *   .acceptAll()                        → marketing=true, analytics=true
 *   .declineAll()                       → marketing=false, analytics=false
 *   .applyPixelConsent()                → Meta fbq + TikTok ttq consent grant/revoke gemaess Status
 *   .trackPixelPageViewIfAllowed()      → fbq + ttq PageView wenn marketing=true
 *   .attachToForm(formEl)               → hidden-fields consent_marketing + event_source_url + event_id (+ fbc/fbp/ttclid/ttp nur mit Consent)
 *   .trackLead(formEl)                  → feuert Meta 'Lead' + TikTok 'SubmitForm' mit derselben event_id wie das Form (Browser↔Server-Dedup)
 *   .bannerInit({bannerEl, acceptBtn, declineBtn, onShown, onHidden, onChange})
 *                                       → wires up Banner-Buttons + zeigt Banner wenn !hasDecided()
 *
 * Banner-DOM-Erwartung:
 *   - bannerEl   = das Container-Element (kann hidden attribute oder display:none nutzen)
 *   - acceptBtn  = Button-Element fuer "Akzeptieren"
 *   - declineBtn = Button-Element fuer "Ablehnen"
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'zap_cookie_consent';
  var SCHEMA_VERSION = 2;

  function nowIso() {
    return new Date().toISOString();
  }

  function readRaw() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      // Private mode / disabled storage → kein Consent moeglich, defensive default
      return null;
    }
  }

  function writeRaw(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  function parseStored() {
    var raw = readRaw();
    if (!raw) return null;

    // v1-Strings (Migration on-read)
    if (raw === 'accepted') {
      return { version: 1, marketing: true, analytics: true, timestamp: null };
    }
    if (raw === 'declined') {
      return { version: 1, marketing: false, analytics: false, timestamp: null };
    }

    // v2-JSON
    try {
      var obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        return {
          version: obj.version || 2,
          marketing: obj.marketing === true,
          analytics: obj.analytics === true,
          timestamp: obj.timestamp || null
        };
      }
    } catch (e) {
      // Korrupte JSON → behandeln als "keine Entscheidung"
    }
    return null;
  }

  function set(consent) {
    var safe = {
      version: SCHEMA_VERSION,
      marketing: !!(consent && consent.marketing === true),
      analytics: !!(consent && consent.analytics === true),
      timestamp: nowIso()
    };
    writeRaw(JSON.stringify(safe));
    return safe;
  }

  function get() {
    return parseStored();
  }

  function hasMarketing() {
    var s = parseStored();
    return !!(s && s.marketing === true);
  }

  function hasAnalytics() {
    var s = parseStored();
    return !!(s && s.analytics === true);
  }

  function hasDecided() {
    return parseStored() !== null;
  }

  function acceptAll() {
    return set({ marketing: true, analytics: true });
  }

  function declineAll() {
    return set({ marketing: false, analytics: false });
  }

  // --- Meta-CAPI-Attribution-Helfer (fbc / fbp / event_id fuer Browser↔Server-Dedup) ---
  function readCookie(name) {
    try {
      var m = global.document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
      return m ? decodeURIComponent(m.pop()) : '';
    } catch (e) {
      return '';
    }
  }

  function genEventId() {
    // RFC4122-v4-aehnlich; reiner Dedup-Schluessel, kein Krypto-Zweck
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : ((r & 0x3) | 0x8)).toString(16);
    });
  }

  // Meta-Klick-ID: bevorzugt das vom Pixel gesetzte _fbc-Cookie,
  // sonst aus dem fbclid-URL-Parameter rekonstruiert (fb.1.<ts>.<fbclid>).
  function getFbc() {
    var c = readCookie('_fbc');
    if (c) return c;
    try {
      var fbclid = new global.URLSearchParams(global.location.search).get('fbclid');
      if (fbclid) return 'fb.1.' + Date.now() + '.' + fbclid;
    } catch (e) {}
    return '';
  }

  // TikTok-Klick-ID (ttclid) aus der URL; TikTok-Browser-ID aus dem _ttp-Cookie.
  // Analog zu fbc/fbp: werden nur MIT Marketing-Consent ans Formular gehaengt und
  // dienen der TikTok-Events-API-Attribution (Server-Seite).
  function getTtclid() {
    try {
      return new global.URLSearchParams(global.location.search).get('ttclid') || '';
    } catch (e) {
      return '';
    }
  }

  function getTtp() {
    return readCookie('_ttp');
  }

  // event_source_url fuer CAPI. OHNE Marketing-Consent werden Klick-/Kampagnen-
  // Identifikatoren (fbclid, gclid, utm_*, ...) client-seitig entfernt, damit bei
  // Ablehnung KEIN personenbezogener Identifier an Formspree/Make/Meta gelangt.
  function eventSourceUrl() {
    if (!global.location) return '';
    var href = global.location.href;
    if (hasMarketing()) return href;
    try {
      var u = new global.URL(href);
      var drop = ['fbclid', 'gclid', 'gbraid', 'wbraid', 'msclkid', 'ttclid'];
      Array.from(u.searchParams.keys()).forEach(function (k) {
        if (drop.indexOf(k) !== -1 || k.toLowerCase().indexOf('utm_') === 0) {
          u.searchParams.delete(k);
        }
      });
      return u.toString();
    } catch (e) {
      // Fallback: Query komplett abschneiden — lieber zu viel entfernen als leaken
      return href.split('?')[0];
    }
  }

  function applyPixelConsent() {
    var granted = hasMarketing();
    // Meta Pixel
    if (typeof global.fbq === 'function') {
      global.fbq('consent', granted ? 'grant' : 'revoke');
    }
    // TikTok Pixel (nur aktiv, wenn das ttq-Snippet auf dieser Seite geladen ist)
    if (global.ttq && typeof global.ttq.grantConsent === 'function') {
      if (granted) {
        global.ttq.grantConsent();
      } else {
        global.ttq.revokeConsent();
      }
    }
  }

  function trackPixelPageViewIfAllowed() {
    if (!hasMarketing()) return;
    if (typeof global.fbq === 'function') {
      global.fbq('track', 'PageView');
    }
    if (global.ttq && typeof global.ttq.page === 'function') {
      global.ttq.page();
    }
  }

  /**
   * Haengt hidden-Fields ans Formular fuer die Make→CAPI-Pipeline.
   *
   * Felder:
   *   - consent_marketing: "true" | "false"
   *       → Make-Router-Filter entscheidet auf Basis dieses Felds, ob
   *         CAPI Full-Payload (mit gehashten Personen-Daten) oder
   *         CAPI Minimal-Payload (PII-frei) gesendet wird.
   *   - event_source_url:  window.location.href
   *       → CAPI event_source_url. Bei consent=false wird Make die
   *         UTM-Parameter strippen, bevor an Meta uebertragen.
   *
   * Idempotent: vorhandene Felder werden ueberschrieben statt dupliziert.
   */
  function attachToForm(form) {
    if (!form || typeof form.appendChild !== 'function') return;

    function setHidden(name, value) {
      var existing = form.querySelector('input[type="hidden"][name="' + name + '"]');
      if (existing) {
        existing.value = value;
        return;
      }
      var input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }

    setHidden('consent_marketing', hasMarketing() ? 'true' : 'false');
    setHidden('event_source_url', eventSourceUrl());

    // Stabile event_id pro Submit: vorhandene wiederverwenden (idempotent),
    // damit Browser-Pixel und Make→CAPI exakt denselben Wert deduplizieren.
    var eidField = form.querySelector('input[type="hidden"][name="event_id"]');
    if (!eidField || !eidField.value) {
      setHidden('event_id', genEventId());
    }

    // Klick-/Browser-IDs sind personenbezogen → nur mit Marketing-Consent
    // uebertragen. Ohne Consent bleiben sie leer und Make sendet den
    // PII-freien Minimal-Payload (consent_marketing=false).
    if (hasMarketing()) {
      setHidden('fbc', getFbc());
      setHidden('fbp', readCookie('_fbp'));
      setHidden('ttclid', getTtclid());
      setHidden('ttp', getTtp());
    } else {
      setHidden('fbc', '');
      setHidden('fbp', '');
      setHidden('ttclid', '');
      setHidden('ttp', '');
    }
  }

  /**
   * Qualifizierungs-Weiche fuer die BROWSER-Conversion — spiegelt EXAKT die
   * Server-Weiche in n8n ("Consent + qualifiziert?"): disqualifiziert, sobald
   * eines der harten Kriterien nicht erfuellt ist. gesellenbrief/fuehrerschein
   * duerfen nur nicht "nein" sein (reines ja/nein-Feld); montage MUSS explizit
   * "ja" sein — "regional" gilt NICHT als qualifiziert (GF-Vorgabe: nur volle
   * Mo-Do-Reisebereitschaft ist brauchbar). Dadurch feuern Browser-Pixel und
   * Events-API fuer DIESELBE Bewerber-Menge → Dedup passt, und kein
   * unqualifizierter Bewerber wird als TikTok-/Meta-Conversion gezaehlt (sonst
   * wuerde der Algorithmus auf die Falschen optimieren). LPs ohne diese Felder
   * (Vertrieb/D2D) → Feld fehlt → gilt als qualifiziert und feuert normal
   * (unveraendert).
   */
  function isQualified(form) {
    if (!form || typeof form.querySelector !== 'function') return true;
    var mustNotBeNein = ['gesellenbrief', 'fuehrerschein'];
    for (var i = 0; i < mustNotBeNein.length; i++) {
      var checked = form.querySelector('input[name="' + mustNotBeNein[i] + '"]:checked');
      if (checked && checked.value === 'nein') return false;
    }
    var montage = form.querySelector('input[name="montage"]:checked');
    if (montage && montage.value !== 'ja') return false;
    return true;
  }

  /**
   * Feuert das Lead-Event sauber: stellt sicher, dass die CAPI-Hidden-Fields
   * (inkl. event_id) am Form haengen, und gibt dieselbe event_id als {eventID}
   * an den Browser-Pixel weiter → Meta dedupliziert Browser- und Server-Event.
   * Pixel feuert nur mit Marketing-Consent UND wenn qualifiziert (DSGVO +
   * identisch zur Server-Weiche); das Plausible-Goal bleibt separat in der LP.
   */
  function trackLead(form) {
    attachToForm(form);
    if (!hasMarketing() || !isQualified(form)) return;
    var eidField = form
      ? form.querySelector('input[type="hidden"][name="event_id"]')
      : null;
    var eid = eidField ? eidField.value : '';
    // Meta: 'Lead' mit derselben event_id wie das Form → Browser↔CAPI-Dedup
    if (typeof global.fbq === 'function') {
      if (eid) {
        global.fbq('track', 'Lead', {}, { eventID: eid });
      } else {
        global.fbq('track', 'Lead');
      }
    }
    // TikTok: 'SubmitForm' mit derselben event_id → Browser↔Events-API-Dedup
    if (global.ttq && typeof global.ttq.track === 'function') {
      if (eid) {
        global.ttq.track('SubmitForm', {}, { event_id: eid });
      } else {
        global.ttq.track('SubmitForm');
      }
    }
  }

  function bannerInit(opts) {
    opts = opts || {};
    var banner = opts.bannerEl;
    var acceptBtn = opts.acceptBtn;
    var declineBtn = opts.declineBtn;
    if (!banner || !acceptBtn || !declineBtn) return;

    function hide() {
      if (banner.hasAttribute) {
        banner.setAttribute('hidden', '');
      }
      banner.style.display = 'none';
      try { document.body.classList.remove('has-cookie-banner'); } catch (e) {}
      if (typeof opts.onHidden === 'function') opts.onHidden();
    }

    function show() {
      banner.removeAttribute('hidden');
      banner.style.display = '';
      try { document.body.classList.add('has-cookie-banner'); } catch (e) {}
      if (typeof opts.onShown === 'function') opts.onShown();
    }

    if (!hasDecided()) {
      show();
    }

    acceptBtn.addEventListener('click', function () {
      var state = acceptAll();
      applyPixelConsent();
      trackPixelPageViewIfAllowed();
      if (typeof opts.onChange === 'function') opts.onChange(state);
      hide();
    });

    declineBtn.addEventListener('click', function () {
      var state = declineAll();
      applyPixelConsent();
      if (typeof opts.onChange === 'function') opts.onChange(state);
      hide();
    });
  }

  global.ZAPConsent = {
    VERSION: SCHEMA_VERSION,
    get: get,
    set: set,
    hasMarketing: hasMarketing,
    hasAnalytics: hasAnalytics,
    hasDecided: hasDecided,
    acceptAll: acceptAll,
    declineAll: declineAll,
    applyPixelConsent: applyPixelConsent,
    trackPixelPageViewIfAllowed: trackPixelPageViewIfAllowed,
    attachToForm: attachToForm,
    trackLead: trackLead,
    bannerInit: bannerInit
  };
})(window);
