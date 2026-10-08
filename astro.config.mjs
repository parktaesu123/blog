import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { resolveSite } from './scripts/site-config.mjs';

const { site, base } = resolveSite();

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'always',
  integrations: [mdx(), sitemap()],
  markdown: { shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } } },
});
