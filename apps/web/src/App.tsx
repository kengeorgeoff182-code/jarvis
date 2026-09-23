import { useEffect, useRef, useState } from 'react';
import type { ConversationDetail, ConversationSummary } from '@jarvis/shared';
import {
  ApiError,
  createConversation,
  getConversation,
  listConversations,
  sendMessage,
} from './lib/api';
import { ConversationSidebar } from './components/ConversationSidebar';
import { Transcript } from './components/Transcript';
import { Composer } from './components/Composer';

function messageFor(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * Chat workspace view. Owns all conversation state and talks to the API only
 * through src/lib/api.ts (components never fetch directly).
 *
 * Send-flow contract: once `sendMessage` resolves, the turn IS persisted —
 * every later step (sidebar refetch, first-message detail refetch) is
 * best-effort and must never report the send itself as failed. Reporting a
 * persisted send as failed would keep the draft alive and bait the user into
 * sending the same message twice.
 */
export function App() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ message: string } | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [active, setActive] = useState<ConversationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Monotonic token for open/detail requests: a slow response for a
  // conversation the user has already left must never clobber the view.
  const detailRequestRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    listConversations()
      .then(({ conversations: fresh }) => {
        if (!cancelled) {
          setConversations(fresh);
          setLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoading(false);
          setBanner({ message: messageFor(error, 'Could not load conversations.') });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function openConversation(id: number) {
    if (id === activeId && active !== null) {
      return;
    }
    setBanner(null);
    setActiveId(id);
    const request = ++detailRequestRef.current;
    setDetailLoading(true);
    try {
      const detail = await getConversation(id);
      // Superseded by a newer open/send — drop this response.
      if (request === detailRequestRef.current) {
        setActive(detail);
      }
    } catch (error) {
      if (request === detailRequestRef.current) {
        setBanner({ message: messageFor(error, 'Could not open the conversation.') });
      }
    } finally {
      if (request === detailRequestRef.current) {
        setDetailLoading(false);
      }
    }
  }

  async function handleNew() {
    setBanner(null);
    try {
      const created = await createConversation();
      setConversations((previous) => [created, ...previous]);
      setActiveId(created.id);
      setActive({ ...created, messages: [] });
    } catch (error) {
      setBanner({ message: messageFor(error, 'Could not start a conversation.') });
    }
  }

  /**
   * Sends a message, auto-creating a conversation when none is open. Throws
   * only while nothing is persisted (creation, send) so the Composer keeps
   * the draft for retry. Post-send refreshes below never throw: the turn is
   * already stored, and a failed refresh is surfaced as a notice instead.
   */
  async function handleSend(content: string) {
    setBanner(null);
    let targetId: number;
    let isFirstMessage: boolean;
    // Snapshot the detail token: if the user navigates while the send is
    // in flight, the refetch below must not steal the token and drop the
    // navigation's own in-flight detail fetch. (Declared here, not inside
    // the try, so the post-persist tail can read it.)
    const detailTokenAtSend = detailRequestRef.current;

    try {
      let target = active;
      if (activeId === null || target === null) {
        const created = await createConversation();
        target = { ...created, messages: [] };
        setConversations((previous) => [created, ...previous]);
        setActiveId(created.id);
        setActive(target);
      }
      // `active.id` always equals `activeId` (they are set together), so the
      // local target's id is authoritative in both branches.
      targetId = target.id;
      isFirstMessage = target.messages.length === 0;

      // The request covers LLM latency and returns the persisted user turn
      // plus the generated assistant reply together.
      const { userMessage, assistantMessage } = await sendMessage(targetId, content);
      setActive((previous) =>
        previous !== null && previous.id === targetId
          ? {
              ...previous,
              messages: [...previous.messages, userMessage, assistantMessage],
            }
          : previous,
      );
    } catch (error) {
      // Nothing was persisted — the draft survives for retry.
      setBanner({ message: messageFor(error, 'Your message could not be sent.') });
      throw error;
    }

    // Persisted from here on. The conversation moved to the top (updatedAt)
    // and, on the first message, was retitled server-side — resync the list,
    // but a failed refresh is only a notice, never a failed send.
    try {
      const { conversations: fresh } = await listConversations();
      setConversations(fresh);
    } catch {
      setBanner({ message: 'Message sent, but the sidebar could not be refreshed.' });
    }
    if (isFirstMessage && detailRequestRef.current === detailTokenAtSend) {
      // The user has not navigated since the send started: re-fetch so the
      // header shows the server-derived title. The token check drops the
      // response if navigation happens while this fetch is in flight.
      const request = ++detailRequestRef.current;
      try {
        const detail = await getConversation(targetId);
        if (request === detailRequestRef.current) {
          setActive((previous) =>
            previous !== null && previous.id === targetId ? detail : previous,
          );
        }
      } catch {
        // Transcript already shows both turns from the send response.
      }
    }
  }

  const emptyPane =
    conversations.length === 0
      ? 'Start your first conversation to begin chatting.'
      : 'Select a conversation from the list, or start a new one.';

  return (
    <div className="app">
      <header className="app-header">
        <h1>Jarvis</h1>
        <p className="tagline">Your personal AI assistant — chat edition</p>
      </header>

      <div className="workspace">
        <ConversationSidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={openConversation}
          onNew={handleNew}
          disabled={loading}
        />

        <main className="chat" aria-label="Active conversation">
          {banner !== null && (
            <p className="error-banner" role="status">
              {banner.message}
            </p>
          )}

          <header className="chat-header">
            <h2>{active !== null ? active.title : 'Jarvis'}</h2>
          </header>

          <div className="chat-body" aria-busy={detailLoading || loading}>
            {detailLoading ? (
              <p role="status">Loading conversation…</p>
            ) : active !== null ? (
              <Transcript messages={active.messages} />
            ) : (
              <p className="chat-empty" role="status">
                {emptyPane}
              </p>
            )}
          </div>

          <Composer onSend={handleSend} disabled={loading || detailLoading} />
        </main>
      </div>
    </div>
  );
}
