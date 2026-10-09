import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { blog } from './blog.config.mjs';
import { resolveSite } from './scripts/site-config.mjs';

const { site, base } = resolveSite();

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'always',
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
    },
    customCss: ['./src/styles/custom.css'],
    sidebar: [
      { label: '홈', link: '/' },
      { label: '모든 글', link: '/posts/' },
      { label: '개발', items: [{ autogenerate: { directory: 'development' } }] },
      { label: 'TIL', items: [{ autogenerate: { directory: 'til' } }] },
      { label: '일상·회고', items: [{ autogenerate: { directory: 'life' } }] },
      { label: '소개', link: '/about/' },
    ],
    lastUpdated: false,
    pagination: false,
  })],
});
