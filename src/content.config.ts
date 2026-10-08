import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

export const collections = {
  docs: defineCollection({
    loader: glob({ base: './src/content/docs', pattern: '**/*.{md,mdx}', generateId: ({ entry }) => entry.replace(/\.(md|mdx)$/, '') }),
    schema: z.object({
        title: z.string(),
        description: z.string().default(''),
        draft: z.boolean().default(false),
        publishedAt: z.coerce.date().optional(),
        updatedAt: z.coerce.date().optional(),
        tags: z.array(z.string().trim().min(1)).default([]),
        comments: z.boolean().default(true),
      }).superRefine((data, ctx) => {
        if (data.updatedAt && data.publishedAt && data.updatedAt < data.publishedAt) {
          ctx.addIssue({ code: 'custom', path: ['updatedAt'], message: '수정일은 발행일보다 빠를 수 없습니다.' });
        }
      }),
  }),
};
