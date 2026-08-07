# Vision

## The problem

Every US payer, health system, and vendor independently re-implements the same
national quality measures against its own data, and independently rediscovers
the same specification ambiguities. There is no open unit of exchange for
measure logic, and no shared, queryable record of what implementers have
learned.

The cost is documented. US physician practices spend an estimated **$15.4
billion a year** on quality reporting
([Casalino et al., Health Affairs 2016](https://www.healthaffairs.org/doi/10.1377/hlthaff.2015.1258)).
One academic hospital counted 162 externally reported inpatient metrics
consuming about **$5.6 million and 108,000 person-hours in a single year**
([Saraswathula et al., JAMA 2023](https://pubmed.ncbi.nlm.nih.gov/37278813/)).
The [ONC eCQM Issue Tracker](https://oncprojectracking.healthit.gov/support/projects/CQM/summary)
receives roughly **800 new tickets a year**, most of them interpretation
questions — the same ambiguities, rediscovered team by team, answered in a
Jira nobody can query as data.

The direction of travel makes this worse before it makes it better. CMS's
[digital quality measurement roadmap](https://ecqi.healthit.gov/dqm/dqm-strategic-roadmap)
calls for measure calculation built on an open-source core, and NCQA retires
hybrid HEDIS reporting by MY2029. Every SQL shop and every FHIR shop is
converging on the same transition at the same time.

## The mission

Make quality measure logic a shared, verifiable public good: one open corpus
where implementations, their provenance, and what implementers have learned
about them live together — usable equally by SQL shops and FHIR shops.

## The vision

By 2030 — the firmest date the digital transition has — an implementer
anywhere can pull a version-pinned measure package, run its test deck against
their own implementation, and read every known interpretation issue before
writing a line of code. And the corpus is governed by its community, not its
founder.

## What exists today, honestly

- **52 measure packages** under [`measures/`](measures/): the CC0 CMS eCQMs for
  the 2026 reporting year, each self-contained, with machine-readable
  provenance pinned to the upstream commit. A CI drift check re-runs the
  importer and fails on any difference, so "unmodified" is a verified claim,
  not an asserted one.
- **A validation core and CLI** (`oq validate`, `oq validate-all`) with tiered
  conformance levels. Everything currently sits at Level 1: deep validation
  (CQL translation, FHIR profile checks, SQL parsing) does not exist yet, and
  we say so rather than badge it.
- **A typed knowledge corpus** under [`knowledge/`](knowledge/): interpretation
  issues, defects, and test cases, pinned to measure versions and aligned with
  the ONC tracker's categories. Seven entries today, on one measure. This is
  the layer no one else offers — and it is the emptiest. Filling it is the
  point.
- **A terminology policy** ([TERMINOLOGY.md](TERMINOLOGY.md)) enforced by the
  validator, so the corpus stays legally redistributable.

## The next year

These are goals, and they are also asks — each one is something a contributor
can move.

1. **Test decks.** Curated synthetic test cases with expected population counts
   for the ten highest-volume measures — "the cases that catch the classic
   mistakes" — runnable against your own implementation, whatever engine or
   warehouse it lives in. This is the feature every kind of implementer we
   talked to asked for first.
2. **A second maintainer from a different organization**, with real merge
   rights. Governance broadening is written into [GOVERNANCE.md](GOVERNANCE.md);
   this is its first concrete step.
3. **Knowledge corpus growth**: 25+ entries across 10+ measures from 5+
   reporters. If you have ever written an internal memo explaining what a
   measure spec really means, that memo is a contribution — and it is the kind
   your employer can usually approve even when your SQL must stay private.
4. **Citability**: DOI-archived releases and a `CITATION.cff`, so the corpus
   can be named in a methods section and every claim about a measure version
   stays resolvable.
5. **The second reporting year**, imported when upstream publishes it, so
   annual updates become a `git diff` instead of a spring research project.

Not goals for this year: a hosted registry, HEDIS content in any form (NCQA
licensing excludes it permanently), or a measure execution engine.

## How to take part

Read [CONTRIBUTING.md](CONTRIBUTING.md). The lowest-friction, highest-value
contribution needs no code and no employer sign-off battle: file one
interpretation issue or one test case for a measure you have implemented.
The measure and clinical-reasoning community gathers on the FHIR Zulip
[`#cql`](https://chat.fhir.org/#narrow/stream/179220-cql) stream; so do we.
