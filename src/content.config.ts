import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
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
  }),
};
