import { useEffect, useState } from 'react';
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
 */
export function App() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ message: string } | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [active, setActive] = useState<ConversationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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
    setDetailLoading(true);
    try {
      const detail = await getConversation(id);
      setActive(detail);
    } catch (error) {
      setBanner({ message: messageFor(error, 'Could not open the conversation.') });
    } finally {
      setDetailLoading(false);
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
   * on failure so the Composer keeps the draft for retry.
   */
  async function handleSend(content: string) {
    setBanner(null);
    try {
      let targetId = activeId;
      let target = active;

      if (targetId === null || target === null) {
        const created = await createConversation();
        targetId = created.id;
        target = { ...created, messages: [] };
        setConversations((previous) => [created, ...previous]);
        setActiveId(created.id);
        setActive(target);
      }

      const message = await sendMessage(targetId, content);
      setActive((previous) =>
        previous !== null && previous.id === targetId
          ? { ...previous, messages: [...previous.messages, message] }
          : previous,
      );

      // The conversation moved to the top (updatedAt) and, on the first
      // message, was retitled server-side — resync both.
      const { conversations: fresh } = await listConversations();
      setConversations(fresh);
      if (target.messages.length === 0) {
        const detail = await getConversation(targetId);
        setActive(detail);
      }
    } catch (error) {
      const message = messageFor(error, 'Your message could not be sent.');
      setBanner({ message });
      throw error;
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
