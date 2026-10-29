# karriere-zap — Repo-Notizen für Claude

> Diese Datei ist die **erste Quelle**, die Claude in einer neuen Session liest. Beim Arbeiten an diesem Repo: zuerst hier lesen, dann Code anfassen.
>
> ⚠️ **Für jede NEUE Landingpage/Ad/Kampagne/jedes Formular gilt zusätzlich verbindlich der Skill `pagebuilder`** (`~/.claude/skills/pagebuilder/SKILL.md`) — er erzwingt Consent-Modal, volles Match-Key-Set, Enrichment, Plausible-Goals, Qualifiziert-Gate, UTM- und DSE-Disziplin von Anfang an (GF-Direktive 2026-07-16).

## Projekt in einem Satz

Statische Landingpages für das **Recruiting der ZAP Prüfstelle GmbH** (Osnabrück). Eingesetzt für Meta-Ads-Kampagnen (Vertrieb + Elektriker + D2D). Deployed via Netlify auf `karriere.zap-pruefstelle.de`.

## Stack

- **Vanilla HTML/CSS/JS** — kein Build-Tool, kein Framework
- **Netlify** — Auto-Deploy on push to `main`; Functions in `netlify/functions/` (v2/ESM, Helfer in `netlify/shared/`)
- **GitHub**: `khalil573/karriere-zap` ⚠️ aktuell PUBLIC, sollte PRIVATE werden ([zap-websec](../../../.claude/skills/anthropic-skills/zap-websec/) Pflicht)
- **Hosting**: Netlify-Account von ZAP, Site `shiny-rugelach-f7445da.netlify.app` mit Custom-Domain `karriere.zap-pruefstelle.de`

## Verzeichnis

```
karriere-zap/
├── assets/
│   └── zap-consent.js          # Shared Cookie-Consent-Manager (v2)
├── index.html                  # Vertrieb-Hauptseite (hell)
├── vertrieb-dunkel.html        # Vertrieb-Variante (dunkel, aktuell ungenutzt)
├── Vertrieb-Vorerfahrung.html  # Vertrieb-LP mit Vorerfahrungs-Filter (Kampagne: "Neue Kampagne für Leads")
├── elektriker.html             # Elektriker-LP (Kampagne: "Elektriker_V1")
├── Door2Door_vertrieb.html     # D2D-Vertrieb-LP (Kampagne: "ZAP D2D · Vertrieb")
├── closer.html                 # Closer-LP (B2B, Fixum + Provision) ⚠️ zitiert noch Alt-GF Zerbe — Text veraltet
├── closer-funnel.html          # Closer-Funnel-LP ARM A (C-Mechanik; harte K.-o.: ≥3 J. Vertrieb, Closing-Skills, 100 % Office OS; Aussortiert = kein Submit)
├── closer-funnel-b.html        # Closer-Funnel-LP ARM B — identischer Funnel, nur Hero/Value pushen Opener-Team + Pflichtprodukt (A/B: EINE Variable = Botschaft)
├── verkaeufer.html             # Verkäufer-Kurz-LP (17.09.2026, PR #67): Hero + Benefits + Galerie + Formular unten, keine Gates
├── verkaeufer-osnabrueck.html  # Verkäufer-LP v2 (17.09.2026, PR #68): Formular als 2. Bildschirm, keine Gates; ⚠️ Dateiname/`_quelle` NIE mit „closer" (n8n-Gate)
└── bewerben.html               # Funnel-Endziel — generisches Bewerbungsformular
```

| `dguv-v3/index.html` (+ `style.css`, `app.js`) | `/dguv-v3/` | **Kunden-Infoseite** („Mehr erfahren"-Button der Cold-Mail-Vorlage in Close) — KEIN Recruiting |
| `dguv-v3/fragen/index.html` (nutzt `../style.css`, `../app.js`) | `/dguv-v3/fragen/` | **Kunden-Infoseite „Drei Fragen"** („Mehr erfahren"-Button der Infomail-Vorlage in Close: nie gehört / Pflicht? / Vermieter?) — KEIN Recruiting; `<body data-campaign="infomail-dguv-v3">` steuert die Default-Kennung in `app.js` |

> **Ausnahme `dguv-v3/` (seit 10.09.2026):** bewusst OHNE Meta-Pixel, Plausible, Cookie-Banner und Formspree — reine Infoseite
> für Kunden, keine Datenerhebung, deshalb kein Consent nötig. Eigene Security-Header nur für `/dguv-v3/*` in `_headers`
> (CSP ohne Inline-JS/-CSS). `app.js` reicht nur `utm_*`-Parameter aus dem E-Mail-Link an den Zeeg-Buchungslink weiter.
> Änderungen an der Seite: nur `dguv-v3/` anfassen, `_headers`-Block nicht auf andere Pfade ausweiten.

⚠️ **URL-Case-Gotcha:** `Vertrieb-Vorerfahrung.html` und `Door2Door_vertrieb.html` haben CamelCase im Filename, die Live-URLs sind aber lowercase (`/vertrieb-vorerfahrung`, `/door2door_vertrieb`). Netlify routet case-insensitive, aber Plausible misst die gewählte URL-Form — bei Verlinkung immer lowercase verwenden.

## Tracking-Stack (3 Schichten)

### 1. Plausible Analytics (cookieless)

- Script-Pfad: `pa-7oSK2XPYPV2eTKJGR7Wq3.js` (account-spezifisch, im `<head>` jeder LP)
- DSGVO: kein Consent erforderlich, EU-hosted
- Goal `Bewerbung Submit`: wird in jedem Form-Success-Handler manuell via `plausible('Bewerbung Submit')` getriggert (auf `bewerben.html`, `elektriker.html`, `Door2Door_vertrieb.html`, `vertrieb-dunkel.html`)
- Dashboard: `khalil@zap-pruefstelle.de` Account → Site `karriere.zap-pruefstelle.de`

### 2. Meta Pixel (`851410567212402`)

- Browser-seitiges Pixel-Tracking
- **Consent-Gated** via `ZAPConsent` (siehe unten): feuert nur, wenn User Marketing-Consent erteilt hat
- Events: `PageView` (bei Accept) + `Lead` (bei erfolgreicher Form-Submission)

### 3. Meta Conversions API (CAPI) — live seit 2026-06-16

- Server-seitige Übertragung an Meta über n8n `FxzN9PrjPTBKizYu` (Knoten „FB CAPI Lead“, seit 07/2026; das frühere Make-Scenario ist abgelöst).
- **Consent-only:** Die CAPI-Route (HTTP-Modul, 3. Router-Branch) feuert **nur bei `consent_marketing=true`**. Payload: `event_name=Lead`, `event_time`, `action_source=website`, `event_source_url`, `event_id` + `user_data` mit SHA256-gehashtem `em`/`ph` sowie `fbc`/`fbp`. Ohne Consent wird **kein** CAPI-Event gesendet (DSGVO — kein Marketing-Tracking ohne Einwilligung; bewusst sauberer als der frühere „Minimal-Payload"-Plan).
- **Fehler-isoliert:** Ein HTTP-Fehler der CAPI-Route bricht die Trello-Kartenerstellung **nicht**.
- **Pixel-Access-Token:** liegt als n8n-Credential „FB-CAPI“, **nie im Repo**.
- **Deduplizierung:** `attachToForm()` erzeugt pro Submit eine `event_id`; `trackLead()` gibt **dieselbe** id an den Browser-Pixel → Meta dedupliziert Browser- + CAPI-Lead zu **einem** Event.

## ZAPConsent v2 (Shared Cookie-Consent-Manager)

**Datei:** `assets/zap-consent.js`

**Eingebunden in jeder LP** im `<head>` **VOR** dem Meta-Pixel-Snippet:

```html
<script src="/assets/zap-consent.js"></script>
```

**Storage:** `localStorage['zap_cookie_consent']` als JSON-Objekt:

```json
{
  "version": 2,
  "marketing": true,
  "analytics": true,
  "timestamp": "2026-05-28T14:00:00.000Z"
}
```

**Rückwärtskompatibel:** Alte String-Werte `"accepted"` / `"declined"` werden weiterhin korrekt interpretiert (Migration on-write).

**Public API** (globals via `window.ZAPConsent`):

| Funktion | Zweck |
|---|---|
| `ZAPConsent.hasMarketing()` | boolean — Pixel + CAPI Full erlaubt? |
| `ZAPConsent.hasAnalytics()` | boolean (aktuell informational, Plausible cookieless) |
| `ZAPConsent.hasDecided()` | boolean — hat User schon entschieden? |
| `ZAPConsent.applyPixelConsent()` | ruft `fbq('consent','grant'\|'revoke')` |
| `ZAPConsent.trackPixelPageViewIfAllowed()` | `fbq('track','PageView')` wenn marketing=true |
| `ZAPConsent.attachToForm(formEl)` | hängt hidden-fields ans Form: `consent_marketing`, `event_source_url` (ohne Consent von fbclid/gclid/utm bereinigt), `event_id` (immer) sowie `fbc`/`fbp` (nur mit Consent) |
| `ZAPConsent.trackLead(formEl)` | feuert `fbq('track','Lead',{},{eventID})` mit derselben `event_id` wie das Form → Browser↔CAPI-Dedup; nur mit Marketing-Consent |
| `ZAPConsent.bannerInit({bannerEl, acceptBtn, declineBtn})` | wires up Cookie-Banner-Buttons |
| `ZAPConsent.acceptAll()` / `.declineAll()` | direkter Set ohne Banner |

**Banner-Markup-Erwartung pro LP:**
- Container mit `id="cookie-banner"` (entweder `hidden`-Attribut oder `display:none` via inline-style)
- Akzeptieren-Button mit `id="cookie-accept"`
- Ablehnen-Button mit `id="cookie-decline"`
- Buttons sollten optisch **gleich prominent** sein (DSGVO: gleich groß, nur Akzent-Farbe unterscheidet)

## Bewerbungs-Pipeline (eigener Eingang → n8n → Trello + CAPI) — seit 29.10.2026

Formspree (`xqewlovo`) ist abgelöst: das Konto nahm keine Einsendungen mehr an. Alle Formulare
schicken per `fetch` (FormData, `Accept: application/json`) an **`/api/bewerbung`** auf derselben Domain.

```
LP-Form Submit → POST /api/bewerbung (Netlify Function v2, netlify/functions/bewerbung.mjs)
   ├─ prüft: Methode, Env (fail-closed 500), Origin-Allowlist (403), Drossel 8 / 10 Min je IP (429),
   │         Honeypot _gotcha (→ 200 ohne Weitergabe), Kontakt Pflicht (telefon|Telefon|email, sonst 400),
   │         Feldnamen ^[A-Za-z0-9_]{1,40}$, ≤ 80 Felder, Werte ≤ 5.000 Zeichen (gekürzt + Hinweis)
   ├─ Lebenslauf (Feld `lebenslauf`): ≤ 4 MB, Typ per Dateisignatur (PDF/DOC/DOCX/JPG/PNG).
   │         Passt er nicht, geht die Bewerbung TROTZDEM durch — Hinweis landet in `nachricht`.
   └─ JSON {version:1, id, submission:{…alle Felder…}, cv?:{dateiname,typ,groesse,base64}, eingang}
        → n8n „Bewerber Pipeline“ FxzN9PrjPTBKizYu, Header X-ZAP-Karriere-Key
        → n8n antwortet erst NACH dem Karriere-Guard (Respond to Webhook) → Trello-Karte (CV als Datei),
          Eingangsbestätigung (ZS6IX7skfBCpec6l), Meta-CAPI/TikTok nur bei Consent + qualifiziert
n8n-Fehler/Timeout (4,5 s) → Blobs-Store `bewerbungen-warteschlange` (Bewerber sieht trotzdem Erfolg)
   → bewerbung-nachsenden.mjs (Scheduled, alle 10 Min, 3 zufällige Einträge je Lauf, löscht erst nach Erfolg)
Messpunkt: GET /api/bewerbung-status → {"wartend":0,"aelteste_min":null} = Normalzustand (nur Zahlen)
```

- **`submission` hat absichtlich dieselbe Form wie früher der Formspree-Webhook** (`body.submission.*`) —
  die Trello-/CAPI-/Gate-Knoten in n8n blieben dadurch unverändert. Neue Felder einer LP kommen ohne
  Änderung durch (keine feste Feldliste).
- **Env-Vars (Netlify-UI, als Secret, Scope Functions, Production + Deploy Previews):**
  `BEWERBER_WEBHOOK_URL` (n8n-Webhook, Pfad = Geheimnis) · `BEWERBER_WEBHOOK_KEY` (Header-Schlüssel;
  n8n kennt nur seinen SHA-256 im „Karriere-Guard“). Werte NIE ins Repo/Doku (Netlify-Secrets-Scan bricht
  sonst den Build). Env-Änderung wirkt erst ab dem nächsten Deploy. Schlüssel rotieren = neuen Wert in
  Netlify + neuen Hash im Guard, dann Redeploy.
- **Browser-Seite:** `assets/zap-cv.js` (`ZAPCv.passend`) verkleinert Fotos > 4 MB per Canvas zu JPEG und
  wandelt HEIC/WebP immer um; eingebunden in `bewerben.html`, `elektriker.html`, `elektriker-b.html`.
  Absenden ist gesperrt, solange die Umwandlung läuft.
- **Ohne JavaScript** (Accept ohne JSON) liefert der Eingang eine kleine Danke-Seite statt JSON.
- **Ausgeliefert wird nur `dist/`** (`netlify.toml`): der Build `node netlify/veroeffentlichen.mjs` kopiert
  alles Öffentliche dorthin (Ausschlussliste: `netlify/`, `test/`, `node_modules/`, `package*.json`,
  `netlify.toml`, `CLAUDE.md`, Punkt-Dateien). Neue LPs/Ordner im Root kommen automatisch mit; neue
  NICHT-öffentliche Dateien gehören in die Ausschlussliste. Grund: Netlify liefert Dateien ohne Rücksicht
  auf Groß-/Kleinschreibung aus, Redirect-Sperren greifen nur exakt (`/Package.json` kam durch).
- **Tests:** `npm test` (node:test, `@netlify/blobs` per Loader-Hook gemockt, fetch abgefangen).
  Beweist NICHT die Blobs-Konsistenz am Edge und das 6-MB-Request-Limit von Netlify — beides nur live.
- **Hängt die Warteschlange** (`wartend > 0` länger als 30 Min): n8n-Executions von FxzN9PrjPTBKizYu
  ansehen — Guard-Fehler „Schlüssel fehlt/falsch“ = Netlify-Env und Guard-Hash passen nicht zusammen
  (Redeploy vergessen?); 5xx/Timeout = n8n down oder Ausführungslimit. Einträge werden automatisch
  nachgesendet, sobald n8n wieder antwortet.

**Wichtige Hidden-Fields die jedes Form mitsendet** (automatisch von `ZAPConsent.attachToForm()`):

| Feld | Wert | Verwendung |
|---|---|---|
| `consent_marketing` | "true" / "false" | n8n-Weiche: CAPI/TikTok feuern nur bei "true" (+ qualifiziert) |
| `event_source_url` | URL (ohne Consent click-id-bereinigt) | CAPI `event_source_url` |
| `event_id` | UUID pro Submit | Dedup Browser-Pixel ↔ CAPI; zugleich `id` des Pakets |
| `fbc` / `fbp` | Meta Klick-/Browser-ID (nur mit Consent) | CAPI Match-Quality |

Form-spezifische Hidden-Fields (in jedem `<form>` einzeln gesetzt):
- `_subject` — Trello-Karten-Titel-Prefix
- `_quelle` — LP-Identifier
- `_gotcha` (Honeypot — auf ALLEN Formularen, seit 29.10. auch elektriker/D2D/vertrieb-dunkel)

## Brand-Tokens

| Token | Wert | Wo |
|---|---|---|
| Orange (Akzent) | `#E24E1F` | CTAs, Banner-Accept, Hook-Akzent |
| Orange dunkel | `#C23E10` / `#B83C14` | Hover-States |
| Ink (Text/CTA-BG) | `#0E0E0E` / `#141414` | Dark Banner, Dark CTAs |
| Paper (Hell-BG) | `#FFFFFF` / `#F7F4EF` / `#FAF7F1` | LP-Hintergründe (variiert pro LP) |
| Fonts | Inter, Bricolage Grotesque, Barlow, JetBrains Mono | Pro LP unterschiedlich |

## Sicherheit & DSGVO

⚠️ **Verbindlich:** Vor jedem Code-Change in diesem Repo den Skill **`anthropic-skills:zap-websec`** aufrufen. Pre-Flight-Punkte beantworten bevor Code geschrieben wird.

**Aktuelle bekannte Anti-Pattern (offen):**
1. Repo ist **PUBLIC** — sollte PRIVATE werden (zap-websec-Pflicht; im LP-Code stehen nur Pixel-/Formspree-IDs, die sind public by design)
2. ~~Webhook ohne Auth~~ — seit 29.10.2026 erledigt: geheimer Pfad + Header-Schlüssel (SHA-256-Vergleich im n8n-„Karriere-Guard“, fail-closed). Der Webhook-Pfad stand am 29.10. im Sitzungsprotokoll; Schutz trägt jetzt der Schlüssel.
3. Es gibt keinen Datenschutz-Beauftragten-Sign-Off für den CAPI-Setup (Doku siehe Memory `capi_setup_status.md`)

**PII-Handling:**
- Bewerber-Daten (Name, Email, Tel, Lebenslauf) landen in Trello-Board "Bewerber anrufen Prebn" — sind Art. 9 DSGVO sensibel
- CAPI Full-Payload überträgt SHA256-Hashes — DSGVO-rechtlich **immer noch personenbezogen** (Pseudonymisierung ≠ Anonymisierung)
- Niemals PII in Logs, niemals an externe APIs ohne AVV

**Sensible Konfiguration (Werte NICHT hier, nur Verweis):**
- Pixel-Access-Token → n8n-Credential „FB-CAPI“
- `BEWERBER_WEBHOOK_URL` / `BEWERBER_WEBHOOK_KEY` → Netlify-Env (Secret)
- Plausible API Key → Plausible-Dashboard (nicht im Repo)

## Deployment

```bash
git push origin main
# → Netlify Auto-Deploy startet, Live in ~30 Sek
```

**Preview-Deploys:**
- Push auf einen Feature-Branch erstellt automatisch einen Netlify-Preview unter `deploy-preview-N--shiny-rugelach-f7445da.netlify.app`

## Verwandte Memory-Dateien

(In `~/.claude/projects/-Users-firaskhalil-Claude-Performance-Marketing/memory/`)

- `lp_inventory.md` — komplette LP-Übersicht
- `plausible_setup.md` — Plausible-Konfig + API
- `meta_campaigns_status.md` — aktive Meta-Kampagnen
- `capi_setup_status.md` — CAPI-Migrations-Status
- `open_tasks.md` — offene Hausaufgaben
- `learnings_2026-05.md` — Pixel-Undercount, AN-Bot-Pattern, Insights

## Letzte größere Änderungen

| Datum | Änderung | Commit |
|---|---|---|
| 2026-10-29 | Denk-Check auch in `elektriker-frankfurt.html` + `elektriker-koeln.html` (GF: zu viele unqualifizierte Bewerbungen); `isQualified()` prüft `quiz_passed`; Lösungs-Kommentare aus `closer-funnel.html` + CLAUDE.md entfernt | (dieser PR) |
| 2026-10-29 | Formspree abgelöst: eigener Eingang `/api/bewerbung` (Netlify Functions + Blobs-Warteschlange), n8n-Karriere-Guard mit Header-Schlüssel, Lebenslauf als Datei in Trello, `zap-cv.js`, Honeypot auf allen Formularen | (dieser PR) |
| 2026-06-18 | `closer.html` auf ZAPConsent v2 + Fix A nachgezogen (jetzt CAPI-fähig, kein Webfont); CAPI-Doku auf Live-Stand aktualisiert | (dieser PR) |
| 2026-06-16 | Fix A: `attachToForm` setzt `event_id`/`fbc`/`fbp` + neue `trackLead()` (Browser↔CAPI-Dedup, DSGVO-Bereinigung von `event_source_url`); Pipeline auf khalil@-Org migriert (Scenario `6206652`), CAPI live + getestet (`events_received:1`) | `40a8bca` |
| 2026-05-28 | Hybrid-CAPI-Vorbereitung: Cookie-Banner refactored auf ZAPConsent v2, alle 6 LPs nutzen jetzt shared component, consent_marketing Hidden-Field für Make-CAPI-Branching, Plausible auf bewerben.html + index.html + vertrieb-dunkel.html nachgezogen | `020c1ce` |
| 2026-05-27 | Door2Door Mobile-UX-Bugs gefixt | `006cd92` |
| 2026-05-27 | Plausible auf elektriker.html + Vertrieb-Vorerfahrung.html | `122b5a4` |
| 2026-05-26 | Door2Door LP komplett neu | `84401b2` + folgende |

## Denk-Check (Closer-Funnel seit 2026-08-19, Elektriker FFM/KOE seit 2026-10-29)

`closer-funnel.html`, `elektriker-frankfurt.html` und `elektriker-koeln.html` haben vor dem Kontaktschritt **4 sprach-/kulturneutrale Muster-Matrizen** (Raven-Stil, per JS gerendert in `buildQuiz()`; Nr. 1–3 einfach, Nr. 4 = echte Raven-Matrix mit 3 Regeln (Latin-Square-Form + Diagonal-Fuellung + Position je Spalte), 8 Optionen). Oben laeuft ein **4-Minuten-Timer** (`#quiz-timer`, `QUIZ_SECONDS`) ueber alle 4 Aufgaben; laeuft er ab, geht es zum Kontakt (unbeantwortet = falsch). Zweck: Lead-Qualität — nur wer **≥ 3 von 4** richtig hat, zählt als Conversion (Schwelle `PASS_THRESHOLD` in der Edge Function).

- **Lösungsschlüssel liegt AUSSCHLIESSLICH in der DB** (`public.closer_quiz_answers`, Supabase-Projekt `uzxdctlbccchmlckweso`, RLS an ohne Policy → nur `service_role`). NICHT im HTML, NICHT in n8n.
- Validator = Edge Function **`closer-quiz-check`** (`verify_jwt=false`, CORS-Allowlist = Prod-Domain + Deploy-Previews). Gibt seit 25.10.2026 nur `{passed}` zurück (Fehler: `{passed:false,error}`) — keine Punktzahl, nie welche Frage richtig war.
- Client sendet die gewählten Buchstaben `q1`–`q4` + `quiz_score` (Text) + `quiz_passed` (Edge-Ergebnis, relayed) ans Formular. `ZAPConsent.trackLead()` wird nur bei `passed` aufgerufen; zusätzlich lehnt `isQualified()` in `zap-consent.js` jedes Formular ab, das ein `quiz_passed`-Feld ≠ `'true'` hat.
- **Doppelt verdrahtet** (wie Qualifiziert-Gate): n8n-IF „Consent + qualifiziert?" verlangt `quiz_passed==='true'`, sobald das Feld mitkommt (Elektriker FFM/KOE), für Closer immer (fail-closed) → CAPI/TikTok-Event nur bei bestanden. Elektriker-LPs ohne Denk-Check (`elektriker.html`, `-b`, `-c`) schicken das Feld nicht und sind unberührt.
- **Nicht bestanden ≠ verloren:** Bewerbung geht trotzdem an `/api/bewerbung` → Trello-Karte (Titel-Prefix `⚠️ Denk-Check nicht bestanden · ` bzw. `nicht geprüft · `, `nachricht` mit `🧠 Denk-Check: …`). Nur die Conversion feuert nicht. (GF-Entscheid 19.08., für Elektriker übernommen 29.10.) Das `—` vor dem Namen im Titel nicht entfernen: daran schneidet die Eingangsbestätigung (n8n `ZS6IX7skfBCpec6l`, `nameAus`) den Vornamen ab.
- Fragen/Antworten ändern = Zeilen in `public.closer_quiz_answers` (`correct_option` A..H) **und** die `QUIZZES`-Definition in **allen drei** LPs gleich anpassen — Reihenfolge der Optionen bestimmt den Buchstaben, alle LPs teilen denselben Schlüssel. ⚠️ Repo ist PUBLIC: Lösungen nie in HTML-Kommentare, Doku oder Commit-Texte schreiben (bis 29.10.2026 standen sie in `closer-funnel.html` + hier — in der Git-Historie weiter lesbar).
- Plausible-Goals: `Closer-Funnel 7 Denkcheck` / `FFM-Funnel 7b Denkcheck` / `KOE-Funnel 7b Denkcheck` (erreicht), `Quiz Bestanden`, `Quiz Nicht bestanden` (gemeinsam für alle LPs, im Dashboard nach Seite filtern).
- Elektriker FFM/KOE: Denk-Check sitzt nach „Erreichbarkeit“, vor dem Kontakt (Schritte `quiz1`–`quiz4`); Gesellenbrief/Führerschein/Montage-Gate davor unverändert (Aussortierte sehen den Test, senden aber nichts).
