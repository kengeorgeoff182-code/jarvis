import type { ConversationDetail, ConversationSummary, Message } from '@jarvis/shared';

/**
 * Port for conversation persistence. Services depend on this interface —
 * never on a concrete adapter — so storage can change (file → SQLite →
 * Postgres) without touching business logic. See docs/architecture.md §2.
 *
 * Timestamps are supplied by the caller (`now`) so the store stays a pure
 * persistence mechanism and tests can stay deterministic.
 */
export interface ConversationStore {
  createConversation(title: string, now: string): ConversationSummary;
  listConversations(): ConversationSummary[];
  getConversation(id: number): ConversationDetail | undefined;
  /**
   * Appends a message and bumps the conversation's updatedAt atomically.
   * Returns undefined when the conversation does not exist.
   */
  addMessage(input: {
    conversationId: number;
    role: Message['role'];
    content: string;
    now: string;
  }): Message | undefined;
  /** Renames a conversation. Returns false when the id does not exist. */
  setTitle(id: number, title: string): boolean;
}
