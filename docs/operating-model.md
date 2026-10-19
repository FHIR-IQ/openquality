# How Open Quality is developed

Most changes to this repository are made by an agent loop, reviewed by a council of
reviewer agents, and merged once CI and the council both pass. The maintainer sets
direction, owns everything that leaves the repository, and can stop the loop at any
time. This file is the loop's operating policy, approved by the maintainer on
2026-10-19. If the loop's behavior and this file disagree, the file wins, and the
disagreement is a defect. The loop never edits this file; changes to it come from the
maintainer.

The rules are borrowed from lean production because the failure they prevent is the
same one: work that piles up unfinished, defects passed downstream, and effort spent
on what nobody asked for.

## The rules

1. **Stop the line.** If CI on `main` is red, or an issue labelled `stop-the-line` is
   open, the only permitted work is making `main` green. No new work starts.
2. **One piece at a time.** At most one loop pull request (label `loop`) is open. While
   it is open, the loop finishes it or closes it. It does not start a second.
3. **Pull, do not push.** Work comes from demand, in this order:
   1. a broken `main` (rule 1)
   2. the open loop PR (rule 2)
   3. issues labelled `ready`, oldest first. Only the maintainer applies `ready`; that
      label is the demand signal.
   4. a `WARN` or `FAIL` from `pnpm oq validate-all measures/cms-fhir-2026 measures/community`
      whose knowledge entry records a decided fix

   If none of these has work, the loop does nothing. An idle cycle is a correct cycle.
4. **Small batches.** One pull request does one thing. Aim for under 400 changed lines,
   excluding generated files (`measures/cms-fhir-2026/`, `site/`). Larger work is split
   into issues, and the first slice is the pull request.
5. **Build quality in.** Tests come before the change, and the change is verified the
   way CI verifies it before the PR opens. A finding the council raises is fixed in the
   same PR, not filed for later.
6. **Go and see.** A claim about the corpus is checked against the corpus, a claim about
   upstream against the pinned upstream commit, a claim about a standard against the
   standard. Memory and summaries are not evidence.
7. **Make problems visible.** A defect found while doing other work becomes a knowledge
   entry or an issue in the same cycle. It is never fixed silently or left unrecorded.
8. **Record every decision.** Each PR body carries the council's verdicts and the
   reasoning for any judgment call. That is the decision log.

## What the loop may do on its own

- Create branches, commit, push, and open pull requests in this repository.
- Open, comment on and label issues in this repository, except the `ready` label.
- Merge its own pull request, only through GitHub auto-merge, after every required CI
  check passes and the council has passed it unanimously.

## What always goes to the maintainer

The loop prepares these and stops. It never does them itself.

- Anything that leaves this repository: email, Zulip, comments on other repositories,
  upstream issues, HL7 documents.
- Reviews of, or comments on, a pull request from an outside contributor. The loop
  drafts the review in an issue; the maintainer posts it.
- Releases: tags, npm publishes, MCP Registry entries.
- Changing a package's license, the terminology or value-set policy, or `TERMINOLOGY.md`.
- Promoting a warning to an error, or anything else that moves packages below Level 1.
- Moving the pinned upstream commit.
- Repository settings, secrets, branch protection, workflow files, and this file, the
  council agents and the `/cycle` command.
- Applying the `ready` label.
- Any change the council does not pass unanimously.

## The council

Four reviewers, each a Claude Code agent in `.claude/agents/`. Each reads the diff,
this file and `CLAUDE.md`, and returns `PASS`, or `BLOCK` with findings it can point to
in the diff.

| Reviewer | The question it answers |
|---|---|
| `council-provenance` | Is every claim true and every license respected? |
| `council-standards` | Is it correct CQL, FHIR, CRMI and QI-Core? |
| `council-verification` | Do the tests prove the change, and does it follow `CLAUDE.md`? |
| `council-lean` | Was it pulled by demand, is it the smallest change that delivers it, is anything waste? |

A `BLOCK` means the loop fixes the findings and convenes the council again, at most
twice. If it still does not pass, the PR is labelled `needs-maintainer` and left open.

**The limit of this, stated plainly.** The council is the same model checking its own
work through different instructions. It catches a lot, but it is not independent
review. CI is the hard gate, and the list above stays with the maintainer for that
reason.

## Running it

- One cycle: `/cycle` in Claude Code at the repository root.
- On a schedule: a Claude Code routine runs `/cycle` daily.
- Stop it: open an issue labelled `stop-the-line`, or remove the routine.
