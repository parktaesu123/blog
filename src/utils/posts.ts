import { getCollection, type CollectionEntry } from 'astro:content';
import { isHomePage } from './paths';

export type Post = CollectionEntry<'docs'>;
const categories: Record<string, string> = {
  development: '개발', til: 'TIL', life: '일상·회고',
};

export async function getPosts(): Promise<Post[]> {
  const entries = await getCollection('docs');
  return entries
    .filter((entry) => !isHomePage(entry.id) && !entry.data.draft && entry.data.publishedAt)
    .sort((a, b) => b.data.publishedAt!.getTime() - a.data.publishedAt!.getTime() || a.id.localeCompare(b.id));
}

export function categoryOf(post: Post) {
  return categories[post.id.split('/')[0]] ?? '기록';
}

export function tagsOf(posts: Post[]) {
  return [...new Set(posts.flatMap((post) => post.data.tags))].sort((a, b) => a.localeCompare(b, 'ko'));
}
