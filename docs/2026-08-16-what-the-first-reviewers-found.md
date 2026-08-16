# What the first reviewers found

Open Quality has existed for twenty days. In that time four people outside the project
read it and pushed back. Three of the validator's rules, two of its defects, one of its
features and two corrected public claims came from them.

This page records what each of them found, what changed, and what is still open. It is
here for two reasons. The people who found these things should be credited for it, and
the fastest way to understand a project is to read what it got wrong.

## The pattern worth noticing

Not one of the four started by publishing a measure.

All four arrived with a problem: a bug, a claim that was not true, a design that would
not hold, or a use case the tool did not serve. Three of the defects they found were in
the validator rather than in any measure. The corpus was fine. The thing that judges the
corpus was wrong.

[CONTRIBUTING](../CONTRIBUTING.md) lists "publish a measure package" first and "file an
interpretation issue or a test case" second. Everything observed so far runs the other
way round. People arrive holding a problem, not a package.

That is not a disappointment. It is what this repository is for. The measures are the
half anyone can copy from CMS. The record of what breaks when you implement them is the
half that does not exist anywhere else.

## What each reviewer found

### Three ways a scanner can lie

Recorded as [corpus-2026-003](../knowledge/corpus/2026-003-one-value-set-two-cql-aliases.md),
[corpus-2026-004](../knowledge/corpus/2026-004-undeclared-symlink-hid-content-from-the-scanner.md),
[corpus-2026-005](../knowledge/corpus/2026-005-the-scanner-trusted-its-own-parser.md) and
[corpus-2026-006](../knowledge/corpus/2026-006-verifying-a-provenance-claim-without-fetching.md).

The content scanner is what enforces the licensing policy this project's credibility
rests on. It was wrong in three ways, all the same shape: it answered "I found nothing"
when the honest answer was "I was not looking there."

- Content behind an undeclared symlink was never read. Packages now reject symlinks
  outright (`bb783f5`).
- A file the scanner could not parse was treated as clean. It now fails closed and says
  it could not read the file (`6f3e89c`).
- One value set referenced under two aliases went uncounted (`968437e`).

The same reviewer proposed a provenance ledger. Working through it showed the design
could not deliver what it promised, and the reasoning is recorded rather than discarded
(`24f0d7e`). A rejected design that explains itself is worth more than a silent no.

### Defines cache and functions do not

Evan Machusak, recorded as
[cql-2026-001](../knowledge/cql/2026-001-prefer-defines-because-function-caching-is-not-guaranteed.md).

Engines in common use evaluate a define once per patient and reuse the result. They do
not reliably do the same for a function call, so logic written as functions re-runs its
retrieves on every invocation. Restructuring one eligibility library from functions into
prefiltered defines took it from 30 to 40 seconds per patient to under a second, with the
same results.

He then corrected the first version of the entry. Caching is an engine implementation
choice, not a rule of the language, and the entry had stated it as a rule (`332d1b9`).
The correction matters more than the original: an entry that overstates its own certainty
is the failure mode this corpus has to avoid.

### Packages that load in tools nobody had to modify

A reviewer building a CQL teaching environment asked the most useful question anyone has
asked about this project: if CRMI already specifies this, what does another
implementation add?

The answer is that Open Quality is not a package format. It ingests whatever standard
format a measure arrives in and publishes it in whatever format a tool already reads.
The value is the shared corpus and the knowledge attached to it, not the container.

Two things changed. `oq fhir-package` now emits a FHIR NPM package, so the corpus loads
in existing tools with no changes on their side (`fffd761`). The README also stopped
claiming a CRMI emitter that did not exist (`19e51be`). The second was the more important
fix. Overstating a rule in documentation is a defect equal to understating it in code.

### A hang, a Windows bug, and how search should actually work

Tim Schwirtlich ([@tschwirt](https://github.com/tschwirt)), pull requests
[#4](https://github.com/FHIR-IQ/openquality/pull/4) and
[#5](https://github.com/FHIR-IQ/openquality/pull/5).

The first person outside the project to run the tool on his own measure, and he arrived
with two defects.

- **The validator hung.** A regular expression introduced while fixing the scanner
  backtracked exponentially on comment lines. Twenty comment lines took 240 ms and every
  additional line doubled it. His file would have run for hours. Comments are now blanked
  in a separate linear pass, and the case is a permanent test (`6c5f231`).
- **Headings were not recognised on Windows.** README sections split on `\n` alone, so a
  CRLF file looked like it was missing every required section. His fix is PR #5, and it
  carries the test.
- **Search does not work the way anyone searches.** He looks for a clinical concept
  first, then narrows by population and care setting. The library searches titles,
  stewards and CMS identifiers. The manifest has fields for clinical domain and care
  setting, and 52 of 53 packages leave them empty. Step one half works by accident and
  step two does not exist.
- **Citation needs an immutable artifact.** A moving branch cannot be cited in a
  dissertation. This makes a tagged release the next thing rather than a later thing.

## What is still open

These are real, they are scoped, and any of them is a genuine contribution. Each links to
the form that files it.

| # | Problem | Why it matters |
|---|---|---|
| 1 | 52 of 53 measures have no recorded knowledge | The corpus is a measure list until this changes. One entry against a measure you have implemented is the highest-value thing anyone can add. |
| 2 | No clinical-concept search | `measure.domain` and `measure.setting` are empty in 52 of 53 packages, so the search people actually perform cannot be built. |
| 3 | No citable release | A moving branch cannot be cited. A tagged release with a DOI unblocks academic use. |
| 4 | Level 2 is unreachable | `cql.translate`, `fhir.validate` and `sql.parse` are named in the code and unimplemented. Every package tops out at Level 1, and the README says so. |
| 5 | The Vercel check fails on pull requests from forks | A contributor sees a red mark they cannot clear and did not cause. |

Numbers 1 and 2 are the ones that need people rather than maintainer time.

## How to take one

You do not need to install anything, and you do not need to be certain you are right.

1. Open the [library](https://openquality.us/library) and find a measure you have
   implemented.
2. Use the links on it: ask a question, report an ambiguity, report a defect, or add a
   test case. Each opens a form with the measure and version already filled in.
3. A maintainer turns the thread into a typed entry under `knowledge/`, pinned to the
   measure and the version, credited to you.

"I could not tell which of two readings was intended" is a complete contribution. So is
"your validator is wrong," which is how four of the five items above got found.

---

*Two of the four reviewers are named here because their contributions are already public:
Tim Schwirtlich through his pull requests, Evan Machusak through the entry he is credited
in. The other two gave feedback privately and are described without names until they say
otherwise.*
