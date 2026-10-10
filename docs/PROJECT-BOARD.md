# Setting up a GitHub Project board (optional)

Issues, labels and milestones already coordinate the work. A Project board gives maintainers a single view of everything in motion. GitHub Projects cannot be created from files in a repository, so this is a few minutes of clicking.

## Create the board

1. On your profile or organisation, open **Projects** > **New project** > **Board**. Name it "Abundance Hub".
2. Add your repository: in the project, open **Workflows** and turn on **Auto-add to project**, with the filter `is:issue`, and pick this repository. Turn on **Item closed** to set Status to Done.
3. Add the existing issues once: **+ Add item**, then paste or search for issues.

## Suggested columns (Status field)

`Open` · `Claimed` · `In progress` · `Needs report` · `Done`

## Suggested views

- **By scale:** Table, grouped by the `scale:` labels.
- **By phase:** Board, grouped by Milestone.
- **Needs a maintainer:** Table, filtered to `label:type:report -label:verified` so you can see reports waiting to be checked.
- **Chapters:** Table, filtered to `label:type:chapter`.

## Keeping it light

The site and the labels are the source of truth. If the board and an issue disagree, the issue wins. Do not build processes that only live on the board.
