import { readdir, readFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { resolveSite } from './site-config.mjs';
import { blog } from '../blog.config.mjs';
import { load } from 'js-yaml';

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
const publishedTags = new Set();
const draftTags = new Set();
async function checkDocuments(directory, relative = '') {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, item.name);
    const name = relative + item.name;
    if (item.isDirectory()) { await checkDocuments(file, name + '/'); continue; }
    if (!/\.mdx?$/.test(item.name)) continue;
    const source = await readFile(file, 'utf8');
    const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const data = frontmatter ? load(frontmatter[1]) : {};
    const slug = String(data.slug || name.replace(/\.mdx?$/, '').replace(/(^|\/)index$/, '$1')).replace(/^\/+|\/+$/g, '');
    const target = join(output, slug, 'index.html');
    if (data.draft) {
      if (await exists(target)) errors.push(`Draft was included in the production build: ${name}`);
      for (const tag of data.tags || []) draftTags.add(tag);
      continue;
    }
    if (!data.publishedAt) continue;
    for (const tag of data.tags || []) publishedTags.add(tag);
    if (!(await exists(target))) { errors.push(`Published article is missing: ${name}`); continue; }
    const html = await readFile(target, 'utf8');
    const expectComments = blog.comments.enabled && data.comments !== false;
    if (html.includes('<giscus-comments') !== expectComments) errors.push(`Article comment setting is incorrect: ${name}`);
    if (expectComments && (!html.includes(`data-repo-id="${blog.comments.repoId}"`) || !html.includes('data-reactions-enabled="1"'))) errors.push(`Article reaction configuration is missing: ${name}`);
    if (!html.includes('data-article=')) errors.push(`Owner editing control is missing: ${name}`);
  }
}
await checkDocuments(resolve('src/content/docs'));
for (const tag of draftTags) {
  if (!publishedTags.has(tag) && await exists(join(output, 'tags', tag, 'index.html'))) errors.push(`Draft-only tag was published: ${tag}`);
}
if (!(await exists(join(output, 'pagefind/pagefind.js')))) errors.push('Search index is missing.');
for (const page of ['index.html', 'about/index.html', 'posts/index.html', 'admin/index.html']) {
  if ((await readFile(join(output, page), 'utf8')).includes('<giscus-comments')) errors.push(`Comments were included on a non-article page: ${page}`);
}
const admin = await readFile(join(output, 'admin/index.html'), 'utf8');
if (admin.includes('data-pagefind-body')) errors.push('The admin editor was included in public search.');
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`Checked ${pages} static pages: links, assets, base path, drafts, search, article comments, owner editing controls, and admin search exclusion.`);
