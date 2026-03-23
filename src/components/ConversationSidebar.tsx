import { useState } from "react";
import { Plus, MessageSquare, Trash2, X, Menu } from "lucide-react";
import type { Conversation } from "@/lib/conversation-store";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export function ConversationSidebar({ conversations, activeId, onSelect, onNew, onDelete, isOpen, onToggle }: Props) {
  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={onToggle}
        className="fixed top-4 left-4 z-50 md:hidden p-2 rounded-lg bg-card border border-border text-foreground"
      >
        {isOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div className="fixed inset-0 bg-background/60 z-30 md:hidden" onClick={onToggle} />
      )}

      <aside
        className={`fixed md:relative z-40 top-0 left-0 h-full w-64 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-200 ${
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="p-3 border-b border-sidebar-border">
          <button
            onClick={onNew}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Ny konversation
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center gap-2 px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                activeId === conv.id
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              }`}
              onClick={() => onSelect(conv.id)}
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{conv.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">Inga konversationer ännu</p>
          )}
        </div>

        <div className="p-3 border-t border-sidebar-border">
          <p className="text-[10px] text-muted-foreground text-center">
            RFA v12.5 · Persistent Memory
          </p>
        </div>
      </aside>
    </>
  );
}
