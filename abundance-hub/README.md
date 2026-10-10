# Abundance Hub

A website and a set of GitHub tools for coordinating people to carry out the [Abundance Plan](plan/PLAN.md): a peaceful path to a world where energy is abundant and everyone has what they need.

GitHub does the coordinating:

| GitHub feature | What it does here |
|---|---|
| **Pages** | Publishes the public site from the `docs/` folder. |
| **Issues** | Each task, report, chapter and proposal is an issue. Issue forms collect structured information. |
| **Labels** | Tag every issue by scale, phase and need, so people can filter to what is theirs. |
| **Milestones** | One per phase of the roadmap. Their progress bars appear on the site. |
| **Actions** | Label and welcome new issues, handle `/claim` and `/release`, and rebuild the site's live numbers. |
| **Discussions** | Open conversation, questions and ideas. |
| **Projects** | An optional board for maintainers (see [docs/PROJECT-BOARD.md](docs/PROJECT-BOARD.md)). |

## Set it up (about 15 minutes)

You need a GitHub account. A free account and a public repository are enough.

1. **Create the repository.** On GitHub, create a new public repository, for example `abundance-hub`, and upload everything in this folder to it (including the hidden `.github` folder). With the command line: `git init`, `git add .`, `git commit -m "Start the hub"`, then follow GitHub's "push an existing repository" instructions.
2. **Point the links at your repository.** In `.github/ISSUE_TEMPLATE/config.yml`, replace `OWNER/REPO` with your own, for example `my-name/abundance-hub`.
3. **Let Actions write.** Settings > Actions > General > Workflow permissions: choose **Read and write permissions**. The progress workflow needs this to save the site's numbers.
4. **Turn on Pages.** Settings > Pages > Build and deployment: Source **Deploy from a branch**, Branch **main**, Folder **/docs**. After a minute your site is at `https://YOUR-NAME.github.io/abundance-hub/`.
5. **Turn on Discussions.** Settings > General > Features > Discussions.
6. **Seed the starter tasks.** Actions tab > **Seed starter tasks** > Run workflow. It creates the labels, the four phase milestones and 36 starter tasks. Leave "dry run" unticked. This takes a couple of minutes because it paces itself to stay within GitHub's rate limits.
7. **Check the site.** Open your Pages address. The task list now shows live issues. If you see the starter notice, wait for the **Update progress data** workflow to finish (you can also run it by hand from the Actions tab).
8. **Add maintainers.** Settings > Collaborators. Maintainers add the `verified` label to checked reports. See [GOVERNANCE.md](GOVERNANCE.md).

Using a custom domain? Set `repo` in `docs/config.js` (for example `"my-name/abundance-hub"`) because the site can no longer work it out from the address.

## How people use it

1. **Pick a task** on the site, filtered by scale, need and phase.
2. **Claim it** by commenting `/claim` on the issue. `/release` hands it back.
3. **Do it**, and bring others along.
4. **Report it** with the *Report an action* form. A maintainer checks it and adds `verified`. Reported and verified numbers are shown separately.
5. **Start a chapter** with the *Start or list a local chapter* form so neighbours can find each other.
6. **Propose tasks** and **correct numbers** with their own forms.

## What is in this repository

```
docs/                    The website (GitHub Pages serves this folder)
  index.html, styles.css, app.js, config.js
  data/goals.json        Goals, baselines, targets and phases
  data/tasks.json        The 36 starter tasks (also the source for seeding)
  data/progress.json     Live numbers, rebuilt by an Action
plan/PLAN.md             Short version of the plan
scripts/                 Node scripts (no dependencies): progress, labels, seeding, tests
.github/
  ISSUE_TEMPLATE/        Forms: report, chapter, proposal, data correction
  workflows/             progress, seed-tasks, sync-labels, triage, ci
  labels.json            Every label and its meaning
CONTRIBUTING.md  CODE_OF_CONDUCT.md  GOVERNANCE.md  SECURITY.md
```

## Customising

- **Tasks:** edit `docs/data/tasks.json`. Run **Seed starter tasks** again; only new tasks are created. Existing issues are matched by a hidden task id and are not changed.
- **Goals and baselines:** edit `docs/data/goals.json`, or let people file *Correct a number* issues.
- **Labels:** edit `.github/labels.json`. The **Sync labels** workflow applies changes.
- **Look and feel:** `docs/styles.css`. Colours are variables at the top, with a dark mode.
- **Check your changes:** `node scripts/test.mjs` (Node 20 or newer). The same checks run on every pull request.

## Things to know

- **Numbers are self-reported until verified.** The site shows both. Decide with your maintainers what evidence you need before adding `verified`.
- **Issues are public.** The forms ask for a city or region, not an address. Remove anything personal that people post by mistake.
- **Progress updates are commits.** The workflow commits `docs/data/progress.json` when something changes. If you protect the `main` branch, allow GitHub Actions to push, or the update will fail.
- **The site makes no outside requests.** System fonts, no trackers, no libraries. It reads only its own `data/` files.
- **Star Trek.** The plan takes inspiration from the Federation. The hub is an independent community project and uses no Star Trek names or imagery.

## Licence

Code is MIT-licensed (see [LICENSE](LICENSE)). You may want a different licence for the written plan, for example Creative Commons Attribution; if so, say so here and add the licence file.
