"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Bot, LoaderCircle, MessageCircle, Send, X } from "lucide-react";
import { getApiBaseUrl } from "../lib/api-base-url";

type ChatMessage = {
  role: "assistant" | "user";
  content: string;
};

const welcomeMessage =
  "Bonjour ! Je suis l’assistant SHADOMA Votes. Je peux vous aider à créer un événement, voter, comprendre un paiement ou utiliser la plateforme. Que souhaitez-vous savoir ?";

/**
 * Assistant IA de la plateforme. Les réponses sont générées par l’API backend
 * afin de ne jamais exposer la clé OpenAI dans le navigateur.
 */
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);

  const toggleChat = () => {
    setOpen((current) => {
      if (!current && messages.length === 0) {
        setMessages([{ role: "assistant", content: welcomeMessage }]);
      }
      return !current;
    });
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = message.trim();
    if (!content || isSending) return;

    setMessage("");
    setMessages((current) => [...current, { role: "user", content }]);
    setIsSending(true);

    try {
      const response = await fetch(`${getApiBaseUrl()}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content })
      });

      if (!response.ok) throw new Error("Chat indisponible");
      const data = (await response.json()) as { reply?: string };
      setMessages((current) => [
        ...current,
        { role: "assistant", content: data.reply ?? "Je n’ai pas pu répondre. Réessayez dans un instant." }
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: "L’assistant est momentanément indisponible. Réessayez dans quelques instants." }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="chat-widget fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6">
      {open && (
        <section className="mb-3 flex h-[min(70dvh,30rem)] w-[min(calc(100vw-2rem),22rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" aria-label="Assistant SHADOMA Votes">
          <header className="flex items-center justify-between bg-gradient-to-br from-brand-500 to-brand-700 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20"><Bot className="h-5 w-5" /></span>
              <div><p className="text-sm font-bold">Assistant SHADOMA</p><p className="text-xs text-white/75">En ligne pour vous aider</p></div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1.5 hover:bg-white/20" aria-label="Fermer l’assistant"><X className="h-4 w-4" /></button>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
            {messages.map((item, index) => (
              <div key={`${item.role}-${index}`} className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}>
                <p className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${item.role === "user" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted text-foreground"}`}>{item.content}</p>
              </div>
            ))}
            {isSending && <div className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />L’assistant réfléchit…</div>}
          </div>
          <form onSubmit={sendMessage} className="flex gap-2 border-t border-border p-3">
            <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Écrivez votre question…" aria-label="Question à l’assistant" disabled={isSending} className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-primary focus:ring-2" />
            <button type="submit" disabled={!message.trim() || isSending} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50" aria-label="Envoyer"><Send className="h-4 w-4" /></button>
          </form>
        </section>
      )}
      <button type="button" onClick={toggleChat} className="chat-widget-trigger group flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/25 transition-all duration-300 hover:scale-110 hover:shadow-brand-500/40 active:scale-95 sm:h-14 sm:w-14" aria-label={open ? "Fermer l’assistant" : "Ouvrir l’assistant IA"}>
        {open ? <X className="h-5 w-5 sm:h-6 sm:w-6" /> : <MessageCircle className="h-5 w-5 sm:h-6 sm:w-6" />}
      </button>
    </div>
  );
}

