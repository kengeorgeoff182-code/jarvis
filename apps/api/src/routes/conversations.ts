import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  appendMessageResponseSchema,
  conversationDetailSchema,
  conversationListResponseSchema,
  conversationSummarySchema,
  createConversationInputSchema,
  createMessageInputSchema,
} from '@jarvis/shared';
import type { ConversationService } from '../services/conversation-service';
import { validationError } from '../errors';

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown, what: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw validationError(
      `Invalid ${what}`,
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return result.data;
}

export interface ConversationRoutesOptions {
  service: ConversationService;
}

/**
 * Conversation + message endpoints. Routes are HTTP-only: they parse input
 * against the shared zod contracts, call the service, and validate outbound
 * payloads before responding. No business logic lives here.
 */
export const conversationRoutes: FastifyPluginAsync<ConversationRoutesOptions> = async (
  app,
  { service },
) => {
  app.get('/conversations', async () => {
    return conversationListResponseSchema.parse({
      conversations: service.list(),
    });
  });

  app.post('/conversations', async (request, reply) => {
    parseOrThrow(createConversationInputSchema, request.body, 'conversation payload');
    const conversation = service.create();
    return reply.code(201).send(conversationSummarySchema.parse(conversation));
  });

  app.get<{ Params: { id: string } }>('/conversations/:id', async (request) => {
    const { id } = parseOrThrow(idParamSchema, request.params, 'conversation id');
    return conversationDetailSchema.parse(service.get(id));
  });

  app.post<{ Params: { id: string } }>('/conversations/:id/messages', async (request, reply) => {
    const { id } = parseOrThrow(idParamSchema, request.params, 'conversation id');
    const body = parseOrThrow(createMessageInputSchema, request.body, 'message payload');
    const result = await service.sendMessage(id, body.content);
    return reply.code(201).send(appendMessageResponseSchema.parse(result));
  });
};
