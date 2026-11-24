// Puts the Faara website in front of the web app after `expo export`:
// the site's pages answer "/" and "/about", and the app is served from app.html
// for every other path (see the rewrites in vercel.json).
import { cpSync, existsSync, renameSync } from 'node:fs';

const dist = 'dist';
if (!existsSync(`${dist}/index.html`)) {
  throw new Error('Run `expo export --platform web` first: dist/index.html is missing.');
}
renameSync(`${dist}/index.html`, `${dist}/app.html`);
cpSync('site', dist, { recursive: true });
console.log('Website added: / and /about; the app is served from /app.html.');
