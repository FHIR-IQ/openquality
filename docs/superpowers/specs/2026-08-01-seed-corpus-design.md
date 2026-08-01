# Open Quality: Seed Corpus (Design)

Date: 2026-08-01
Status: Approved for planning
Author: Gene Vestel

## 1. What this is

The first of four sub-projects that turn Open Quality from a package format into
a working corpus. It fills `measures/` and `knowledge/` with real content, and
makes the small set of format and tooling changes that real content forces.

The other three sub-projects stay out of scope and keep their own specs: the
deep validator subsystem, the hosted registry, and the community launch. The one
exception is `cql.translate`, taken from the validator subsystem for the reason
given in section 7.

Today `measures/` holds one hand-written package and one empty placeholder, and
`knowledge/` holds one entry. The registry design doc
([2026-07-27](2026-07-27-openquality-registry-design.md)) names cold start as a
launch risk and answers it with a seed import. This spec is that import.

### Non-goals

- No hosted registry, no publish API, no search.
- No `fhir.validate`, `sql.parse`, or VSAC resolution.
- No HEDIS, and no content whose license forbids redistribution.
- No fabricated documentation. A section that needs human knowledge stays empty
  and says so.

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| Seed source | `cqframework/ecqm-content-qicore-2025` | CC0-1.0, covers the 2026 reporting year, matches the existing `cms-fhir-2026` collection |
| Seed shape | Bulk import plus hand-built showcase packages | Bulk proves the path scales and survives the annual update; showcase demonstrates what the format is for |
| Import mechanics | Generator script, output committed to git | Git is the registry until the hosted one exists, so the corpus has to be browsable and validate offline |
| Drift detection | CI re-runs the importer and fails on any diff | "Unmodified redistribution" is a validated manifest claim, so it needs to be verifiable |
| SQL side | Author SQL-on-FHIR ViewDefinitions | Uses the existing `sql-on-fhir` data model, needs no format change, and gives the same measure two ways |
| Level 2 | Take `cql.translate` only | Without it every seeded package caps at Level 1 and the top rung of the ladder stays empty |
| Provenance | Validated manifest field | Prose provenance cannot be queried or checked, which is the failure the knowledge corpus exists to prevent |
| Bulk README scope | Import all measures, leave "Known limitations" empty | Empty and honest, and it doubles as the lowest-friction contribution ask |
| Terminology | Per-system policy in `TERMINOLOGY.md` | License terms differ by code system, so one blanket rule is either too strict or too loose |

## 3. Sources, and what was verified

Every claim here was checked against the source rather than assumed.

**`cqframework/ecqm-content-qicore-2025`.** License CC0-1.0. Default branch
`main`, last pushed 2026-05-13. Content: 70 CQL files in `input/cql`, 74 FHIR
`Library` resources, 53 `Measure` resources, and 54 measure test directories
under `input/tests/measure`. Upstream describes it as FHIR measures translated
from the QDM eCQMs published in May 2025 for the 2026 reporting year. The
repository is about 360 MB and the `Library` JSON alone is about 74 MB, so the
import has to be selective.

The split between measures and shared libraries is roughly 53 measures to 17
libraries. The importer derives the exact split from the `Measure` resources
rather than from a hardcoded list.

**`tuva-health/tuva-core`.** License Apache-2.0, actively maintained. Its
`quality_measures` mart holds 8 measures. **Not used.** None of the 8 overlap the
eCQM set, so it gives no side-by-side comparison, and its claims schema is not in
the `dataModel` enum, so every package would land on `custom`. If `custom` is the
answer for every real warehouse schema then the field stops doing the work the
README claims for it. Revisit when the SQL side needs breadth rather than depth.

**`loinc/loinc-fhir-codesystem`.** The canonical FHIR CodeSystem for LOINC is
34,254 bytes with `content value="not-present"` and zero `concept` elements. This
is the precedent for section 4: FHIR publishes the declaration of a large
external terminology and leaves the content to a terminology server.

**`OHDSI/Vocabulary-v5.0`.** Marked `Unlicense`, but that covers the build code
only. The vocabulary data comes from Athena and each source vocabulary keeps its
own license, CPT included. Recorded here so nobody mistakes the repository
license for a content license.

## 4. Terminology policy

Open Quality already refuses to embed value set expansions. The same rule applies
one level down, at the code declaration, but the terms differ by code system, so
the policy is per system rather than blanket.

Declared code systems across the 70 upstream CQL files: LOINC 31, SNOMED CT 30,
CPT 6, ICD-10-CM 5, HCPCS 1, CVX 1, plus HL7 and THO systems.

| Code system | Codes | Display text | Basis |
|---|---|---|---|
| LOINC | yes | yes, with the required attribution | Royalty-free license, attribution required, no modification |
| SNOMED CT | yes | yes | Free to use in the US and other member territories; affiliate terms declared as a dependency |
| ICD-10-CM, HCPCS, CVX | yes | yes | US government content |
| HL7 and THO systems | yes | yes | Published by HL7 |
| CPT | code and system URL only | **no** | No free redistribution path found. The descriptors are the licensed expression |

CPT exposure is small: **12 code declarations across 6 of the 70 CQL files**
(`CMS50` 5, `CMS122` 3, and one each in `CMS56`, `CMS117`, `CMS146`, and
`OncologyPainIntensityQuantified`). Stripping the `display` string is metadata
only, so the CQL still translates. Stripping the `code` declaration itself would
break the logic and is not done.

`TERMINOLOGY.md` at the repository root states this table, the LOINC attribution,
and the SNOMED CT affiliate dependency. The README's current absolute "No CPT
codes" is corrected to match what is actually enforced.

### CPT to SNOMED CT substitution: optional

The AMA announced a SNOMED CT to CPT mapping initiative in July 2026, aimed at
the 1 January 2027 prior authorization deadline. As of this writing **no free,
downloadable, redistributable cross map has been confirmed.** The AMA describes
working sessions and pilots still to come. The SNOMED International validation
notice is archived and states no distribution terms. Commercial vendors still
sell a CPT to SNOMED crosswalk.

The design therefore does not depend on it. Stripping descriptors makes the
corpus clean on its own. A substitution table at `import/cpt-substitutions.yaml`
is built as a seam: one entry per CPT code, carrying the target SNOMED CT
concept, a rationale, and a confidence flag. It starts hand-authored and covers
only codes with a defensible equivalent. `99429 "Unlisted preventive medicine
service"` is expected to have none.

Substitution changes what a measure matches against real data. It is a semantic
change, not a cosmetic one. Every substituted measure therefore gets a generated
knowledge corpus entry of type `implementation-note` naming the swap, the
confidence, and the risk, and its package is marked `derived`.

If the AMA map is published under redistributable terms, the table is regenerated
from it and the hand-authored entries are replaced.

## 5. Package model changes

Four changes to the format, each forced by real content.

### 5.1 `provenance`

A new optional manifest block:

```yaml
provenance:
  upstream: https://github.com/cqframework/ecqm-content-qicore-2025
  ref: <commit sha>
  retrieved: 2026-08-01
  relationship: derived        # unmodified | derived
  modifications:               # required when relationship is derived
    - stripped CPT display descriptors from 3 code declarations
```

A new `manifest.provenance` check validates the block when present and reports no
error when absent. Requiring it on every package would force community authors to
declare an upstream they do not have.

Seeded packages get it because the importer always emits it, and the drift check
proves the committed tree is the importer's output. That is where the guarantee
comes from, not from the schema.

`spec/README.md` gains the field and a CRMI mapping row. This also gives the
CRMI republisher JIRA ticket already drafted in
`docs/outreach/community-launch/03-crmi-alignment-jira.md` a concrete,
experience-backed proposal instead of a hypothetical.

### 5.2 `dataModel` gains `qi-core`

Upstream CQL declares `using QICore version '6.0.0'`. The `DATA_MODELS` enum in
`packages/core/src/manifest.ts` allows `fhir-r4 | qdm-5.6 | omop-5.4 |
sql-on-fhir | custom`, while `spec/README.md` documents `qi-core` as valid. Code
and spec disagree today. Add `qi-core` and align both.

### 5.3 Version mapping

The package version derives from the CMS measure version, so `CMS122v13` becomes
`13.0.0`. The upstream CQL library version, `0.5.000` for CMS122, goes in the
provenance block. A measure whose version cannot be parsed is skipped, per
section 10.

### 5.4 Value set reference form

Upstream writes canonical URLs, `http://cts.nlm.nih.gov/fhir/ValueSet/<oid>`. The
existing hand-written package writes `urn:oid:`. The importer emits `url` with the
canonical form, matching upstream and CRMI, and derives `oid` alongside it.
`checkValueSetRefs` already rejects a `urn:oid:` prefix in the `oid` field, so the
importer must strip it rather than copy it across.

## 6. The importer

`scripts/seed-import.ts`, reading a pinned upstream commit SHA.

For each measure it emits `measures/cms-fhir-2026/<slug>/` containing:

- `openquality.yaml`, including the provenance block
- `cql/<Library>.cql`, vendored and rewritten per section 4
- `README.md`, generated

For each shared CQL library it emits a package under a `cqframework/` namespace.
Measures reference these through the existing `dependencies` field rather than
copying the library into each package, which is what `measures/README.md` already
says the collection should do.

It reads upstream `Measure` JSON for title, identifiers, and description but does
**not** vendor it. Vendoring would add a `fhir/Measure` artifact, and
`requiredDeepChecks` in `packages/core/src/level.ts` would then demand
`fhir.validate`, which is out of scope. The same reasoning excludes the `Library`
JSON, which also carries the 74 MB.

Generated README sections, matching the three `REQUIRED_SECTIONS` in
`packages/core/src/readme.ts`:

- **Intent**: from `Measure.description`.
- **Known limitations**: empty, with a standing invitation to file one and a link
  to the knowledge corpus. Nothing is invented.
- **Provenance**: rendered from the manifest block, naming the upstream commit
  and any modifications.

Test data is referenced by upstream path and commit SHA, never copied.

## 7. Level 2 and `cql.translate`

`computeLevel` caps a package at Level 1 when no deep check runs. A corpus seeded
without any deep validator would show every one of about 53 packages at Level 1.
The three-rung ladder the project uses to explain itself would then have nothing
on its top rung.

So this sub-project takes exactly one slice of the deferred validator subsystem:
the cqframework CQL to ELM translator, run in CI, reporting through the existing
`cql.translate` CheckId that `level.ts` already consumes. `fhir.validate`,
`sql.parse`, and VSAC resolution stay deferred. The cost is a JVM in CI.

This also gives a standing signal on upstream breakage: if a future upstream
revision stops translating, CI says so.

## 8. Showcase packages

Hand-authored, small, and each demonstrating one thing the bulk import cannot.

SQL-on-FHIR ViewDefinition implementations of measures that also exist in the CQL
seed, starting with CMS122, using the existing `sql-on-fhir` data model. Two
independent implementations of one measure, in one corpus, is the clearest
available demonstration that `dataModel` and the conformance ladder do real work.
Where the two disagree, the disagreement is a knowledge corpus entry that writes
itself.

These are authored against the substituted CQL so both implementations agree on
terminology.

The existing `measures/community/hospital-at-home-eligibility/` placeholder is
left alone. It belongs to its proposer.

## 9. Knowledge corpus seeding

Between 6 and 10 entries, hand-written, attached to the showcase packages and to
whatever the import surfaces. Real interpretation issues, implementation notes,
and defects found while importing. Test case entries reference the upstream test
bundles by path and commit SHA rather than copying them.

The generated substitution notes from section 4 are additional to this count and
are marked as generated.

No bulk generation of one entry per measure. A corpus whose value is human
knowledge that is not written down anywhere else is diluted, not helped, by 53
mechanical entries.

## 10. Failure handling

The importer is fail-closed. A measure it cannot map is skipped with a recorded
reason. Skip conditions:

1. No parseable measure version.
2. No `Measure.description` to generate Intent from.
3. Display text from a code system not listed in section 4, so the license status
   is unknown.
4. CQL that does not translate.

Skips are written to a generated `import-report.md` listing each skipped measure
and its reason. Silent truncation would read as complete coverage. The report is
committed alongside the packages.

## 11. CI

Five jobs.

1. `pnpm test`, the existing suite plus the new tests.
2. `oq validate` over every package under `measures/`, with a Level 1 floor.
3. CQL to ELM translation, which lifts seeded CQL packages to Level 2.
4. Drift check: re-run the importer and `git diff --exit-code`.
5. Terminology scan.

Job 4 is what makes the `unmodified` and `derived` claims verifiable. Without it,
a hand edit to a generated package silently falsifies a validated manifest field.

## 12. Testing

Unit tests, each transform in isolation:

- provenance schema and the `manifest.provenance` check, valid and malformed
- terminology scanner, one case per row of the section 4 table
- CPT display stripping, including that the stripped CQL still parses
- version mapping, `CMS122v13` to `13.0.0`, and the unparseable case
- canonical URL to OID derivation, including `urn:oid:` prefix stripping
- dependency wiring to the `cqframework/` library packages
- skip conditions, one test per condition in section 10

One fully imported package is committed as a golden fixture so importer changes
appear as reviewable diffs rather than as a silent change across 53 directories.

The integration test is the corpus itself, which is what §5.8 of the registry
design doc already calls for: every package validates in CI, and CQL packages
reach Level 2.

## 13. Build order

1. Format changes: `provenance`, `qi-core`, `TERMINOLOGY.md`, scanner. Small,
   testable, no content in play.
2. The importer, the golden fixture, and the drift check.
3. `cql.translate` in CI.
4. Showcase packages and hand-written corpus entries, last, informed by what the
   import surfaces.

Steps 1 through 3 are mechanical and reviewable. Step 4 is judgment work and
benefits from everything the earlier steps expose.

## 14. Risks and open questions

**The CPT position needs a legal opinion.** The reasoning is that a code number
plus a system URL is a reference while the descriptor is AMA's copyrightable
expression. That reasoning is not a lawyer's. It should be reviewed before
launch. Residual risk is accepted in the same way the content scanner's residual
risk is accepted, and the takedown process backs it.

**Upstream is draft content.** The source describes itself as draft measures as
they existed in MADiE. Packages inherit that status and say so. The collection is
already marked Draft.

**SNOMED CT is free to use, which is not the same as CC0.** A package declaring
`CC0-1.0` while carrying SNOMED CT display text is making a narrower claim than
it appears to. `TERMINOLOGY.md` states the dependency. Whether the manifest
should carry a `terminologyDependencies` field is deferred until the corpus shows
whether the prose statement is enough.

**A JVM in CI.** New dependency, new failure mode, and slower CI. Accepted
because the alternative is a corpus that cannot demonstrate its own top
conformance level.

**The annual update is untested until 2027.** The pinned commit and drift check
are designed for it, but the design will not be proven until the 2027 content
lands.

## 15. Success criteria

- About 53 measures imported, every one validating at Level 1 or higher in CI.
- Every CQL package reaching Level 2.
- Zero CPT display descriptors in the repository, enforced by the scanner.
- The drift check passing, so every `unmodified` and `derived` claim is verified.
- At least one measure implemented both in CQL and as a SQL-on-FHIR
  ViewDefinition.
- Between 6 and 10 hand-written knowledge corpus entries.
- `import-report.md` accounting for every upstream measure, imported or skipped.
