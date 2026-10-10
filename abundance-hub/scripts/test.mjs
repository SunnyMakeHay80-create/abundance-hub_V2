// Run with: node scripts/test.mjs
// Checks the parsing, the aggregation and the data files. No network, no dependencies.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseForm, toNumber, SCALES, PHASES, NEEDS } from "./lib.mjs";
import { aggregate } from "./build-progress.mjs";
import { buildIssueBody, taskMarker } from "./seed-issues.mjs";

const read = async (rel) => JSON.parse(await readFile(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));
let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}\n     ${err.message}`);
    process.exitCode = 1;
  }
}

await test("parseForm reads issue-form sections and treats _No response_ as empty", () => {
  const body = [
    "### Scale", "", "Neighbourhood", "",
    "### People involved", "", "12", "",
    "### Evidence", "", "_No response_",
  ].join("\n");
  const form = parseForm(body);
  assert.equal(form["Scale"], "Neighbourhood");
  assert.equal(form["People involved"], "12");
  assert.equal(form["Evidence"], "");
  assert.deepEqual(parseForm(null), {});
});

await test("toNumber copes with commas, words and nonsense", () => {
  assert.equal(toNumber("1,200"), 1200);
  assert.equal(toNumber("about 40 households"), 40);
  assert.equal(toNumber("none"), 0);
  assert.equal(toNumber("-5"), 0);
  assert.equal(toNumber(""), 0);
  assert.equal(toNumber("99999999999999999999"), 1e12);
});

await test("aggregate counts tasks, impact, chapters and verified reports", () => {
  const user = (login, type = "User") => ({ login, type });
  const issues = [
    { number: 1, title: "Task A", state: "open", html_url: "u1", user: user("ann"), comments: 2,
      labels: [{ name: "type:task" }, { name: "scale:household" }, { name: "phase:0" }, { name: "need:energy" }, { name: "good first task" }] },
    { number: 2, title: "Task B", state: "closed", html_url: "u2", user: user("bob"),
      labels: [{ name: "type:task" }, { name: "scale:global" }, { name: "phase:2" }, { name: "need:safety" }] },
    { number: 3, title: "Task C", state: "open", html_url: "u3", user: user("ann"),
      labels: [{ name: "type:task" }, { name: "scale:person" }, { name: "phase:0" }, { name: "status:claimed" }] },
    { number: 4, title: "Report: solar", state: "open", html_url: "u4", user: user("cy"),
      body: "### People involved\n\n10\n\n### Households reached\n\n4\n\n### Energy saved or generated per year (kWh)\n\n2,000",
      labels: [{ name: "type:report" }, { name: "verified" }] },
    { number: 5, title: "Report: swap", state: "open", html_url: "u5", user: user("di"),
      body: "### People involved\n\n5\n\n### Households reached\n\n_No response_",
      labels: [{ name: "type:report" }] },
    { number: 6, title: "Chapter: Leeds", state: "open", html_url: "u6", user: user("ed"),
      body: "### City or region\n\nLeeds, UK\n\n### Scale\n\nCity or region",
      labels: [{ name: "type:chapter" }] },
    { number: 7, title: "A pull request", state: "open", html_url: "u7", user: user("fay"), pull_request: {}, labels: [] },
    { number: 8, title: "Bot noise", state: "open", html_url: "u8", user: user("dependabot[bot]", "Bot"), labels: [] },
  ];
  const data = aggregate({ repo: "me/hub", issues, milestones: [], now: new Date("2026-10-10T00:00:00Z") });

  assert.equal(data.repo.url, "https://github.com/me/hub");
  assert.equal(data.totals.openTasks, 2);
  assert.equal(data.totals.doneTasks, 1);
  assert.equal(data.totals.chapters, 1);
  assert.equal(data.totals.participants, 5, "ann, bob, cy, di, ed; not the PR author or the bot");
  assert.equal(data.byScale.household.open, 1);
  assert.equal(data.byScale.global.done, 1);
  assert.equal(data.byPhase["0"].open, 2);
  assert.equal(data.byNeed.energy.open, 1);
  assert.equal(data.impact.reported.reports, 2);
  assert.equal(data.impact.reported.people, 15);
  assert.equal(data.impact.reported.households, 4);
  assert.equal(data.impact.reported.kwh, 2000);
  assert.equal(data.impact.verified.reports, 1);
  assert.equal(data.impact.verified.people, 10);
  assert.equal(data.chapters[0].region, "Leeds, UK");
  assert.equal(data.chapters[0].title, "Leeds");
  assert.equal(data.tasks[0].number, 1, "good first task sorts first");
  assert.equal(data.tasks[1].number, 3, "claimed task sorts last");
});

await test("every task in docs/data/tasks.json is valid, unique and uses known labels", async () => {
  const tasks = await read("../docs/data/tasks.json");
  const labels = new Set((await read("../.github/labels.json")).map((l) => l.name));
  const ids = new Set();
  assert.ok(tasks.length >= 30, "expected a full set of starter tasks");
  for (const t of tasks) {
    assert.ok(t.id && !ids.has(t.id), `duplicate or missing id: ${t.id}`);
    ids.add(t.id);
    assert.ok(SCALES.includes(t.scale), `${t.id}: bad scale ${t.scale}`);
    assert.ok(PHASES.includes(t.phase), `${t.id}: bad phase ${t.phase}`);
    assert.ok(t.title && t.body && t.measure, `${t.id}: missing title, body or measure`);
    assert.ok(t.needs.length > 0, `${t.id}: needs at least one need`);
    for (const n of t.needs) assert.ok(NEEDS.includes(n), `${t.id}: bad need ${n}`);
    for (const l of [`scale:${t.scale}`, `phase:${t.phase}`, ...t.needs.map((n) => `need:${n}`)]) {
      assert.ok(labels.has(l), `${t.id}: label ${l} is not in labels.json`);
    }
  }
  for (const scale of SCALES) {
    assert.ok(tasks.some((t) => t.scale === scale), `no starter tasks at scale ${scale}`);
  }
});

await test("issue body includes the dedupe marker and the measure", async () => {
  const [task] = await read("../docs/data/tasks.json");
  const body = buildIssueBody(task);
  assert.ok(body.includes(taskMarker(task.id)));
  assert.ok(body.includes(task.measure));
  assert.ok(body.includes("/claim"));
});

await test("goals.json is well formed", async () => {
  const goals = await read("../docs/data/goals.json");
  assert.equal(goals.phases.length, 4);
  for (const g of goals.goals) {
    assert.ok(g.id && g.label && g.baseline, `goal ${g.id} is incomplete`);
    for (const year of ["2030", "2040", "2050"]) assert.ok(g.targets[year], `goal ${g.id} lacks a ${year} target`);
    assert.ok(NEEDS.includes(g.need) || g.need === "safety", `goal ${g.id}: unknown need ${g.need}`);
  }
});

await test("seed progress.json parses and has the shape the site expects", async () => {
  const p = await read("../docs/data/progress.json");
  for (const key of ["generatedAt", "repo", "totals", "impact", "byScale", "byPhase", "milestones", "tasks", "chapters"]) {
    assert.ok(key in p, `progress.json lacks ${key}`);
  }
});

console.log(`\n${passed} checks passed${process.exitCode ? ", some failed" : ""}.`);
