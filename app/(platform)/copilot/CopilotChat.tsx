"use client";

// Client half of the AI Copilot page -- everything below the header on
// app/(platform)/copilot/page.tsx. Plain fetch() against
// /api/copilot/chat rather than a Server Action, since this is a chat
// loop (repeated round trips with growing history), not a one-shot
// form submission. History lives in React state only, per this app's
// "no browser storage in a page that isn't published via the Artifact
// tool" convention -- refreshing the page starts a fresh conversation.
import { useRef, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const SUGGESTIONS = [
  "What's our revenue this month?",
  "What's our margin by service category this month?",
  "How's the reactivation pipeline looking?",
  "Do we have any overdue invoices?",
  "Who's clocked in right now?",
];

export default function CopilotChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];

    setMessages(nextMessages);
    setInput("");
    setError(null);
    setIsSending(true);

    try {
      const response = await fetch("/api/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      const data = (await response.json()) as { reply?: string; error?: string };

      if (!response.ok || !data.reply) {
        setError(data.error || "Something went wrong answering that.");
        return;
      }

      setMessages([...nextMessages, { role: "assistant", content: data.reply }]);
    } catch {
      setError("Could not reach the Copilot. Check your connection and try again.");
    } finally {
      setIsSending(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    sendMessage(input);
  }

  return (
    <section className="mt-6 flex flex-col rounded-3xl bg-white p-5 shadow sm:p-8">
      {messages.length === 0 ? (
        <div>
          <p className="text-sm text-[#6b705c]">
            Ask about revenue, job costing margins, the reactivation
            pipeline, outstanding invoices, or who&apos;s working right
            now. Try one of these:
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => sendMessage(suggestion)}
                className="rounded-xl border border-[#d8d3c6] bg-white px-3.5 py-2 text-sm font-semibold text-[#174734] transition hover:border-[#d4af37]"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                message.role === "user"
                  ? "self-end bg-[#174734] text-white"
                  : "self-start bg-[#f7f6f1] text-[#174734]"
              }`}
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          ))}
          {isSending && (
            <div className="self-start rounded-2xl bg-[#f7f6f1] px-4 py-3 text-sm text-[#6b705c]">
              Thinking…
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}

      <form onSubmit={handleSubmit} className="mt-5 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask a question about the business…"
          disabled={isSending}
          className="min-w-0 flex-1 rounded-xl border border-[#d9d4c6] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          className="rounded-xl bg-[#174734] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#226246] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Ask
        </button>
      </form>
    </section>
  );
}
