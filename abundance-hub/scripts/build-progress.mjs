// Builds docs/data/progress.json from the repository's issues and milestones.
// Run by .github/workflows/progress.yml. Local use:
//   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo node scripts/build-progress.mjs

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createClient, parseForm, toNumber, labelNames, labelValue, labelValues, isBot,
  SCALES, PHASES, NEEDS,
} from "./lib.mjs";

const MAX_OPEN_TASKS = 150;
const MAX_CHAPTERS = 100;

function emptyImpact() {
  return { reports: 0, people: 0, households: 0, kwh: 0 };
}

/** Pure function: turns raw issues and milestones into the data the site reads. */
export function aggregate({ repo, issues, milestones, now = new Date() }) {
  const [owner, name] = repo.split("/");
  const real = issues.filter((i) => !i.pull_request);

  const byScale = Object.fromEntries(SCALES.map((s) => [s, { open: 0, done: 0 }]));
  const byPhase = Object.fromEntries(PHASES.map((p) => [p, { open: 0, done: 0 }]));
  const byNeed = Object.fromEntries(NEEDS.map((n) => [n, { open: 0, done: 0 }]));
  const impact = { reported: emptyImpact(), verified: emptyImpact() };
  const tasks = [];
  const chapters = [];
  const participants = new Set();
  let openTasks = 0;
  let doneTasks = 0;

  for (const issue of real) {
    const labels = labelNames(issue);
    if (!isBot(issue.user)) participants.add(issue.user.login);
    const state = issue.state === "closed" ? "done" : "open";

    if (labels.includes("type:task")) {
      const scale = labelValue(labels, "scale:");
      const phase = labelValue(labels, "phase:");
      if (state === "open") openTasks++;
      else doneTasks++;
      if (scale && byScale[scale]) byScale[scale][state]++;
      if (phase && byPhase[phase]) byPhase[phase][state]++;
      for (const need of labelValues(labels, "need:")) if (byNeed[need]) byNeed[need][state]++;

      if (state === "open" && tasks.length < MAX_OPEN_TASKS) {
        tasks.push({
          number: issue.number,
          title: issue.title,
          url: issue.html_url,
          scale,
          phase,
          needs: labelValues(labels, "need:"),
          claimed: labels.includes("status:claimed"),
          blocked: labels.includes("status:blocked"),
          firstTask: labels.includes("good first task"),
          comments: issue.comments || 0,
        });
      }
    }

    if (labels.includes("type:report")) {
      const form = parseForm(issue.body);
      const bucket = labels.includes("verified") ? ["reported", "verified"] : ["reported"];
      for (const key of bucket) {
        impact[key].reports++;
        impact[key].people += toNumber(form["People involved"]);
        impact[key].households += toNumber(form["Households reached"]);
        impact[key].kwh += toNumber(form["Energy saved or generated per year (kWh)"]);
      }
    }

    if (labels.includes("type:chapter") && state === "open" && chapters.length < MAX_CHAPTERS) {
      const form = parseForm(issue.body);
      chapters.push({
        number: issue.number,
        title: issue.title.replace(/^Chapter:\s*/i, ""),
        url: issue.html_url,
        region: form["City or region"] || "",
        scale: form["Scale"] || "",
      });
    }
  }

  tasks.sort((a, b) => {
    const rank = (t) => (t.firstTask ? 0 : 1) + (t.claimed ? 2 : 0);
    return rank(a) - rank(b) || (a.phase || "9").localeCompare(b.phase || "9") || a.number - b.number;
  });

  return {
    generatedAt: now.toISOString(),
    repo: { owner, name, url: `https://github.com/${owner}/${name}` },
    totals: {
      openTasks,
      doneTasks,
      chapters: chapters.length,
      participants: participants.size,
    },
    impact,
    byScale,
    byPhase,
    byNeed,
    milestones: milestones.map((m) => ({
      title: m.title,
      open: m.open_issues,
      closed: m.closed_issues,
      dueOn: m.due_on,
      url: m.html_url,
    })),
    tasks,
    chapters,
  };
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error("Set GITHUB_REPOSITORY, for example owner/repo.");
  const client = createClient(process.env.GITHUB_TOKEN, repo);

  const issues = await client.paginate(`/repos/${repo}/issues?state=all&sort=created&direction=asc`);
  const milestones = await client.paginate(`/repos/${repo}/milestones?state=all&sort=due_on&direction=asc`);
  const data = aggregate({ repo, issues, milestones });

  const out = fileURLToPath(new URL("../docs/data/progress.json", import.meta.url));
  await mkdir(dirname(out), { recursive: true });

  // Skip the write when nothing but the timestamp changed, so the history stays quiet.
  try {
    const previous = JSON.parse(await readFile(out, "utf8"));
    const strip = ({ generatedAt, ...rest }) => JSON.stringify(rest);
    if (strip(previous) === strip(data)) {
      console.log("No changes to progress data.");
      return;
    }
  } catch {
    // No previous file, or it could not be read: write a fresh one.
  }
  await writeFile(out, JSON.stringify(data, null, 2) + "\n");
  console.log(
    `Wrote progress.json: ${data.totals.openTasks} open and ${data.totals.doneTasks} done tasks, ` +
    `${data.impact.reported.reports} reports, ${data.totals.chapters} chapters.`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
