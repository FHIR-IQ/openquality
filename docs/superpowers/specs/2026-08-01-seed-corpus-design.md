# Open Quality: Seed Corpus (Design)

Date: 2026-08-01
Status: Approved for planning
Author: Gene Vestel

## 1. What this is

The first of four sub-projects that turn Open Quality from a package format into
a working corpus. It fills `measures/` and `knowledge/` with real content, and
makes the small set of format and tooling changes that real content forces.

The other three sub-projects stay out of scope and keep their own specs: the
deep validator subsystem, the hosted registry, and the community launch. Section
7 explains why an earlier plan to take one slice of the validator subsystem was
dropped.

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
| Level 2 | Out of scope; corpus ships at Level 1 | No runnable translator artifact is published, and per-package translation fails because measures include shared libraries. Cost far exceeded the badge it bought |
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

Sampled `Measure` resources (CMS122, CMS125, CMS165) carry `status: active`,
`experimental: false`, a semver-shaped `version` in the 0.4 to 0.5 range,
`effectivePeriod` of 2026-01-01 to 2026-12-31, and
`publisher: National Committee for Quality Assurance`. Section 5.3 covers what
follows from that.

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

### 5.3 Version, identifiers, and steward

The upstream `Measure` resources do not carry a CMS measure version. Checked
against `CMS122FHIRDiabetesAssessGreaterThan9Percent.json`: `version` is
`0.5.000`, and the identifiers are a short name `CMS122FHIR` and a `cmsId` of
`122FHIR`. There is no `v13` anywhere in the resource.

So the package version is the upstream `Measure.version` normalized to semver:
`0.5.000` becomes `0.5.0`. This is honest about what the content is. Upstream
calls it draft, and a `0.x` version says so. Inventing `13.0.0` from the CMS
eCQM numbering would assert a correspondence to the published QDM measure that
this FHIR translation has not earned.

`measure.identifiers` comes from the `cmsId` and short-name identifiers, giving
`CMS122FHIR`. `measurementPeriod` comes from `effectivePeriod.start`, which is
`2026-01-01`.

**`measure.steward` is `Measure.publisher`, which is the National Committee for
Quality Assurance, not CMS.** Verified on CMS122, CMS125, and CMS165. The
existing hand-written package in `measures/cms-fhir-2026/` declares
`steward: CMS`, version `13.0.0`, and the measure's former title. All three
disagree with upstream, and the import corrects them.

This needs saying plainly somewhere a reader will see it, because the content
policy bans HEDIS and names NCQA as the reason: **these are CMS-program eCQMs
that NCQA stewards, published under CC0 through MADiE. They are not HEDIS
measures.** Steward and licensor are different things. The note belongs in
`measures/cms-fhir-2026/README.md`.

A measure whose version cannot be parsed is skipped, per section 10.

### 5.4 Value set reference form

Upstream writes canonical URLs, `http://cts.nlm.nih.gov/fhir/ValueSet/<oid>`. The
existing hand-written package writes `urn:oid:`. The importer emits `url` with the
canonical form, matching upstream and CRMI, and derives `oid` alongside it.
`checkValueSetRefs` already rejects a `urn:oid:` prefix in the `oid` field, so the
importer must strip it rather than copy it across.

## 6. The importer

`packages/importer`, reading a pinned upstream commit SHA. It lives in
`packages/` rather than `scripts/` so its tests match the existing
`packages/*/test/**/*.test.ts` glob in `vitest.config.ts` and follow the
convention `core` and `cli` already set.

The pinned commit for the first import is
`d4e0edd01b7da2a3b43d5360156b43761438190a`, dated 2026-05-13.

For each measure it emits `measures/cms-fhir-2026/<slug>/` containing:

- `openquality.yaml`, including the provenance block
- `cql/<Library>.cql`, vendored and rewritten per section 4
- `README.md`, generated

**Included libraries are vendored into the package that needs them**, not
published as packages of their own. A measure that includes `FHIRHelpers`,
`QICoreCommon`, and five others gets all of them under its own `cql/`, resolved
transitively.

An earlier draft made each shared library its own package, referenced through
`dependencies`. That was wrong on principle: `manifest.measure.title` is required
for Level 1, so publishing `FHIRHelpers` as a package meant inventing measure
identity for something that is not a measure. A corpus whose value rests on being
accurate about what things are cannot start by mislabelling seventeen of them.

Vendoring costs duplication: the same library file appears in many packages. That
is the correct trade. A package that cannot be read or evaluated without fetching
six others is not a unit of exchange, and package managers already work this way.
The drift check keeps every copy identical, and `dependencies` still records the
relationship as metadata.

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

## 7. Level 2 is out of scope, and the corpus ships at Level 1

An earlier draft of this spec took one slice of the deferred validator
subsystem, the cqframework CQL to ELM translator, so seeded packages could reach
Level 2. Two facts checked during planning killed that.

**There is no runnable translator artifact.** Maven Central publishes
`info.cqframework:cql-to-elm` and `cql-to-elm-cli`, but neither ships a
`jar-with-dependencies`, and the `clinical_quality_language` GitHub release
carries source only, no assets. Running the translator in CI therefore means
assembling a Maven classpath or building from source.

**Per-package translation cannot work the obvious way.** A measure library
includes shared libraries: CMS122 includes seven. Translating a package
directory in isolation fails unless every included library sits beside it.

Together those turn a "one small slice" into a JVM, a dependency-resolution
step, a version pin to maintain, and a new class of CI flakiness, in a project
maintained by one person. The benefit was a badge.

So Level 2 stays deferred with the rest of the validator subsystem. The corpus
ships at Level 1 and says why. This costs the flagship corpus its top rung, and
that is the honest state: upstream cqframework already validates that this
content translates, and re-running it here proves little. The README's status
table already says deep validators are next.

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

Skips are written to a generated `import-report.md` listing each skipped measure
and its reason. Silent truncation would read as complete coverage. The report is
committed alongside the packages.

## 11. CI

Three jobs.

1. `pnpm test`, the existing suite plus the new tests.
2. `oq validate` over every package under `measures/`, with a Level 1 floor, plus
   a terminology scan asserting no licensed display text survived.
3. Drift check: re-run the importer and `git diff --exit-code`.

No JVM and no CQL translation. Section 7 has the reasoning.

Job 4 is what makes the `unmodified` and `derived` claims verifiable. Without it,
a hand edit to a generated package silently falsifies a validated manifest field.

## 12. Testing

Unit tests, each transform in isolation:

- provenance schema and the `manifest.provenance` check, valid and malformed
- terminology scanner, one case per row of the section 4 table
- CPT display stripping, including that the stripped CQL still parses
- version normalization, `0.5.000` to `0.5.0`, and the unparseable case
- canonical URL to OID derivation, including `urn:oid:` prefix stripping
- transitive resolution of included libraries, and vendoring them into the package
- skip conditions, one test per condition in section 10

One fully imported package is committed as a golden fixture so importer changes
appear as reviewable diffs rather than as a silent change across 53 directories.

The integration test is the corpus itself, which is what §5.8 of the registry
design doc already calls for: every package validates in CI at Level 1 or above.

## 13. Build order

1. Format changes: `provenance`, `qi-core`, `TERMINOLOGY.md`, scanner. Small,
   testable, no content in play.
2. The importer, the golden fixture, and the drift check.
3. Showcase packages and hand-written corpus entries, last, informed by what the
   import surfaces.

Steps 1 and 2 are mechanical and reviewable. Step 3 is judgment work and
benefits from everything the earlier steps expose.

## 14. Risks and open questions

**The CPT position needs a legal opinion.** The reasoning is that a code number
plus a system URL is a reference while the descriptor is AMA's copyrightable
expression. That reasoning is not a lawyer's. It should be reviewed before
launch. Residual risk is accepted in the same way the content scanner's residual
risk is accepted, and the takedown process backs it.

**Upstream is draft content.** The source describes itself as draft measures as
they existed in MADiE. Packages inherit that status and say so, and the package
version is the upstream `0.x` version rather than a CMS measure number. The
collection is already marked Draft.

**NCQA appears as the steward on CC0 content.** A reader who knows the content
policy bans HEDIS will see `steward: National Committee for Quality Assurance`
and reasonably ask whether the policy is being broken. It is not: these are
CMS-program eCQMs published under CC0 through MADiE, and HEDIS is a separate
NCQA product. The distinction between steward and licensor needs stating on the
collection README, not buried in this spec. If a future measure in this source
turns out to carry NCQA license terms rather than CC0, it is skipped under
section 10.

**SNOMED CT is free to use, which is not the same as CC0.** A package declaring
`CC0-1.0` while carrying SNOMED CT display text is making a narrower claim than
it appears to. `TERMINOLOGY.md` states the dependency. Whether the manifest
should carry a `terminologyDependencies` field is deferred until the corpus shows
whether the prose statement is enough.

**The corpus cannot demonstrate its own top conformance level.** Every seeded
package sits at Level 1 because no deep validator runs. A visitor sees a
three-rung ladder with nothing on the top rung. Accepted: the alternative was a
fragile CI path to a badge, and claiming Verified without verifying anything
would be the worse failure for this project specifically.

**The annual update is untested until 2027.** The pinned commit and drift check
are designed for it, but the design will not be proven until the 2027 content
lands.

## 15. Success criteria

- About 53 measures imported, every one validating at Level 1 or higher in CI.
- Zero CPT display descriptors in the repository, enforced by the scanner.
- The drift check passing, so every `unmodified` and `derived` claim is verified.
- At least one measure implemented both in CQL and as a SQL-on-FHIR
  ViewDefinition.
- Between 6 and 10 hand-written knowledge corpus entries.
- `import-report.md` accounting for every upstream measure, imported or skipped.
