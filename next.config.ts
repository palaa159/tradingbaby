import type { NextConfig } from 'next';

/**
 * The dashboard runs under Bun, not Node: every store imports `bun:sqlite`.
 * `bun ./node_modules/.bin/next start` gives route handlers the Bun runtime,
 * verified in both dev and production.
 *
 * `useTypeScriptCli` is not optional here — Next 16 wants TypeScript 6's
 * compiler API and this repo is on TypeScript 7 (CLAUDE.md), so without the
 * flag the build refuses to type-check at all.
 *
 * The app keeps its own tsconfig so the root one stays exactly as the Bun
 * server and the test suite need it: NodeNext resolution, no JSX, no DOM.
 */
const config: NextConfig = {
  experimental: { useTypeScriptCli: true },
  typescript: { tsconfigPath: 'tsconfig.next.json' },
  poweredByHeader: false,
};

export default config;
