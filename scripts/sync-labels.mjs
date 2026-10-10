// Creates or updates every label listed in .github/labels.json.
//   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo node scripts/sync-labels.mjs

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createClient } from "./lib.mjs";

export async function syncLabels(client) {
  const file = fileURLToPath(new URL("../.github/labels.json", import.meta.url));
  const wanted = JSON.parse(await readFile(file, "utf8"));
  const existing = await client.paginate(`/repos/${client.repo}/labels`);
  const byName = new Map(existing.map((l) => [l.name.toLowerCase(), l]));

  let created = 0;
  let updated = 0;
  for (const label of wanted) {
    const current = byName.get(label.name.toLowerCase());
    if (!current) {
      await client.post(`/repos/${client.repo}/labels`, label);
      created++;
    } else if (current.color !== label.color || (current.description || "") !== label.description) {
      await client.patch(`/repos/${client.repo}/labels/${encodeURIComponent(current.name)}`, {
        new_name: label.name,
        color: label.color,
        description: label.description,
      });
      updated++;
    }
  }
  return { created, updated };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) {
    console.error("Set GITHUB_REPOSITORY, for example owner/repo.");
    process.exit(1);
  }
  const client = createClient(process.env.GITHUB_TOKEN, repo);
  syncLabels(client)
    .then(({ created, updated }) => console.log(`Labels: ${created} created, ${updated} updated.`))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
