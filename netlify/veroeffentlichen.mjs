// Build-Schritt (netlify.toml): kopiert alles Öffentliche nach dist/ — nur dist/ wird ausgeliefert.
//
// Warum (29.10.2026): Vorher war der Repo-Root der Publish-Ordner. Netlify liefert Dateien
// unabhängig von Groß-/Kleinschreibung aus, Redirect-Sperren greifen aber nur exakt
// (/package.json = 404, /Package.json = 200). Ein eigener Publish-Ordner schließt das sicher.
// Ausschlussliste statt Positivliste: neue Landingpages und Ordner kommen ohne Änderung mit.
import { cpSync, readdirSync, rmSync } from 'node:fs';

const ZIEL = 'dist';
const NICHT_OEFFENTLICH = new Set([
  ZIEL, 'netlify', 'test', 'node_modules',
  'package.json', 'package-lock.json', 'netlify.toml', 'CLAUDE.md', 'AGENTS.md', 'README.md',
]);

rmSync(ZIEL, { recursive: true, force: true });
let anzahl = 0;
for (const name of readdirSync('.')) {
  // Punkt-Dateien/-Ordner (.git, .claude, .gitignore, .netlify …) sind nie öffentlich.
  if (name.startsWith('.') || NICHT_OEFFENTLICH.has(name)) continue;
  cpSync(name, `${ZIEL}/${name}`, { recursive: true });
  anzahl++;
}
console.log(`veroeffentlichen: ${anzahl} Einträge nach ${ZIEL}/ kopiert`);
