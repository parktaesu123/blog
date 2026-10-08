import { blog } from '../../blog.config.mjs';

export const adminApi = import.meta.env.PUBLIC_ADMIN_API_URL || blog.admin.api;
export interface Session { authenticated: boolean; login?: string; csrf?: string; }
let sessionRequest: Promise<Session> | undefined;

export function getSession() {
  return sessionRequest ??= fetch(`${adminApi}/session`, { credentials: 'include', cache: 'no-store' })
    .then((response) => { if (!response.ok) throw new Error('로그인 상태를 확인하지 못했습니다.'); return response.json() as Promise<Session>; });
}

export function loginUrl(returnTo = window.location.href) {
  const url = new URL('/auth/login', adminApi);
  url.searchParams.set('return_to', returnTo);
  return url.href;
}

export async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = await getSession();
  if (!session.authenticated || !session.csrf) throw new Error('작성자 계정으로 로그인해 주세요.');
  const response = await fetch(`${adminApi}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf, ...options.headers },
    cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || '요청을 처리하지 못했습니다.');
  return result as T;
}

export async function logout() {
  await adminRequest('/auth/logout', { method: 'POST' });
  sessionRequest = undefined;
  window.location.reload();
}
