import type { ConversationSummary } from '@jarvis/shared';

interface ConversationSidebarProps {
  conversations: ConversationSummary[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  disabled?: boolean;
}

/**
 * Conversation list with a "new conversation" action. Presentational: state
 * and data live in the view that renders it.
 */
export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  disabled = false,
}: ConversationSidebarProps) {
  return (
    <aside className="sidebar">
      <h2 className="visually-hidden">Conversations</h2>
      <button type="button" className="new-conversation" onClick={onNew} disabled={disabled}>
        + New conversation
      </button>
      <nav aria-label="Conversations">
        {conversations.length === 0 ? (
          <p className="sidebar-empty">No conversations yet.</p>
        ) : (
          <ul className="conversation-list">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  className="conversation-item"
                  aria-current={conversation.id === activeId ? 'true' : undefined}
                  onClick={() => onSelect(conversation.id)}
                >
                  {conversation.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </aside>
  );
}
