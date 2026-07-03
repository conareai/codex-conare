# codex-conare

[Conare](https://conare.ai) for OpenAI Codex: your project's context — what it
is, what changed recently, your working rules, known pitfalls — injected into
every Codex session automatically, in about a second.

A native `SessionStart` hook fetches a precomputed, freshness-stamped project
brief and hands it to Codex as `additionalContext` before the model's first
token. No tool call, no waiting on retrieval, no manual prompting.

## Install

```bash
npx codex-conare
```

Then the one-time trust step (Codex requires trusting new command hooks):

1. Start `codex`
2. Run `/hooks`
3. Review and trust the codex-conare SessionStart hook

Don't have a Conare account yet? Run `bunx conare@latest` to sign in and start
syncing your chat history — until credentials exist, the hook is a silent
no-op.

## What the installer does (and nothing else)

1. Copies `hooks/session-start.mjs` to `~/.conare/hooks/codex-session-start.mjs`.
2. Registers it in `~/.codex/hooks.json` — Codex loads lifecycle hooks from
   `hooks.json` next to its config layers, so **`config.toml` is never
   touched**, and any hooks you already have are preserved untouched.
3. Prints the trust step above.

Re-running refreshes the script in place (idempotent). `npx codex-conare
status` shows what's installed; `npx codex-conare uninstall` removes exactly
what was added — our hook entry and the copied script, nothing else.

## How the hook works

`hooks/session-start.mjs` (zero dependencies, ~120 lines — read it):

1. Resolves the repo's identity: sha256 of the normalized `origin` remote URL
   (falls back to the directory path for remoteless repos).
2. Reads your API key from `~/.conare/config.json`.
3. Fetches `GET /api/hook/brief` with a 2-second budget.
4. Prints the brief to stdout — or, on any failure (offline, no key, no brief
   yet), prints nothing and exits 0. **The hook can never block or degrade
   session start.**

The brief is precomputed by Conare's background agents (refreshed every 24h
from your ingested history) and served as a materialized artifact — that's why
it's fast.

## Configuration

| What | Where |
| --- | --- |
| API key | `~/.conare/config.json` (`apiKey`) — written by `bunx conare@latest` |
| API base override | `CONARE_API_URL` env var (default `https://api.conare.ai`) |
| Codex dir override | `CODEX_HOME` env var (default `~/.codex`) |

## Privacy & security

- The hook sends only a repo-identity hash and your API key over HTTPS. No
  code, no file contents, no prompts.
- Everything that runs on your machine is in this repo, in plain JavaScript.

## Using Claude Code too?

Install the [claude-conare plugin](https://github.com/conareai/claude-conare)
— same brief, plus the bundled Conare MCP server and skill.

## Development

```bash
npm test   # syntax checks + full install/uninstall smoke test in a throwaway HOME
```

## License

[MIT](LICENSE)
