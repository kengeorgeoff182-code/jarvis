import { useEffect, useRef } from 'react';
import type { Message } from '@jarvis/shared';

interface TranscriptProps {
  messages: Message[];
}

const ROLE_LABELS: Record<Message['role'], string> = {
  user: 'You',
  assistant: 'Assistant',
  system: 'System',
};

/**
 * Ordered message log. The log live region wraps a real <ol> — putting
 * role="log" on the list itself would strip its list semantics (axe:
 * aria-allowed-role / listitem). Appended messages are announced to
 * assistive technology via the implicit aria-live of the log role.
 */
export function Transcript({ messages }: TranscriptProps) {
  const endRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <p className="transcript-empty" role="status">
        No messages yet — send the first one below.
      </p>
    );
  }

  return (
    <div role="log" aria-live="polite" aria-label="Messages">
      <ol className="transcript">
        {messages.map((message, index) => (
          <li key={message.id} ref={index === messages.length - 1 ? endRef : undefined}>
            <article className={`message message-${message.role}`}>
              <h3 className="message-role">{ROLE_LABELS[message.role]}</h3>
              <p className="message-content">{message.content}</p>
            </article>
          </li>
        ))}
      </ol>
    </div>
  );
}
