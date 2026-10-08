const SITE = 'https://blog.taisu.site';
const REPO = 'parktaesu123/blog';
const OWNER_ID = 163130634;
const ROOT = 'src/content/docs/';
const SESSION_COOKIE = '__Host-taisu-session';
const OAUTH_COOKIE = '__Host-taisu-oauth';
const MAX_CONTENT = 256 * 1024;
const encoder = new TextEncoder();

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function base64ToBytes(value) { return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)); }
function urlBase64(bytes) { return bytesToBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''); }
function fromUrlBase64(value) { return base64ToBytes(value.replaceAll('-', '+').replaceAll('_', '/')); }
function cookie(name, value, age) { return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`; }
function readCookie(request, name) {
  return (request.headers.get('Cookie') || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}
async function key(secret) {
  if (!/^[a-f0-9]{64}$/i.test(secret || '')) throw new ApiError(503, '인증 서비스 설정을 확인하고 있습니다.');
  const bytes = Uint8Array.from(secret.match(/../g), (byte) => parseInt(String(byte), 16));
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function seal(value, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(secret), encoder.encode(JSON.stringify(value)));
  return `${urlBase64(iv)}.${urlBase64(new Uint8Array(encrypted))}`;
}
async function unseal(value, secret) {
  if (!value || value.length > 12000) return null;
  try {
    const [iv, payload] = value.split('.');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromUrlBase64(iv) }, await key(secret), fromUrlBase64(payload));
    const result = JSON.parse(new TextDecoder().decode(plain));
    return result.expiresAt > Date.now() ? result : null;
  } catch { return null; }
}
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}
function redirect(url, cookies = []) {
  const headers = new Headers({ Location: url });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 302, headers });
}
function returnUrl(value) {
  try {
    const url = new URL(value);
    if (url.origin === SITE && !url.username && !url.password) return url.href;
  } catch {}
  return `${SITE}/admin/`;
}
function documentPath(value) {
  if (typeof value !== 'string' || value.length > 180 || !/^(development|til|life)\/[\p{L}\p{N}_.\/-]+\.(md|mdx)$/u.test(value)) throw new ApiError(400, '올바른 글 경로가 아닙니다.');
  if (value.split('/').some((segment) => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))) throw new ApiError(400, '올바른 글 경로가 아닙니다.');
  return ROOT + value;
}
function apiPath(value) { return value.split('/').map(encodeURIComponent).join('/'); }
async function github(path, token, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
      'User-Agent': 'taisu-blog-admin', 'X-GitHub-Api-Version': '2026-03-10',
      'Content-Type': 'application/json', ...options.headers,
    },
  });
  if (!response.ok) {
    if ([409, 422].includes(response.status)) throw new ApiError(409, '글이 다른 곳에서 변경됐거나 같은 주소의 글이 있습니다. 최신 글을 다시 불러와 주세요.');
    if (response.status === 404) throw new ApiError(404, '글을 찾을 수 없습니다.');
    if ([401, 403].includes(response.status)) throw new ApiError(401, '로그인 권한을 확인하지 못했습니다. 다시 로그인해 주세요.');
    throw new ApiError(502, 'GitHub 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
  return response.json();
}
async function readSession(request, env) {
  const session = await unseal(readCookie(request, SESSION_COOKIE), env.SESSION_KEY);
  if (!session || session.id !== OWNER_ID || typeof session.token !== 'string' || typeof session.csrf !== 'string') return null;
  return session;
}
async function body(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_CONTENT * 2) throw new ApiError(413, '글이 너무 큽니다.');
  const text = await request.text();
  if (encoder.encode(text).length > MAX_CONTENT * 2) throw new ApiError(413, '글이 너무 큽니다.');
  try { return JSON.parse(text); } catch { throw new ApiError(400, '요청 형식이 올바르지 않습니다.'); }
}
async function route(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin && origin !== SITE) throw new ApiError(403, '허용되지 않은 사이트입니다.');
  if (request.method === 'OPTIONS') {
    if (origin !== SITE) throw new ApiError(403, '허용되지 않은 사이트입니다.');
    return new Response(null, { status: 204 });
  }
  const ready = Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && /^[a-f0-9]{64}$/i.test(env.SESSION_KEY || ''));
  if (url.pathname === '/health' && request.method === 'GET') return json({ ready }, ready ? 200 : 503);
  if (!ready) throw new ApiError(503, '인증 서비스 설정을 확인하고 있습니다.');

  if (url.pathname === '/auth/login' && request.method === 'GET') {
    const state = crypto.randomUUID();
    const verifier = urlBase64(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = urlBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))));
    const authorize = new URL('https://github.com/login/oauth/authorize');
    authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
    authorize.searchParams.set('redirect_uri', `${url.origin}/auth/callback`);
    authorize.searchParams.set('login', 'parktaesu123');
    authorize.searchParams.set('state', state);
    authorize.searchParams.set('code_challenge', challenge);
    authorize.searchParams.set('code_challenge_method', 'S256');
    authorize.searchParams.set('allow_signup', 'false');
    const pending = await seal({ state, verifier, returnTo: returnUrl(url.searchParams.get('return_to')), expiresAt: Date.now() + 600000 }, env.SESSION_KEY);
    return redirect(authorize.href, [cookie(OAUTH_COOKIE, pending, 600)]);
  }
  if (url.pathname === '/auth/callback' && request.method === 'GET') {
    const pending = await unseal(readCookie(request, OAUTH_COOKIE), env.SESSION_KEY);
    const clear = cookie(OAUTH_COOKIE, '', 0);
    if (!pending || url.searchParams.get('state') !== pending.state || !url.searchParams.get('code')) return redirect(`${SITE}/admin/?error=login`, [clear]);
    try {
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET,
          code: url.searchParams.get('code'), redirect_uri: `${url.origin}/auth/callback`, code_verifier: pending.verifier }),
      });
      if (!response.ok) throw new Error('OAuth exchange failed');
      const result = await response.json();
      if (!result.access_token) throw new Error('OAuth exchange failed');
      const user = await github('/user', result.access_token);
      if (user.id !== OWNER_ID) return redirect(`${SITE}/admin/?error=owner`, [clear, cookie(SESSION_COOKIE, '', 0)]);
      const repo = await github(`/repos/${REPO}`, result.access_token);
      if (!repo.permissions?.push) return redirect(`${SITE}/admin/?error=permission`, [clear, cookie(SESSION_COOKIE, '', 0)]);
      const lifetime = Math.min(3600, Number(result.expires_in) || 3600);
      const session = await seal({ id: user.id, login: user.login, token: result.access_token,
        csrf: crypto.randomUUID(), expiresAt: Date.now() + lifetime * 1000 }, env.SESSION_KEY);
      return redirect(returnUrl(pending.returnTo), [clear, cookie(SESSION_COOKIE, session, lifetime)]);
    } catch { return redirect(`${SITE}/admin/?error=login`, [clear, cookie(SESSION_COOKIE, '', 0)]); }
  }

  const session = await readSession(request, env);
  if (url.pathname === '/session' && request.method === 'GET') return json(session
    ? { authenticated: true, login: session.login, csrf: session.csrf }
    : { authenticated: false });
  if (!session) throw new ApiError(401, '작성자 계정으로 로그인해 주세요.');
  if (!['GET', 'HEAD'].includes(request.method)) {
    if (origin !== SITE || request.headers.get('X-CSRF-Token') !== session.csrf) throw new ApiError(403, '요청을 확인하지 못했습니다. 새로고침 후 다시 시도해 주세요.');
    const user = await github('/user', session.token);
    if (user.id !== OWNER_ID) throw new ApiError(403, '작성자 계정만 글을 관리할 수 있습니다.');
  }
  if (url.pathname === '/auth/logout' && request.method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': cookie(SESSION_COOKIE, '', 0) });
  if (url.pathname === '/posts' && request.method === 'GET') {
    const tree = await github(`/repos/${REPO}/git/trees/main?recursive=1`, session.token);
    if (tree.truncated) throw new ApiError(502, '글 목록이 너무 큽니다. 저장소 설정을 확인해 주세요.');
    return json({ posts: tree.tree.filter((item) => item.type === 'blob' && item.path.startsWith(ROOT)).flatMap((item) => {
      const relative = item.path.slice(ROOT.length);
      try { documentPath(relative); return [{ path: relative, sha: item.sha }]; } catch { return []; }
    }) });
  }
  if (url.pathname === '/post' && request.method === 'GET') {
    const path = documentPath(url.searchParams.get('path'));
    const doc = await github(`/repos/${REPO}/contents/${apiPath(path)}?ref=main`, session.token);
    if (doc.type !== 'file' || doc.encoding !== 'base64' || doc.size > MAX_CONTENT) throw new ApiError(413, '이 글은 편집기에서 불러올 수 없습니다.');
    return json({ path: path.slice(ROOT.length), sha: doc.sha, content: new TextDecoder().decode(base64ToBytes(doc.content.replaceAll('\n', ''))) });
  }
  if (url.pathname === '/post' && ['PUT', 'DELETE'].includes(request.method)) {
    const data = await body(request);
    const path = documentPath(data.path);
    if (data.sha !== undefined && !/^[a-f0-9]{40}$/i.test(data.sha)) throw new ApiError(400, '글 버전이 올바르지 않습니다.');
    if (request.method === 'DELETE' && !data.sha) throw new ApiError(400, '삭제할 글 버전을 확인하지 못했습니다.');
    const payload = { branch: 'main', sha: data.sha, message: `${request.method === 'DELETE' ? 'Delete' : data.sha ? 'Update' : 'Create'} ${data.path} from blog editor` };
    if (request.method === 'PUT') {
      if (typeof data.content !== 'string' || encoder.encode(data.content).length > MAX_CONTENT || !/^---\r?\n[\s\S]+?\r?\n---(?:\r?\n|$)/.test(data.content)) throw new ApiError(400, '글의 내용이나 제목 정보가 올바르지 않습니다.');
      payload.content = bytesToBase64(encoder.encode(data.content));
    }
    const result = await github(`/repos/${REPO}/contents/${apiPath(path)}`, session.token, { method: request.method, body: JSON.stringify(payload) });
    return json({ ok: true, sha: result.content?.sha, commit: result.commit?.sha, commitUrl: result.commit?.html_url });
  }
  throw new ApiError(404, '요청을 찾을 수 없습니다.');
}

export default {
  async fetch(request, env) {
    let response;
    try { response = await route(request, env); }
    catch (error) { response = json({ message: error instanceof ApiError ? error.message : '요청을 처리하지 못했습니다.' }, error instanceof ApiError ? error.status : 500); }
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    if (request.headers.get('Origin') === SITE) {
      headers.set('Access-Control-Allow-Origin', SITE);
      headers.set('Access-Control-Allow-Credentials', 'true');
      headers.set('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
      headers.set('Vary', 'Origin');
    }
    return new Response(response.body, { status: response.status, headers });
  },
};
