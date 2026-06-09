# karriere-zap — Konstanten & Build-Anleitung (zuerst lesen)

> **Diese Datei liest jeder neue Chat als Erstes.** Sie sagt dir, **was bei jeder
> neuen Recruiting-Seite/Anzeige gleich bleibt (1:1 übernehmen)** und **was du pro
> Kampagne neu baust.**
>
> **Pflicht bei jeder Code-Arbeit:** zuerst den Skill `anthropic-skills:zap-websec`
> ziehen, dann Code.

---

## 0. Goldene Regeln (nicht verhandelbar)

1. **Bestehende Live-Landingpages NIE ändern.** Sie laufen in aktiven Meta-Ads-Kampagnen.
   Neue Variante = **neue Datei** + eigener **Branch** + **PR** (den Firas selbst merged).
2. **Diese vier Bausteine bei JEDER Seite 1:1 übernehmen:** Meta Pixel · Cookie-Banner +
   Consent-Gate · Formspree-Endpoint · Plausible. (Snippets unten → einfach kopieren.)
3. **Keine Secrets ins Repo.** Pixel-ID und Formspree-ID sind **client-seitig und damit
   öffentlich by design** → dürfen im Code stehen. Make-Webhook-URL, Tokens, API-Keys
   gehören **nie** ins Repo (auch nicht „als Beispiel").
4. **Repo ist aktuell PUBLIC** → keine internen IDs/URLs ergänzen, die nicht ohnehin schon
   im Client-Code stehen.

---

## 1. IMMER GLEICH — 1:1 kopieren

### Identität & Hosting
| Was | Wert |
|---|---|
| Firma | ZAP Prüfstelle GmbH, Winkelhausenstraße 13, 49090 Osnabrück |
| Telefon | +49 541 93213072 |
| Karriere-Mail | karriere@zap-pruefstelle.de |
| Live-Domain | `karriere.zap-pruefstelle.de` |
| Hosting | Netlify (`shiny-rugelach-f7445da.netlify.app`), Auto-Deploy bei Push auf `main` |
| Repo | `github.com/khalil573/karriere-zap` |
| Hauptseite (Rechts-Links) | `www.zap-pruefstelle.de` → `/impressum`, `/datenschutz`, `/agb` |

### Meta Pixel — ID `851410567212402` (consent-gated)
Im `<head>`, **feuert nur nach Zustimmung**. Default ist `revoke`:
```html
<!-- Meta Pixel (Consent-gesteuert) -->
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('consent', 'revoke');
fbq('init', '851410567212402');
if (localStorage.getItem('zap_cookie_consent') === 'accepted') {
  fbq('consent', 'grant');
  fbq('track', 'PageView');
}
</script>
<noscript><img height="1" width="1" style="display:none"
  src="https://www.facebook.com/tr?id=851410567212402&ev=PageView&noscript=1" alt="" /></noscript>
```
- **Events:** `PageView` (bei Accept) + `Lead` (bei erfolgreichem Form-Submit, **nur mit Consent**).

### Plausible (cookieless, kein Consent nötig, EU-hosted)
```html
<script async src="https://plausible.io/js/pa-7oSK2XPYPV2eTKJGR7Wq3.js"></script>
<script>
  window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};
  plausible.init()
</script>
```
- **Goal bei Submit:** `plausible('Bewerbung Submit')` im Erfolgs-Handler.

### Cookie-Banner / Consent
- **localStorage-Key:** `zap_cookie_consent` — Werte `'accepted'` / `'declined'`.
  Gilt **domainweit**: wer auf einer ZAP-Seite schon zugestimmt hat, sieht das Banner woanders nicht erneut.
- **Markup-IDs:** Container `#cookie-banner`, Buttons `#cookie-accept` / `#cookie-decline`.
- Banner zeigt nur, wenn noch kein Wert gesetzt ist. Accept → `fbq('consent','grant')` + PageView.
- Buttons gleich prominent (DSGVO).
- ℹ️ Auf `main` ist die Consent-Logik noch **inline pro Seite** (String-Wert). Ein gemeinsamer
  `assets/zap-consent.js` (ZAPConsent v2, JSON-Schema) + Meta CAPI sind **in Vorbereitung**
  (Branch `feature/hybrid-capi-prep`) — erst nach Merge zur Pflicht machen.

### Formspree — Endpoint `https://formspree.io/f/xqewlovo`
Alle Bewerbungsformulare posten **hierhin** (von dort → Make → Trello).
- **Submit per fetch:**
```js
fetch("https://formspree.io/f/xqewlovo", {
  method: "POST", body: new FormData(form), headers: { Accept: "application/json" }
})
```
- **Felder, die die Make→Trello-Pipeline liest:** `name`, `telefon`, `email`,
  optional `aktueller_beruf`, `startzeitpunkt`, `nachricht`, `lebenslauf` (File).
- **Hidden-Felder pro Seite setzen:** `_subject` (Trello-Titel-Prefix), `_quelle` (Dateiname der LP),
  `_gotcha` (Honeypot, Anti-Spam).
- **Lead-Mapping:** JS setzt vor dem Senden `name` mit **Kampagnen-Emoji-Prefix** und baut
  `nachricht` als mehrzeilige Zusammenfassung — damit man in Trello die Quelle erkennt:
  🔌 Elektriker · 💼 D2D · 🎯 Closer.

### Fotos — Cloudinary, Cloud `dzvvvmpsn`
Basis-URL: `https://res.cloudinary.com/dzvvvmpsn/image/upload/<transform>/<public-id>`
Transform-Muster: `c_fill,g_face,w_<W>,h_<H>,f_auto,q_auto` (Gesichter) bzw. `g_auto` (Szene).

| Person / Motiv | Public-ID |
|---|---|
| **Ravn** (Personalreferent, Recruiter-/Hero-Foto) | `v1779182899/WhatsApp_Image_2026-05-19_at_11.27.56_gcrtqr.jpg` |
| Andreas Zerbe (Geschäftsführung) | `v1776770480/andreas-z_qnnz9g.jpg` |
| „igor-d" (Team) | `v1776770481/igor-d_riarqr.jpg` |
| „justus-p" (Team) | `v1776770480/justus-p_ihykfh.jpg` |
| Justus P. (Elektriker-Set) | `v1779176492/IMG_4842_b5wpwa.heic` |
| Dietrich Z. (Elektriker-Set) | `v1779176594/IMG_4847_1_lsguua.heic` |
| Igor (Elektriker-Set) | `v1779176568/IMG_4852_1_a4u4vy.heic` |
| Tesla Model 3 (Benefit-Foto) | `v1779177896/WhatsApp_Image_2026-05-19_at_10.00.12_eaobfl.jpg` |
| Deutschland-Karte (Einsatzgebiet) | `v1779182447/68a0584d90d7fa0a7f0b6779_de_karte_v1_gdxegy.jpg` |
| index-Hero / Szenen | `…/handwerker-baustelle_cy2dmk.jpg`, `…/team-headset_qhf3fa.jpg`, `…/buero-flur_dxgg8g.jpg` |

> Ravn ist das **Standard-Recruiter-Gesicht** für Hero + Bewerbungs-Block + Ad-Creatives.

### Brand / Design-Tokens
| Token | Wert |
|---|---|
| Akzent-Orange | `#E24E1F` (Hover dunkel: `#B83A0F` / `#C23E10`) |
| Ink / Schwarz | `#0E0E0E` / `#141414` |
| Paper / Hell-BG | `#FAF7F1` / `#F7F4EF` / `#FFFFFF` / `#F1ECE0` |
| Fonts | **Inter** (Standard) · **Space Grotesk** (Zahlen/Display, D2D+Closer) · **JetBrains Mono** (Eyebrows) · Barlow Condensed / Bricolage (einzelne LPs) |

---

## 2. PRO KAMPAGNE NEU BAUEN (das Variable)

Pro Rolle/Zielgruppe änderst du **nur**:
- **Copy & Positionierung:** Hook/Headline, Subline, **Schmerzpunkte der Zielgruppe**, USP-Pills, FAQ.
- **Konditionen:** Gehalt, Provision, Wochenstunden, Arbeitszeit (variieren je Rolle).
- **Dateiname** der neuen LP (= Live-URL) + **`_quelle`** + **`_subject`** + **Lead-Emoji-Prefix**.
- Ggf. Rollen-Labels im Team-Block.

Beispiel-Konditionen (Stand der bisherigen LPs):
| Rolle | Fix | Provision | Zeit |
|---|---|---|---|
| D2D-Vertrieb | 2.500 € | 7,5 % | 30 Std · 08–15 Uhr |
| Closer | 3.100 € | 2,5 % | 35 Std · 08–16 Uhr |
| Elektriker | 3.100–4.500 € | — | 4-Tage-Woche + Tesla Model 3 |

---

## 3. Bestehende Landingpages (Inventar — nicht anfassen)
| Datei | Live-URL | Zielgruppe |
|---|---|---|
| `index.html` | `/` | Vertrieb, Handwerker-Quereinsteiger (hell) |
| `vertrieb-dunkel.html` | `/vertrieb-dunkel.html` | Vertrieb, dunkle Variante |
| `Vertrieb-Vorerfahrung.html` | `/vertrieb-vorerfahrung` | Vertriebler mit Erfahrung |
| `elektriker.html` | `/elektriker.html` | Elektriker (dunkel, Tesla/4-Tage-Woche) |
| `Door2Door_vertrieb.html` | `/door2door_vertrieb` | D2D-Vertrieb |
| `closer.html` | `/closer` | Closer (festes Fixgehalt statt reiner Provision) |
| `bewerben.html` | `/bewerben` | Generisches Bewerbungsformular |

⚠️ **URL-Case-Gotcha:** CamelCase-Dateinamen, Live-URLs aber lowercase. Beim Verlinken immer lowercase.

---

## 4. Ad-Creatives (Meta) — Ordner `Performance Marketing/creatives-<kampagne>/`
Workflow: **Render-HTML pro Format → Chrome-headless-Screenshot → PNG → Meta-Upload.**

| Format | Maße (px) | Platzierung | Render-Datei |
|---|---|---|---|
| 4:5 | 1080×1350 | Feed portrait | `render-4x5.html` |
| 1:1 | 1080×1080 | Feed square | `render-1x1.html` |
| 1.91:1 | 1200×628 | Feed landscape | `render-1.91x1.html` |
| 9:16 | 1080×1920 | Reels/Stories | `render-9x16.html` |

- **PNG-Naming:** `zap-<kampagne>-<format>-<platzierung>.png`
- **Render-Befehl** (isoliertes Chrome-Profil, wartet auf Fonts+Foto):
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --virtual-time-budget=6000 --user-data-dir=/tmp/chrome-render \
  --window-size=1080,1350 --screenshot=out.png "file://…/render-4x5.html"
```
- Gleiche Brand-Tokens, gleiches Ravn-Foto, CTA „Bewerbung in 60 Sek →". Neue Kampagne = neuer
  Schwester-Ordner (`creatives-d2d` nicht überschreiben).

---

## 5. Bewerber-Pipeline (Überblick — Details NICHT im Repo)
```
LP-Form → Formspree (xqewlovo) → Make.com-Szenario → Trello-Board "Bewerber anrufen Prebn"
```
- Make-Router verzweigt nach „mit/ohne Lebenslauf". Webhook-URL & Make-Interna liegen in
  Formspree/Make bzw. lokal in `Performance Marketing/SETUP.md` — **nicht im Repo**.
- Lead-Event (`fbq('track','Lead')`) feuert bei erfolgreichem Submit, nur mit Consent.

---

## 6. Checkliste: neue Landingpage bauen
1. **Neue Datei** anlegen (Live-LP nie überschreiben) — Design/CSS darf 1:1 kopiert werden, Copy neu.
2. Meta-Pixel-Snippet + `<noscript>` übernehmen (ID `851410567212402`, consent-gated).
3. Plausible-Snippet übernehmen.
4. Cookie-Banner-Markup + JS übernehmen (`zap_cookie_consent`).
5. Formspree `xqewlovo` + fetch-Handler + `name`/`nachricht`-Mapping + Honeypot übernehmen.
6. `_subject`, `_quelle`, Lead-Emoji-Prefix auf die neue Kampagne setzen.
7. Brand-Tokens + Cloudinary-Fotos verwenden (Ravn als Recruiter-Gesicht).
8. Rechtliche Links → `www.zap-pruefstelle.de/{impressum,datenschutz,agb}`.
9. Auf eigenem **Branch** committen, **PR** öffnen. Prüfen: bestehende LPs **byte-identisch** unverändert.
10. `zap-websec` beachtet? Keine Secrets, Pixel/Formspree-IDs sind ok (public by design).

---

## 7. Bekannte offene Punkte (Security/DSGVO)
- Repo ist **PUBLIC** → sollte private werden.
- Make-Webhook hat **keine HMAC-Signatur** (Bot-Spam-Risiko).
- Consent-Refactor (ZAPConsent v2) + Meta CAPI liegen unmerged auf `feature/hybrid-capi-prep`.
- Bewerber-PII landet in Trello → DSGVO-sensibel, kein PII in Logs.
