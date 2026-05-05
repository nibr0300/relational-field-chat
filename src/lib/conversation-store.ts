import { supabase } from "@/integrations/supabase/client";
import type { Msg, Attachment } from "./rfa-stream";

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

const MAX_LOADED_MESSAGES = 40;
const MAX_RENDERED_CONTENT_CHARS = 80_000;

function capStoredContent(content: string): string {
  if (content.length <= MAX_RENDERED_CONTENT_CHARS) return content;
  return `${content.slice(0, MAX_RENDERED_CONTENT_CHARS)}\n\n[... äldre meddelande trunkerat i vyn för stabilitet ...]`;
}

export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

export async function createConversation(title?: string): Promise<Conversation> {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ title: title || "Ny konversation" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteConversation(id: string) {
  const { error } = await supabase.from("conversations").delete().eq("id", id);
  if (error) throw error;
}

export async function updateConversationTitle(id: string, title: string) {
  const { error } = await supabase
    .from("conversations")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function loadMessages(conversationId: string): Promise<Msg[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(MAX_LOADED_MESSAGES);
  if (error) throw error;
  return [...(data ?? [])].reverse().map((m: any) => ({
    role: m.role as "user" | "assistant",
    content: capStoredContent(m.content ?? ""),
    image_url: m.image_url ?? undefined,
    file_url: m.file_url ?? undefined,
    file_name: m.file_name ?? undefined,
    attachments: (m.attachments as Attachment[] | null) ?? undefined,
  }));
}

export async function saveMessage(conversationId: string, msg: Msg) {
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: msg.role,
    content: msg.content,
    image_url: msg.image_url ?? null,
    file_url: msg.file_url ?? null,
    file_name: msg.file_name ?? null,
    attachments: msg.attachments ?? [],
  } as any);
  if (error) throw error;

  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}

export async function autoTitleConversation(conversationId: string, firstUserMsg: string) {
  const title = firstUserMsg.slice(0, 60) + (firstUserMsg.length > 60 ? "…" : "");
  await updateConversationTitle(conversationId, title);
}

export async function uploadToStorage(file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${crypto.randomUUID()}.${ext}`;
  const lower = file.name.toLowerCase();
  const isMd = lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".mdx");
  const contentType = file.type || (isMd ? "text/markdown" : "application/octet-stream");
  const { error } = await supabase.storage.from("chat-images").upload(path, file, {
    contentType,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("chat-images").getPublicUrl(path);
  return data.publicUrl;
}

// Keep legacy exports for backward compat
export const uploadImage = uploadToStorage;
export const uploadFile = uploadToStorage;
