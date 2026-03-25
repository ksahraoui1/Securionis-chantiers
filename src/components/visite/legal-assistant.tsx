"use client";

import { useState, useRef, useEffect } from "react";
import { stripMarkdown } from "@/lib/utils/constants";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface LegalAssistantProps {
  context: {
    intitule: string;
    critere?: string | null;
    baseLegale?: string | null;
    objet?: string | null;
  };
  onInsertRemarque?: (text: string) => void;
}

const QUICK_QUESTIONS = [
  "Quelle est la réglementation applicable ?",
  "Quels sont les critères d'acceptation ?",
  "Comment formuler la NC dans le rapport ?",
  "Quels délais de correction recommander ?",
];

export function LegalAssistant({ context, onInsertRemarque }: LegalAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  async function sendMessage(question: string) {
    if (!question.trim() || loading) return;

    const userMsg: Message = { role: "user", content: question.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/assistant/legal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          context: {
            intitule: context.intitule,
            critere: context.critere ?? undefined,
            baseLegale: context.baseLegale ?? undefined,
            objet: context.objet ?? undefined,
          },
          history: messages,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Erreur");
      }

      setMessages([...newMessages, { role: "assistant", content: stripMarkdown(data.answer) }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div>
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 min-h-touch bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors"
      >
        <span className="material-symbols-outlined text-lg">gavel</span>
        Assistant juridique
        {messages.length > 0 && (
          <span className="bg-indigo-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {messages.filter((m) => m.role === "assistant").length}
          </span>
        )}
        <span className="material-symbols-outlined text-sm ml-auto">
          {isOpen ? "expand_less" : "expand_more"}
        </span>
      </button>

      {isOpen && (
        <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/30 overflow-hidden">
          {/* Messages */}
          <div
            ref={scrollRef}
            className="max-h-80 overflow-y-auto p-4 space-y-3"
          >
            {messages.length === 0 && !loading && (
              <div className="text-center py-4 space-y-3">
                <div className="flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
                    <span className="material-symbols-outlined text-indigo-600 text-2xl">gavel</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    Assistant juridique
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Posez une question sur la réglementation applicable à ce point de contrôle.
                  </p>
                </div>

                {/* Quick questions */}
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {QUICK_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => sendMessage(q)}
                      className="text-xs px-3 py-1.5 rounded-full bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white rounded-br-md"
                      : "bg-white border border-gray-200 text-gray-900 rounded-bl-md"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="space-y-2">
                      <AssistantMessage content={msg.content} />
                      {onInsertRemarque && (
                        <button
                          type="button"
                          onClick={() => onInsertRemarque(msg.content)}
                          className="flex items-center gap-1 text-[10px] font-medium text-indigo-600 hover:text-indigo-800 mt-2"
                        >
                          <span className="material-symbols-outlined text-sm">content_paste</span>
                          Copier dans la remarque
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 text-sm text-gray-500">
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
                    Recherche en cours...
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
                <span className="material-symbols-outlined text-lg mt-0.5">error</span>
                {error}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-indigo-200 bg-white p-3 flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Posez votre question juridique..."
              rows={1}
              className="flex-1 px-3 py-2 rounded-lg bg-gray-50 text-sm outline-none min-h-[44px] max-h-24 resize-none overflow-hidden"
              onInput={(e) => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = "auto";
                t.style.height = Math.min(t.scrollHeight, 96) + "px";
              }}
            />
            <button
              type="button"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            >
              <span className="material-symbols-outlined">send</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AssistantMessage({ content }: { content: string }) {
  return (
    <div className="whitespace-pre-wrap leading-relaxed">
      {content}
    </div>
  );
}
