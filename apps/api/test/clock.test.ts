import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Each test gets a pristine clock module. The monotonic high-water mark is
 * module state, and one test's emissions must never leak into another's
 * assertions: under a stalling wall clock the rapid-call test can
 * legitimately run the clock up to its iteration count ahead of real time,
 * which would otherwise break a later test's wall-clock expectations.
 */
let nowIso: typeof import('../src/clock').nowIso;

/** Stamp parsed as epoch ms — comparisons and tolerances read better in ms. */
function toMs(iso: string): number {
  return Date.parse(iso);
}

describe('nowIso', () => {
  beforeEach(async () => {
    vi.resetModules();
    ({ nowIso } = await import('../src/clock'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tracks the wall clock', () => {
    const before = Date.now();
    const stamp = toMs(nowIso());
    const after = Date.now();
    expect(stamp).toBeGreaterThanOrEqual(before);
    expect(stamp).toBeLessThanOrEqual(after);
  });

  it('resyncs to the wall clock once it advances', async () => {
    // Let the wall clock move past anything earlier tests may have emitted.
    await new Promise((resolve) => setTimeout(resolve, 5));

    const before = Date.now();
    const stamp = toMs(nowIso());
    const after = Date.now();
    expect(stamp).toBeGreaterThanOrEqual(before);
    expect(stamp).toBeLessThanOrEqual(after);
  });

  it('is strictly increasing across rapid successive calls', () => {
    let previous = toMs(nowIso());
    for (let i = 0; i < 1000; i += 1) {
      const current = toMs(nowIso());
      expect(current).toBeGreaterThan(previous);
      previous = current;
    }
  });

  it('stays monotonic when the wall clock jumps backwards', async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    const highWater = toMs(nowIso());

    try {
      // Freeze the clock 10 seconds in the past: every call must still
      // increase, advancing past highWater rather than regressing.
      vi.useFakeTimers({ now: new Date(highWater - 10_000) });
      let previous = highWater;
      for (let i = 0; i < 10; i += 1) {
        const current = toMs(nowIso());
        expect(current).toBeGreaterThan(previous);
        previous = current;
      }
    } finally {
      vi.useRealTimers();
    }

    // Recovers: once the wall clock climbs back above the high-water mark
    // (the sleep guarantees that), stamps track it again instead of
    // drifting forever.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const before = Date.now();
    const recovered = toMs(nowIso());
    const after = Date.now();
    expect(recovered).toBeGreaterThanOrEqual(before);
    expect(recovered).toBeLessThanOrEqual(after);
  });

  it('emits valid ISO-8601 UTC timestamps', () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
