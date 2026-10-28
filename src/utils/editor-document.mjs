// Keep the textarea body byte-for-byte; only the frontmatter separator is added.
export function withEditorBody(frontmatter, body) { return `---\n${frontmatter}---\n\n${body}`; }
export function splitEditorDocument(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new Error('글의 제목 정보를 읽지 못했습니다. 원본 파일을 확인해 주세요.');
  return { frontmatter: match[1], body: match[2].replace(/^\r?\n/, '') };
}
