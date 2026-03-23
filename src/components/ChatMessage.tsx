import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check, FileText, ExternalLink } from "lucide-react";
import { useState } from "react";
import type { Msg } from "@/lib/rfa-stream";

interface ChatMessageProps {
  message: Msg;
}

function CodeBlock({ language, children }: { language: string; children: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-border">
      <div className="flex items-center justify-between px-3 py-1.5 bg-secondary/80 text-[10px] text-muted-foreground">
        <span>{language || "code"}</span>
        <button onClick={copy} className="flex items-center gap-1 hover:text-primary transition-colors">
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? "Kopierat" : "Kopiera"}
        </button>
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language || "text"}
        customStyle={{ margin: 0, borderRadius: 0, fontSize: "12px", background: "hsl(220 18% 10%)" }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`animate-fade-in-up flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] md:max-w-[75%] px-4 py-3 rounded-lg ${
          isUser
            ? "bg-primary/15 border border-primary/20 text-foreground"
            : "bg-card border border-border text-foreground"
        }`}
      >
        {message.image_url && (
          <img
            src={message.image_url}
            alt="Uploaded"
            className="max-w-full max-h-64 rounded-md mb-2 border border-border"
          />
        )}
        {message.file_url && (
          <a
            href={message.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-secondary/80 border border-border rounded-lg px-3 py-2 mb-2 hover:border-primary/30 transition-colors w-fit"
          >
            <FileText className="w-5 h-5 text-primary" />
            <span className="text-xs text-foreground truncate max-w-[200px]">{message.file_name || "Dokument"}</span>
            <ExternalLink className="w-3 h-3 text-muted-foreground" />
          </a>
        )}
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none text-foreground [&_p]:text-foreground [&_li]:text-foreground [&_strong]:text-primary [&_h1]:text-primary [&_h2]:text-primary [&_h3]:text-primary/80 [&_a]:text-primary">
            <ReactMarkdown
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const codeStr = String(children).replace(/\n$/, "");
                  if (match || codeStr.includes("\n")) {
                    return <CodeBlock language={match?.[1] || ""}>{codeStr}</CodeBlock>;
                  }
                  return (
                    <code className="text-primary/80 bg-secondary px-1.5 py-0.5 rounded text-xs" {...props}>
                      {children}
                    </code>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
