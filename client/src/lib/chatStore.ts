/**
 * Lightweight client-only chat store for the demo.
 *
 * Real product will replace this with a server-backed inbox (vendor accounts,
 * push notifications, anti-spam, attachments). For the demo we just persist
 * threads/messages to localStorage and notify subscribers via a CustomEvent.
 *
 * Shape:
 * - A "thread" is keyed by a slug derived from the vendor's name. One thread
 *   per vendor, even if the fan asks about multiple instruments — additional
 *   instrument links just append new "card" messages into the same thread.
 * - Messages are either text bubbles (fromMe true/false) or "card" messages
 *   that render an Open-Graph-style preview for the instrument the fan was
 *   looking at when they hit the message button.
 */

export type ChatCard = {
  kind: "instrument";
  instrumentId: string;
  instrumentName: string;
  instrumentCategory?: string;
  instrumentPhotoUrl?: string;
  vendorName: string;
  vendorLogoUrl?: string;
  vendorDomain?: string;
  url: string;
};

export type ChatMessage = {
  id: string;
  threadId: string;
  fromMe: boolean;
  ts: number;
  text?: string;
  card?: ChatCard;
};

export type ChatThread = {
  id: string;
  vendorName: string;
  vendorLogoUrl?: string;
  vendorDomain?: string;
  lastPreview: string;
  updatedAt: number;
  unread: number;
};

const STORAGE_KEY = "gt:chats";
const EVENT = "gt:chats-changed";

type ChatStoreState = {
  threads: Record<string, ChatThread>;
  messages: Record<string, ChatMessage[]>;
};

function loadState(): ChatStoreState {
  if (typeof window === "undefined") return { threads: {}, messages: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { threads: {}, messages: {} };
    const parsed = JSON.parse(raw) as ChatStoreState;
    return { threads: parsed.threads ?? {}, messages: parsed.messages ?? {} };
  } catch {
    return { threads: {}, messages: {} };
  }
}

function saveState(state: ChatStoreState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* quota / privacy mode — ignore */
  }
}

export function vendorThreadId(vendorName: string): string {
  return "vendor:" + vendorName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function getState(): ChatStoreState {
  return loadState();
}

export function getThreads(): ChatThread[] {
  const s = loadState();
  return Object.values(s.threads).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getThread(id: string): ChatThread | undefined {
  return loadState().threads[id];
}

export function getMessages(threadId: string): ChatMessage[] {
  return loadState().messages[threadId] ?? [];
}

function previewFor(msg: ChatMessage): string {
  if (msg.text) return msg.text;
  if (msg.card?.kind === "instrument") return `📎 ${msg.card.instrumentName}`;
  return "";
}

function applyMessage(state: ChatStoreState, msg: ChatMessage, threadPatch: Partial<ChatThread>) {
  const existingThread = state.threads[msg.threadId];
  const incrementUnread = !msg.fromMe;
  const thread: ChatThread = {
    id: msg.threadId,
    vendorName: existingThread?.vendorName ?? threadPatch.vendorName ?? "Vendor",
    vendorLogoUrl: threadPatch.vendorLogoUrl ?? existingThread?.vendorLogoUrl,
    vendorDomain: threadPatch.vendorDomain ?? existingThread?.vendorDomain,
    lastPreview: previewFor(msg),
    updatedAt: msg.ts,
    unread: msg.fromMe ? (existingThread?.unread ?? 0) : (existingThread?.unread ?? 0) + (incrementUnread ? 1 : 0),
  };
  return {
    threads: { ...state.threads, [msg.threadId]: thread },
    messages: { ...state.messages, [msg.threadId]: [...(state.messages[msg.threadId] ?? []), msg] },
  };
}

function newId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Open or create the thread for a vendor and seed it with an instrument card.
 * Returns the thread id so callers can navigate to /chat/:id.
 */
export function startVendorChatAboutInstrument(card: ChatCard): string {
  const threadId = vendorThreadId(card.vendorName);
  const state = loadState();
  const msg: ChatMessage = {
    id: newId(),
    threadId,
    fromMe: true,
    ts: Date.now(),
    card,
  };
  const next = applyMessage(state, msg, {
    vendorName: card.vendorName,
    vendorLogoUrl: card.vendorLogoUrl,
    vendorDomain: card.vendorDomain,
  });
  // Reset unread when the user is opening the thread themselves.
  next.threads[threadId] = { ...next.threads[threadId], unread: 0 };
  saveState(next);
  return threadId;
}

export function sendUserMessage(threadId: string, text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;
  const state = loadState();
  const thread = state.threads[threadId];
  const msg: ChatMessage = {
    id: newId(),
    threadId,
    fromMe: true,
    ts: Date.now(),
    text: trimmed,
  };
  const next = applyMessage(state, msg, {
    vendorName: thread?.vendorName ?? "Vendor",
    vendorLogoUrl: thread?.vendorLogoUrl,
    vendorDomain: thread?.vendorDomain,
  });
  saveState(next);
}

/**
 * Demo-only canned reply. Real flow would be a vendor agent on the other side.
 * We trigger this from the thread page after the user sends the first message.
 */
export function sendDemoVendorReply(threadId: string, replyText: string) {
  const state = loadState();
  const thread = state.threads[threadId];
  if (!thread) return;
  const msg: ChatMessage = {
    id: newId(),
    threadId,
    fromMe: false,
    ts: Date.now(),
    text: replyText,
  };
  const next = applyMessage(state, msg, {
    vendorName: thread.vendorName,
    vendorLogoUrl: thread.vendorLogoUrl,
    vendorDomain: thread.vendorDomain,
  });
  saveState(next);
}

export function markThreadRead(threadId: string) {
  const state = loadState();
  const t = state.threads[threadId];
  if (!t || t.unread === 0) return;
  const next = { ...state, threads: { ...state.threads, [threadId]: { ...t, unread: 0 } } };
  saveState(next);
}

export function totalUnread(): number {
  const s = loadState();
  return Object.values(s.threads).reduce((acc, t) => acc + (t.unread ?? 0), 0);
}

export function subscribeChats(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
