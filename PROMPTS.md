# Prompts

The prompts I gave the AI coding assistant (Claude Code) while building this project, copied word for word in order (typos included), each in a plain-text block. Answers I gave to its clarifying questions are included too.

---

## 1. Reading the assignment

```text
we have to work on assignment details and resources are


We plan to fast track candidates who complete an assignment to build a type of AI-powered application on Cloudflare. An AI-powered application should include the following components:
LLM (recommend using Llama 3.3 on Workers AI), or an external LLM of your choice
Workflow / coordination (recommend using Workflows, Workers or Durable Objects)
User input via chat or voice (recommend using Pages or Realtime)
Memory or state
Find additional documentation here.
Note: AI-assisted coding is encouraged, but you have to submit prompt history.

https://agents.cloudflare.com/
https://developers.cloudflare.com/agents/

don't plan or make any change, just see, I will discuss then
```

## 2. The build spec

```text
Act as a staff software engineer. Let's build Codex Guardian on top of the agents-starter we just scaffolded.

What it does:
An AI agent that checks GitHub pull requests against a team's engineering standards ("the codex"). Users manage rules and exceptions by chatting with it, then ask it to review a PR. It explains every finding with file, line, the rule it broke, and how to fix it.

Must-have components (from the assignment):
- LLM: Llama 3.3 70B on Workers AI, for both chat and rule evaluation
- Coordination: Agents SDK (AIChatAgent on a Durable Object) for chat and state, plus a Cloudflare Workflow for the PR review so each step is durable and retried on failure
- User input: chat UI served from the same Worker (React, reuse the starter's components)
- Memory: rules, exceptions and review history stored in the agent's SQLite, and synced to the UI live

Review workflow steps: fetch PR files and patches from GitHub -> snapshot the rules and exceptions -> run cheap regex rules first, then LLM rules in small batches -> drop findings covered by an exception -> save the review -> optionally post a summary comment on the PR. Show step progress in the UI while it runs.

Engineering bar:
- Clean, readable TypeScript. Follow SOLID and DRY, but don't over-engineer. Small modules with one job each (agent, workflow, GitHub client, rule evaluation, storage, UI).
- Pure logic (patch parsing, path matching, exception filtering, report formatting, parsing LLM output) kept separate from Cloudflare APIs so it's easy to unit test. Add vitest tests for it.
- No secrets in code. GitHub token goes in a Worker secret and is optional for public repos.
- Handle bad LLM output safely: validate with zod, never crash the review.
- Remove the starter's demo tools (weather, calculator etc.).

Docs:
- README.md: what it is, architecture diagram, how to run locally, how to deploy, demo script, and the deployed link.
- AGENTS.md (and CLAUDE.md pointing to it): project structure, conventions, commands, and do's and don'ts, so any other dev's AI agent follows the same patterns and doesn't make a mess.
- Keep PROMPTS.md updated with my prompts, word for word.

Stretch, only if the core is solid: expose the review as an MCP server so Claude Code or Cursor can check a diff before pushing, and add a small eval set of labelled diffs.

Before writing code, give me a short plan with the folder structure, and then build it.

I already have gh, wrangler setup, let me know if you need anything else or have any confusion, an idea to dicuss, suggestion
```

## 3. Answers to the assistant's questions

```text
**Where should I scaffold the project?** → Projects/cf_ai_codex_guardian (Recommended)

**Should posting the PR summary comment require approval in chat?** → Yes, Approve/Reject in chat (Recommended)

**Do you want me to deploy with wrangler and create/push the GitHub repo when the core is done?** → Yes, deploy and push
```

## 4. Dependency versions

```text
make sure to use latest stable versions of any lib/deps
```

## 5. Clarifying "latest"

```text
by latest I mean meant LTS and not beta or calvalry or dev releases hopefully you understood the same
```
