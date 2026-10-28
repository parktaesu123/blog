import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import remarkWrittenLayout from './remark-written-layout.mjs';

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkWrittenLayout)
  .use(remarkRehype, { allowDangerousHtml: true }).use(rehypeStringify, { allowDangerousHtml: true });

export function renderPreview(source) { return String(processor.processSync(source)); }
