import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { renderPreview } from '../src/utils/render-preview.mjs';
import { splitEditorDocument, withEditorBody } from '../src/utils/editor-document.mjs';
import remarkWrittenLayout from '../src/utils/remark-written-layout.mjs';

const processor = await createMarkdownProcessor({ remarkPlugins: [remarkWrittenLayout], smartypants: false, syntaxHighlight: false });
async function both(source) {
  const preview = renderPreview(source);
  const published = (await processor.render(source)).code;
  const normalize = (html) => html.replace(/ id="[^"]*"/g, '').replace(/>\s+</g, '><');
  assert.equal(normalize(published), normalize(preview));
  return preview;
}
test('Multiline prose keeps each authored line and paragraph in preview and publication', async () => {
  const source = '### 제목\n부제\n\n첫 문장\n\n첫째 줄\n둘째 줄\n셋째 줄\n\n다음 문장\n그 다음 문장\n\n마지막 문장\n\n첫 생각\n다음 생각\n\n정리\n끝\n\n마지막 단락\n다음 글\n';
  const html = await both(source);
  assert.match(html, /첫째 줄<br>\n둘째 줄<br>\n셋째 줄/);
  assert.match(html, /첫 생각<br>\n다음 생각/);
  assert.equal((html.match(/class="written-gap"/g) || []).length, 7);
  assert.match(html, /<h3 class="written-block">제목<\/h3>\n<p class="written-block">부제/);
});
test('Ordinary paragraph indents, repeated spaces, extra empty lines and trailing blank lines survive', async () => {
  const html = await both('  앞  문장\n   뒤\t문장\n\n\n끝\n\n');
  assert.match(html, /\u00a0\u00a0앞 \u00a0문장<br>\n\u00a0\u00a0\u00a0뒤 \u00a0\u00a0\u00a0문장/);
  assert.match(html, /height: 3.7rem/);
  assert.match(html, /height: 1.85rem/);
});
test('Markdown headings, emphasis, links, lists, tables, images and code remain Markdown', async () => {
  const source = '# 제목\n\n**굵게**와 [링크](https://example.com)\n\n- 첫째\n  이어짐\n  - 하위\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n![사진](https://example.com/photo.png)\n\n```js\n  const a = 1;\n\n  console.log(a);\n```';
  const html = await both(source);
  for (const tag of ['<strong>', '<a href=', '<ul', '<table', '<img', '<pre']) assert.ok(html.includes(tag));
  assert.match(html, /첫째<br>\n이어짐/);
  assert.match(html, /  const a = 1;\n\n  console.log\(a\);/);
  assert.equal(html.includes('const a = 1;<br>'), false);
});
test('Hard breaks are not doubled and literal punctuation is not rewritten', async () => {
  const html = await both('첫 줄  \n둘째 줄\\\n셋째 줄\n\n"그대로" -- ...');
  assert.match(html, /첫 줄<br>\n둘째 줄<br>\n셋째 줄/);
  assert.match(html, /"그대로" -- \.\.\./);
});
test('Saving and reopening preserves the exact body, including leading and ending whitespace', () => {
  for (const body of ['', '\n\n  앞\n\n뒤  \n\n\n', '끝 공백   ', '\t줄\r\n\r\n']) {
    assert.equal(splitEditorDocument(withEditorBody('title: test\n', body)).body, body);
  }
});
