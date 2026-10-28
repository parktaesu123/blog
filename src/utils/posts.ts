import { getCollection, type CollectionEntry } from 'astro:content';
import { isHomePage } from './paths';
import { resolveCategory } from './categories';

export type Post = CollectionEntry<'docs'>;

export async function getPosts(): Promise<Post[]> {
  const entries = await getCollection('docs');
  return entries
    .filter((entry) => !isHomePage(entry.id) && !entry.data.draft && entry.data.publishedAt)
    .sort((a, b) => b.data.publishedAt!.getTime() - a.data.publishedAt!.getTime() || a.id.localeCompare(b.id));
}

export function categoryOf(post: Post) {
  return resolveCategory(categoryIdOf(post)).label;
}

export function categoryIdOf(post: Post) {
  const source = post.filePath?.split('src/content/docs/')[1] ?? post.id;
  return resolveCategory(post.data.category ?? source.split('/')[0]).id;
}

export function tagsOf(posts: Post[]) {
  return [...new Set(posts.flatMap((post) => post.data.tags))].sort((a, b) => a.localeCompare(b, 'ko'));
}
