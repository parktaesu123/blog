import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { resolveSite } from './scripts/site-config.mjs';
import remarkWrittenLayout from './src/utils/remark-written-layout.mjs';
import { unified } from '@astrojs/markdown-remark';

const { site, base } = resolveSite();

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'always',
  markdown: {
    processor: unified({ remarkPlugins: [remarkWrittenLayout], smartypants: false }),
    shikiConfig: { theme: 'github-light' },
  },
  // The introduction used to live at these addresses.
  redirects: { '/development/first-post/': '/about/' },
  integrations: [mdx(), sitemap({ filter: (page) => !page.includes('/admin/') })],
});
