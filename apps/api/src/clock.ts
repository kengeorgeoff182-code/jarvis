/**
 * Strictly monotonic wall-clock timestamps.
 *
 * `Date.now()` has millisecond precision, so two writes in the same
 * millisecond produce identical ISO stamps — and every ordering built on
 * those stamps (`ORDER BY updated_at DESC`) then falls back to a tie-break
 * that can rank an older write first. Fast CI hardware hits this reliably;
 * a real burst of user activity would too.
 *
 * nowIso() guarantees each call returns a stamp strictly greater than the
 * previous one from this process: inside a millisecond it advances by 1 ms,
 * and it resyncs to the wall clock as soon as the clock moves. Stamps stay
 * valid ISO-8601 UTC and only drift from wall time by the number of
 * same-millisecond calls, which is bounded and transient.
 *
 * Monotonicity is per process, matching the single-writer deployment model
 * of the SQLite store (see docs/adr/0005-sqlite-persistence.md).
 */
let lastEmittedMs = 0;

export function nowIso(): string {
  const currentMs = Date.now();
  if (currentMs > lastEmittedMs) {
    lastEmittedMs = currentMs;
    return new Date(currentMs).toISOString();
  }
  lastEmittedMs += 1;
  return new Date(lastEmittedMs).toISOString();
}
