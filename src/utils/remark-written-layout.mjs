// Apply the same source layout to editor previews and published Markdown.
export default function remarkWrittenLayout() {
  return (tree, file) => {
    const source = String(file).replace(/\r\n?/g, '\n');
    const lines = source.split('\n');
    const nbsp = (value) => value.replace(/\t/g, '    ').replace(/ /g, '\u00a0');
    const spaces = (value) => value.replace(/\t/g, '    ').replace(/ {2,}/g, (run) => ' ' + '\u00a0'.repeat(run.length - 1));

    // Markdown discards up to three leading spaces in ordinary paragraphs.
    // Restore those source indents without changing list or code syntax.
    for (const block of tree.children) {
      if (block.type !== 'paragraph' || !block.position) continue;
      const prefix = lines[block.position.start.line - 1].slice(0, block.position.start.column - 1);
      const restore = (node) => {
        if (node.type === 'text' && node.position && node.value.includes('\n')) {
          const first = node.position.start.line - 1;
          node.value = node.value.split('\n').map((line, index) => {
            if (!index) return line;
            const indent = lines[first + index]?.match(/^[ \t]*/)?.[0] ?? '';
            return nbsp(indent) + line;
          }).join('\n');
        }
        for (const child of node.children ?? []) restore(child);
      };
      restore(block);
      if (prefix && /^[ \t]+$/.test(prefix)) block.children.unshift({ type: 'text', value: nbsp(prefix) });
    }

    const inline = (node) => {
      if (!node.children || ['code', 'inlineCode', 'html'].includes(node.type)) return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== 'text') { inline(child); return [child]; }
        return child.value.split('\n').flatMap((line, index) => [
          ...(index ? [{ type: 'break' }] : []), { type: 'text', value: spaces(line) },
        ]);
      });
    };
    inline(tree);

    const gap = (count) => ({
      type: 'paragraph', children: [],
      data: { hName: 'div', hProperties: { className: ['written-gap'], ariaHidden: 'true', style: `height: ${count * 1.85}rem` } },
    });
    const result = [];
    let previous = 0;
    for (const block of tree.children) {
      if (block.position && !['definition', 'yaml', 'mdxjsEsm'].includes(block.type)) {
        const emptyLines = Math.max(0, block.position.start.line - previous - 1);
        if (emptyLines) result.push(gap(emptyLines));
        if (block.type !== 'code') {
          block.data ??= {};
          block.data.hProperties ??= {};
          const classes = block.data.hProperties.className ?? [];
          block.data.hProperties.className = [...(Array.isArray(classes) ? classes : [classes]), 'written-block'];
        }
        previous = block.position.end.line;
      }
      result.push(block);
    }
    const trailing = lines.length - previous - (source.endsWith('\n') ? 1 : 0);
    if (previous && trailing > 0) result.push(gap(trailing));
    tree.children = result;
  };
}
