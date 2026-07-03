#!/usr/bin/env node
// codex-conare SessionStart hook (installed to ~/.conare/hooks/ by `npx codex-conare`).
//
// Injects the precomputed Conare project brief as additionalContext before the
// model's first token — Codex treats plain stdout from a SessionStart hook as
// additionalContext. Fails silent BY DESIGN: any missing prerequisite,
// timeout, or error prints nothing and exits 0 — a hook must never block or
// degrade session start, and no error text may ever reach the model.
//
// https://github.com/conareai/codex-conare

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const VERSION = "1.0.0";
const API_URL = process.env.CONARE_API_URL || "https://api.conare.ai";
// Wall budget for the network fetch. The registered hook timeout is 5s;
// this keeps us well under it so Codex never has to kill us.
const FETCH_BUDGET_MS = 2000;

function readStdinPayload() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

function readApiKey() {
  try {
    const config = JSON.parse(
      readFileSync(join(homedir(), ".conare", "config.json"), "utf8"),
    );
    return typeof config.apiKey === "string" && config.apiKey ? config.apiKey : null;
  } catch {
    return null;
  }
}

// Repo identity = sha256 of the normalized origin remote URL, so the same
// project maps to the same brief regardless of protocol (ssh/https) or local
// checkout path. Remoteless directories fall back to the cwd path.
// Normalization contract (server must match): strip protocol, strip
// credentials, scp-style ':' → '/', strip trailing .git, lowercase.
function normalizeRemote(url) {
  return url
    .replace(/^[a-z+]+:\/\//i, "")
    .replace(/^[^@/]*@/, "")
    .replace(/:/g, "/")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function repoIdentity(cwd) {
  let source = cwd;
  try {
    const remote = execFileSync(
      "git",
      ["-C", cwd, "remote", "get-url", "origin"],
      { stdio: ["ignore", "pipe", "ignore"], timeout: 500 },
    )
      .toString()
      .trim();
    if (remote) source = normalizeRemote(remote);
  } catch {
    // Not a git repo, no origin remote, or git missing — cwd is the identity.
  }
  return createHash("sha256").update(source).digest("hex");
}

async function fetchBrief(apiKey, repo) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_BUDGET_MS);
  try {
    const res = await fetch(
      `${API_URL}/api/hook/brief?repo=${repo}&client=codex`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "User-Agent": `codex-conare/${VERSION}`,
        },
        signal: controller.signal,
      },
    );
    if (res.status !== 200) return "";
    return (await res.text()).trim();
  } catch {
    return ""; // offline / timeout / DNS — silent
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const payload = readStdinPayload();
  const cwd =
    typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();

  const apiKey = readApiKey();
  if (!apiKey) return;

  const brief = await fetchBrief(apiKey, repoIdentity(cwd));
  if (!brief) return;

  // Codex: plain stdout from SessionStart = additionalContext.
  process.stdout.write(brief);
}

main()
  .catch(() => {})
  .finally(() => process.exit(0));
