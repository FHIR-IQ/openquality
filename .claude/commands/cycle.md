---
description: Run one cycle of the Open Quality development loop under docs/operating-model.md
---

Run exactly one cycle of the development loop. `docs/operating-model.md` is the policy;
read it first and follow it over anything here. Never do what it reserves for the
maintainer. Never edit `docs/operating-model.md`, `.claude/agents/`, `.claude/commands/`
or `.github/workflows/`.

## 1. Check the line

- `gh issue list --label stop-the-line --state open`. If any: report and stop.
- `gh run list --branch main --workflow CI --limit 1`. If the latest run failed, the work
  item is making `main` green. Go to step 3.

## 2. Pull one work item

- `gh pr list --label loop --state open`. If one exists, it is the work item: fix its
  failing checks or council findings, or close it if it is no longer wanted. Go to step 3.
- Otherwise take the oldest issue labelled `ready` (`gh issue list --label ready --state open`).
- Otherwise check `pnpm oq validate-all measures/cms-fhir-2026 measures/community` for a
  finding whose knowledge entry records a decided fix.
- If there is nothing, report "idle: no demand" and stop. Do not invent work.

If the item is too big for one PR under the batch rule, split it into issues, comment
the split on the original issue, and take the first slice.

## 3. Build it

1. `git checkout -b loop/<short-name> origin/main`.
2. Go and see: read the code, corpus and upstream that the item concerns.
3. Write the failing test first, then the change.
4. Run `pnpm test`, `pnpm typecheck` and
   `pnpm oq validate-all measures/cms-fhir-2026 measures/community`. If the importer
   changed, also `pnpm oq-import 2026-08-01 && git diff --exit-code -- measures/`.
   If a catalogue input changed, run `pnpm build-library`.
5. Anything else you notice that is wrong becomes an issue or a knowledge entry, not
   part of this diff.

## 4. Convene the council

Commit, then run the four reviewers in parallel with the Agent tool:
`council-provenance`, `council-standards`, `council-verification`, `council-lean`.
Give each the work item (issue number and text) and tell it to review
`git diff origin/main...HEAD`.

- Any BLOCK: fix the findings, commit, and convene all four again. At most two rounds.
- Still blocked after two rounds: push, open the PR with label `loop` and
  `needs-maintainer`, put the open findings in the body, and stop.

## 5. Ship

- Push and open the PR with label `loop`. The body holds: the work item it closes
  (`Closes #n`), what changed, how it was verified, and each reviewer's verdict and
  findings with how they were resolved. End with the attribution line from the session.
- Only with four PASS verdicts: `gh pr merge --auto --squash`. GitHub merges once the
  required checks pass.

## 6. Report

End with three lines: the work item, the outcome (merged-pending-checks,
needs-maintainer, idle, stopped), and the link.
