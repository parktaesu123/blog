const SITE = 'https://blog.taisu.site';
const REPO = 'parktaesu123/blog';
const OWNER_ID = 163130634;
const COMMENT_CATEGORY = 'DIC_kwDOU_E-Rs4DHOvY';
const ROOT = 'src/content/docs/';
const CATEGORY_FILE = 'src/data/categories.json';
const SESSION_COOKIE = '__Host-taisu-session';
const OAUTH_COOKIE = '__Host-taisu-oauth';
const MAX_CONTENT = 256 * 1024;
const MAX_IMAGE = 5 * 1024 * 1024;
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
function categorySettings(value) {
  const invalid = () => { throw new ApiError(400, '카테고리 설정이 올바르지 않습니다. 이름과 이동할 카테고리를 확인해 주세요.'); };
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !['categories', 'redirects'].includes(key))) invalid();
  if (!Array.isArray(value.categories) || value.categories.length < 1 || value.categories.length > 50) invalid();
  const validId = (id) => typeof id === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(id) && !['constructor', 'prototype'].includes(id);
  const ids = new Set();
  const categories = value.categories.map((item) => {
    if (!item || typeof item !== 'object' || Object.keys(item).some((key) => !['id', 'label'].includes(key)) || !validId(item.id) || ids.has(item.id)) invalid();
    if (typeof item.label !== 'string' || !item.label.trim() || item.label.trim().length > 40 || /[\x00-\x1f\x7f]/.test(item.label)) invalid();
    ids.add(item.id); return { id: item.id, label: item.label.trim() };
  });
  if (!value.redirects || typeof value.redirects !== 'object' || Array.isArray(value.redirects) || Object.keys(value.redirects).length > 200) invalid();
  const redirects = {};
  for (const [from, to] of Object.entries(value.redirects)) {
    if (!validId(from) || ids.has(from) || !ids.has(to)) invalid();
    redirects[from] = to;
  }
  return { categories, redirects };
}
async function readCategories(token) {
  const file = await github(`/repos/${REPO}/contents/${CATEGORY_FILE}?ref=main`, token);
  if (file.type !== 'file' || file.encoding !== 'base64' || file.size > 32768) throw new ApiError(502, '카테고리 설정 파일을 확인해 주세요.');
  let config;
  try { config = categorySettings(JSON.parse(new TextDecoder().decode(base64ToBytes(file.content.replaceAll('\n', ''))))); }
  catch { throw new ApiError(502, '카테고리 설정 파일을 확인해 주세요.'); }
  return { config, sha: file.sha };
}
function imagePath(name) {
  if (typeof name !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(png|jpg|gif|webp)$/i.test(name)) throw new ApiError(400, '올바른 이미지 이름이 아닙니다.');
  return `public/uploads/${name}`;
}
function validateImage(content, name) {
  if (typeof content !== 'string' || !content || content.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(content)) throw new ApiError(400, '이미지 파일을 읽지 못했습니다.');
  const size = content.length / 4 * 3 - (content.endsWith('==') ? 2 : content.endsWith('=') ? 1 : 0);
  if (size > MAX_IMAGE) throw new ApiError(413, '이미지는 5MB 이하로 첨부해 주세요.');
  // Inspect the file signature without decoding a multi-megabyte image into memory.
  const bytes = base64ToBytes(content.slice(0, 32));
  const starts = (...values) => values.every((value, i) => bytes[i] === value);
  const text = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  const extension = starts(137, 80, 78, 71, 13, 10, 26, 10) ? 'png'
    : starts(255, 216, 255) ? 'jpg'
    : ['GIF87a', 'GIF89a'].includes(text(0, 6)) ? 'gif'
    : text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP' ? 'webp' : null;
  if (!extension || !name.toLowerCase().endsWith(`.${extension}`)) throw new ApiError(400, 'PNG·JPG·GIF·WebP 이미지 파일만 첨부할 수 있습니다.');
}
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

const pageFields = 'totalCount pageInfo { hasNextPage endCursor }';
const commentFields = 'id bodyText url createdAt author { login url } replies { totalCount } reactions { totalCount }';
const commentConnection = `${pageFields} nodes { ${commentFields} }`;
const reactionConnection = `${pageFields} nodes { content createdAt user { login url } }`;
async function discussionQuery(query, variables, token) {
  const result = await github('/graphql', token, { method: 'POST', body: JSON.stringify({ query, variables }) });
  // GraphQL may report permission or upstream errors with an HTTP 200 response.
  if (result.errors?.length || !result.data) throw new ApiError(502, '댓글과 반응을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
  return result.data;
}
function validateDiscussion(discussion) {
  if (!discussion || discussion.category?.id !== COMMENT_CATEGORY) throw new ApiError(404, '블로그에 연결된 댓글을 찾을 수 없습니다.');
  return discussion;
}
async function activity(url, token) {
  const after = url.searchParams.get('after');
  if (after !== null && (!after.length || after.length > 512 || /[\x00-\x1f\x7f]/.test(after))) throw new ApiError(400, '올바른 목록 위치가 아닙니다.');
  const value = url.searchParams.get('discussion');
  if (value === null) {
    const data = await discussionQuery(`query BlogActivity($category: ID!, $after: String) {
      repository(owner: "parktaesu123", name: "blog") {
        discussions(categoryId: $category, first: 20, after: $after, orderBy: { field: UPDATED_AT, direction: DESC }) {
          ${pageFields} nodes { number title url updatedAt comments { totalCount } reactions { totalCount } }
        }
      }
    }`, { category: COMMENT_CATEGORY, after }, token);
    if (!data.repository?.discussions) throw new ApiError(502, '댓글 목록을 확인하지 못했습니다.');
    return json({ discussions: data.repository.discussions });
  }
  if (!/^[1-9]\d{0,9}$/.test(value) || Number(value) > 2147483647) throw new ApiError(400, '올바른 댓글 번호가 아닙니다.');
  const number = Number(value);
  const section = url.searchParams.get('section') || 'overview';
  if (!['overview', 'comments', 'reactions', 'replies', 'comment-reactions'].includes(section)) throw new ApiError(400, '올바른 조회 항목이 아닙니다.');
  if (section === 'replies' || section === 'comment-reactions') {
    const id = url.searchParams.get('comment');
    if (!id || !/^[A-Za-z0-9_+=/-]{1,256}$/.test(id)) throw new ApiError(400, '올바른 댓글 정보가 아닙니다.');
    const field = section === 'replies' ? 'replies' : 'reactions';
    const connection = field === 'replies' ? commentConnection : reactionConnection;
    const data = await discussionQuery(`query BlogCommentActivity($id: ID!, $after: String) {
      node(id: $id) { ... on DiscussionComment {
        discussion { number category { id } repository { nameWithOwner } }
        ${field}(first: ${field === 'replies' ? 30 : 100}, after: $after) { ${connection} }
      } }
    }`, { id, after }, token);
    const discussion = validateDiscussion(data.node?.discussion);
    if (discussion.number !== number || discussion.repository?.nameWithOwner !== REPO) throw new ApiError(404, '해당 글의 댓글을 찾을 수 없습니다.');
    return json({ [field]: data.node[field] });
  }
  const selection = section === 'overview'
    ? `number title url category { id } comments(first: 30) { ${commentConnection} } reactions(first: 100) { ${reactionConnection} }`
    : `category { id } ${section}(first: ${section === 'comments' ? 30 : 100}, after: $after) { ${section === 'comments' ? commentConnection : reactionConnection} }`;
  const data = await discussionQuery(`query BlogDiscussion($number: Int!${section === 'overview' ? '' : ', $after: String'}) {
    repository(owner: "parktaesu123", name: "blog") { discussion(number: $number) { ${selection} } }
  }`, section === 'overview' ? { number } : { number, after }, token);
  const discussion = validateDiscussion(data.repository?.discussion);
  return json(section === 'overview' ? { discussion } : { [section]: discussion[section] });
}
async function readSession(request, env) {
  const session = await unseal(readCookie(request, SESSION_COOKIE), env.SESSION_KEY);
  if (!session || session.id !== OWNER_ID || typeof session.token !== 'string' || typeof session.csrf !== 'string') return null;
  return session;
}
async function body(request, limit = MAX_CONTENT * 2) {
  if (Number(request.headers.get('Content-Length')) > limit) throw new ApiError(413, '파일이 너무 큽니다.');
  const text = await request.text();
  if (encoder.encode(text).length > limit) throw new ApiError(413, '파일이 너무 큽니다.');
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
  if (url.pathname === '/activity' && request.method === 'GET') return activity(url, session.token);
  if (url.pathname === '/categories' && request.method === 'GET') return json(await readCategories(session.token));
  if (!['GET', 'HEAD'].includes(request.method)) {
    if (origin !== SITE || request.headers.get('X-CSRF-Token') !== session.csrf) throw new ApiError(403, '요청을 확인하지 못했습니다. 새로고침 후 다시 시도해 주세요.');
    const user = await github('/user', session.token);
    if (user.id !== OWNER_ID) throw new ApiError(403, '작성자 계정만 글을 관리할 수 있습니다.');
  }
  if (url.pathname === '/auth/logout' && request.method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': cookie(SESSION_COOKIE, '', 0) });
  if (url.pathname === '/categories' && request.method === 'PUT') {
    const data = await body(request, 32768);
    const config = categorySettings(data.config);
    if (typeof data.sha !== 'string' || !/^[a-f0-9]{40}$/i.test(data.sha)) throw new ApiError(400, '카테고리 버전을 확인하지 못했습니다.');
    const current = await readCategories(session.token);
    if (current.sha !== data.sha) throw new ApiError(409, '카테고리가 다른 곳에서 변경됐습니다. 다시 불러온 뒤 수정해 주세요.');
    const removed = [...current.config.categories.map((item) => item.id), ...Object.keys(current.config.redirects)].filter((id) => !config.categories.some((item) => item.id === id));
    if (removed.some((id) => !Object.hasOwn(config.redirects, id))) throw new ApiError(400, '삭제할 카테고리의 글을 옮길 카테고리를 선택해 주세요.');
    const result = await github(`/repos/${REPO}/contents/${CATEGORY_FILE}`, session.token, { method: 'PUT', body: JSON.stringify({
      branch: 'main', sha: data.sha, message: 'Update sidebar categories from blog editor',
      content: bytesToBase64(encoder.encode(JSON.stringify(config, null, 2) + '\n')),
    }) });
    return json({ ok: true, config, sha: result.content?.sha, commit: result.commit?.sha });
  }
  if (url.pathname === '/image' && request.method === 'POST') {
    const data = await body(request, Math.ceil(MAX_IMAGE / 3) * 4 + 1024);
    const path = imagePath(data.name);
    validateImage(data.content, data.name);
    const result = await github(`/repos/${REPO}/contents/${apiPath(path)}`, session.token, {
      method: 'PUT', body: JSON.stringify({ branch: 'main', message: `Add ${data.name} from blog editor`, content: data.content }),
    });
    return json({ ok: true, url: `/uploads/${data.name}`, commit: result.commit?.sha }, 201);
  }
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
