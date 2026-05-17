import { useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import {
  getMessages,
  getThread,
  getThreads,
  markThreadRead,
  sendDemoVendorReply,
  sendUserMessage,
  subscribeChats,
  type ChatCard,
  type ChatMessage,
  type ChatThread,
} from "@/lib/chatStore";

function useChatThreads(): ChatThread[] {
  const [threads, setThreads] = useState<ChatThread[]>(() => getThreads());
  useEffect(() => subscribeChats(() => setThreads(getThreads())), []);
  return threads;
}

/**
 * Module-level set of user-message ids we've already scheduled a canned vendor
 * reply for. Lives outside the component so leaving and re-entering the thread
 * doesn't cause a second reply for the same message — the previous in-component
 * ref reset on every mount, which let duplicates slip through.
 */
const scheduledReplyIds = new Set<string>();

function useChatMessages(threadId: string): ChatMessage[] {
  const [msgs, setMsgs] = useState<ChatMessage[]>(() => getMessages(threadId));
  useEffect(
    () => subscribeChats(() => setMsgs(getMessages(threadId))),
    [threadId],
  );
  return msgs;
}

/**
 * Format a timestamp the way Apple Messages does — relative for today,
 * weekday for this week, date otherwise. Demo-grade: minutes are good enough.
 */
function formatRelativeTs(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  const diffDays = Math.floor((now.getTime() - ts) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function VendorAvatar({ logoUrl, name, size = 44 }: { logoUrl?: string; name: string; size?: number }) {
  return (
    <div
      className="rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, background: "rgba(255,255,255,0.92)" }}
    >
      {logoUrl ? (
        <img src={logoUrl} alt="" className="object-contain" style={{ width: size * 0.62, height: size * 0.62 }} />
      ) : (
        <span className="text-[#00062B] font-bold" style={{ fontSize: size * 0.36 }}>
          {name.charAt(0)}
        </span>
      )}
    </div>
  );
}

/**
 * /chat — list of conversations (Messages-style).
 */
export function Chat() {
  const threads = useChatThreads();
  const [, navigate] = useLocation();

  return (
    <main className="relative min-h-screen w-full max-w-[390px] mx-auto pb-[110px]">
      <header className="relative z-10 flex items-end px-5 pt-14 pb-3">
        <h1 className="text-white text-[34px] font-bold leading-none tracking-tight" data-testid="text-page-title">Chat</h1>
      </header>

      {threads.length === 0 ? (
        <div className="px-8 py-16 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: "rgba(49,158,216,0.16)" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#319ED8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h2 className="text-white text-[17px] font-semibold mb-1">No messages yet</h2>
          <p className="text-white/55 text-[13px] leading-relaxed max-w-[280px]">
            Open any instrument's <span className="text-white/80">Where to buy</span> list and tap the chat bubble next to a vendor to start a conversation.
          </p>
        </div>
      ) : (
        <ul className="pt-1" data-testid="list-chat-threads">
          {threads.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => navigate(`/chat/${encodeURIComponent(t.id)}`)}
                className="w-full flex items-center gap-3 px-5 py-3 active:bg-white/5 text-left"
                data-testid={`row-chat-thread-${t.id}`}
              >
                <VendorAvatar logoUrl={t.vendorLogoUrl} name={t.vendorName} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <p className="text-white text-[15px] font-semibold truncate flex-1">{t.vendorName}</p>
                    <span className="text-white/40 text-[11px] flex-shrink-0">{formatRelativeTs(t.updatedAt)}</span>
                  </div>
                  <p className="text-white/55 text-[13px] truncate">{t.lastPreview || "—"}</p>
                </div>
                {t.unread > 0 && (
                  <span
                    className="ml-1 min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                    style={{ background: "#319ED8" }}
                    aria-label={`${t.unread} unread`}
                  >
                    {t.unread}
                  </span>
                )}
              </button>
              <div className="h-px bg-white/8 ml-[76px]" />
            </li>
          ))}
        </ul>
      )}

      <p className="px-8 pt-6 pb-2 text-white/30 text-[10px] text-center leading-relaxed">
        Demo preview. Real product will route messages to verified vendor accounts with anti-spam and notifications.
      </p>

      <MiniPlayer />
      <BottomNav />
    </main>
  );
}

/* -------------------- Thread view -------------------- */

function InstrumentCard({ card, onOpen }: { card: ChatCard; onOpen: (url: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(card.url)}
      className="w-full text-left rounded-2xl overflow-hidden border border-white/10 active:opacity-90"
      style={{ background: "rgba(255,255,255,0.04)" }}
      data-testid={`card-instrument-${card.instrumentId}`}
    >
      {card.instrumentPhotoUrl && (
        <div className="w-full" style={{ aspectRatio: "16 / 9", background: "linear-gradient(135deg, #1a1f4a 0%, #2a1156 100%)" }}>
          <img src={card.instrumentPhotoUrl} alt={card.instrumentName} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="px-3.5 py-3">
        <div className="flex items-center gap-2 mb-1">
          {card.vendorLogoUrl && (
            <div className="w-4 h-4 rounded-sm overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.92)" }}>
              <img src={card.vendorLogoUrl} alt="" className="w-3 h-3 object-contain" />
            </div>
          )}
          <p className="text-white/55 text-[11px] uppercase tracking-wider truncate">
            {card.vendorDomain ?? card.vendorName}
          </p>
        </div>
        {card.instrumentCategory && (
          <p className="text-[#319ED8] text-[10px] font-semibold uppercase tracking-wider">{card.instrumentCategory}</p>
        )}
        <p className="text-white text-[14px] font-semibold leading-tight">{card.instrumentName}</p>
        <p className="text-white/45 text-[12px] mt-1.5">Tap to open in browser ›</p>
      </div>
    </button>
  );
}

function MessageBubble({ msg, onOpenLink }: { msg: ChatMessage; onOpenLink: (url: string) => void }) {
  if (msg.card) {
    return (
      <div className={`flex ${msg.fromMe ? "justify-end" : "justify-start"} px-4`}>
        <div className="max-w-[78%]">
          <InstrumentCard card={msg.card} onOpen={onOpenLink} />
        </div>
      </div>
    );
  }
  return (
    <div className={`flex ${msg.fromMe ? "justify-end" : "justify-start"} px-4`}>
      <div
        className={`max-w-[78%] px-3.5 py-2 rounded-2xl text-[15px] leading-snug ${
          msg.fromMe ? "text-white" : "text-white"
        }`}
        style={{
          background: msg.fromMe ? "#319ED8" : "rgba(255,255,255,0.10)",
          borderBottomRightRadius: msg.fromMe ? "6px" : undefined,
          borderBottomLeftRadius: msg.fromMe ? undefined : "6px",
        }}
        data-testid={`bubble-${msg.id}`}
      >
        {msg.text}
      </div>
    </div>
  );
}

/**
 * /chat/:id — single thread view, Apple Messages-style.
 */
export function ChatThreadPage() {
  const [, params] = useRoute<{ id: string }>("/chat/:id");
  const [, navigate] = useLocation();
  const threadId = params?.id ? decodeURIComponent(params.id) : "";
  const thread = threadId ? getThread(threadId) : undefined;
  const messages = useChatMessages(threadId);
  const [draft, setDraft] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Keep view scrolled to the latest message.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Mark thread as read on open AND whenever a new vendor message lands while
  // the user is actively viewing this thread (otherwise the demo reply
  // increments unread and the badge stays stuck until next visit).
  useEffect(() => {
    if (!threadId) return;
    markThreadRead(threadId);
  }, [threadId, messages.length]);

  // Demo: schedule a canned vendor reply 1.5s after the last user text. Uses a
  // module-level guard set keyed by message id so remounting the thread can't
  // queue a duplicate reply for the same user message. The timer is NOT
  // cleared on every messages change (which previously canceled in-flight
  // replies when the user typed quickly) — it self-checks on fire.
  useEffect(() => {
    if (!thread) return;
    const last = messages[messages.length - 1];
    if (!last || !last.fromMe || !last.text) return;
    if (scheduledReplyIds.has(last.id)) return;
    scheduledReplyIds.add(last.id);
    const lastInstrument = [...messages].reverse().find((m) => m.card)?.card;
    const reply = lastInstrument
      ? `Thanks for reaching out about the ${lastInstrument.instrumentName}! A specialist from ${thread.vendorName} will follow up shortly with availability and pricing.`
      : `Thanks for the message! Someone from ${thread.vendorName} will get back to you shortly.`;
    window.setTimeout(() => sendDemoVendorReply(threadId, reply), 1500);
  }, [messages, thread, threadId]);

  if (!thread) {
    return (
      <main className="relative min-h-screen w-full max-w-[390px] mx-auto flex flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 px-3 py-3" style={{ background: "rgba(0,6,43,0.92)", backdropFilter: "blur(24px) saturate(180%)" }}>
          <button
            type="button"
            onClick={() => navigate("/chat")}
            aria-label="Back"
            className="w-9 h-9 rounded-full flex items-center justify-center text-white active:opacity-70"
            style={{ background: "rgba(255,255,255,0.10)" }}
            data-testid="button-chat-back"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <h1 className="text-white text-[17px] font-semibold">Conversation</h1>
        </header>
        <div className="flex-1 flex items-center justify-center px-8 text-center">
          <p className="text-white/55 text-[14px]">This conversation isn't available.</p>
        </div>
      </main>
    );
  }

  // Allowlist scheme to avoid `javascript:` / `data:` payloads if a card URL
  // ever comes from an untrusted source (today they're hand-curated, but the
  // store accepts arbitrary strings).
  const openLink = (url: string) => {
    try {
      const u = new URL(url);
      if (u.protocol !== "https:" && u.protocol !== "http:") return;
      window.open(u.toString(), "_blank", "noopener,noreferrer");
    } catch {
      /* ignore invalid URL */
    }
  };

  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;
    sendUserMessage(threadId, text);
    setDraft("");
  };

  return (
    <main className="relative h-screen w-full max-w-[390px] mx-auto flex flex-col">
      {/* Header — back + vendor avatar + name + domain */}
      <header
        className="flex-shrink-0 flex items-center gap-3 px-3 py-2.5 border-b border-white/8"
        style={{ background: "rgba(0,6,43,0.92)", backdropFilter: "blur(24px) saturate(180%)" }}
      >
        <button
          type="button"
          onClick={() => navigate("/chat")}
          aria-label="Back"
          className="w-9 h-9 rounded-full flex items-center justify-center text-white active:opacity-70 flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.10)" }}
          data-testid="button-chat-back"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <VendorAvatar logoUrl={thread.vendorLogoUrl} name={thread.vendorName} size={36} />
        <div className="flex-1 min-w-0">
          <p className="text-white text-[15px] font-semibold truncate leading-tight">{thread.vendorName}</p>
          {thread.vendorDomain && (
            <p className="text-white/50 text-[11px] truncate leading-tight">{thread.vendorDomain}</p>
          )}
        </div>
      </header>

      {/* Message stream */}
      <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto py-3" data-testid="list-chat-messages">
        <div className="flex flex-col gap-2">
          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} onOpenLink={openLink} />
          ))}
          {messages.length === 0 && (
            <p className="text-center text-white/40 text-[13px] py-6">Say hi to {thread.vendorName} 👋</p>
          )}
        </div>
      </div>

      {/* Composer */}
      <form
        className="flex-shrink-0 flex items-end gap-2 px-3 py-2.5 border-t border-white/8"
        style={{ background: "rgba(0,6,43,0.96)" }}
        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={`Message ${thread.vendorName}…`}
          rows={1}
          className="flex-1 resize-none rounded-2xl px-4 py-2.5 text-white text-[15px] placeholder:text-white/35 focus:outline-none"
          style={{ background: "rgba(255,255,255,0.08)", maxHeight: "120px" }}
          data-testid="input-chat-message"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Send"
          className="w-10 h-10 rounded-full flex items-center justify-center text-white active:opacity-80 disabled:opacity-30 flex-shrink-0"
          style={{ background: "#319ED8" }}
          data-testid="button-chat-send"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12l14-7-7 14-2-5-5-2z" />
          </svg>
        </button>
      </form>
    </main>
  );
}
