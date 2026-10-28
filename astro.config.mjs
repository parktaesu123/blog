import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { blog } from './blog.config.mjs';
import { resolveSite } from './scripts/site-config.mjs';
import remarkWrittenLayout from './src/utils/remark-written-layout.mjs';
import { unified } from '@astrojs/markdown-remark';

const { site, base } = resolveSite();

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'always',
  markdown: { processor: unified({ remarkPlugins: [remarkWrittenLayout], smartypants: false }) },
  redirects: { '/development/first-post/': '/' },
  integrations: [starlight({
    title: blog.title,
    description: blog.description,
    defaultLocale: 'root',
    locales: { root: { label: '한국어', lang: 'ko' } },
    favicon: '/favicon.svg',
    components: {
      PageTitle: './src/components/PageTitle.astro',
      Footer: './src/components/Footer.astro',
      Header: './src/components/Header.astro',
      Sidebar: './src/components/Sidebar.astro',
      ThemeProvider: './src/components/LightTheme.astro',
      ThemeSelect: './src/components/ThemeSelect.astro',
    },
    customCss: ['./src/styles/custom.css'],
    sidebar: [
      { label: '홈', link: '/' },
      { label: '모든 글', link: '/posts/' },
    ],
    lastUpdated: false,
    pagination: false,
  })],
});
