# The knowledge corpus

The measures are half the value. This is the other half: a shared, typed record of what the
community has learned about each measure — the questions, the ambiguities, the defects, and
the test cases that every implementer otherwise rediscovers on their own.

"Known interpretation issues for CMS122" should be a query, not an archaeology project. That
is what this directory is for.

This is also the contribution an organization will usually approve when it will not approve
releasing the measure logic itself. You can keep your SQL private and still publish the
defect you found, the ambiguity you hit, or the test case that caught it.

## Why it is structured, not a comment thread

A generic comment box produces noise nobody can search a year later. Every entry here is
**typed** and **attached** to a specific measure, and pinned to a version where it matters —
because logic changes between measurement years, and a defect against `13.0.0` may not apply
to `14.0.0`.

The schema is a machine-readable **superset of the categories in the
[ONC eCQM Issue Tracker](https://oncprojectracking.healthit.gov/support/projects/CQM/summary)**
— the public JIRA where measure developers and implementers already file interpretation
questions and get answers from the measure stewards. If you file there, the mapping into
this corpus is direct, and the corpus becomes the open, queryable companion to it.

## Entry types

| Type | What it records |
|------|-----------------|
| `question` | Something ambiguous about how the measure should behave. |
| `interpretation-issue` | A place where the specification can be read two ways, with the readings. |
| `defect` | A concrete error in a published package. |
| `implementation-note` | A lesson learned that saves the next implementer time. |
| `test-case` | An input and the expected result. |
| `validation-result` | The outcome of running a measure against a known cohort. |

## Layout

Most entries live under the measure they concern:

```text
knowledge/
  cms122/
    2026-001-numerator-timing.md
    2026-002-exclusion-ambiguity.md
    test-cases/
      poor-control-boundary.md
```

## Entries that are not about one measure

Some of the most reusable knowledge is not about a measure at all. "Defines
cache and functions do not, so every call re-evaluates the retrieve" is a fact
about how CQL is evaluated. It applies to every measure anyone writes, and
filing it under whichever measure happened to expose it buries it.

An entry like that carries a `scope` instead of a `measure`, and lives in a
directory named for that scope:

```text
knowledge/
  cql/            # the language and how engines evaluate it
  sql-on-fhir/    # ViewDefinitions and the flat schema
  qi-core/        # the profiles and the data model
  corpus/         # how this repository packages and versions things
```

Use `measure:` when the entry is about a measure, and `scope:` when it is not.
Do not set both. An entry with neither has no home and will not appear in the
library.

The id is prefixed with the scope rather than the measure, so
`corpus-2026-002` rather than `cms122-2026-007`. That prefix is the honest
statement of what the entry is about, and it is how a reader knows before
opening the file whether it applies to them.

## Entry format

Each entry is a Markdown file with a YAML front matter header, then a free-text body.

```yaml
---
id: cms122-2026-002                       # stable, unique within the measure
type: interpretation-issue                 # one of the types above
measure: cms/diabetes-glycemic-status-assessment-greater-than-9   # the package id it concerns
# ...or, when the entry is not about one measure, a scope instead:
#   scope: cql                              # cql | sql-on-fhir | qi-core | corpus
measureVersion: "0.5.0"                     # pin when the issue is version-specific
measurementPeriod: 2026
status: open                                # open | acknowledged | resolved | wont-fix
# Optional cross-reference to where this was also filed, so the corpus stays
# continuous with the official trackers:
externalRef:
  tracker: onc-ecqm-issue-tracker           # onc-ecqm-issue-tracker | onc-cql-issue-tracker | eki
  id: CQM-1234
categories: [measure-logic, cql]            # aligned to the eCQM Issue Tracker categories
reporter: your-github-handle
---

## Summary

One or two sentences stating the issue.

## Detail

The two readings, the input that exposes them, and why it matters for the result.

## Resolution

Filled in when the thread reaches acknowledged / resolved / wont-fix, with the reason.
```

`status` mirrors how a maintainer or steward dispositions the thread: **open**,
**acknowledged**, **resolved**, or **wont-fix**, always with a stated reason once it leaves
`open`.

## Test cases

A `test-case` entry carries an input bundle (or a reference to one) and the expected result,
so it can be run rather than just read. Put the input data next to the entry or reference a
package fixture. These are the entries that turn the corpus from prose into something
executable.

## Contributing an entry

See [CONTRIBUTING](../CONTRIBUTING.md#2-file-an-interpretation-issue-or-a-test-case). This
is the highest-value, lowest-friction way to contribute, and it needs only a GitHub account.
