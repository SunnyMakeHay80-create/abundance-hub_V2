// Creates the phase milestones and one issue per task in docs/data/tasks.json.
// Safe to run again: tasks that already exist (matched by a hidden task-id marker) are skipped.
//   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo node scripts/seed-issues.mjs [--dry-run]

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createClient } from "./lib.mjs";
import { syncLabels } from "./sync-labels.mjs";

const MILESTONES = [
  { phase: "0", title: "Phase 0: Foundations", due: "2027-12-31", description: "Late 2026 to 2027. Form local groups, publish baselines, launch easy wins." },
  { phase: "1", title: "Phase 1: Deploy what works", due: "2030-12-31", description: "2027 to 2030. Build solar, wind, storage and grids; reach people without power; retrofit homes." },
  { phase: "2", title: "Phase 2: Firm power and cooperation", due: "2040-12-31", description: "2030 to 2040. Add geothermal, long-duration storage and nuclear; electrify; link grids." },
  { phase: "3", title: "Phase 3: Abundance and sharing", due: "2055-12-31", description: "2040 to 2055. High clean electricity; shift savings into housing, health, education and science." },
];

const SCALE_NAMES = {
  person: "Person",
  household: "Household",
  neighbourhood: "Neighbourhood",
  "city-region": "City or region",
  national: "Nation",
  global: "Global",
};

export function taskMarker(id) {
  return `<!-- task-id: ${id} -->`;
}

export function buildIssueBody(task) {
  const needs = task.needs.map((n) => n[0].toUpperCase() + n.slice(1)).join(", ");
  return [
    task.body,
    "",
    `**How we will measure it:** ${task.measure}`,
    "",
    `**Scale:** ${SCALE_NAMES[task.scale]}  `,
    `**Needs it helps with:** ${needs}`,
    "",
    "---",
    "**Want to take this on?** Comment `/claim` so others know. Comment `/release` if you need to step back.",
    "When you have done something, open a [report](../issues/new?template=report-action.yml) and link this issue.",
    "",
    taskMarker(task.id),
  ].join("\n");
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error("Set GITHUB_REPOSITORY, for example owner/repo.");
  const dryRun = process.argv.includes("--dry-run");
  const client = createClient(process.env.GITHUB_TOKEN, repo);

  const file = fileURLToPath(new URL("../docs/data/tasks.json", import.meta.url));
  const tasks = JSON.parse(await readFile(file, "utf8"));

  if (dryRun) {
    console.log(`Dry run: would create up to ${tasks.length} issues and ${MILESTONES.length} milestones.`);
    return;
  }

  const labelResult = await syncLabels(client);
  console.log(`Labels: ${labelResult.created} created, ${labelResult.updated} updated.`);

  // Milestones
  const existingMilestones = await client.paginate(`/repos/${repo}/milestones?state=all`);
  const milestoneByPhase = {};
  for (const m of MILESTONES) {
    let found = existingMilestones.find((e) => e.title === m.title);
    if (!found) {
      found = await client.post(`/repos/${repo}/milestones`, {
        title: m.title,
        description: m.description,
        due_on: `${m.due}T12:00:00Z`,
      });
      console.log(`Created milestone: ${m.title}`);
    }
    milestoneByPhase[m.phase] = found.number;
  }

  // Issues
  const existingIssues = await client.paginate(`/repos/${repo}/issues?state=all`);
  const seen = new Set();
  for (const issue of existingIssues) {
    const match = (issue.body || "").match(/<!-- task-id: ([\w-]+) -->/);
    if (match) seen.add(match[1]);
  }

  let created = 0;
  for (const task of tasks) {
    if (seen.has(task.id)) continue;
    const labels = [
      "type:task",
      `scale:${task.scale}`,
      `phase:${task.phase}`,
      ...task.needs.map((n) => `need:${n}`),
      "help wanted",
    ];
    if (task.phase === "0" && (task.scale === "person" || task.scale === "household")) {
      labels.push("good first task");
    }
    await client.post(`/repos/${repo}/issues`, {
      title: task.title,
      body: buildIssueBody(task),
      labels,
      milestone: milestoneByPhase[task.phase],
    });
    created++;
    console.log(`Created: ${task.title}`);
    // Stay well inside GitHub's secondary rate limits for content creation.
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log(`Done. ${created} new issues, ${tasks.length - created} already existed.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
