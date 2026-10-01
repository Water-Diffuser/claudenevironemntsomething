// Renders Claude's markdown, with syntax-highlighted code blocks.
// Token colors come from CSS variables (see .hljs-* in styles/index.css).
import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
