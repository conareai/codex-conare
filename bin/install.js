#!/usr/bin/env node
// codex-conare installer.
//
//   npx codex-conare            install (or refresh) the SessionStart hook
//   npx codex-conare status     show what's installed
//   npx codex-conare uninstall  remove the hook cleanly
//
// Registers the hook in ~/.codex/hooks.json — Codex loads lifecycle hooks from
// hooks.json files next to active config layers, so we merge JSON and NEVER
// parse or rewrite config.toml. We only ever touch our own entry (identified
// by the installed script path); everything else in the file is preserved.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOME = homedir();
const CODEX_DIR = process.env.CODEX_HOME || join(HOME, ".codex");
const HOOKS_JSON = join(CODEX_DIR, "hooks.json");
const INSTALL_DIR = join(HOME, ".conare", "hooks");
const INSTALLED_SCRIPT = join(INSTALL_DIR, "codex-session-start.mjs");
const BUNDLED_SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "hooks",
  "session-start.mjs",
);

const OURS = (hook) =>
  Array.isArray(hook?.hooks) &&
  hook.hooks.some(
    (h) =>
      (Array.isArray(h?.command) ? h.command.join(" ") : String(h?.command ?? "")).includes(
        "codex-session-start",
      ),
  );

function readHooksFile() {
  if (!existsSync(HOOKS_JSON)) return { hooks: {} };
  // A hooks.json we can't parse is the user's problem to resolve, not ours to
  // clobber — abort loudly instead of writing over it.
  const parsed = JSON.parse(readFileSync(HOOKS_JSON, "utf8"));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`${HOOKS_JSON} is not a JSON object`);
  }
  parsed.hooks ??= {};
  return parsed;
}

function writeHooksFile(data) {
  writeFileSync(HOOKS_JSON, JSON.stringify(data, null, 2) + "\n");
}

function install() {
  if (!existsSync(CODEX_DIR)) {
    console.error(
      `Codex config directory not found at ${CODEX_DIR}.\n` +
        "Install Codex first (https://developers.openai.com/codex), then re-run: npx codex-conare",
    );
    process.exit(1);
  }

  mkdirSync(INSTALL_DIR, { recursive: true });
  copyFileSync(BUNDLED_SCRIPT, INSTALLED_SCRIPT);

  const data = readHooksFile();
  data.hooks.SessionStart = (data.hooks.SessionStart ?? []).filter(
    (hook) => !OURS(hook),
  );
  data.hooks.SessionStart.push({
    matcher: "startup",
    hooks: [
      {
        type: "command",
        command: ["node", INSTALLED_SCRIPT],
        timeout: 5,
        statusMessage: "Loading Conare project brief",
      },
    ],
  });
  writeHooksFile(data);

  const hasCreds = existsSync(join(HOME, ".conare", "config.json"));
  console.log(`codex-conare installed.

  hook script  ${INSTALLED_SCRIPT}
  registered   ${HOOKS_JSON}

One-time step — Codex requires you to trust new command hooks:
  1. Start codex
  2. Run /hooks
  3. Review and trust the codex-conare SessionStart hook
${hasCreds ? "" : `
No Conare credentials found (~/.conare/config.json). Run \`bunx conare@latest\`
to sign in — until then the hook is a silent no-op.
`}
Every new Codex session now starts with your project's Conare brief.
Uninstall anytime: npx codex-conare uninstall`);
}

function uninstall() {
  if (existsSync(HOOKS_JSON)) {
    const data = readHooksFile();
    if (Array.isArray(data.hooks.SessionStart)) {
      data.hooks.SessionStart = data.hooks.SessionStart.filter(
        (hook) => !OURS(hook),
      );
      if (data.hooks.SessionStart.length === 0) delete data.hooks.SessionStart;
      // The file may hold other hooks the user owns — never delete it.
      writeHooksFile(data);
    }
  }
  if (existsSync(INSTALLED_SCRIPT)) unlinkSync(INSTALLED_SCRIPT);
  console.log("codex-conare removed (hook entry + installed script).");
}

function status() {
  const scriptInstalled = existsSync(INSTALLED_SCRIPT);
  let registered = false;
  try {
    registered = (readHooksFile().hooks.SessionStart ?? []).some(OURS);
  } catch {
    // unreadable hooks.json → not registered as far as we can tell
  }
  const creds = existsSync(join(HOME, ".conare", "config.json"));
  console.log(`codex-conare status

  codex dir    ${existsSync(CODEX_DIR) ? "ok" : "MISSING"}  (${CODEX_DIR})
  hook script  ${scriptInstalled ? "ok" : "MISSING"}  (${INSTALLED_SCRIPT})
  registered   ${registered ? "ok" : "MISSING"}  (${HOOKS_JSON})
  credentials  ${creds ? "ok" : "MISSING"}  (~/.conare/config.json — run \`bunx conare@latest\`)`);
  process.exit(scriptInstalled && registered && creds ? 0 : 1);
}

const command = process.argv[2] ?? "install";
if (command === "install") install();
else if (command === "uninstall") uninstall();
else if (command === "status") status();
else {
  console.error(`Unknown command: ${command}\nUsage: codex-conare [install|status|uninstall]`);
  process.exit(1);
}
