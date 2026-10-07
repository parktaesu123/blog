import { readdir, readFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { resolveSite } from './site-config.mjs';
import { blog } from '../blog.config.mjs';

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
for (const draft of ['development/draft-example', 'til/array-map', 'life/keeping-notes']) {
  if (await exists(join(output, draft, 'index.html'))) errors.push(`Draft was included in the production build: ${draft}`);
}
if (await exists(join(output, 'tags/초안/index.html'))) errors.push('Draft-only tag was included in the production build.');
if (!(await exists(join(output, 'pagefind/pagefind.js')))) errors.push('Search index is missing.');
const article = await readFile(join(output, 'development/first-post/index.html'), 'utf8');
if (blog.comments.enabled && (!article.includes('<giscus-comments') || !article.includes(`data-repo-id="${blog.comments.repoId}"`) || !article.includes('data-reactions-enabled="1"'))) {
  errors.push('Published article is missing its configured comments and reactions.');
}
for (const page of ['index.html', 'about/index.html', 'posts/index.html']) {
  if ((await readFile(join(output, page), 'utf8')).includes('<giscus-comments')) errors.push(`Comments were included on a non-article page: ${page}`);
}
if (!article.includes(`https://github.com/${blog.repository}/edit/main/src/content/docs/development/first-post.md`)) errors.push('Article editing link is missing.');
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`Checked ${pages} static pages: links, assets, base path, drafts, search, article comments, and GitHub editing.`);
