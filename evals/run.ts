/**
 * Eval runner: sends each labelled diff to the deployed `check_diff` MCP tool
 * and scores the findings. Run: `npm run eval` (or `npm run eval -- <url>`).
 *
 * A case passes when every expected finding is reported (same rule, line
 * within ±1) and no forbidden rule fires. Uses a fresh codex per run so the
 * default starter rules apply with no exceptions.
 */
import { readFile } from "node:fs/promises";

interface Label {
  id: string;
  expected: { ruleId: string; line: number }[];
  forbidden: string[];
}
interface Finding {
  ruleId: string;
  file: string;
  line: number;
}

const url =
  process.argv[2] ??
  "https://codex-guardian.sayyedaribhussain4321.workers.dev/mcp";
const codex = `eval-${Date.now().toString(36)}`;
const dir = new URL(".", import.meta.url);

async function checkDiff(diff: string): Promise<Finding[]> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "check_diff", arguments: { diff, codex } }
    })
  });
  const body = await res.text();
  const data = body.startsWith("{")
    ? body
    : body
        .split("\n")
        .find((line) => line.startsWith("data: "))
        ?.slice(6);
  const message = JSON.parse(data ?? "{}");
  if (message.error) throw new Error(JSON.stringify(message.error));
  return message.result.structuredContent.findings;
}

const { cases } = JSON.parse(
  await readFile(new URL("labels.json", dir), "utf8")
) as { cases: Label[] };

let expectedTotal = 0;
let found = 0;
let forbiddenHits = 0;
let passed = 0;

for (const label of cases) {
  const diff = await readFile(new URL(`cases/${label.id}.diff`, dir), "utf8");
  const findings = await checkDiff(diff);
  const missing = label.expected.filter(
    (e) =>
      !findings.some(
        (f) => f.ruleId === e.ruleId && Math.abs(f.line - e.line) <= 1
      )
  );
  const wrong = findings.filter((f) => label.forbidden.includes(f.ruleId));
  expectedTotal += label.expected.length;
  found += label.expected.length - missing.length;
  forbiddenHits += wrong.length;
  const ok = missing.length === 0 && wrong.length === 0;
  if (ok) passed++;

  const detail = [
    ...missing.map((m) => `missed ${m.ruleId}@${m.line}`),
    ...wrong.map((w) => `false positive ${w.ruleId}@${w.line}`)
  ].join(", ");
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.id.padEnd(18)} ${detail}`);
}

console.log(
  `\n${passed}/${cases.length} cases passed · recall ${found}/${expectedTotal} · ${forbiddenHits} false positive(s) on forbidden rules`
);
process.exitCode = passed === cases.length ? 0 : 1;
