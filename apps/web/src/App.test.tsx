import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

const healthPayload = {
  status: 'ok',
  service: 'jarvis-api',
  version: '0.1.0',
  uptimeSeconds: 42,
  timestamp: '2026-09-03T12:00:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('renders connection details once the API responds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => healthPayload } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(screen.getByText(/Connecting to the Jarvis API/)).toBeInTheDocument();
    expect(await screen.findByText('jarvis-api')).toBeInTheDocument();
    expect(screen.getByText('0.1.0')).toBeInTheDocument();
    expect(screen.getByText('42s')).toBeInTheDocument();
  });

  it('renders an accessible error message when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    render(<App />);

    expect(
      await screen.findByText(/Could not reach the Jarvis API/),
    ).toBeInTheDocument();
  });
});
