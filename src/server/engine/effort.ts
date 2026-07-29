/**
 * Reasoning effort per model, for the SDK's `Options.effort`.
 *
 * 'xhigh' is only accepted by Opus 5 and Sonnet 5. Haiku 4.5 has no effort
 * levels, so it is left unset rather than sent a flag the runtime would
 * silently downgrade — the absent key is the honest description of what runs.
 */

const XHIGH_MODELS = new Set(['claude-opus-5', 'claude-sonnet-5']);

/** Spread into `query({ options })`; contributes nothing for models without effort. */
export function effortFor(model: string): { readonly effort: 'xhigh' } | Record<string, never> {
  return XHIGH_MODELS.has(model) ? { effort: 'xhigh' } : {};
}
