import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'docs'>;
const categories: Record<string, string> = {
  development: '개발', til: 'TIL', life: '일상·회고',
};

export async function getPosts(): Promise<Post[]> {
  const entries = await getCollection('docs');
  return entries
    .filter((entry) => !entry.data.draft && entry.data.publishedAt)
    .sort((a, b) => b.data.publishedAt!.getTime() - a.data.publishedAt!.getTime() || a.id.localeCompare(b.id));
}

export function categoryOf(post: Post) {
  return categories[post.id.split('/')[0]] ?? '기록';
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul',
  }).format(date);
}

export function tagsOf(posts: Post[]) {
  return [...new Set(posts.flatMap((post) => post.data.tags))].sort((a, b) => a.localeCompare(b, 'ko'));
}
