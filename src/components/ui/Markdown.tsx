import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { CSSProperties } from 'react'
import { cn } from '../../lib/utils'

interface MarkdownProps {
  content: string
  className?: string
}

export function Markdown({ content, className }: MarkdownProps) {
  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            const isInline = !match && !className

            if (isInline) {
              return (
                <code
                  className="rounded bg-secondary px-1.5 py-0.5 text-sm font-mono"
                  {...props}
                >
                  {children}
                </code>
              )
            }

            return (
              <div className="relative rounded-lg overflow-hidden my-2">
                {match && (
                  <div className="bg-secondary/80 px-3 py-1 text-xs text-muted-foreground border-b border-border">
                    {match[1]}
                  </div>
                )}
                <SyntaxHighlighter
                  style={oneDark as Record<string, CSSProperties>}
                  language={match ? match[1] : 'text'}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    borderRadius: match ? '0 0 0.5rem 0.5rem' : '0.5rem',
                    fontSize: '0.875rem',
                  }}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              </div>
            )
          },
          pre({ children }) {
            return <>{children}</>
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {children}
              </a>
            )
          },
          ul({ children }) {
            return <ul className="list-disc pl-4 my-2">{children}</ul>
          },
          ol({ children }) {
            return <ol className="list-decimal pl-4 my-2">{children}</ol>
          },
          li({ children }) {
            return <li className="my-1">{children}</li>
          },
          p({ children }) {
            return <p className="my-2 first:mt-0 last:mb-0">{children}</p>
          },
          h1({ children }) {
            return <h1 className="text-xl font-bold my-3">{children}</h1>
          },
          h2({ children }) {
            return <h2 className="text-lg font-bold my-2">{children}</h2>
          },
          h3({ children }) {
            return <h3 className="text-base font-bold my-2">{children}</h3>
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-4 border-primary/50 pl-4 my-2 italic text-muted-foreground">
                {children}
              </blockquote>
            )
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-2">
                <table className="min-w-full border-collapse border border-border">
                  {children}
                </table>
              </div>
            )
          },
          th({ children }) {
            return (
              <th className="border border-border bg-secondary px-3 py-2 text-left font-semibold">
                {children}
              </th>
            )
          },
          td({ children }) {
            return <td className="border border-border px-3 py-2">{children}</td>
          },
          hr() {
            return <hr className="my-4 border-border" />
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
