import type {
  AppendMessageResponse,
  ConversationDetail,
  ConversationSummary,
} from '@jarvis/shared';
import type { ConversationStore } from '../ports/conversation-store';
import type { ChatMessage, LLMProvider } from '../ports/llm-provider';
import { notFoundError, unexpectedError } from '../errors';

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
 * Conversation business logic: creation defaults, existence checks, the
 * "conversations are titled by their first message" rule, and reply
 * generation. HTTP-free and framework-free; depends only on the
 * ConversationStore and LLMProvider ports.
 */
export class ConversationService {
  private readonly store: ConversationStore;
  private readonly llm: LLMProvider;

  constructor(store: ConversationStore, llm: LLMProvider) {
    this.store = store;
    this.llm = llm;
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

  /**
   * Appends a user message and generates + persists the assistant reply as
   * one atomic turn. The reply is generated BEFORE anything is written, so a
   * provider failure persists nothing — the client keeps its draft and can
   * retry. The first message becomes the conversation title.
   */
  async sendMessage(conversationId: number, content: string): Promise<AppendMessageResponse> {
    const conversation = this.get(conversationId);
    const history: ChatMessage[] = conversation.messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
    // The provider sees the full history including the message being sent.
    const reply = await this.llm.chat([...history, { role: 'user', content }]);

    const now = new Date().toISOString();
    const messages = this.store.addMessages({
      conversationId,
      messages: [
        { role: 'user', content },
        { role: 'assistant', content: reply },
      ],
      now,
    });
    if (messages === undefined) {
      throw notFoundError(`Conversation ${conversationId} not found`);
    }
    const [userMessage, assistantMessage] = messages;
    if (userMessage === undefined || assistantMessage === undefined) {
      throw unexpectedError('Failed to persist the full message turn');
    }
    if (conversation.messages.length === 0) {
      this.store.setTitle(conversationId, titlePreview(content));
    }
    return { userMessage, assistantMessage };
  }
}
