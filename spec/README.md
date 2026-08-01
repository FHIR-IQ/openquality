# Open Quality package specification

This directory defines the Open Quality package format, the conformance levels, and how both
map onto the HL7 **Canonical Resource Management Infrastructure (CRMI)** Implementation
Guide. The design rationale behind these choices lives in
[`../docs/superpowers/specs/`](../docs/superpowers/specs/).

The guiding decision: the `openquality.yaml` manifest is a friendly, SQL-inclusive front
door for authors, and CRMI is the interoperability target underneath it. A package is
authored as a simple directory and can be emitted as a CRMI artifact bundle that
CRMI-aware tooling — cqframework tooling, Reason Health's toolkit, and DEQM evaluators —
can consume. Open Quality tracks CRMI rather than inventing a parallel model.

## The package

A package is a directory with an `openquality.yaml` manifest and the artifacts it declares.

```yaml
id: cms/diabetes-hba1c-poor-control        # namespace/name
version: 13.0.0                            # semver, immutable once published
license: CC0-1.0                           # SPDX id, from the allowlist
measurementPeriod: 2026                    # the measurement year, not the package version
measure:
  title: "Diabetes: Hemoglobin A1c Poor Control (> 9%)"
  steward: CMS                             # the measure steward, distinct from the publisher
  identifiers: [CMS122v13, NQF-0059]
dataModel: fhir-r4                         # fhir-r4 | qi-core | qdm-5.6 | omop-5.4 | sql-on-fhir | custom
artifacts:
  - path: cql/DiabetesHemoglobinA1cPoorControl.cql
    type: cql
valueSets:                                 # referenced, never embedded
  - oid: 2.16.840.1.113883.3.464.1003.103.12.1001
    source: vsac
provenance:                                # required for redistributed content
  upstream: https://github.com/cqframework/ecqm-content-qicore-2025
  ref: d4e0edd01b7da2a3b43d5360156b43761438190a
  retrieved: 2026-08-01
  relationship: unmodified                 # unmodified | derived
dependencies:
  - id: cqframework/FHIRHelpers
    version: ^4.0.0
```

Two fields carry more weight than their size suggests. `dataModel` is what makes shared SQL
usable by anyone other than its author. `valueSets` are references only — a licensing
control and a correctness control, since embedded expansions go stale.

## Conformance levels

Levels measure rigor, not FHIR adoption. A SQL-only package can reach the top.

| Level | Name | Requires |
|-------|------|----------|
| 0 | Shared | Valid manifest, an open license, at least one artifact. Any language. |
| 1 | Described | Level 0, plus a declared data model, typed artifacts, value sets resolvable by OID or canonical URL, and a README stating intent, known limitations, and provenance. |
| 2 | Verified | Level 1, plus deep validation passing per artifact: CQL translates to ELM; FHIR resources validate against the CRMI and QI-Core profiles; SQL parses against its declared dialect and ships its schema. |

Local validation reaches Level 1. Level 2 runs on publish, where the deep validators run.

## Mapping to CRMI

CRMI models a knowledge artifact along four independent capability axes — **Shareable**,
**Computable**, **Publishable**, and **Executable** — and packages an artifact plus its
dependencies as a FHIR Bundle. Open Quality's fields and levels map onto that model as
follows.

### Fields

| Open Quality | CRMI / FHIR |
|--------------|-------------|
| `id` (namespace/name) | Canonical `url` (globally unique, version-independent) |
| `version` (semver, immutable) | Business `version` (CRMI CR 3.3), independent of resource history; immutability = CRMI released content |
| `license` | `crmi-license` extension, SPDX code |
| `measurementPeriod` | `effectivePeriod` |
| `measure.title` / `steward` / `identifiers` | `Measure.title` / `publisher` / `identifier` |
| `dataModel` | The declared model (QI-Core, US Core, OMOP, SQL-on-FHIR ViewDefinition) |
| `artifacts[type: cql]` | A `Library` with `Library.content` |
| `valueSets` (OID reference) | A `depends-on` dependency, resolved through the version manifest; expansions never embedded |
| `provenance` | `RelatedArtifact` of type `derived-from`, plus `Provenance` on the bundle |
| `dependencies` | `relatedArtifact` of type `depends-on` / `composed-of` |
| the package as a whole | A CRMI artifact Bundle whose first entry is an `asset-collection` Library (`CRMIManifestLibrary`) |

### Levels

| Open Quality level | CRMI capability |
|--------------------|-----------------|
| Level 0, Shared | **Shareable** — `url`, `version`, `title`, `status`, `description` |
| Level 1, Described | Shareable plus **Publishable** metadata — data model, provenance, resolvable references |
| Level 2, Verified | **Computable** and, where applicable, **Executable** — CQL translates to ELM; profiles validate |

### Lifecycle and versioning

Open Quality follows CRMI's status model: an artifact is **draft**, **active**, or
**retired**, an active artifact never returns to draft (a new version is required instead),
and a retired artifact never returns to active. Versions are immutable once published;
withdrawal carries a stated reason and nothing is deleted, so a measure cited in an audit
stays resolvable. Value-set version stability is handled the CRMI way, through a version
manifest that pins the versions used, rather than by embedding expansions.

### Distribution

A package can be emitted as a CRMI artifact bundle via the `$package` shape — the target
artifact plus its traced dependencies, first entry an outcome manifest that characterizes
the bundle. This is what lets an Open Quality package be installed and evaluated by tooling
that has never heard of `openquality.yaml`. Packaging measures as standard FHIR NPM
packages, registered through the FHIR package registry, is the near-term interoperability
goal.

## Status of this spec

Draft, and tracking CRMI as it ballots. Where this document and CRMI, the Quality Measure
IG, or CQL disagree, those specifications win and this one is corrected. Corrections and
proposals go through the process in [GOVERNANCE](../GOVERNANCE.md).
