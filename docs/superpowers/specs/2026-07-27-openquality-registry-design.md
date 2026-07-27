# Open Quality: Measure Package Registry (v1 Design)

Date: 2026-07-27
Status: Approved for planning
Author: Gene Vestel

## 1. Problem

Healthcare quality measurement is rebuilt from scratch inside every organization that
does it. Payers, health systems, and vendors each staff quality departments, developer
teams, and abstractors to implement the same national measures against their own data,
then pay auditors to certify that the implementations are correct. The logic is written
repeatedly, the same ambiguities in the same specifications are rediscovered
independently, and the resulting code is almost never shared. The cost lands on the
system as administrative overhead and does not produce better care.

Nothing exists that lets a developer, researcher, physician, or organization find,
share, review, or test measure implementations across stewards and populations. There
is no common unit of exchange for measure logic and no shared place to record what the
community has learned about a given measure.

## 2. What Open Quality Is

A free, public registry of quality measure packages, plus the community that forms
around them. Anyone can publish a package containing measure logic in CQL, SQL,
SQL on FHIR, or any other language, along with FHIR resources, value set references,
and documentation. Anyone can search, browse, install, and give structured feedback.

### v1 scope

Publish, search, browse, validate, and discuss. Seeded at launch with the CMS eCQM
library.

### Explicit non-goals for v1

Scope discipline matters more than feature count here, so these are out and stay out
of v1:

- No execution of measures against data, and no reference result sets.
- No private or organization-only spaces.
- No formal peer review workflow.
- No HEDIS, CPT, or unlicensed VSAC content.
- No in-browser measure authoring tools.

## 3. Decisions

Each of these was chosen deliberately during design. The rationale matters as much as
the choice, because reversing one later is expensive.

| Decision | Choice | Why |
|---|---|---|
| First subsystem | Package registry | Nothing else works without a canonical unit of sharing. |
| Content policy | Public, open licenses only | Legally clean, launchable with no license negotiation. |
| Package format | Open manifest with tiered conformance levels | Accepts SQL shops and FHIR shops both, with a quality ladder. |
| Publish model | Git authored, registry hosted | Version history from git, immutability from the registry, web access for non-developers. |
| QA depth | Static validation on publish | Real automatable signal without building sandboxed execution. |
| Identity | GitHub login, scoped namespaces, verified orgs | Unambiguous provenance, zero credential handling. |
| Cold start | Seed with CMS eCQMs before launch | A registry with nothing in it gets one visit. |
| Stack | Next.js on Vercel, Supabase, one JVM worker | Maintainable by one person, low running cost. |

### 3.1 The licensing constraint

This determines what the community can be, so it is stated up front rather than buried.

CMS eCQM content, including CQL, HQMF, and the eCQI Resource Center packages, is
effectively public and can be redistributed. HEDIS is not. NCQA holds copyright on the
HEDIS measure specifications and licenses them, so publicly posting HEDIS measure logic
violates that license. Value set content carries its own restriction: redistributing
VSAC expansions requires a UMLS license, and CPT codes are AMA licensed.

Open Quality therefore accepts open licensed, publicly redistributable content only.
The practical consequences:

- Every package declares an SPDX license from an allowlist of OSI and Creative Commons
  licenses.
- Value sets are referenced by OID or canonical URL and never embedded as expansions.
  This makes the policy machine enforceable rather than review dependent.
- HEDIS measure logic can never be published. Community authored reimplementations
  against public specifications can be, as can feedback and test cases.

## 4. The Package Model

### 4.1 Manifest

Every package has an `openquality.yaml` at its root.

```yaml
id: gene/hba1c-poor-control        # namespace/name
version: 1.2.0                      # semver, immutable once published
license: Apache-2.0                 # SPDX id, required, from allowlist
measurementPeriod: 2026             # measures are annual; not the package version
measure:
  title: "Diabetes: Hemoglobin A1c Poor Control (>9%)"
  steward: CMS                         # measure steward, distinct from the publisher
  identifiers: [CMS122v13, NQF-0059]   # references to public specs
  type: intermediate-outcome           # process | outcome | structural | ...
  improvementNotation: decrease
  domain: [diabetes, chronic-care]
  setting: [ambulatory]
dataModel: fhir-r4                  # fhir-r4 | qdm-5.6 | omop-5.4 | sql-on-fhir | custom
artifacts:
  - path: cql/HbA1cPoorControl.cql
    type: cql
  - path: sql/hba1c_poor_control.sql
    type: sql
    dialect: bigquery
  - path: fhir/Measure-CMS122.json
    type: fhir/Measure
valueSets:                          # referenced, never embedded
  - oid: 2.16.840.1.113883.3.464.1003.103.12.1001
    source: vsac
dependencies:
  - id: oq/fhir-common-cql
    version: ^2.0.0
```

Two fields carry more weight than their size suggests.

`dataModel` is what makes shared SQL usable by anyone other than its author. SQL written
against an undeclared warehouse schema is unreadable to a stranger, so declaring the
model is what turns a private artifact into a shareable one.

`valueSets` are references only. This is both a licensing control and a correctness
control, since embedded expansions go stale.

### 4.2 Conformance levels

Levels measure rigor, not FHIR adoption. A SQL implementation must be able to reach the
top level, otherwise the majority of the intended audience is permanently second class.

**Level 0, Shared.** Valid manifest, an open license, at least one artifact. Anything
goes.

**Level 1, Described.** Everything in Level 0, plus machine readable measure identity,
a declared data model, every artifact typed, every value set resolvable by OID or
canonical URL, and a README containing defined sections for intent, known limitations,
and provenance.

**Level 2, Verified.** Everything in Level 1, plus deep validation passing for every
artifact, with criteria specific to artifact type:

- CQL translates to ELM with no errors.
- FHIR resources validate against the CRMI and ECR profiles.
- SQL parses against its declared dialect, and the package supplies schema DDL or
  references a public schema such as OMOP or SQL on FHIR ViewDefinitions.

### 4.3 Capability tags

Orthogonal to levels, and signals rather than ranks: `fhir-ecr-compatible`,
`sql-on-fhir`, `omop`, `cql-translatable`.

### 4.4 Versioning and immutability

Semver. A published version is permanently immutable. Authors can deprecate a version
or mark it withdrawn with a stated reason, but never delete or overwrite it, because a
measure cited in an audit has to stay resolvable. Measurement year lives in its own
field rather than being encoded into the version number.

## 5. Architecture

### 5.1 Components

- **Web app.** Next.js on Vercel, serving both the site and the registry API.
- **Postgres.** Supabase. Packages, versions, users, orgs, validation reports, feedback
  threads, search index.
- **Object storage.** Supabase Storage. Immutable package tarballs, content addressed
  by SHA-256 digest.
- **Validator worker.** One container on Fly.io bundling a JVM for the CQL translator
  and the HL7 FHIR validator, plus a Python process for SQL parsing.
- **`oq` CLI and GitHub Action.** Pack, validate locally, publish.
- **Seed importer.** Repeatable script that pulls eCQI Resource Center bundles and
  republishes them under `@cms`.

### 5.2 Publish flow

The load bearing distinction: manifest validation is synchronous and blocking, deep
validation is asynchronous and never blocks.

1. A publish request arrives carrying a scoped token.
2. The API authorizes the namespace, confirms the version does not already exist,
   validates the manifest against its schema, checks the license against the SPDX
   allowlist, enforces size limits, and runs the forbidden content scan. Any failure
   here is a hard rejection and nothing is stored.
3. On success the tarball is written to storage under its digest, a `package_version`
   row is inserted, and a validation job is enqueued in a Postgres jobs table using
   `SELECT ... FOR UPDATE SKIP LOCKED`. No separate queue service.
4. The worker downloads the tarball, runs deep validators, writes a structured
   validation report, computes the conformance level, and updates the row.

Until the worker finishes, the package is live and browsable at Level 0 with a
"validation pending" badge. A worker outage degrades badge quality but never takes
publishing down.

### 5.3 Deep validators

- CQL translation to ELM via the cqframework translator.
- FHIR resource validation against CRMI and ECR profiles via the HL7 validator.
- SQL parsing per declared dialect via sqlglot.
- Value set OID resolution against VSAC, existence check only, expansions never stored.

Two caveats that affect operations. VSAC resolution requires a UMLS API account held by
the service. If VSAC is unreachable, the check reports `unverified` rather than failing
the package.

### 5.4 Forbidden content scanning

Looks for embedded value set expansions, CPT code system declarations, and known HEDIS
and NCQA copyright strings. It is heuristic. It will miss things and it will produce
false positives, so it is a first filter backed by a documented takedown process and a
report button on every package page. It is not a guarantee and must not be described as
one.

### 5.5 Security

Packages are inert. Nothing in a package is executed at publish time and there are no
install scripts, ever. Extraction is hardened against path traversal and decompression
bombs. The registry reads packages, it does not run them.

### 5.6 Search

Postgres full text plus trigram matching. Facets on domain, conformance level, data
model, license, measurement year, and capability tags. No separate search service until
Postgres demonstrably stops coping.

### 5.7 Idempotency and error handling

- Publishing the same `(id, version, digest)` twice is a no-op.
- The same `(id, version)` with a different digest is a hard 409. This is where the
  immutability guarantee is enforced.
- Validation jobs retry with backoff and dead-letter after five attempts, surfacing as
  "validation failed to run", a state kept distinct from "validation found problems".

### 5.8 Testing

Contract tests on the manifest schema. Golden-file tests on validation reports. The real
integration test is the seed import: the full CMS eCQM library must reach Level 2, and
that corpus runs in CI. If a released CMS measure cannot pass the Level 2 bar, the bar
is wrong, and discovering that before launch is most of the value of importing first.

### 5.9 Deferred

A FHIR package registry compatible endpoint, so `cqf-tooling` can install Level 2
packages natively. Small and valuable, but out of v1.

## 6. Design Language

Borrowed from the Awwwards Directory (`awwwards.com/directory`), whose structure fits a
package registry closely, since a registry is a directory.

### 6.1 What the reference does

One typeface throughout, Inter Tight, at three weights: 300 body, 500 UI, 600 display.
Near monochrome. No shadows anywhere, 8px radius everywhere, separation by hairline
borders and background contrast. A large jump in type scale, roughly 127px display down
to 14px body with little in between, and display leading set to 1.0. Color enters only
from content thumbnails plus one accent used for the active filter count.

Card structure: dark media panel on top, then an identity row of circular avatar plus
name plus small superscript status tag, then hairline separated label and value rows,
ending in a compact stats mini-table.

### 6.2 Mapping to measures

Measures have no imagery, which is the obvious objection to borrowing a showcase
layout. The answer is that code is the imagery.

| Reference element | Open Quality equivalent |
|---|---|
| Dark project thumbnail | Syntax highlighted excerpt of the primary artifact, CQL or SQL, on `#222` |
| `PRO` / `INT` superscript tag | Conformance level, `L0` / `L1` / `L2` |
| Location / Website rows | Steward / Data model / Measurement year / Language |
| Awards mini-table (HM, SOTD, SOTM, SOTY) | Validation mini-table (CQL, FHIR, SQL, VS) with pass state |
| Type / Category / Country filter pills | Domain / Data model / Level / Language / Year facets |
| "1971 professionals waiting" | "412 measure packages published" |
| Grid density toggle | Card grid versus compact list, for scanning many measures |

### 6.3 Tokens

```text
--bg:       #F8F8F8     --ink:      #222222     --surface:  #FFFFFF
--panel:    #222222     --hairline: #E6E6E6     --accent:   #FF6B35
font:       Inter Tight 300 / 500 / 600
mono:       JetBrains Mono 400 (code panels, identifiers, versions)
radius:     8px         shadow: none            display leading: 1.0
```

### 6.4 What is not borrowed

The ad marquee, the emoji, the promotional register, and large display type anywhere
except the homepage and directory landing. On a package detail page a full screen
headline is wasted space for someone who came to read code. Dark mode is added, which
the reference does not have, since the audience is developers and the code panel is
dark already.

### 6.5 Risks

The reference leans on genuinely varied agency thumbnails to carry its grid. Syntax
highlighted code is less varied, and a page of FHIR JSON packages could look
monotonous. Mitigation: a second panel type, a small deterministic population flow
diagram generated from the measure definition, initial population to denominator to
exclusions to numerator, used when no good code excerpt exists.

Validation state must never be encoded in color alone. Every pass or fail state carries
an icon and a text label.

## 7. Community Layer

### 7.1 Typed feedback

Feedback is typed, not a comment box, because a generic thread produces noise nobody can
search a year later. Every item is one of five kinds:

- Question
- Interpretation issue
- Defect report
- Implementation note
- Validation result

Threads attach to a package and optionally pin to a specific version, since logic
changes between years and a defect against 1.2.0 may not apply to 2.0.0. Maintainers can
mark a thread acknowledged, resolved, or won't fix, with a reason.

The payoff is that "known interpretation issues for CMS122" becomes a query rather than
an archaeology project. That corpus is arguably more valuable than the code.

### 7.2 Participation

Participation requires GitHub login but not publishing rights, which is how a physician,
abstractor, or researcher takes part without ever touching a package. Verified org
affiliation shows on the author line. A "helpful" count on threads is the only
reputation mechanic in v1. No karma, no voting, no leaderboards.

### 7.3 Moderation

A report button, a published code of conduct, and one admin. That is honest for launch
scale and needs revisiting the moment it is not.

## 8. Governance

Open Quality is not a measure steward and says so on every package page.

Seeded `@cms` packages carry explicit provenance: imported from the eCQI Resource
Center, unmodified, not affiliated with or endorsed by CMS.

Reserved namespaces, locked in the first migration so nobody squats them: `cms`, `ncqa`,
`nqf`, `hl7`, `cqf`, `ahrq`, `jointcommission`, `oq`.

Namespaces support multiple maintainers and ownership transfer. Versions can be
deprecated or withdrawn with a stated reason but never deleted. A documented takedown
process with a named contact backs the licensing policy, since the automated scanner
will miss things.

### 8.1 Outside the spec, required before launch

- Confirm the Open Quality name and domain are available.
- Decide the legal entity that holds liability.
- Decide which organization owns the GitHub organization.
- Obtain a UMLS API account for VSAC value set resolution.

## 9. Phasing

**Phase 0, pre-launch, private.** Manifest schema, CLI, validator worker, CMS seed
import.

**Phase 1, launch.** Public site, search, browse, GitHub auth, publishing, typed
feedback.

**Phase 2.** FHIR package registry endpoint, reference execution against a Synthea
cohort, private org spaces. This is also the revenue path.

**Phase 3.** Formal peer review, consortium spaces for licensed content.

Running cost through Phase 1 is roughly 50 to 100 dollars per month across Vercel,
Supabase, and one Fly container. This matters because it means the project does not need
funding to survive its first year.

## 10. Success Criteria for v1

- The full CMS eCQM library imported and passing at Level 2.
- 25 community published packages within 90 days of launch.
- At least 10 distinct publishing organizations.
- Typed feedback threads on at least a third of published packages.

## 11. Risks

**The largest risk is not cold start and not legal exposure.** It is that quality teams'
measure code is usually treated as proprietary by their employers, so a developer who
wants to share often cannot get approval. The seed import solves an empty site but does
not solve this. Two mitigations belong in the design rather than in marketing:

1. Target constituencies whose incentives already favor openness: academic centers,
   HIEs, digital health vendors who gain from being seen as open, consultants, and the
   existing CQF and eCQI contributor community.
2. Make feedback and test cases first class contributions in their own right. An
   organization that will never release its SQL will often approve publishing a defect
   report or a test case, and that still improves the corpus.

**Cold start.** Mitigated by the CMS seed import.

**Legal exposure from licensed content.** Mitigated by the open license only policy, the
reference-don't-embed rule for value sets, automated scanning, and a documented takedown
process. Residual risk remains and is accepted.

**Single maintainer.** Moderation, takedown response, and operations all depend on one
person in v1. Accepted for launch scale, revisit at Phase 2.
