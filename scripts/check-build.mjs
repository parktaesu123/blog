import { readdir, readFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { resolveSite } from './site-config.mjs';

const output = resolve('dist');
const { base } = resolveSite();
const errors = [];
let pages = 0;
async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}
async function walk(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) { await walk(path); continue; }
    if (!item.name.endsWith('.html')) continue;
    pages++;
    const html = await readFile(path, 'utf8');
    for (const match of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
      const href = match[1].replaceAll('&amp;', '&');
      if (!href.startsWith('/') || href.startsWith('//')) continue;
      const pathname = new URL(href, 'https://check.invalid').pathname;
      if (!pathname.startsWith(base)) { errors.push(`${path}: ${href} misses base ${base}`); continue; }
      const relative = decodeURIComponent(pathname.slice(base.length));
      const target = resolve(output, relative);
      if (!(await exists(target)) && !(await exists(join(target, 'index.html')))) errors.push(`${path}: missing ${href}`);
    }
  }
}
await walk(output);
if (await exists(join(output, 'development/draft-example/index.html'))) errors.push('Draft was included in the production build.');
if (await exists(join(output, 'tags/초안/index.html'))) errors.push('Draft-only tag was included in the production build.');
if (!(await exists(join(output, 'pagefind/pagefind.js')))) errors.push('Search index is missing.');
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`Checked ${pages} static pages: internal links, assets, base path, draft exclusion, and search index.`);
