# Five minutes with Open Quality

I ran every command below against this repository and copied every block of
output from that run. Nothing here is illustrative.

You need Node 22 and pnpm.

```bash
git clone https://github.com/FHIR-IQ/openquality
cd openquality
pnpm install
```

## 1. Look at a package

A package is a directory. There is no database and no account.

```bash
ls measures/cms-fhir-2026/breast-cancer-screening
```

```text
README.md
cql
openquality.yaml
```

The manifest is the whole format. This is the end of `openquality.yaml` for that
package:

```yaml
valueSets:
  - oid: 2.16.840.1.113883.3.464.1003.198.12.1005
    url: http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.198.12.1005
    source: vsac
provenance:
  upstream: https://github.com/cqframework/ecqm-content-qicore-2025
  ref: d4e0edd01b7da2a3b43d5360156b43761438190a
  retrieved: 2026-08-01
  relationship: unmodified
```

Two things there are load bearing.

A package references value sets by OID and embeds no expansion. You still expand
them against VSAC with your own account. That account is free, and it is a real
step: the corpus does not remove it.

`relationship: unmodified` is checked rather than asserted. CI re-runs the
importer against that exact upstream commit and fails if the result differs from
the committed tree by a single byte. Where the importer did change a file, the
manifest says `derived` and names what changed.

## 2. Validate it

```bash
pnpm oq validate measures/cms-fhir-2026/breast-cancer-screening
```

```text
Level 1 (Described)
To reach the next level:
  - cql.translate did not run
Note: cql.translate, fhir.validate, and sql.parse will run on publish once
the deep validators exist. Until then Level 1 is the ceiling.
```

Read the last two lines carefully. Level 2 requires CQL translation, FHIR
profile validation, and SQL parsing. None of those exist yet. Every package in
the corpus sits at Level 1, and the tool says so instead of printing a badge it
has not earned.

Across the whole corpus:

```bash
pnpm oq validate-all measures/cms-fhir-2026 measures/community
```

```text
Checked 53 packages, 0 below Level 1
```

## 3. Watch the licensing rule fire

The terminology policy is code, not a paragraph in a README. Write a package
that carries a CPT descriptor:

```cql
library Demo version '0.1.0'

codesystem "CPT": 'http://www.ama-assn.org/go/cpt'

code "Office visit": '99213' from "CPT" display 'Office or other outpatient visit'
```

```bash
pnpm oq validate ./demo-pkg
```

```text
error  cql/Demo.cql code '99213' from "CPT" carries display text. CPT descriptors are licensed and cannot be redistributed. Keep the code and the code system, remove the display string.
warn   cql/Demo.cql file references the CPT code system, which is AMA licensed and cannot be redistributed
Level 0 (Shared)
To reach the next level:
  - content.forbidden reported an error
```

The package drops to Level 0 and the exit code is 1. You may reference the CPT
code and the code system. The descriptor is the licensed expression, so it stays
out. The policy permits LOINC and SNOMED CT display text, and the corpus carries
it with the attribution those licenses require in
[TERMINOLOGY.md](TERMINOLOGY.md).

## 4. Read what someone already learned

This is the part that does not exist anywhere else, and the part with the least
in it. From `knowledge/cms122/2026-001-missing-hba1c-counts-as-poor-control.md`:

> A patient with diabetes and **no** HbA1c result during the measurement period
> counts in the numerator of CMS122 (poor control), not the denominator only.
> This trips up first-time implementers who assume "poor control > 9%" requires
> an actual result above 9%.

The entry carries structured front matter, so it is queryable rather than prose
in a wiki:

```yaml
id: cms122-2026-001
type: interpretation-issue
measure: cms/diabetes-glycemic-status-assessment-greater-than-9
measureVersion: "0.5.0"
status: resolved
categories: [measure-logic, cql]
```

An implementer who reads that before writing their numerator does not ship the
bug. Today there are seven entries, all on one measure.

## What this cannot do yet

- No hosted registry. Git is the distribution channel.
- No execution engine. Open Quality does not run measures against your data.
- No Level 2. The deep validators are not written.
- No HEDIS logic, permanently. NCQA licensing excludes it.
- Seven knowledge entries on one measure, against 53 packages.

That last line is the project. Closing the distance between 53 packages and
seven entries is the whole ask.

## Contribute

The lowest-friction contribution needs no code and no employer sign-off battle:
file one interpretation issue for a measure you have implemented. If you have
ever written an internal memo explaining what a measure spec really means, that
memo is a contribution. See [CONTRIBUTING](CONTRIBUTING.md).
