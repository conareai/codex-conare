// End-to-end smoke test against a throwaway HOME:
//   install → registered correctly, re-install → idempotent,
//   hook with no creds → silent, uninstall → clean, foreign hooks preserved.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const home = mkdtempSync(join(tmpdir(), "codex-conare-smoke-"));
const codexDir = join(home, ".codex");
mkdirSync(codexDir, { recursive: true });

// Pre-existing foreign hook the installer must preserve untouched.
const foreign = {
  matcher: "startup",
  hooks: [{ type: "command", command: "echo someone-elses-hook", timeout: 5 }],
};
writeFileSync(
  join(codexDir, "hooks.json"),
  JSON.stringify({ hooks: { SessionStart: [foreign] } }, null, 2),
);

const env = { ...process.env, HOME: home, CODEX_HOME: codexDir, USERPROFILE: home };
const run = (...args) =>
  execFileSync("node", ["bin/install.js", ...args], { env, encoding: "utf8" });

// install
run("install");
let data = JSON.parse(readFileSync(join(codexDir, "hooks.json"), "utf8"));
assert.equal(data.hooks.SessionStart.length, 2, "foreign hook preserved + ours added");
const registeredCommand = data.hooks.SessionStart[1].hooks[0].command;
assert.equal(typeof registeredCommand, "string", "command must be a shell string (Codex rejects argv arrays)");
assert.ok(registeredCommand.includes("codex-session-start"), "our hook registered");
assert.ok(existsSync(join(home, ".conare", "hooks", "codex-session-start.mjs")), "script copied");

// re-install is idempotent
run("install");
data = JSON.parse(readFileSync(join(codexDir, "hooks.json"), "utf8"));
assert.equal(data.hooks.SessionStart.length, 2, "re-install did not duplicate");

// hook is silent with no credentials
const out = execFileSync(
  "node",
  [join(home, ".conare", "hooks", "codex-session-start.mjs")],
  { env, input: "{}", encoding: "utf8" },
);
assert.equal(out, "", "no credentials ⇒ empty output");

// hook is silent with credentials but unreachable API
mkdirSync(join(home, ".conare"), { recursive: true });
writeFileSync(join(home, ".conare", "config.json"), '{"apiKey":"cmem_smoke"}');
const out2 = execFileSync(
  "node",
  [join(home, ".conare", "hooks", "codex-session-start.mjs")],
  { env: { ...env, CONARE_API_URL: "http://127.0.0.1:9" }, input: "{}", encoding: "utf8" },
);
assert.equal(out2, "", "unreachable API ⇒ empty output");

// uninstall
run("uninstall");
data = JSON.parse(readFileSync(join(codexDir, "hooks.json"), "utf8"));
assert.equal(data.hooks.SessionStart.length, 1, "only foreign hook remains");
assert.ok(!existsSync(join(home, ".conare", "hooks", "codex-session-start.mjs")), "script removed");

console.log("smoke: all assertions passed");
