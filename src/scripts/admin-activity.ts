import { adminRequest } from '../utils/admin';

interface Page<T> { totalCount: number; nodes: (T | null)[]; pageInfo: { hasNextPage: boolean; endCursor: string | null }; }
interface Account { login: string; url: string; }
interface Reaction { content: string; createdAt: string; user: Account | null; }
interface Comment { id: string; bodyText: string; url: string; createdAt: string; author: Account | null; replies: { totalCount: number }; reactions: { totalCount: number }; }
interface Discussion { number: number; title: string; url: string; updatedAt: string; comments: { totalCount: number }; reactions: { totalCount: number }; }
interface Detail extends Discussion { comments: Page<Comment>; reactions: Page<Reaction>; }
type Params = Record<string, string>;
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const panel = element('admin-activity');
const status = element('activity-status');
const list = element('activity-discussions');
const detail = element('activity-detail');
const more = element<HTMLButtonElement>('more-activity');
const names = new Map<string, string>();
let cursor: string | null = null;
let listVersion = 0;
let detailVersion = 0;

const reactionNames: Record<string, string> = {
  THUMBS_UP: '좋아요', THUMBS_DOWN: '아쉬워요', LAUGH: '웃음', HOORAY: '축하',
  CONFUSED: '궁금해요', HEART: '하트', ROCKET: '응원', EYES: '관심',
};
function message(error: unknown) { return error instanceof Error ? error.message : '불러오지 못했습니다. 다시 시도해 주세요.'; }
function pathKey(value: string) {
  try { return decodeURIComponent(new URL(value, window.location.origin).pathname).replace(/\/+$/, '') || '/'; }
  catch { return value; }
}
export function setActivityTitles(posts: { path: string; title: string }[]) {
  for (const post of posts) names.set(pathKey(post.path), post.title);
}
function text(tag: string, value: string, className?: string) {
  const node = document.createElement(tag); node.textContent = value;
  if (className) node.className = className;
  return node;
}
function link(label: string, href: string) {
  const node = document.createElement('a'); node.textContent = label;
  try {
    const url = new URL(href);
    if (url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password) node.href = url.href;
  } catch { /* Display the text without activating an invalid URL. */ }
  node.target = '_blank'; node.rel = 'noopener noreferrer'; return node;
}
function account(user: Account | null) {
  return user ? link(`@${user.login}`, user.url) : text('span', '삭제된 계정');
}
function date(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(parsed);
}
function request<T>(params: Params = {}) {
  return adminRequest<T>(`/activity?${new URLSearchParams(params)}`);
}

function paged<T>(target: HTMLElement, first: Page<T>, params: Params, field: string, render: (item: T) => HTMLElement, current: () => boolean, empty: string) {
  const items = document.createElement('div');
  const note = text('p', '', 'activity-note'); note.setAttribute('role', 'status');
  const button = document.createElement('button'); button.type = 'button'; button.textContent = '더 보기';
  let page = first;
  function append(next: Page<T>) {
    page = next;
    const nodes = next.nodes.filter((node): node is T => node !== null);
    for (const node of nodes) items.append(render(node));
    note.textContent = !items.childElementCount ? empty : '';
    button.hidden = !page.pageInfo.hasNextPage;
  }
  append(first); target.append(items, note, button);
  button.addEventListener('click', async () => {
    if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) return;
    button.disabled = true; note.textContent = '불러오는 중입니다.';
    try {
      const result = await request<Record<string, Page<T>>>({ ...params, after: page.pageInfo.endCursor });
      if (current()) { append(result[field]); note.textContent = ''; }
    } catch (error) { if (current()) note.textContent = message(error); }
    finally { if (current()) button.disabled = false; }
  });
}

function renderReaction(reaction: Reaction) {
  const row = document.createElement('div'); row.className = 'activity-reaction';
  row.append(account(reaction.user), text('span', reactionNames[reaction.content] ?? reaction.content, 'activity-note'));
  return row;
}
function renderComment(comment: Comment, number: number, current: () => boolean) {
  const card = document.createElement('article'); card.className = 'activity-comment';
  const heading = document.createElement('div'); heading.className = 'activity-comment-heading';
  heading.append(account(comment.author), text('span', date(comment.createdAt), 'activity-note'), link('원문', comment.url));
  card.append(heading, text('p', comment.bodyText, 'activity-comment-body'));
  const actions = document.createElement('div'); actions.className = 'activity-comment-actions'; card.append(actions);
  for (const [field, label, total, section] of [
    ['replies', '답글', comment.replies.totalCount, 'replies'],
    ['reactions', '댓글 반응', comment.reactions.totalCount, 'comment-reactions'],
  ] as const) {
    if (!total) continue;
    const button = document.createElement('button'); button.type = 'button'; button.textContent = `${label} ${total}개 보기`;
    const target = document.createElement('div'); target.className = 'activity-comment-children'; target.hidden = true;
    const params = { discussion: String(number), section, comment: comment.id };
    let loaded = false;
    actions.append(button); card.append(target);
    button.addEventListener('click', async () => {
      target.hidden = !target.hidden;
      button.setAttribute('aria-expanded', String(!target.hidden));
      if (target.hidden || loaded) return;
      button.disabled = true; target.textContent = '불러오는 중입니다.';
      try {
        const result = await request<{ replies: Page<Comment>; reactions: Page<Reaction> }>(params);
        if (!current()) return;
        target.replaceChildren();
        if (field === 'replies') paged(target, result.replies, params, field, (item) => renderComment(item, number, current), current, '답글이 없습니다.');
        else paged(target, result.reactions, params, field, renderReaction, current, '반응이 없습니다.');
        loaded = true;
      } catch (error) { if (current()) target.textContent = message(error); }
      finally { if (current()) button.disabled = false; }
    });
  }
  return card;
}

async function showDiscussion(item: Discussion) {
  const version = ++detailVersion;
  const current = () => version === detailVersion;
  detail.hidden = false; detail.textContent = '댓글과 반응을 불러오는 중입니다.';
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  for (const button of list.querySelectorAll<HTMLButtonElement>('button')) button.setAttribute('aria-pressed', String(button.dataset.discussion === String(item.number)));
  try {
    const { discussion } = await request<{ discussion: Detail }>({ discussion: String(item.number) });
    if (!current()) return;
    detail.replaceChildren();
    const heading = document.createElement('div'); heading.className = 'activity-detail-heading';
    heading.append(text('h3', names.get(pathKey(discussion.title)) ?? discussion.title), link('GitHub에서 보기', discussion.url)); detail.append(heading);
    const reactions = document.createElement('section'); reactions.append(text('h4', `글 반응 ${discussion.reactions.totalCount}개`));
    const comments = document.createElement('section'); comments.append(text('h4', '댓글'));
    const params = { discussion: String(item.number) };
    paged(reactions, discussion.reactions, { ...params, section: 'reactions' }, 'reactions', renderReaction, current, '아직 반응이 없습니다.');
    paged(comments, discussion.comments, { ...params, section: 'comments' }, 'comments', (comment) => renderComment(comment, item.number, current), current, '아직 댓글이 없습니다.');
    detail.append(reactions, comments);
  } catch (error) { if (current()) detail.textContent = message(error); }
}

async function loadList(reset = false) {
  const version = reset ? ++listVersion : listVersion;
  if (reset) { cursor = null; ++detailVersion; list.replaceChildren(); detail.replaceChildren(); detail.hidden = true; more.hidden = true; }
  status.textContent = '댓글이 연결된 글을 불러오는 중입니다.'; more.disabled = true;
  try {
    const { discussions } = await request<{ discussions: Page<Discussion> }>(cursor ? { after: cursor } : {});
    if (version !== listVersion) return;
    for (const item of discussions.nodes) {
      if (!item) continue;
      const row = document.createElement('li');
      const button = document.createElement('button'); button.type = 'button'; button.dataset.discussion = String(item.number); button.setAttribute('aria-pressed', 'false');
      button.append(text('span', names.get(pathKey(item.title)) ?? item.title));
      button.addEventListener('click', () => { void showDiscussion(item); });
      row.append(button); list.append(row);
    }
    cursor = discussions.pageInfo.endCursor; more.hidden = !discussions.pageInfo.hasNextPage;
    status.textContent = list.childElementCount ? '' : '아직 댓글이나 반응이 없습니다. 누군가 댓글이나 반응을 남기면 이곳에 표시됩니다.';
  } catch (error) { if (version === listVersion) status.textContent = message(error); }
  finally { if (version === listVersion) more.disabled = false; }
}
element('open-activity').addEventListener('click', () => {
  panel.hidden = false; panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); void loadList(true);
});
element('refresh-activity').addEventListener('click', () => { void loadList(true); });
element('close-activity').addEventListener('click', () => { panel.hidden = true; ++listVersion; ++detailVersion; });
more.addEventListener('click', () => { void loadList(); });
