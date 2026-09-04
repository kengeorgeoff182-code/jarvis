import { useEffect, useState } from 'react';
import { ApiError, fetchHealth } from './lib/api';

type ConnectionState =
  | { kind: 'connecting' }
  | { kind: 'error'; message: string }
  | { kind: 'connected'; service: string; version: string; uptimeSeconds: number };

export function App() {
  const [state, setState] = useState<ConnectionState>({ kind: 'connecting' });

  useEffect(() => {
    let cancelled = false;

    void fetchHealth()
      .then((health) => {
        if (!cancelled) {
          setState({
            kind: 'connected',
            service: health.service,
            version: health.version,
            uptimeSeconds: health.uptimeSeconds,
          });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            kind: 'error',
            message:
              error instanceof ApiError ? error.message : 'Could not reach the Jarvis API.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="app">
      <header>
        <h1>Jarvis</h1>
        <p className="tagline">Your personal AI assistant — foundation build</p>
      </header>
      <main>
        <section aria-label="API connection status" role="status" aria-live="polite">
          {state.kind === 'connecting' && <p>Connecting to the Jarvis API…</p>}
          {state.kind === 'error' && <p className="error">{state.message}</p>}
          {state.kind === 'connected' && (
            <dl>
              <div>
                <dt>Service</dt>
                <dd>{state.service}</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>{state.version}</dd>
              </div>
              <div>
                <dt>Uptime</dt>
                <dd>{state.uptimeSeconds}s</dd>
              </div>
            </dl>
          )}
        </section>
      </main>
    </div>
  );
}
