import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';

const env = { GITHUB_CLIENT_ID: 'test-client', GITHUB_CLIENT_SECRET: 'test-secret', SESSION_KEY: 'a'.repeat(64) };
const site = 'https://blog.taisu.site';
const origin = 'https://blog-admin.taisu.site';
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });
const calls = [];
let handler;
globalThis.fetch = async (url, options) => {
  calls.push({ url: String(url), options });
  if (!handler) throw new Error('Unexpected network request');
  return handler(String(url), options);
};
function response(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } }); }
async function sessionCookie(overrides = {}) {
  return '__Host-taisu-session=' + await seal({ id: 163130634, login: 'parktaesu123', token: 'test-user-token', csrf: 'test-csrf', expiresAt: Date.now() + 60000, ...overrides }, env.SESSION_KEY);
}
async function seal(value, secret) {
  const key = await crypto.subtle.importKey('raw', Buffer.from(secret, 'hex'), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(value)));
  return `${Buffer.from(iv).toString('base64url')}.${Buffer.from(encrypted).toString('base64url')}`;
}
function request(path, headers = {}, options = {}) { return new Request(origin + path, { ...options, headers: { Origin: site, ...headers } }); }

test('Unauthenticated visitors cannot list or change posts', async () => {
  for (const [path, method] of [['/posts','GET'], ['/post','PUT'], ['/post','DELETE'], ['/image','POST']]) {
    const result = await worker.fetch(request(path, {}, { method }), env);
    assert.equal(result.status, 401);
  }
  const result = await worker.fetch(request('/session'), env);
  assert.deepEqual(await result.json(), { authenticated: false });
});
test('Only the verified owner ID is accepted, even with a valid encrypted cookie', async () => {
  const result = await worker.fetch(request('/posts', { Cookie: await sessionCookie({ id: 99 }) }), env);
  assert.equal(result.status, 401);
});
test('Expired and tampered cookies are rejected', async () => {
  for (const value of [await sessionCookie({ expiresAt: Date.now() - 10 }), (await sessionCookie()).slice(0, -10) + 'tampered']) {
    const result = await worker.fetch(request('/session', { Cookie: value }), env);
    assert.deepEqual(await result.json(), { authenticated: false });
  }
});
test('Session response does not expose the GitHub token', async () => {
  const result = await worker.fetch(request('/session', { Cookie: await sessionCookie() }), env);
  const text = await result.text();
  assert.equal(result.status, 200);
  assert.equal(text.includes('test-user-token'), false);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.equal(result.headers.get('Access-Control-Allow-Origin'), site);
});
test('Foreign origins and writes without a matching CSRF token are blocked', async () => {
  const cookie = await sessionCookie();
  assert.equal((await worker.fetch(request('/session', { Origin: 'https://attacker.example' }), env)).status, 403);
  assert.equal((await worker.fetch(request('/post', { Cookie: cookie }, { method: 'PUT', body: '{}' }), env)).status, 403);
  assert.equal((await worker.fetch(request('/post', { Cookie: cookie, 'X-CSRF-Token': 'wrong' }, { method: 'PUT', body: '{}' }), env)).status, 403);
  assert.equal((await worker.fetch(request('/image', { Cookie: cookie }, { method: 'POST', body: '{}' }), env)).status, 403);
});

const imageName = '12345678-1234-4123-8123-123456789abc.png';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP9sAAAAASUVORK5CYII=';
test('Images are created only inside public/uploads on blog/main with original bytes', async () => {
  handler = (url, options) => {
    if (url.endsWith('/user')) return response({ id: 163130634 });
    assert.equal(url, `https://api.github.com/repos/parktaesu123/blog/contents/public/uploads/${imageName}`);
    assert.equal(options.method, 'PUT');
    const data = JSON.parse(options.body);
    assert.equal(data.branch, 'main'); assert.equal(data.content, png); assert.equal(data.sha, undefined);
    return response({ commit: { sha: 'c'.repeat(40) } });
  };
  const result = await worker.fetch(request('/image', { Cookie: await sessionCookie(), 'X-CSRF-Token': 'test-csrf' }, { method: 'POST', body: JSON.stringify({ name: imageName, content: png }) }), env);
  assert.equal(result.status, 201);
  assert.equal((await result.json()).url, `/uploads/${imageName}`);
});
test('Image uploads reject traversal, SVG, fake image data and mismatched extensions', async () => {
  handler = (url) => { assert.ok(url.endsWith('/user')); return response({ id: 163130634 }); };
  const headers = { Cookie: await sessionCookie(), 'X-CSRF-Token': 'test-csrf' };
  for (const data of [
    { name: '../README.md', content: png },
    { name: imageName.replace('.png', '.svg'), content: Buffer.from('<svg/>').toString('base64') },
    { name: imageName, content: Buffer.from('<script>alert(1)</script>').toString('base64') },
    { name: imageName.replace('.png', '.jpg'), content: png },
    { name: imageName, content: 'not base64!' },
  ]) assert.equal((await worker.fetch(request('/image', headers, { method: 'POST', body: JSON.stringify(data) }), env)).status, 400);
});
test('Oversized images are rejected before sending content to GitHub', async () => {
  handler = (url) => { assert.ok(url.endsWith('/user')); return response({ id: 163130634 }); };
  const content = Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64');
  const result = await worker.fetch(request('/image', { Cookie: await sessionCookie(), 'X-CSRF-Token': 'test-csrf' }, { method: 'POST', body: JSON.stringify({ name: imageName, content }) }), env);
  assert.equal(result.status, 413);
});
test('An image name collision cannot overwrite an existing upload', async () => {
  handler = (url) => url.endsWith('/user') ? response({ id: 163130634 }) : response({ message: 'Already exists' }, 422);
  const result = await worker.fetch(request('/image', { Cookie: await sessionCookie(), 'X-CSRF-Token': 'test-csrf' }, { method: 'POST', body: JSON.stringify({ name: imageName, content: png }) }), env);
  assert.equal(result.status, 409);
});
test('Paths cannot escape the three article directories', async () => {
  const headers = { Cookie: await sessionCookie() };
  for (const path of ['../README.md', 'development/../../.github/workflows/deploy.yml', '.github/workflows/deploy.md', 'development/.secret.md', 'development//test.md']) {
    assert.equal((await worker.fetch(request('/post?path=' + encodeURIComponent(path), headers), env)).status, 400);
  }
});
test('Login includes PKCE, state and secure HttpOnly cookies', async () => {
  const result = await worker.fetch(request('/auth/login?return_to=https://attacker.example'), env);
  const location = new URL(result.headers.get('Location'));
  assert.equal(location.origin, 'https://github.com');
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(location.searchParams.get('state'));
  assert.equal(location.searchParams.has('scope'), false);
  assert.match(result.headers.get('Set-Cookie'), /Secure; HttpOnly; SameSite=Lax/);
});
test('Invalid OAuth state cannot exchange a code', async () => {
  const before = calls.length;
  const pending = await seal({ state: 'correct', verifier: 'test', expiresAt: Date.now() + 60000 }, env.SESSION_KEY);
  const result = await worker.fetch(request('/auth/callback?state=wrong&code=fake', { Cookie: '__Host-taisu-oauth=' + pending }), env);
  assert.equal(result.headers.get('Location'), site + '/admin/?error=login');
  assert.equal(calls.length, before);
});
test('OAuth callback refuses another account and does not create a session', async () => {
  handler = (url) => url.endsWith('/access_token') ? response({ access_token: 'test-user-token' }) : response({ id: 99, login: 'other' });
  const pending = await seal({ state: 'correct', verifier: 'test', expiresAt: Date.now() + 60000 }, env.SESSION_KEY);
  const result = await worker.fetch(request('/auth/callback?state=correct&code=fake', { Cookie: '__Host-taisu-oauth=' + pending }), env);
  assert.equal(result.headers.get('Location'), site + '/admin/?error=owner');
  assert.match(result.headers.get('Set-Cookie'), /__Host-taisu-session=;.*Max-Age=0/);
});
test('Owner OAuth login cannot redirect to an unrelated site or expose a token', async () => {
  handler = (url) => url.endsWith('/access_token') ? response({ access_token: 'test-user-token' }) : url.endsWith('/user') ? response({ id: 163130634, login: 'parktaesu123' }) : response({ permissions: { push: true } });
  const pending = await seal({ state: 'correct', verifier: 'test', returnTo: 'https://attacker.example', expiresAt: Date.now() + 60000 }, env.SESSION_KEY);
  const result = await worker.fetch(request('/auth/callback?state=correct&code=fake', { Cookie: '__Host-taisu-oauth=' + pending }), env);
  assert.equal(result.headers.get('Location'), site + '/admin/');
  assert.equal(result.headers.get('Set-Cookie').includes('test-user-token'), false);
});
test('Saving preserves UTF-8 content and restricts GitHub writes to blog/main', async () => {
  const content = '---\ntitle: 글 제목\ndraft: true\n---\n\n한글 본문\n';
  handler = (url, options) => {
    if (url.endsWith('/user')) return response({ id: 163130634 });
    assert.equal(url, 'https://api.github.com/repos/parktaesu123/blog/contents/src/content/docs/development/test.md');
    const data = JSON.parse(options.body);
    assert.equal(data.branch, 'main');
    assert.equal(Buffer.from(data.content, 'base64').toString(), content);
    return response({ content: { sha: 'b'.repeat(40) }, commit: { sha: 'c'.repeat(40) } });
  };
  const result = await worker.fetch(request('/post', { Cookie: await sessionCookie(), 'X-CSRF-Token': 'test-csrf' }, { method: 'PUT', body: JSON.stringify({ path: 'development/test.md', content }) }), env);
  assert.equal(result.status, 200);
});
test('Stale revisions return a conflict without silently overwriting a post', async () => {
  handler = (url) => url.endsWith('/user') ? response({ id: 163130634 }) : response({ message: 'Conflict' }, 409);
  const result = await worker.fetch(request('/post', { Cookie: await sessionCookie(), 'X-CSRF-Token': 'test-csrf' }, { method: 'PUT', body: JSON.stringify({ path: 'development/test.md', content: '---\ntitle: Test\n---\nBody', sha: 'a'.repeat(40) }) }), env);
  assert.equal(result.status, 409);
});
test('Deletion requires the current file revision and remains limited to content', async () => {
  handler = (url, options) => {
    if (url.endsWith('/user')) return response({ id: 163130634 });
    assert.equal(options.method, 'DELETE');
    assert.equal(JSON.parse(options.body).sha, 'a'.repeat(40));
    return response({ commit: { sha: 'c'.repeat(40) } });
  };
  const headers = { Cookie: await sessionCookie(), 'X-CSRF-Token': 'test-csrf' };
  const missing = await worker.fetch(request('/post', headers, { method: 'DELETE', body: JSON.stringify({ path: 'development/test.md' }) }), env);
  assert.equal(missing.status, 400);
  const valid = await worker.fetch(request('/post', headers, { method: 'DELETE', body: JSON.stringify({ path: 'development/test.md', sha: 'a'.repeat(40) }) }), env);
  assert.equal(valid.status, 200);
});
