import axe from 'axe-core';

/**
 * Runs an axe-core audit against the rendered DOM. jsdom applies no real
 * stylesheets, so rules that require a rendered browser (e.g.
 * color-contrast) may report noise; pass rule exclusions via `options` when
 * that happens, with a comment explaining why.
 */
export async function auditAccessibility(
  container: HTMLElement,
  options: axe.RunOptions = {},
): Promise<axe.AxeResults> {
  return axe.run(container, options);
}

function formatViolations(violations: axe.Result[]): string {
  return violations
    .map((violation) => {
      const targets = violation.nodes.map((node) => `      ${node.target.join(' ')}`).join('\n');
      return `  [${violation.impact ?? 'n/a'}] ${violation.id}: ${violation.help}\n${targets}`;
    })
    .join('\n');
}

/**
 * Asserts that an axe result set contains no violations, throwing with a
 * readable per-rule report otherwise. Used directly in tests (no vitest
 * matcher augmentation: vitest 5 re-exports its Assertion type from an
 * internal chunk, where module augmentation does not reliably merge).
 */
export function assertNoAxeViolations(violations: axe.Result[]): void {
  if (violations.length === 0) {
    return;
  }
  throw new Error(
    `Expected no axe violations, but found ${violations.length}:\n${formatViolations(violations)}`,
  );
}

/** One-call audit: run axe on the container and fail on any violation. */
export async function expectNoAxeViolations(container: HTMLElement): Promise<void> {
  const results = await auditAccessibility(container);
  assertNoAxeViolations(results.violations);
}
