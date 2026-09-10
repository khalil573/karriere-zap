/* Mehr-erfahren-Seite (ZAP Prüfstelle) — reicht die Kampagnen-Kennung aus dem
   E-Mail-Link an den Zeeg-Buchungslink weiter. Kein Tracking, kein Speichern,
   keine Anfrage an Dritte: läuft ausschließlich im Browser des Besuchers. */
(function () {
  'use strict';
  var ALLOWED = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
                 'first_name', 'last_name', 'email', 'mobile'];
  // Ohne Parameter (z. B. nach der Webflow-Weiterleitung www.zap-pruefstelle.de/mehr-erfahren, die
  // Query-Strings verwirft): Die Seite ist nur aus der Cold-Mail verlinkt, daher zählt die Buchung
  // als Cold-Mail-Buchung; der Close-Lead wird dann über die E-Mail-Adresse zugeordnet.
  var DEFAULTS = { utm_source: 'close', utm_medium: 'lp', utm_campaign: 'coldmail-dguv-v3' };
  var incoming;
  try { incoming = new URLSearchParams(window.location.search); } catch (e) { incoming = null; }

  var out = new URLSearchParams();
  var hasUtm = false;
  if (incoming) {
    ALLOWED.forEach(function (key) {
      var v = incoming.get(key);
      if (v && v.length <= 200) {
        out.set(key, v);
        if (key.indexOf('utm_') === 0) hasUtm = true;
      }
    });
  }
  if (!hasUtm) {
    Object.keys(DEFAULTS).forEach(function (k) { out.set(k, DEFAULTS[k]); });
  }

  var links = document.querySelectorAll('a[data-zeeg]');
  for (var i = 0; i < links.length; i++) {
    var base = links[i].getAttribute('href').split('?')[0];
    links[i].setAttribute('href', base + '?' + out.toString());
    links[i].setAttribute('rel', 'noopener');
  }
})();
