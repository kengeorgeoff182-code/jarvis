import { useState, type FormEvent, type KeyboardEvent } from 'react';

interface ComposerProps {
  /** Resolves on success, rejects on failure (draft is then preserved). */
  onSend: (content: string) => Promise<void>;
  disabled?: boolean;
}

/**
 * Chat input. Submits on the Send button or on Enter (Shift+Enter inserts a
 * newline). The draft is cleared only after a successful send, so a failed
 * request leaves the text intact for retry.
 */
export function Composer({ onSend, disabled = false }: ComposerProps) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (content.length === 0 || disabled || sending) {
      return;
    }
    setSending(true);
    try {
      await onSend(content);
      setDraft('');
    } catch {
      // Keep the draft so the user can retry without retyping.
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  const canSend = !disabled && !sending && draft.trim().length > 0;

  return (
    <form className="composer" onSubmit={submit}>
      <label className="visually-hidden" htmlFor="composer-input">
        Message Jarvis
      </label>
      <textarea
        id="composer-input"
        rows={1}
        placeholder="Message Jarvis…"
        value={draft}
        disabled={disabled || sending}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <button type="submit" disabled={!canSend}>
        {sending ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}
