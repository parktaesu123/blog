import { adminRequest } from '../utils/admin';
import { categoryConfig, resolveCategory, type CategoryConfig } from '../utils/categories';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const panel = element('admin-categories');
const rows = element('category-rows');
const status = element('categories-status');
const selector = element<HTMLSelectElement>('post-category');
let current: CategoryConfig = structuredClone(categoryConfig);
let draft: CategoryConfig = structuredClone(current);
let sha = '';
let dirty = false;
let saving = false;
let confirmDiscard: (message: string, label: string) => Promise<boolean>;

export function selectedCategory(id: string) { return resolveCategory(id, current).id; }
function updateSelector() {
  const selected = selector.value;
  selector.replaceChildren(...current.categories.map((category) => new Option(category.label, category.id)));
  selector.value = selectedCategory(selected);
}
updateSelector();
function changed() { dirty = true; status.textContent = '저장하지 않은 변경사항이 있습니다.'; }
function button(label: string, action: () => void, accessibleLabel = label) {
  const node = document.createElement('button'); node.type = 'button'; node.textContent = label;
  node.setAttribute('aria-label', accessibleLabel); node.addEventListener('click', action); return node;
}
function render() {
  rows.replaceChildren();
  draft.categories.forEach((category, index) => {
    const row = document.createElement('div'); row.className = 'category-editor-row';
    const main = document.createElement('div'); main.className = 'category-editor-main';
    const label = document.createElement('label'); label.textContent = `카테고리 ${index + 1}`;
    const input = document.createElement('input'); input.value = category.label; input.maxLength = 40; input.required = true;
    input.addEventListener('input', () => { category.label = input.value; changed(); }); label.append(input);
    const actions = document.createElement('div'); actions.className = 'category-row-actions';
    const move = (offset: number) => {
      [draft.categories[index], draft.categories[index + offset]] = [draft.categories[index + offset], draft.categories[index]];
      changed(); render();
      rows.children[index + offset]?.querySelector('input')?.focus();
    };
    const up = button('위로', () => move(-1), `${category.label || '카테고리'} 위로 이동`); up.disabled = index === 0;
    const down = button('아래로', () => move(1), `${category.label || '카테고리'} 아래로 이동`); down.disabled = index === draft.categories.length - 1;
    const remove = button('삭제', () => {
      transfer.hidden = !transfer.hidden;
      if (!transfer.hidden) target.replaceChildren(...draft.categories.filter((item) => item.id !== category.id).map((item) => new Option(item.label || '이름 없는 카테고리', item.id)));
    }, `${category.label || '카테고리'} 삭제`); remove.disabled = draft.categories.length === 1;
    actions.append(up, down, remove); main.append(label, actions); row.append(main);
    const transfer = document.createElement('div'); transfer.className = 'category-transfer'; transfer.hidden = true;
    const targetLabel = document.createElement('label'); targetLabel.textContent = '글을 옮길 카테고리';
    const target = document.createElement('select');
    for (const other of draft.categories) if (other.id !== category.id) target.append(new Option(other.label || '이름 없는 카테고리', other.id));
    targetLabel.append(target); transfer.append(targetLabel, button('이 카테고리 삭제', () => {
      if (!target.value) return;
      for (const id of Object.keys(draft.redirects)) if (draft.redirects[id] === category.id) draft.redirects[id] = target.value;
      draft.redirects[category.id] = target.value;
      draft.categories.splice(index, 1); changed(); render();
    }), button('취소', () => { transfer.hidden = true; }));
    row.append(transfer); rows.append(row);
  });
}
export async function loadCategories() {
  const result = await adminRequest<{ config: CategoryConfig; sha: string }>('/categories');
  current = result.config; draft = structuredClone(current); sha = result.sha; dirty = false;
  updateSelector(); render(); status.textContent = '';
}
export function initCategories(confirm: typeof confirmDiscard) {
  confirmDiscard = confirm;
  element('open-categories').addEventListener('click', () => {
    panel.hidden = false; panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!sha) void loadCategories().catch((error) => { status.textContent = error.message; });
  });
  element('close-categories').addEventListener('click', () => { panel.hidden = true; });
  element('add-category').addEventListener('click', () => {
    if (saving) return;
    if (draft.categories.length >= 50) { status.textContent = '카테고리는 최대 50개까지 만들 수 있습니다.'; return; }
    draft.categories.push({ id: `category-${crypto.randomUUID()}`, label: '' }); changed(); render();
    rows.lastElementChild?.querySelector('input')?.focus();
  });
  element('reload-categories').addEventListener('click', async () => {
    if (saving || dirty && !(await confirmDiscard('카테고리의 저장하지 않은 변경사항을 버리고 다시 불러올까요?', '다시 불러오기'))) return;
    try { await loadCategories(); } catch (error) { status.textContent = error instanceof Error ? error.message : '불러오지 못했습니다.'; }
  });
  element('save-categories').addEventListener('click', async () => {
    if (saving || !sha) return;
    for (const input of rows.querySelectorAll('input')) {
      if (!input.value.trim()) { input.setCustomValidity('카테고리 이름을 입력해 주세요.'); input.reportValidity(); input.setCustomValidity(''); return; }
    }
    saving = true; status.textContent = '카테고리를 저장하고 있습니다.';
    for (const node of panel.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input, button, select')) node.disabled = true;
    try {
      const result = await adminRequest<{ config: CategoryConfig; sha: string }>('/categories', { method: 'PUT', body: JSON.stringify({ config: draft, sha }) });
      current = result.config; draft = structuredClone(current); sha = result.sha; dirty = false; updateSelector();
      status.textContent = '저장했습니다. 배포가 완료되면 왼쪽 메뉴에 반영됩니다.';
    } catch (error) { status.textContent = error instanceof Error ? error.message : '저장하지 못했습니다.'; }
    finally {
      saving = false;
      for (const node of panel.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input, button, select')) node.disabled = false;
      render();
    }
  });
  window.addEventListener('beforeunload', (event) => { if (dirty) event.preventDefault(); });
}
