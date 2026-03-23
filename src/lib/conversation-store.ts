import { supabase } from "@/integrations/supabase/client";
import type { Msg } from "./rfa-stream";

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
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
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((m: any) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
    image_url: m.image_url ?? undefined,
    file_url: m.file_url ?? undefined,
    file_name: m.file_name ?? undefined,
  }));
}

export async function saveMessage(
  conversationId: string,
  msg: Msg
) {
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: msg.role,
    content: msg.content,
    image_url: msg.image_url ?? null,
    file_url: msg.file_url ?? null,
    file_name: msg.file_name ?? null,
  } as any);
  if (error) throw error;

  // Update conversation timestamp and auto-title from first user message
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}

export async function autoTitleConversation(conversationId: string, firstUserMsg: string) {
  const title = firstUserMsg.slice(0, 60) + (firstUserMsg.length > 60 ? "…" : "");
  await updateConversationTitle(conversationId, title);
}

export async function uploadImage(file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "png";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("chat-images").upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from("chat-images").getPublicUrl(path);
  return data.publicUrl;
}
