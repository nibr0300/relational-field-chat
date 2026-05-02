import { useState, useRef, useEffect } from "react";
import { Send, Paperclip, X, FileText } from "lucide-react";

interface AttachedFile {
  file: File;
  type: "image" | "pdf" | "markdown";
  preview?: string; // data URL for images
}

interface ChatInputProps {
  onSend: (text: string, files: AttachedFile[], opts: { hat: boolean }) => void;
  disabled?: boolean;
}

export type { AttachedFile };

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [hat, setHat] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if ((!trimmed && files.length === 0) || disabled) return;
    onSend(trimmed, files, { hat });
    setInput("");
    setFiles([]);
    setHat(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;

    const newFiles: AttachedFile[] = [];
    for (const file of selected) {
      const lower = file.name.toLowerCase();
      const isMarkdown =
        file.type === "text/markdown" ||
        file.type === "text/x-markdown" ||
        lower.endsWith(".md") ||
        lower.endsWith(".markdown") ||
        lower.endsWith(".mdx");
      if (file.type === "application/pdf") {
        newFiles.push({ file, type: "pdf" });
      } else if (isMarkdown) {
        newFiles.push({ file, type: "markdown" });
      } else if (file.type.startsWith("image/")) {
        const preview = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        newFiles.push({ file, type: "image", preview });
      }
    }
    setFiles((prev) => [...prev, ...newFiles]);
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="border-t border-border bg-card/50 backdrop-blur-sm p-4">
      <div className="max-w-3xl mx-auto">
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {files.map((f, i) => (
              <div key={i} className="relative">
                {f.type === "image" && f.preview ? (
                  <img src={f.preview} alt="Preview" className="max-h-20 rounded-lg border border-border" />
                ) : (
                  <div className="flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="text-xs text-foreground truncate max-w-[140px]">{f.file.name}</span>
                  </div>
                )}
                <button
                  onClick={() => removeFile(i)}
                  className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-destructive text-destructive-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-3 items-end">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf,text/markdown,.md,.markdown,.mdx"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
            className="p-3 rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary/30 disabled:opacity-30 transition-all"
            title="Bifoga filer (bilder, PDF & Markdown)"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <button
            onClick={() => setHat((h) => !h)}
            disabled={disabled}
            className={`p-3 rounded-lg border transition-all ${
              hat
                ? "bg-primary/20 border-primary/50 text-primary glow-amber"
                : "border-border text-muted-foreground hover:text-primary hover:border-primary/30"
            } disabled:opacity-30`}
            title={hat ? "Tänkar-hatt PÅ — djup planering aktiv" : "Aktivera tänkar-hatt (RAAP)"}
            aria-pressed={hat}
          >
            <span className="text-base leading-none">🎩</span>
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Ställ en fråga till RFA..."
            disabled={disabled}
            rows={1}
            className="flex-1 bg-secondary border border-border rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
          />
          <button
            onClick={handleSubmit}
            disabled={disabled || (!input.trim() && files.length === 0)}
            className="p-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all glow-amber"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
