import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface SafeMarkdownProps {
  children: string;
}

/**
 * 所有模型输出与本地历史的 Markdown 统一走此组件。
 * 不添加 rehypeRaw，因此输入中的 HTML 会按普通文本处理，而不会成为可执行 DOM。
 */
export function SafeMarkdown({ children }: SafeMarkdownProps) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>;
}
