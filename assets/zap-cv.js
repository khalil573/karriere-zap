/*
 * ZAP Lebenslauf-Helfer (29.10.2026)
 *
 * Der eigene Bewerbungs-Eingang (/api/bewerbung, Formspree-Ersatz) nimmt höchstens 4 MB
 * Lebenslauf an — Netlify kappt Function-Requests bei 6 MB inklusive Kodierung. Fotos werden
 * deshalb vor dem Absenden im Browser verkleinert (JPEG, stufenweise), alles andere über 4 MB
 * lehnt die Seite freundlich ab. Fotos in anderen Formaten (HEIC vom iPhone, WebP …) werden
 * immer nach JPEG umgewandelt, weil der Eingang nur PDF/Word/JPG/PNG annimmt.
 * Die Bewerbung selbst geht immer — auch ganz ohne Lebenslauf.
 *
 * API:  ZAPCv.MAX                → 4 MB in Bytes
 *       ZAPCv.passend(file)      → Promise<File|null>  (Datei ≤ 4 MB oder null)
 */
(function (global) {
  'use strict';

  var MAX = 4 * 1024 * 1024;
  // [längste Kante in px, JPEG-Qualität] — erste Stufe, die unter 4 MB landet, gewinnt.
  var STUFEN = [[2400, 0.85], [1800, 0.8], [1400, 0.72]];

  function bildLaden(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('bild')); };
      img.src = url;
    });
  }

  function alsJpeg(img, maxKante, qualitaet) {
    var f = Math.min(1, maxKante / Math.max(img.naturalWidth, img.naturalHeight));
    var c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * f);
    c.height = Math.round(img.naturalHeight * f);
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; // transparente PNGs nicht schwarz werden lassen
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return new Promise(function (resolve) { c.toBlob(resolve, 'image/jpeg', qualitaet); });
  }

  function passend(file) {
    if (!file) return Promise.resolve(null);
    var bild = /^image\//.test(file.type);
    var direkt = !bild || /^image\/(jpeg|png)$/.test(file.type);
    if (direkt && file.size <= MAX) return Promise.resolve(file);
    if (!bild) return Promise.resolve(null);
    return bildLaden(file).then(function (img) {
      var i = 0;
      function naechsteStufe() {
        if (i >= STUFEN.length) return null;
        var s = STUFEN[i++];
        return alsJpeg(img, s[0], s[1]).then(function (blob) {
          if (blob && blob.size <= MAX) {
            return new File([blob], file.name.replace(/\.[^.]*$/, '') + '.jpg', { type: 'image/jpeg' });
          }
          return naechsteStufe();
        });
      }
      return naechsteStufe();
    // Browser kann das Format nicht lesen (z. B. HEIC außerhalb von Safari): kleine Datei trotzdem
    // mitschicken — der Eingang vermerkt dann „Dateityp nicht erlaubt“ auf der Karte.
    }).catch(function () { return file.size <= MAX ? file : null; });
  }

  global.ZAPCv = { MAX: MAX, passend: passend };
})(window);
