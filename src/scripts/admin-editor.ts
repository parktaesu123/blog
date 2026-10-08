import { load, dump } from 'js-yaml';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { getSession, adminRequest, loginUrl, logout } from '../utils/admin';
import { sitePath } from '../utils/paths';

interface Doc { path: string; sha: string; content: string; }
interface ParsedDoc { meta: Record<string, unknown>; body: string; }
interface Saved { ok: boolean; sha?: string; commitUrl?: string; }
interface AttachedImage { file: File; name: string; path: string; preview: string; uploaded: boolean; }
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
const imageFiles = element<HTMLInputElement>('image-files');
const imageStatus = element<HTMLParagraphElement>('image-status');
const attachments = new Map<string, AttachedImage>();
const imageTypes: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
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
  for (const control of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select')) {
    control.disabled = value || (Boolean(selected) && (control === category || control === slug));
  }
}
function postPath() { return selected?.path ?? `${category.value}/${slug.value}.md`; }
function updateAddress() {
  element('post-address').textContent = selected || slug.value ? `주소: ${new URL(sitePath(postPath().replace(/\.mdx?$/, '/')), window.location.origin).href}` : '글 주소에 짧은 영문 이름을 입력해 주세요.';
  element<HTMLButtonElement>('save-post').textContent = draft.checked ? '초안 저장' : selected ? '수정한 글 발행' : '글 발행';
}
function tab(preview: boolean) {
  element('body-label').hidden = preview;
  element('writing-tools').hidden = preview;
  element('post-preview').hidden = !preview;
  element('show-writing').setAttribute('aria-pressed', String(!preview));
  element('show-preview').setAttribute('aria-pressed', String(preview));
  if (preview) {
    const target = element('post-preview');
    target.innerHTML = DOMPurify.sanitize(marked.parse(body.value, { async: false }));
    for (const image of target.querySelectorAll('img')) {
      const attachment = attachments.get(image.getAttribute('src') || '');
      if (attachment) image.src = attachment.preview;
    }
  }
}
function clearAttachments() {
  for (const image of attachments.values()) URL.revokeObjectURL(image.preview);
  attachments.clear(); imageFiles.value = ''; imageStatus.textContent = '';
  element('attached-images').replaceChildren(); element('attached-images').hidden = true;
}
function showAttachments() {
  const target = element('attached-images'); target.replaceChildren();
  for (const image of attachments.values()) {
    if (!body.value.includes(image.path)) continue;
    const figure = document.createElement('figure');
    const thumbnail = document.createElement('img'); thumbnail.src = image.preview; thumbnail.alt = image.file.name || '붙여넣은 이미지';
    const caption = document.createElement('figcaption'); caption.textContent = `${thumbnail.alt} · ${image.uploaded ? '저장됨' : '글 저장 시 함께 저장'}`;
    figure.append(thumbnail, caption); target.append(figure);
  }
  target.hidden = !target.childElementCount;
}
function insertMarkdown(text: string) {
  body.setRangeText(text, body.selectionStart, body.selectionEnd, 'end');
  dirty = true; body.dispatchEvent(new Event('input', { bubbles: true })); body.focus();
}
function attachImages(files: File[]) {
  if (busy) return;
  const errors: string[] = [];
  for (const file of files) {
    const extension = imageTypes[file.type];
    if (!extension) { errors.push('PNG·JPG·GIF·WebP 이미지를 첨부해 주세요.'); continue; }
    if (!file.size || file.size > 5 * 1024 * 1024) { errors.push('이미지는 5MB 이하로 첨부해 주세요.'); continue; }
    const name = `${crypto.randomUUID()}.${extension}`;
    const path = sitePath(`uploads/${name}`);
    attachments.set(path, { file, name, path, preview: URL.createObjectURL(file), uploaded: false });
    const alt = (file.name || '이미지').replace(/\.[^.]+$/, '').replace(/[\[\]\\\r\n]/g, ' ');
    insertMarkdown(`\n\n![${alt}](${path})\n\n`);
  }
  showAttachments();
  imageStatus.textContent = errors.length ? [...new Set(errors)].join(' ') : '이미지를 추가했습니다. 글을 저장하면 이미지도 함께 저장됩니다.';
}
function imageBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}
async function uploadImages(content: string) {
  const images = [...attachments.values()].filter((image) => content.includes(image.path) && !image.uploaded);
  for (const [index, image] of images.entries()) {
    saveStatus.textContent = `이미지를 저장하고 있습니다. (${index + 1}/${images.length})`;
    const result = await adminRequest<{ url: string }>('/image', { method: 'POST', body: JSON.stringify({ name: image.name, content: await imageBase64(image.file) }) });
    if (sitePath(result.url) !== image.path) throw new Error('이미지 저장 주소를 확인하지 못했습니다.');
    image.uploaded = true;
  }
  showAttachments();
}
async function openEditor(doc?: Doc) {
  if (busy || !(await mayDiscard())) return;
  clearAttachments();
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
body.addEventListener('input', showAttachments);
body.addEventListener('paste', (event) => {
  const files = Array.from(event.clipboardData?.items || []).filter((item) => item.kind === 'file').map((item) => item.getAsFile()).filter((file): file is File => Boolean(file));
  if (!files.length) return;
  event.preventDefault(); attachImages(files);
});
body.addEventListener('dragover', (event) => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); });
body.addEventListener('drop', (event) => {
  const files = Array.from(event.dataTransfer?.files || []);
  if (!files.length) return;
  event.preventDefault(); attachImages(files);
});
element('attach-image').addEventListener('click', () => imageFiles.click());
imageFiles.addEventListener('change', () => { attachImages(Array.from(imageFiles.files || [])); imageFiles.value = ''; });
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-markdown]')) button.addEventListener('click', () => {
  const selection = body.value.slice(body.selectionStart, body.selectionEnd);
  const snippets: Record<string, string> = { heading: `\n## ${selection || '제목'}\n`, bold: `**${selection || '굵은 글씨'}**`, link: `[${selection || '링크 제목'}](https://)`, code: `\n\n\`\`\`\n${selection || '코드를 입력하세요.'}\n\`\`\`\n\n` };
  insertMarkdown(snippets[button.dataset.markdown!]);
});
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
    await uploadImages(content);
    saveStatus.textContent = '글을 저장하고 있습니다.';
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
    clearAttachments();
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
