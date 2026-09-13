/* Infoseiten der ZAP Prüfstelle (/dguv-v3/ und /dguv-v3/fragen/) — reichen die Kampagnen-Kennung
   aus dem E-Mail-Link an den Zeeg-Buchungslink und an interne Verweise weiter. Kein Tracking,
   kein Speichern, keine Anfrage an Dritte: läuft ausschließlich im Browser des Besuchers. */
(function () {
  'use strict';
  var ALLOWED = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
                 'first_name', 'last_name', 'email', 'mobile'];
  // Ohne Parameter (z. B. nach der Webflow-Weiterleitung www.zap-pruefstelle.de/mehr-erfahren, die
  // Query-Strings verwirft): Die Seiten sind nur aus den Close-Mailvorlagen verlinkt, daher zählt die
  // Buchung als Cold-Mail-Buchung; der Close-Lead wird dann über die E-Mail-Adresse zugeordnet.
  // Welche Vorlage: data-campaign am <body> (coldmail-dguv-v3 = Termin-Button, infomail-dguv-v3 = Infomail).
  var campaign = (document.body && document.body.getAttribute('data-campaign')) || 'coldmail-dguv-v3';
  if (!/^[a-z0-9-]{1,40}$/.test(campaign)) campaign = 'coldmail-dguv-v3';
  var DEFAULTS = { utm_source: 'close', utm_medium: 'lp', utm_campaign: campaign };
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
  var query = out.toString();

  var links = document.querySelectorAll('a[data-zeeg]');
  for (var i = 0; i < links.length; i++) {
    var base = links[i].getAttribute('href').split('?')[0];
    links[i].setAttribute('href', base + '?' + query);
    links[i].setAttribute('rel', 'noopener');
  }
  // Interne Verweise zwischen den Infoseiten behalten die Kennung (nur relative Ziele, keine fremden Hosts).
  var internal = document.querySelectorAll('a[data-passthrough]');
  for (var j = 0; j < internal.length; j++) {
    var href = internal[j].getAttribute('href') || '';
    if (/^[a-z]+:|^\/\//i.test(href)) continue;
    internal[j].setAttribute('href', href.split('?')[0].split('#')[0] + '?' + query);
  }
})();
