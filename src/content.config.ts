import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

// 파일명: {slug}.{locale}.md → id `{slug}.{locale}`
const projects = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: './src/content/projects',
    // 기본 id는 점을 지워 slug화하므로 locale 구분이 사라진다 — 파일명을 그대로 쓴다.
    generateId: ({ entry }) => entry.replace(/\.md$/, ''),
  }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    stack: z.array(z.string()),
    order: z.number().default(0),
    changelog: z.array(z.object({ date: z.string(), text: z.string() })).default([]),
  }),
});

export const collections = { projects };
