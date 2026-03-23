import ReactMarkdown from "react-markdown";
import type { Msg } from "@/lib/rfa-stream";

interface ChatMessageProps {
  message: Msg;
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
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none text-foreground [&_p]:text-foreground [&_li]:text-foreground [&_strong]:text-primary [&_h1]:text-primary [&_h2]:text-primary [&_h3]:text-primary/80 [&_code]:text-primary/80 [&_code]:bg-secondary [&_a]:text-primary">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
