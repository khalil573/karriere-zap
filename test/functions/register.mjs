// Node-Loader-Hook registrieren: ersetzt `@netlify/blobs` in den Functions durch den
// In-Memory-Mock (mock-blobs.mjs). Aufruf: node --import ./test/functions/register.mjs <test>
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
