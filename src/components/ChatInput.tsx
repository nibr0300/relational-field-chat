import { useState, useRef, useEffect } from "react";
import { Send, Paperclip, X, FileText, ImageIcon } from "lucide-react";

interface ChatInputProps {
  onSend: (text: string, imageFile?: File, pdfFile?: File) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
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
    if ((!trimmed && !imageFile && !pdfFile) || disabled) return;
    onSend(trimmed, imageFile ?? undefined, pdfFile ?? undefined);
    setInput("");
    setImagePreview(null);
    setImageFile(null);
    setPdfFile(null);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type === "application/pdf") {
      setPdfFile(file);
      setImageFile(null);
      setImagePreview(null);
    } else if (file.type.startsWith("image/")) {
      setImageFile(file);
      setPdfFile(null);
      const reader = new FileReader();
      reader.onload = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const removeAttachment = () => {
    setImagePreview(null);
    setImageFile(null);
    setPdfFile(null);
  };

  return (
    <div className="border-t border-border bg-card/50 backdrop-blur-sm p-4">
      <div className="max-w-3xl mx-auto">
        {(imagePreview || pdfFile) && (
          <div className="relative inline-block mb-2">
            {imagePreview ? (
              <img src={imagePreview} alt="Preview" className="max-h-24 rounded-lg border border-border" />
            ) : pdfFile ? (
              <div className="flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2">
                <FileText className="w-5 h-5 text-primary" />
                <span className="text-xs text-foreground truncate max-w-[200px]">{pdfFile.name}</span>
              </div>
            ) : null}
            <button
              onClick={removeAttachment}
              className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-destructive text-destructive-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        <div className="flex gap-3 items-end">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={handleFile}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
            className="p-3 rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary/30 disabled:opacity-30 transition-all"
            title="Ladda upp bild eller PDF"
          >
            <Paperclip className="w-4 h-4" />
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
            disabled={disabled || (!input.trim() && !imageFile && !pdfFile)}
            className="p-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all glow-amber"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
