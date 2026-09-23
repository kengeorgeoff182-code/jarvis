import { z } from 'zod';

/**
 * Roles a stored message can carry. `user` messages arrive from the client;
 * `assistant` replies are generated server-side by the LLM provider;
 * `system` is reserved for future prompt-injection.
 */
export const messageRoleSchema = z.enum(['user', 'assistant', 'system']);

/** List/sidebar view of a conversation — no message bodies. */
export const conversationSummarySchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(200),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

/** A single stored message inside a conversation. */
export const messageSchema = z.object({
  id: z.number().int().positive(),
  conversationId: z.number().int().positive(),
  role: messageRoleSchema,
  content: z.string().min(1).max(100_000),
  createdAt: z.string().datetime(),
});

export type Message = z.infer<typeof messageSchema>;

/** Full conversation: summary fields plus the ordered message list. */
export const conversationDetailSchema = conversationSummarySchema.extend({
  messages: z.array(messageSchema),
});

export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

/** POST /conversations body. Conversations are created untitled server-side. */
export const createConversationInputSchema = z.object({}).strict();

export type CreateConversationInput = z.infer<typeof createConversationInputSchema>;

/** POST /conversations/:id/messages body. Role is stamped by the server. */
export const createMessageInputSchema = z.object({
  content: z.string().trim().min(1).max(100_000),
});

export type CreateMessageInput = z.infer<typeof createMessageInputSchema>;

/** GET /conversations response. */
export const conversationListResponseSchema = z.object({
  conversations: z.array(conversationSummarySchema),
});

export type ConversationListResponse = z.infer<typeof conversationListResponseSchema>;

/**
 * POST /conversations/:id/messages response — the persisted user message
 * plus the assistant reply generated for it, in transcript order.
 */
export const appendMessageResponseSchema = z.object({
  userMessage: messageSchema,
  assistantMessage: messageSchema,
});

export type AppendMessageResponse = z.infer<typeof appendMessageResponseSchema>;
