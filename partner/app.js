/* Partner-Infoseite der ZAP Prüfstelle (/partner/) — reicht die Kampagnen-Kennung aus dem
   E-Mail-Link an den Zeeg-Buchungslink weiter. Kein Tracking, kein Speichern, keine Anfrage
   an Dritte: läuft ausschließlich im Browser des Besuchers. */
(function () {
  'use strict';
  var ALLOWED = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
                 'first_name', 'last_name', 'email', 'mobile'];
  // Ohne Parameter (Direktaufruf / Flyer-QR): Seite ist aus der Partner-Mailvorlage verlinkt,
  // daher zählt die Buchung als Partner-Buchung; die Zuordnung läuft dann über die E-Mail-Adresse.
  var campaign = (document.body && document.body.getAttribute('data-campaign')) || 'partner-arbeitssicherheit';
  if (!/^[a-z0-9-]{1,40}$/.test(campaign)) campaign = 'partner-arbeitssicherheit';
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
})();
