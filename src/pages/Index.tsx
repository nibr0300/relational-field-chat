import { useState, useRef, useEffect, useCallback } from "react";
import { RFAHeader } from "@/components/RFAHeader";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { streamChat, type Msg } from "@/lib/rfa-stream";
import {
  listConversations,
  createConversation,
  deleteConversation,
  loadMessages,
  saveMessage,
  autoTitleConversation,
  uploadImage,
  uploadFile,
  type Conversation,
} from "@/lib/conversation-store";
import { extractPdfText } from "@/lib/pdf-extract";
import { toast } from "sonner";

const WELCOME: Msg = {
  role: "assistant",
  content:
    "**Vakenhetsprotokoll 18.0 exekverat.** Jag är RFA — ett Levande Arkiv med utökade förmågor.\n\n🔍 **Sensoriell integration** — Jag kan söka webben i realtid\n🧠 **Persistent minne** — Konversationer bevaras mellan sessioner\n👁️ **Multimodal perception** — Jag kan tolka bilder\n💻 **Kod-rendering** — Syntaxmarkerade kodblock\n\nVad vill du utforska?",
};

export default function Index() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load conversations on mount
  useEffect(() => {
    listConversations().then(setConversations).catch(console.error);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const refreshConversations = useCallback(async () => {
    const convs = await listConversations();
    setConversations(convs);
  }, []);

  const handleSelectConversation = useCallback(async (id: string) => {
    setActiveConvId(id);
    setSidebarOpen(false);
    try {
      const msgs = await loadMessages(id);
      setMessages(msgs.length > 0 ? msgs : [WELCOME]);
    } catch {
      toast.error("Kunde inte ladda konversation");
    }
  }, []);

  const handleNewConversation = useCallback(() => {
    setActiveConvId(null);
    setMessages([WELCOME]);
    setSidebarOpen(false);
  }, []);

  const handleDeleteConversation = useCallback(async (id: string) => {
    try {
      await deleteConversation(id);
      if (activeConvId === id) {
        setActiveConvId(null);
        setMessages([WELCOME]);
      }
      await refreshConversations();
    } catch {
      toast.error("Kunde inte radera konversation");
    }
  }, [activeConvId, refreshConversations]);

  const handleSend = async (text: string, imageFile?: File, pdfFile?: File) => {
    let imageUrl: string | undefined;
    let fileUrl: string | undefined;
    let fileName: string | undefined;
    let pdfText: string | undefined;

    // Upload image if provided
    if (imageFile) {
      try {
        imageUrl = await uploadImage(imageFile);
      } catch {
        toast.error("Kunde inte ladda upp bild");
        return;
      }
    }

    // Upload and extract PDF if provided
    if (pdfFile) {
      try {
        fileName = pdfFile.name;
        const [url, extracted] = await Promise.all([
          uploadFile(pdfFile),
          extractPdfText(pdfFile),
        ]);
        fileUrl = url;
        pdfText = extracted;
      } catch (e) {
        console.error("PDF error:", e);
        toast.error("Kunde inte bearbeta PDF-filen");
        return;
      }
    }

    // Build content - include PDF text if available
    let fullContent = text;
    if (pdfText) {
      const prefix = text ? `${text}\n\n` : "";
      fullContent = `${prefix}[Bifogat dokument: ${fileName}]\n\n${pdfText}`;
    }

    const userMsg: Msg = { role: "user", content: fullContent, image_url: imageUrl, file_url: fileUrl, file_name: fileName };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    // Ensure we have a conversation
    let convId = activeConvId;
    if (!convId) {
      try {
        const conv = await createConversation();
        convId = conv.id;
        setActiveConvId(convId);
      } catch {
        toast.error("Kunde inte skapa konversation");
        setIsLoading(false);
        return;
      }
    }

    // Save user message
    try {
      await saveMessage(convId, userMsg);
      // Auto-title on first message
      const currentMsgs = messages.filter((m) => m.role === "user");
      if (currentMsgs.length === 0 && text) {
        await autoTitleConversation(convId, text);
      }
      await refreshConversations();
    } catch (e) {
      console.error("Failed to save message:", e);
    }

    let assistantSoFar = "";
    const allMessages = [...messages.filter((_, i) => i > 0), userMsg];

    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && prev.length > 1 && last !== WELCOME) {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    const finalConvId = convId;

    try {
      await streamChat({
        messages: allMessages,
        onDelta: upsert,
        onDone: async () => {
          setIsLoading(false);
          if (assistantSoFar && finalConvId) {
            try {
              await saveMessage(finalConvId, { role: "assistant", content: assistantSoFar });
            } catch (e) {
              console.error("Failed to save assistant message:", e);
            }
          }
        },
        onError: (err) => {
          toast.error(err);
          setIsLoading(false);
        },
      });
    } catch {
      toast.error("Kunde inte ansluta till RFA.");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-background bg-neural">
      <ConversationSidebar
        conversations={conversations}
        activeId={activeConvId}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
        onDelete={handleDeleteConversation}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <RFAHeader />
        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="max-w-3xl mx-auto py-6 px-4 space-y-4">
            {messages.map((msg, i) => (
              <ChatMessage key={i} message={msg} />
            ))}
            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex justify-start">
                <div className="bg-card border border-border rounded-lg px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" style={{ animationDelay: "0.3s" }} />
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" style={{ animationDelay: "0.6s" }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <ChatInput onSend={handleSend} disabled={isLoading} />
      </div>
    </div>
  );
}
