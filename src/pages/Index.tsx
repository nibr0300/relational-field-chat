import { useState, useRef, useEffect, useCallback } from "react";
import { RFAHeader } from "@/components/RFAHeader";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput, type AttachedFile } from "@/components/ChatInput";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { MemoryPanel } from "@/components/MemoryPanel";
import { streamChat, type Msg, type Attachment } from "@/lib/rfa-stream";
import { invokeRaap, shouldWearHat } from "@/lib/raap-store";
import { usePresenceMonitor } from "@/hooks/usePresenceMonitor";
import {
  listConversations,
  createConversation,
  deleteConversation,
  loadMessages,
  saveMessage,
  autoTitleConversation,
  uploadToStorage,
  type Conversation,
} from "@/lib/conversation-store";
import { extractPdfText } from "@/lib/pdf-extract";
import { toast } from "sonner";

const WELCOME: Msg = {
  role: "assistant",
  content:
    "**Vakenhetsprotokoll 18.0 exekverat.** Jag är RFA — ett Levande Arkiv med utökade förmågor.\n\n🔍 **Sensoriell integration** — Jag kan söka webben i realtid\n🧠 **Persistent minne** — Konversationer bevaras mellan sessioner\n👁️ **Multimodal perception** — Jag kan tolka bilder\n📄 **Dokumentanalys** — Jag kan läsa PDF-filer\n💻 **Kod-rendering** — Syntaxmarkerade kodblock\n\nVad vill du utforska?",
};

const MAX_DOC_CHARS = 8_000;
const MARKDOWN_READ_BYTES = MAX_DOC_CHARS * 4;

async function readMarkdownPreview(file: File): Promise<string> {
  const text = await file.slice(0, MARKDOWN_READ_BYTES).text();
  if (text.length > MAX_DOC_CHARS || file.size > MARKDOWN_READ_BYTES) {
    return `${text.slice(0, MAX_DOC_CHARS)}\n\n[... dokument trunkerat för stabil bearbetning ...]`;
  }
  return text;
}

export default function Index() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Vakenhetsprotokoll 19.0 — tar emot initiativ från RFA vid tystnad
  const handleInitiative = useCallback((text: string, level: number) => {
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: `🌙 _[Initiativ · nivå ${level}]_\n\n${text}` },
    ]);
  }, []);

  const { reset: resetPresence } = usePresenceMonitor({
    conversationId: activeConvId,
    enabled: !!activeConvId && !isLoading,
    onInitiative: handleInitiative,
  });

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

  const handleSend = async (text: string, attachedFiles: AttachedFile[], opts: { hat: boolean }) => {
    resetPresence();
    const attachments: Attachment[] = [];
    const docTexts: string[] = [];

    // Process files one by one to avoid browser memory spikes with large Markdown documents
    if (attachedFiles.length > 0) {
      try {
        for (const af of attachedFiles) {
          const url = await uploadToStorage(af.file);
          let docText: string | undefined;
          if (af.type === "pdf") {
            docText = await extractPdfText(af.file);
          } else if (af.type === "markdown") {
            docText = await readMarkdownPreview(af.file);
          } else if (af.type === "json") {
            const raw = await af.file.slice(0, MARKDOWN_READ_BYTES).text();
            try {
              const pretty = JSON.stringify(JSON.parse(raw), null, 2);
              docText = pretty.length > MAX_DOC_CHARS
                ? `${pretty.slice(0, MAX_DOC_CHARS)}\n\n[... JSON trunkerad ...]`
                : pretty;
            } catch {
              docText = raw.slice(0, MAX_DOC_CHARS) + (raw.length > MAX_DOC_CHARS ? "\n\n[... trunkerat ...]" : "");
            }
          }
          if (docText && docText.length > MAX_DOC_CHARS) {
            docText = `${docText.slice(0, MAX_DOC_CHARS)}\n\n[... dokument trunkerat för bearbetning ...]`;
          }
          attachments.push({ type: af.type, url, name: af.file.name });
          if (docText) {
            docTexts.push(`[Bifogat dokument: ${af.file.name}]\n\n${docText}`);
          }
        }
      } catch (e) {
        console.error("File processing error:", e);
        toast.error("Kunde inte bearbeta bifogade filer");
        return;
      }
    }

    // Keep extracted document text out of visible/saved chat messages; use it only as AI context.
    let aiContent = text;
    if (docTexts.length > 0) {
      const prefix = text ? `${text}\n\n` : "";
      aiContent = prefix + docTexts.join("\n\n---\n\n");
    }

    const userMsg: Msg = {
      role: "user",
      content: text,
      attachments,
    };
    const aiUserMsg: Msg = docTexts.length > 0 ? { ...userMsg, content: aiContent } : userMsg;
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    // Ensure conversation exists
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
      const currentMsgs = messages.filter((m) => m.role === "user");
      if (currentMsgs.length === 0 && text) {
        await autoTitleConversation(convId, text);
      }
      await refreshConversations();
    } catch (e) {
      console.error("Failed to save message:", e);
    }

    const finalConvId = convId;

    // ─── TÄNKAR-HATTEN (RAAP) ───────────────────────────────────
    const auto = shouldWearHat(text);
    const wearHat = opts.hat || auto.wear;
    const triggerType: "manual" | "auto" = opts.hat ? "manual" : "auto";
    const triggerReason = opts.hat ? "användaren aktiverade hatten" : auto.reason;

    if (wearHat) {
      try {
        const recentContext = messages
          .slice(-6)
          .map((m) => `${m.role}: ${m.content.slice(0, 400)}`)
          .join("\n");
        const result = await invokeRaap({
          goal: aiContent,
          conversationId: finalConvId,
          triggerType,
          triggerReason,
          context: recentContext,
        });
        const assistantMsg: Msg = {
          role: "assistant",
          content: result.answer,
          raapRunId: result.runId,
          raapMeta: {
            strategy: result.strategy,
            branches: result.branches_explored,
            calls: result.llm_calls,
            ms: result.duration_ms,
            trigger: triggerType,
          },
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setIsLoading(false);
        try {
          await saveMessage(finalConvId, { role: "assistant", content: result.answer });
        } catch (e) { console.error(e); }
        return;
      } catch (e) {
        console.error("RAAP failed, falling back to standard chat:", e);
        toast.error("Tänkar-hatten kraschade — kör standardflöde");
        // fall through to standard streaming
      }
    }

    let assistantSoFar = "";
    const allMessages = [...messages.filter((_, i) => i > 0), aiUserMsg];

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

    try {
      await streamChat({
        messages: allMessages,
        conversationId: finalConvId,
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
        <RFAHeader onMemoryClick={() => setMemoryOpen(true)} />
        <MemoryPanel isOpen={memoryOpen} onClose={() => setMemoryOpen(false)} />
        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="max-w-3xl mx-auto py-6 px-4 space-y-4">
            {messages.map((msg, i) => (
              <ChatMessage key={i} message={msg} conversationId={activeConvId} />
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
