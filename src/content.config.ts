import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

// Posts stay under src/content/docs so the admin worker keeps writing to the same files.
export const collections = {
  docs: defineCollection({
    loader: glob({
      base: './src/content/docs',
      pattern: '**/*.{md,mdx}',
      generateId: ({ entry, data }) => typeof data.slug === 'string' && data.slug
        ? data.slug.replace(/^\/+|\/+$/g, '')
        : entry.replace(/\.mdx?$/, ''),
    }),
    schema: z.object({
      title: z.string(),
      description: z.string().default(''),
      slug: z.string().optional(),
      draft: z.boolean().default(false),
      publishedAt: z.coerce.date().optional(),
      updatedAt: z.coerce.date().optional(),
      tags: z.array(z.string().trim().min(1)).default([]),
      comments: z.boolean().default(true),
      category: z.string().optional(),
      tableOfContents: z.boolean().optional(),
      sidebar: z.object({ hidden: z.boolean().optional(), label: z.string().optional() }).default({}),
    }).superRefine((data, ctx) => {
      if (data.updatedAt && data.publishedAt && data.updatedAt < data.publishedAt) {
        ctx.addIssue({ code: 'custom', path: ['updatedAt'], message: '수정일은 발행일보다 빠를 수 없습니다.' });
      }
    }),
  }),
};
