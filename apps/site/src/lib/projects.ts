import { getCollection } from 'astro:content';
import type { Locale } from '../i18n';

export function splitProjectId(id: string): { slug: string; locale: string } {
  const dot = id.lastIndexOf('.');
  return { slug: id.slice(0, dot), locale: id.slice(dot + 1) };
}

export async function getProjects(locale: Locale) {
  const all = await getCollection('projects', (entry) => splitProjectId(entry.id).locale === locale);
  return all
    .map((entry) => ({ ...entry, slug: splitProjectId(entry.id).slug }))
    .sort((a, b) => a.data.order - b.data.order);
}
