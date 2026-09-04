import type { ConversationDetail, ConversationSummary, Message } from '@jarvis/shared';
import type { ConversationStore } from '../ports/conversation-store';
import { notFoundError } from '../errors';

const DEFAULT_TITLE = 'New conversation';
const PREVIEW_LENGTH = 60;

/** Collapses whitespace and truncates user content into a sidebar title. */
function titlePreview(content: string): string {
  const singleLine = content.replace(/\s+/g, ' ').trim();
  return singleLine.length > PREVIEW_LENGTH
    ? `${singleLine.slice(0, PREVIEW_LENGTH)}…`
    : singleLine;
}

/**
 * Conversation business logic: creation defaults, existence checks, and the
 * "conversations are titled by their first message" rule. HTTP-free and
 * framework-free; depends only on the ConversationStore port.
 */
export class ConversationService {
  private readonly store: ConversationStore;

  constructor(store: ConversationStore) {
    this.store = store;
  }

  create(): ConversationSummary {
    const now = new Date().toISOString();
    return this.store.createConversation(DEFAULT_TITLE, now);
  }

  list(): ConversationSummary[] {
    return this.store.listConversations();
  }

  get(id: number): ConversationDetail {
    const conversation = this.store.getConversation(id);
    if (conversation === undefined) {
      throw notFoundError(`Conversation ${id} not found`);
    }
    return conversation;
  }

  /** Appends a user message; the first message becomes the conversation title. */
  sendMessage(conversationId: number, content: string): Message {
    const conversation = this.get(conversationId);
    const now = new Date().toISOString();
    const message = this.store.addMessage({
      conversationId,
      role: 'user',
      content,
      now,
    });
    if (message === undefined) {
      throw notFoundError(`Conversation ${conversationId} not found`);
    }
    if (conversation.messages.length === 0) {
      this.store.setTitle(conversationId, titlePreview(content));
    }
    return message;
  }
}
