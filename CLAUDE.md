# karriere-zap — Repo-Notizen für Claude

> Diese Datei ist die **erste Quelle**, die Claude in einer neuen Session liest. Beim Arbeiten an diesem Repo: zuerst hier lesen, dann Code anfassen.

## Projekt in einem Satz

Statische Landingpages für das **Recruiting der ZAP Prüfstelle GmbH** (Osnabrück). Eingesetzt für Meta-Ads-Kampagnen (Vertrieb + Elektriker + D2D). Deployed via Netlify auf `karriere.zap-pruefstelle.de`.

## Stack

- **Vanilla HTML/CSS/JS** — kein Build-Tool, kein Framework
- **Netlify** — Auto-Deploy on push to `main`
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
└── bewerben.html               # Funnel-Endziel — generisches Bewerbungsformular
```

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

### 3. Meta Conversions API (CAPI) — Hybrid-Setup

- Server-seitige Übertragung an Meta via Make.com Scenario `9130395`
- **Zwei Branches:**
  - Bei `consent_marketing=true` (User hat Cookie-Banner akzeptiert): Full Payload mit SHA256-gehashten Email/Tel/Name (em/ph/fn/ln) + IP + User-Agent → bessere Match-Rate für Meta-Algorithmus
  - Bei `consent_marketing=false` (User hat abgelehnt oder keine Entscheidung): Minimal Payload nur mit `event_name`, `event_time`, UTM-gestrippte `event_source_url` → DSGVO-defensiv (Art. 6 (1) f, berechtigtes Interesse Reichweitenmessung)
- **Pixel-Access-Token:** liegt in Make-Connection, **nie im Repo**
- **Deduplizierung:** Meta deduppliziert Pixel-Events + CAPI-Events via `event_id` (wenn gesetzt)

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
| `ZAPConsent.attachToForm(formEl)` | hängt hidden-fields `consent_marketing` + `event_source_url` ans Form |
| `ZAPConsent.bannerInit({bannerEl, acceptBtn, declineBtn})` | wires up Cookie-Banner-Buttons |
| `ZAPConsent.acceptAll()` / `.declineAll()` | direkter Set ohne Banner |

**Banner-Markup-Erwartung pro LP:**
- Container mit `id="cookie-banner"` (entweder `hidden`-Attribut oder `display:none` via inline-style)
- Akzeptieren-Button mit `id="cookie-accept"`
- Ablehnen-Button mit `id="cookie-decline"`
- Buttons sollten optisch **gleich prominent** sein (DSGVO: gleich groß, nur Akzent-Farbe unterscheidet)

## Bewerbungs-Pipeline (Formspree → Make → Trello + CAPI)

```
LP-Form Submit
   ↓ POST application/x-www-form-urlencoded (oder multipart bei Lebenslauf)
Formspree (Form-ID xqewlovo)
   ↓ Webhook
Make.com Scenario 9130395 "Claude (Bewerber Pipeline) Integration Webhooks"
   ↓ Router
   ├─ Trello-Karte (immer)
   └─ HTTP POST an Meta CAPI
      ├─ wenn consent_marketing=true → Full Payload (SHA256-gehashte PII)
      └─ wenn consent_marketing=false → Minimal Payload (PII-frei)
```

**Wichtige Hidden-Fields die jedes Form mitsendet** (automatisch von `ZAPConsent.attachToForm()`):

| Feld | Wert | Verwendung |
|---|---|---|
| `consent_marketing` | "true" / "false" | Make-Router-Filter für CAPI-Branch |
| `event_source_url` | window.location.href | CAPI `event_source_url` |

Form-spezifische Hidden-Fields (in jedem `<form>` einzeln gesetzt):
- `_subject` — Trello-Karten-Titel-Prefix
- `_quelle` — LP-Identifier
- `_gotcha` (Honeypot)

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
1. Repo ist **PUBLIC** — sollte PRIVATE werden (Make-Webhook-URL ist hardcoded im JS, Spam-Risiko)
2. Make-Webhook hat **keine HMAC-Signatur** — Angriffsfläche für Bot-Spam direkt auf Webhook
3. Es gibt keinen Datenschutz-Beauftragten-Sign-Off für den CAPI-Setup (Doku siehe Memory `capi_setup_status.md`)

**PII-Handling:**
- Bewerber-Daten (Name, Email, Tel, Lebenslauf) landen in Trello-Board "Bewerber anrufen Prebn" — sind Art. 9 DSGVO sensibel
- CAPI Full-Payload überträgt SHA256-Hashes — DSGVO-rechtlich **immer noch personenbezogen** (Pseudonymisierung ≠ Anonymisierung)
- Niemals PII in Logs, niemals an externe APIs ohne AVV

**Sensible Konfiguration (Werte NICHT hier, nur Verweis):**
- Pixel-Access-Token → Make.com Connection (verschlüsselt)
- Formspree Personal API Key → Formspree-Dashboard (nicht im Repo)
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
| 2026-05-28 | Hybrid-CAPI-Vorbereitung: Cookie-Banner refactored auf ZAPConsent v2, alle 6 LPs nutzen jetzt shared component, consent_marketing Hidden-Field für Make-CAPI-Branching, Plausible auf bewerben.html + index.html + vertrieb-dunkel.html nachgezogen | (dieser Commit) |
| 2026-05-27 | Door2Door Mobile-UX-Bugs gefixt | `006cd92` |
| 2026-05-27 | Plausible auf elektriker.html + Vertrieb-Vorerfahrung.html | `122b5a4` |
| 2026-05-26 | Door2Door LP komplett neu | `84401b2` + folgende |
