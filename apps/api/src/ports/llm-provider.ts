/**
 * Port for LLM reply generation. Services depend on this interface — never
 * on a concrete adapter — so providers (OpenAI, Ollama, Anthropic, ...) are
 * swappable without touching business logic. See docs/architecture.md §2.
 *
 * Streaming is deliberately not part of this slice (see ADR-0006); the port
 * can gain a streaming variant without reshaping the services that use it.
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMProvider {
  /** Returns the assistant reply text for a message history. */
  chat(messages: ChatMessage[]): Promise<string>;
}
