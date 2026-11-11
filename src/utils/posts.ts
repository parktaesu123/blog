import { getCollection, type CollectionEntry } from 'astro:content';
import { isIntroduction, sitePath } from './paths';
import { categoryConfig, resolveCategory } from './categories';

export type Post = CollectionEntry<'docs'>;

export async function getPosts(): Promise<Post[]> {
  const entries = await getCollection('docs');
  return entries
    .filter((entry) => !isIntroduction(entry.id) && !entry.data.draft && entry.data.publishedAt)
    .sort((a, b) => b.data.publishedAt!.getTime() - a.data.publishedAt!.getTime() || a.id.localeCompare(b.id));
}

export async function getIntroduction() {
  return (await getCollection('docs')).find((entry) => isIntroduction(entry.id));
}

export function categoryOf(post: Post) {
  return resolveCategory(categoryIdOf(post)).label;
}

export function categoryIdOf(post: Post) {
  const source = post.filePath?.split('src/content/docs/')[1] ?? post.id;
  return resolveCategory(post.data.category ?? source.split('/')[0]).id;
}

/** Every configured category with its posts, in sidebar order. */
export function groupByCategory(posts: Post[]) {
  return categoryConfig.categories.map((category) => ({
    ...category,
    posts: posts.filter((post) => categoryIdOf(post) === category.id),
  }));
}

/** The path of the source file, which is what the admin editor addresses. */
export function sourceIdOf(entry: Post) {
  return entry.filePath?.split('src/content/docs/')[1]?.replace(/\.mdx?$/, '') ?? entry.id;
}

export function tagsOf(posts: Post[]) {
  return [...new Set(posts.flatMap((post) => post.data.tags))].sort((a, b) => a.localeCompare(b, 'ko'));
}

/** The first image in the body, which the editor inserts as the post's cover. */
export function coverOf(post: Post): string | undefined {
  const match = post.body?.match(/!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/) ?? post.body?.match(/<img[^>]+src="([^"]+)"/);
  const src = match?.[1];
  if (!src) return undefined;
  if (/^https?:\/\//.test(src)) return src;
  return src.startsWith('/') ? sitePath(src) : undefined;
}

/** Rough reading time for Korean prose, about 500 characters a minute. */
export function readingMinutes(post: Post) {
  const text = (post.body ?? '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<[^>]+>/g, '').replace(/[#>*`_~\-|]/g, '').replace(/\s+/g, '');
  return Math.max(1, Math.round(text.length / 500));
}
