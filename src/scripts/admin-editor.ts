import { load, dump } from 'js-yaml';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { getSession, adminRequest, loginUrl, logout } from '../utils/admin';
import { sitePath } from '../utils/paths';

interface Doc { path: string; sha: string; content: string; }
interface ParsedDoc { meta: Record<string, unknown>; body: string; }
interface Saved { ok: boolean; sha?: string; commitUrl?: string; }
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = element<HTMLParagraphElement>('admin-status');
const form = element<HTMLFormElement>('post-editor');
const title = element<HTMLInputElement>('post-title');
const description = element<HTMLTextAreaElement>('post-description');
const category = element<HTMLSelectElement>('post-category');
const slug = element<HTMLInputElement>('post-slug');
const date = element<HTMLInputElement>('post-date');
const tags = element<HTMLInputElement>('post-tags');
const draft = element<HTMLInputElement>('post-draft');
const comments = element<HTMLInputElement>('post-comments');
const body = element<HTMLTextAreaElement>('post-body');
const saveStatus = element<HTMLParagraphElement>('save-status');
const list = element<HTMLDivElement>('admin-posts');
let selected: Doc | undefined;
let metadata: Record<string, unknown> = {};
let dirty = false;
let busy = false;
let loadingList = 0;

function message(error: unknown) { return error instanceof Error ? error.message : '처리하지 못했습니다. 다시 시도해 주세요.'; }
function koreaDate(value: unknown = new Date()) {
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return koreaDate();
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul' }).format(parsed);
}
function parse(content: string): ParsedDoc {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new Error('글의 제목 정보를 읽지 못했습니다. 원본 파일을 확인해 주세요.');
  const meta = load(match[1]);
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new Error('글의 제목 정보가 올바르지 않습니다.');
  return { meta: meta as Record<string, unknown>, body: match[2].replace(/^\r?\n/, '') };
}
function confirmAction(text: string, acceptLabel: string) {
  const dialog = element<HTMLDialogElement>('editor-confirm');
  element('confirm-message').textContent = text;
  element('confirm-accept').textContent = acceptLabel;
  dialog.returnValue = 'cancel';
  dialog.showModal();
  return new Promise<boolean>((resolve) => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'accept'), { once: true }));
}
async function mayDiscard() { return !dirty || await confirmAction('저장하지 않은 내용이 있습니다. 변경 내용을 버릴까요?', '변경 내용 버리기'); }
function setBusy(value: boolean) {
  busy = value;
  for (const control of document.querySelectorAll<HTMLButtonElement>('.admin-view button')) control.disabled = value;
}
function postPath() { return selected?.path ?? `${category.value}/${slug.value}.md`; }
function updateAddress() {
  element('post-address').textContent = selected || slug.value ? `주소: ${new URL(sitePath(postPath().replace(/\.mdx?$/, '/')), window.location.origin).href}` : '글 주소에 짧은 영문 이름을 입력해 주세요.';
  element<HTMLButtonElement>('save-post').textContent = draft.checked ? '초안 저장' : selected ? '수정한 글 발행' : '글 발행';
}
function tab(preview: boolean) {
  element('body-label').hidden = preview;
  element('post-preview').hidden = !preview;
  element('show-writing').setAttribute('aria-pressed', String(!preview));
  element('show-preview').setAttribute('aria-pressed', String(preview));
  if (preview) element('post-preview').innerHTML = DOMPurify.sanitize(marked.parse(body.value, { async: false }));
}
async function openEditor(doc?: Doc) {
  if (busy || !(await mayDiscard())) return;
  selected = doc;
  const parsed = doc ? parse(doc.content) : { meta: {}, body: '' };
  metadata = parsed.meta;
  title.value = typeof metadata.title === 'string' ? metadata.title : '';
  description.value = typeof metadata.description === 'string' ? metadata.description : '';
  category.value = doc?.path.split('/')[0] ?? 'development';
  slug.value = doc?.path.split('/').slice(1).join('/').replace(/\.mdx?$/, '') ?? '';
  category.disabled = Boolean(doc);
  slug.disabled = Boolean(doc);
  date.value = koreaDate(metadata.publishedAt ?? new Date());
  date.max = koreaDate();
  tags.value = Array.isArray(metadata.tags) ? metadata.tags.join(', ') : '';
  draft.checked = doc ? metadata.draft === true : true;
  comments.checked = metadata.comments !== false;
  body.value = parsed.body;
  dirty = false;
  saveStatus.textContent = '';
  element('editor-heading').textContent = doc ? '글 수정' : '새 글 작성';
  element('delete-post').hidden = !doc;
  element('mdx-note').hidden = !doc?.path.endsWith('.mdx');
  form.hidden = false;
  updateAddress();
  tab(false);
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  title.focus({ preventScroll: true });
}
function serialized() {
  const meta: Record<string, unknown> = { ...metadata, title: title.value.trim(), description: description.value.trim() };
  meta.publishedAt = metadata.publishedAt && date.value === koreaDate(metadata.publishedAt)
    ? metadata.publishedAt : `${date.value}T09:00:00+09:00`;
  meta.tags = [...new Set(tags.value.split(',').map((tag) => tag.trim()).filter(Boolean))];
  meta.comments = comments.checked;
  const sidebar = metadata.sidebar && typeof metadata.sidebar === 'object' ? { ...metadata.sidebar as Record<string, unknown> } : {};
  if (draft.checked) { meta.draft = true; sidebar.hidden = true; }
  else { delete meta.draft; delete sidebar.hidden; }
  if (Object.keys(sidebar).length) meta.sidebar = sidebar; else delete meta.sidebar;
  if (selected) meta.updatedAt = new Date();
  return `---\n${dump(meta, { lineWidth: -1, noRefs: true, sortKeys: false })}---\n\n${body.value.trimEnd()}\n`;
}
async function getDoc(path: string) { return adminRequest<Doc>(`/post?path=${encodeURIComponent(path)}`); }
async function loadList() {
  const generation = ++loadingList;
  list.textContent = '글 목록을 불러오는 중입니다.';
  const result = await adminRequest<{ posts: { path: string; sha: string }[] }>('/posts');
  const docs: Doc[] = [];
  // Limit simultaneous requests so larger archives don't overwhelm the GitHub API.
  for (let i = 0; i < result.posts.length; i += 4) docs.push(...await Promise.all(result.posts.slice(i, i + 4).map((post) => getDoc(post.path))));
  if (generation !== loadingList) return;
  const entries = docs.map((doc) => ({ doc, parsed: parse(doc.content) })).sort((a, b) => {
    return new Date(String(b.parsed.meta.publishedAt ?? 0)).getTime() - new Date(String(a.parsed.meta.publishedAt ?? 0)).getTime();
  });
  list.replaceChildren();
  if (!entries.length) list.textContent = '아직 글이 없습니다. 첫 글을 작성해 보세요.';
  for (const { doc, parsed } of entries) {
    const row = document.createElement('article'); row.className = 'admin-post-row';
    const info = document.createElement('div');
    const heading = document.createElement('strong'); heading.textContent = String(parsed.meta.title || doc.path);
    const detail = document.createElement('small'); detail.textContent = `${parsed.meta.draft ? '초안' : '발행됨'} · ${doc.path}`;
    info.append(heading, detail);
    const actions = document.createElement('div'); actions.className = 'admin-post-actions';
    const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = '수정'; edit.addEventListener('click', async () => {
      try { await openEditor(doc); } catch (error) { status.textContent = message(error); }
    }); actions.append(edit);
    if (!parsed.meta.draft) {
      const view = document.createElement('a'); view.textContent = '글 보기'; view.href = sitePath(doc.path.replace(/\.mdx?$/, '/')); actions.append(view);
    }
    row.append(info, actions); list.append(row);
  }
}
form.addEventListener('input', () => { dirty = true; updateAddress(); });
form.addEventListener('change', () => { dirty = true; updateAddress(); });
element('show-writing').addEventListener('click', () => tab(false));
element('show-preview').addEventListener('click', () => tab(true));
element('new-post').addEventListener('click', () => { openEditor().catch((error) => { status.textContent = message(error); }); });
element('close-editor').addEventListener('click', async () => { if (await mayDiscard()) { dirty = false; form.hidden = true; } });
element('refresh-posts').addEventListener('click', () => { loadList().catch((error) => { status.textContent = message(error); }); });
element('admin-logout').addEventListener('click', async () => { if (await mayDiscard()) logout().catch((error) => { status.textContent = message(error); }); });
window.addEventListener('beforeunload', (event) => { if (dirty) { event.preventDefault(); } });
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !form.reportValidity()) return;
  if (!title.value.trim()) { saveStatus.textContent = '제목을 입력해 주세요.'; return; }
  const path = postPath();
  const content = serialized();
  setBusy(true); saveStatus.textContent = '저장하고 있습니다.';
  try {
    const result = await adminRequest<Saved>('/post', { method: 'PUT', body: JSON.stringify({ path, content, sha: selected?.sha }) });
    selected = { path, content, sha: result.sha! };
    metadata = parse(content).meta;
    dirty = false;
    category.disabled = slug.disabled = true;
    element('delete-post').hidden = false;
    element('editor-heading').textContent = '글 수정';
    saveStatus.textContent = draft.checked ? '초안을 저장했습니다.' : '저장했습니다. 배포가 끝나면 블로그에 반영됩니다.';
    if (result.commitUrl) {
      const link = document.createElement('a'); link.textContent = ' 저장 내역 보기'; link.href = result.commitUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; saveStatus.append(link);
    }
    await loadList();
  } catch (error) { saveStatus.textContent = message(error); }
  finally { setBusy(false); }
});
element('delete-post').addEventListener('click', async () => {
  if (!selected || busy || !(await confirmAction(`“${title.value}” 글을 삭제할까요? 블로그에서 내려가며 저장소의 변경 이력에는 남습니다.`, '글 삭제'))) return;
  setBusy(true); saveStatus.textContent = '삭제하고 있습니다.';
  try {
    await adminRequest('/post', { method: 'DELETE', body: JSON.stringify({ path: selected.path, sha: selected.sha }) });
    dirty = false; selected = undefined; form.hidden = true;
    status.textContent = '글을 삭제했습니다. 배포가 끝나면 블로그에서도 내려갑니다.';
    await loadList();
  } catch (error) { saveStatus.textContent = message(error); }
  finally { setBusy(false); }
});

async function start() {
  const returnTo = new URL(window.location.href);
  returnTo.searchParams.delete('error');
  element<HTMLAnchorElement>('admin-login-link').href = loginUrl(returnTo.href);
  const error = new URLSearchParams(window.location.search).get('error');
  try {
    const session = await getSession();
    if (!session.authenticated) {
      element('admin-login').hidden = false;
      status.textContent = error === 'owner' ? '작성자 계정만 글을 관리할 수 있습니다.' : error === 'permission' ? '블로그 저장소 편집 권한을 확인해 주세요.' : error ? '로그인을 완료하지 못했습니다. 다시 시도해 주세요.' : '';
      return;
    }
    element('admin-workspace').hidden = false;
    element('admin-account').textContent = `${session.login} · 작성자`;
    status.textContent = '';
    await loadList();
    const post = new URLSearchParams(window.location.search).get('post');
    if (post) {
      const listing = await adminRequest<{ posts: { path: string }[] }>('/posts');
      const match = listing.posts.find((entry) => entry.path.replace(/\.mdx?$/, '') === post);
      if (match) await openEditor(await getDoc(match.path));
    }
  } catch (error) {
    status.textContent = message(error);
    element('admin-login').hidden = false;
  }
}
start();
