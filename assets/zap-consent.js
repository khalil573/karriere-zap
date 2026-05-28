/*!
 * ZAP Consent Manager v2
 * --------------------------
 * Zentrale Verwaltung des Cookie-Consent-Status fuer alle ZAP-Karriere-Landingpages.
 *
 * Eingebunden in jeder LP im <head> VOR dem Meta-Pixel-Snippet.
 *
 * Speicherort: localStorage['zap_cookie_consent']
 *
 * Schema v2 (JSON):
 *   {
 *     version:   2,
 *     marketing: true|false,   // → Meta Pixel + Meta Conversions API (CAPI)
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
 *   .applyPixelConsent()                → fbq('consent','grant'|'revoke') gemaess Status
 *   .trackPixelPageViewIfAllowed()      → fbq('track','PageView') wenn marketing=true
 *   .attachToForm(formEl)               → fuegt hidden-fields consent_marketing + event_source_url ans Form
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

  function applyPixelConsent() {
    if (typeof global.fbq !== 'function') return;
    if (hasMarketing()) {
      global.fbq('consent', 'grant');
    } else {
      global.fbq('consent', 'revoke');
    }
  }

  function trackPixelPageViewIfAllowed() {
    if (typeof global.fbq === 'function' && hasMarketing()) {
      global.fbq('track', 'PageView');
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
    setHidden('event_source_url', global.location ? global.location.href : '');
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
    bannerInit: bannerInit
  };
})(window);
