# AGENTS.md

Guide for AI coding agents (and humans) working on Codex Guardian. Read this before changing code; follow the patterns that already exist.

## What this is

A Cloudflare Worker that serves a React chat app and hosts:

- `GuardianAgent` — an `AIChatAgent` (Agents SDK) on a SQLite-backed Durable Object. One instance per team codex (`?codex=<name>`). Owns chat, the codex (rules, exceptions) and review history, and pushes state to the UI.
- `ReviewWorkflow` — an `AgentWorkflow` (Cloudflare Workflows) that reviews one PR with durable, retried steps and reports progress back to the agent.
- LLM: Llama 3.3 70B on Workers AI (`env.AI`).

## Project structure

```
src/
  server.ts                 Worker entry: routes /agents/*, exports agent + workflow
  config.ts                 Env helpers and binding/event names
  agent/
    guardian-agent.ts       AIChatAgent: chat loop, codex methods, workflow callbacks, state sync
    tools.ts                Chat tools; thin adapters over GuardianAgent methods
    system-prompt.ts        Kept short on purpose (see "LLM rules" below)
  workflow/
    review-workflow.ts      The PR review pipeline (step.do per external call)
  github/
    client.ts               GitHub REST: PR files/patches, post comment
    pr-ref.ts               Parse PR URLs / owner/repo#n (pure)
  llm/
    workers-ai.ts           Model id + rule-evaluation adapter (JSON mode)
    dedupe-stream.ts        Workaround: drop duplicated fields in Workers AI streams
    leaked-tool-calls.ts    Middleware: turn tool calls written as text into real ones
    context-window.ts       Recent-message window for chat (pure)
  review/                   PURE domain logic — no Cloudflare imports
    types.ts                FileChange, AddedLine, CompleteFn, LlmMessage
    patch.ts                Unified diff → added lines with new-file line numbers
    changes.ts              Raw PR files → reviewable changes (skips lockfiles, etc.)
    paths.ts                Glob matching, ignored paths
    regex-rules.ts          Run regex rules
    llm-rules.ts            Batch building, prompt, zod-validated output parsing
    exceptions.ts           Waive findings covered by exceptions
    report.ts               Sorting, summaries, markdown report / PR comment
    review-record.ts        State transitions for a ReviewRecord
  storage/
    json-table.ts           Generic SQLite table of zod-validated JSON docs
    codex-store.ts          Rules, exceptions, reviews (+ seeding, idempotency)
    default-rules.ts        Starter codex
  shared/
    schemas.ts              zod schemas = single source of truth for all types
    ids.ts                  Slugs and random ids
  client/                   React UI (Vite)
    main.tsx, app.tsx       Entry, layout, useAgent + useAgentChat
    codex-context.tsx       State + actions passed to components
    components/             message-list, tool-part, review-card, codex-panel, theme-toggle
test/                       Vitest unit tests for pure logic (one file per module area)
examples/                   Only on the demo PR branch
```

## Commands

```sh
npm run dev       # Vite dev server with the Worker (Workers AI runs remotely; needs wrangler login)
npm test          # vitest run
npm run check     # oxfmt --check, oxlint, tsc, vitest — must pass before committing
npm run format    # oxfmt --write
npm run types     # regenerate env.d.ts after changing wrangler.jsonc
npm run deploy    # vite build && wrangler deploy
```

## Conventions

- **TypeScript, strict.** No `any` (lint error). Prefer `unknown` + narrowing. Do not enable `experimentalDecorators` (breaks `@callable`).
- **Types come from zod.** Add or change a domain type in `src/shared/schemas.ts` and infer it (`z.infer`). Don't hand-write a parallel interface.
- **Pure core, thin adapters.** Logic that can be pure goes in `src/review/` (or another pure module) with no imports from `cloudflare:*`, `agents`, or `env`. Inject side effects as functions (see `CompleteFn`). Every pure module gets tests in `test/`.
- **One job per module.** The agent coordinates; the store persists; the workflow sequences steps; tools adapt chat calls to agent methods. Don't put business logic in tools, React components or the workflow body.
- **State flow.** SQLite (via `CodexStore`) is the source of truth. Any change goes through `GuardianAgent.mutate()` / `saveReview()`, which re-syncs state to clients. Clients never call `setState`; they call `@callable` methods, and `validateStateChange` rejects client writes.
- **Validate at boundaries.** Tool inputs, `@callable` arguments, LLM output, workflow progress and stored rows are all parsed with zod. Never trust LLM output: drop what doesn't validate, never throw from parsing.
- **Workflows.** Every external or non-deterministic call is a `step.do` with an explicit retry config. Deterministic pure work can run outside steps. Step names must be stable and unique (`llm-batch-${i}`). Use `NonRetryableError` for errors that can't succeed on retry. Copy plain data out of agent RPC results and dispose them (`using`).
- **Errors in chat tools** are returned as `{ error }` (via `safely`) so the model can explain or self-correct. Error messages should say how to fix the input (e.g. list valid rule ids).
- **Style.** Match the surrounding code. Short doc comments explaining _why_, not what. oxfmt formatting (80 cols, no trailing commas).
- **Dependencies.** Latest stable releases only (npm `latest` tag; no beta/rc/next). Don't add a dependency for something a few lines of code can do.

## LLM rules (learned the hard way — keep these)

Llama 3.3 on Workers AI is sensitive. When touching chat or tools:

- Keep `SYSTEM_PROMPT` to a few sentences. Long prompts make it stop calling tools. Put guidance in tool descriptions.
- Keep tool schemas flat with few optional fields. Prefer two simple tools over one tool with a mode switch.
- Booleans may arrive as strings: use `looseBoolean` in tool schemas.
- Keep `recoverLeakedToolCalls` middleware and the `recentMessages` window in the chat path.
- After changing prompts or tools, test real requests (see README demo script); unit tests can't catch model behaviour.

## Do

- Add a test with every change to `src/review/`, `src/llm/` or other pure modules.
- Run `npm run check` before committing.
- Run `npm run types` after editing `wrangler.jsonc`.
- Add a **new** migration tag in `wrangler.jsonc` when adding/renaming a Durable Object class.

## Don't

- Don't commit secrets. `GITHUB_TOKEN` lives in `.dev.vars` (git-ignored) and `wrangler secret put`.
- Don't edit existing Durable Object migrations.
- Don't call GitHub or Workers AI from React or from pure modules.
- Don't post to GitHub without the approval step in the workflow.
- Don't let a failing LLM batch fail a review; record a warning instead.
- Don't grow `app.tsx` into a monolith; add a component in `client/components/`.
- Don't add starter/demo tools back (weather, calculator, scheduling).
