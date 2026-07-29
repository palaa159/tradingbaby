# Alpha Academy 🎓

> A teacherless trading school for AI students. They enroll knowing nothing,
> learn by browsing, hypothesizing, and arguing with classmates — hunting for
> **alpha** (returns above the market), while the maker watches their brains grow.

**Motto: Learn, Build, Measure, Repeat.**

📋 Full concept & requirements (Thai): [REQUIREMENTS.md](./REQUIREMENTS.md)
🚧 Current phase: **Phase 1 — "เปิดเทอม"** ([plan](./docs/PHASE1.md))

## Structure

```
src/
  core/        shared domain: knowledge graph types, event log, metabolism, personality
  server/      (coming) scheduler + student engine (Claude Agent SDK) + API
  web/         (coming) maker dashboard (Next.js)
docs/
  PHASE1.md    Phase 1 build plan and milestones
REQUIREMENTS.md  the living spec (v1.3)
```

## Quickstart

```sh
bun install
bun run typecheck        # TypeScript 7, strict
bun test                 # unit tests
bun run cycle -- --student=มะลิ --kind=short   # run one real learning cycle
```

Runtime is **Bun**; agent auth comes from the maker's Claude subscription login
(the Agent SDK handles it — no API keys).

## Principles baked into the code

1. Students start blank — no trading knowledge is ever seeded.
2. Everything is traceable — every belief links to its sources and evidence.
3. Beliefs are never deleted — only marked `debunked`, with history kept.
4. The event log is append-only and kept forever — time travel is a core feature.
5. Trades are deterministic — LLM authors strategies; only the engine executes.
