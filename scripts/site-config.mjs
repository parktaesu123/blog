import { loadEnv } from 'vite';
import { blog } from '../blog.config.mjs';

export function resolveSite(env = { ...loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), 'PUBLIC_'), ...process.env }) {
  const [owner, repository] = (env.GITHUB_REPOSITORY ?? '').split('/');
  const isUserSite = repository?.toLowerCase() === `${owner?.toLowerCase()}.github.io`;
  const site = env.PUBLIC_SITE_URL || blog.site || (owner ? `https://${owner}.github.io` : 'http://localhost:4321');
  const inferredBase = owner && repository && !isUserSite ? `/${repository}/` : '/';
  const base = env.PUBLIC_BASE_PATH || (env.PUBLIC_SITE_URL || blog.site ? '/' : inferredBase);
  return { site, base: `/${base.split('/').filter(Boolean).join('/')}${base.split('/').filter(Boolean).length ? '/' : ''}` };
}
