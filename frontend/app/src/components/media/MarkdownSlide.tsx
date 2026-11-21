import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import './markdown-slide.css'

/** Renders authored slide text without executing HTML or loading inline images. */
export function MarkdownSlide({ source, className }: { source: string; className?: string }) {
  return (
    <div className={`markdown-slide ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          img: () => null,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
