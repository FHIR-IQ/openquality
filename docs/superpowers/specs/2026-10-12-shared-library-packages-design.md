# Shared library packages: design

Date: 2026-10-12
Status: Approved in conversation (stop vendoring), awaiting written-spec review

## Goal

Publish each shared CQL library once, as its own package, and have measure packages
depend on it instead of carrying a copy. This is the shape the January 2027 Clinical
Reasoning connectathon scenario tests: 52 measures resolving against separately published
libraries, loaded in VS Code, CQL Studio, MADiE and HAPI. Bryn Rhodes reports that CRMI
and the tooling already support it.

It also closes `corpus-2026-002` (vendored library duplication) by removing the copies,
not just reporting them.

## What changes for a reader

- A measure package no longer holds `cql/FHIRHelpers.cql` and the other shared
  libraries. Its manifest lists them under `dependencies`.
- Seventeen new library packages appear in `measures/cms-fhir-2026/`.
- **Every output stays self-contained.** `oq fhir-bundle`, `oq fhir-package` and MCP
  `get_bundle` resolve dependencies transitively from the corpus and include them, the
  way CRMI `$package` does. Someone who downloads a measure still gets everything needed
  to evaluate it.

## Measured on 2026-10-12

- 301 CQL files in `cms-fhir-2026`: 52 measure libraries plus copies of **17** shared
  libraries. (The earlier "69 distinct names" counted the 52 measure libraries too.)
- The 17: AHAOverall, AdultOutpatientEncounters, AdvancedIllnessandFrailty,
  AlaraCommonFunctions, Antibiotic, CQMCommon, CumulativeMedicationDuration, FHIRHelpers,
  Hospice, HospitalHarm, PCMaternal, PalliativeCare, QICoreCommon, Status,
  SupplementalDataElements, TJCOverall, VTE.
- All 17 declare `using`: 16 QI-Core 6.0.0, 1 FHIR 4.0.1 (FHIRHelpers). So each can carry
  a `dataModel` and reach Level 1.
- None contains CPT. The display-stripping still runs on them, so this stays true if
  upstream changes.
- No measure includes another measure's main library. The split is clean.

## Design

### 1. Manifest: library identity

A new optional top-level block, alongside `measure`:

```yaml
id: cms/lib-fhirhelpers
version: 4.4.0
library:
  name: FHIRHelpers      # must equal the CQL `library` header
  version: 4.4.000       # the CQL header string exactly, which `include` statements use
```

- The Zod schema stays permissive: `library` is optional, both fields optional
  (convention 1 in CLAUDE.md). The rules live in a module.
- `manifest.measure` (Level 1) passes when the package declares `measure.title` **or**
  `library`. Its message names both options.
- A new Level 1 check, `manifest.library`, owned by a new `library.ts`:
  - `library` and `measure` together: error. A package is one or the other.
  - With `library`: exactly one CQL artifact, whose header name and version equal
    `library.name` and `library.version`. Otherwise error.
  - Without `library`: passes, no findings.
- Added to `CheckId`, `validate.ts` (`checksRun`), `LEVEL_1_CHECKS`, and the `L1_CHECKS`
  fixture in `test/level.test.ts`.

### 2. Manifest: dependencies

The existing, unused `dependencies: [{id, version}]` field carries **direct** includes.
Each library package lists its own direct includes. Transitive closure is computed, never
written down, so there is one source of truth per edge.

Whether a dependency resolves is a property of the corpus, not of one package, so it is
not a Level 1 check:

- `validate-all` reports `dependencies.resolve` errors for any `id@version` that is not a
  package in the directories it validated, and exits non-zero. CI runs `validate-all`, so
  the committed corpus always resolves.
- Single-package `oq validate` does not check it, and says so in its output when the
  manifest has dependencies.

### 3. Importer

- Library package id `cms/lib-<lowercased name>`, directory
  `measures/cms-fhir-2026/lib-<lowercased name>/`. Same collection, so `validate-all`,
  `build-library` and the drift check pick them up with no new roots.
- Version: the CQL header version through `normalizeVersion` (`4.4.000` → `4.4.0`).
  `library.version` keeps the header string.
- Contents: `openquality.yaml`, `README.md`, `cql/<Name>.cql`. Display stripping runs as
  for measures; `relationship` is computed the same way.
- README sections (Intent, Known Limitations, Provenance) are generated. Intent is
  factual: "Shared CQL library <Name> version <v>, included by these measures in this
  collection:" plus the list. Nothing is invented.
- `valueSets` come from the library's own CQL, as for measures.
- Only libraries some imported measure reaches are emitted. A measure with a missing
  include is still skipped, as now.
- Measure packages: `dependencies` lists direct includes. `libraryFileNames` and the
  vendored writes are removed.

### 4. Emitters

- `core` gains `resolveDependencies(manifest, lookup)`: depth-first over `dependencies`,
  deduplicated by id, sorted, cycle-safe, returning the missing ones rather than throwing.
- `buildPackageBundle` and `buildFhirPackage` take the dependencies' CQL as extra members.
  Own artifacts are `composed-of` on the asset-collection Library. Dependencies are
  `depends-on`.
- CLI `fhir-bundle` / `fhir-package` find dependencies by scanning `measures/` from the
  repository root (`--corpus <dir>` to override) and fail with a named error if one is
  missing.

### 5. Catalogue, MCP, site

- `index.json` gains `kind: measure | library` and `dependencies` per package.
- MCP `get_bundle` resolves dependencies through the catalogue. `get_measure` shows
  `dependencies`. `search_measures` gains an optional `kind` filter and defaults to
  measures only, so search results do not fill up with libraries.
- `library.html` lists measures as now, plus a short "Shared libraries" section.
- Counts in public text change carefully: **52 measure packages and 17 library
  packages**, never "69 packages" unqualified.

### 6. Docs and knowledge

- `spec/README.md`, `measures/README.md`, `CLAUDE.md`: vendoring is replaced by
  dependencies. Hand-authored packages (`measures/community/`) may still vendor; that
  stays legal.
- `corpus-2026-002` → `status: resolved`, with the resolution.
- `docs/connectathon-clinical-reasoning.md` Scenario 2 is rewritten from "is vendoring
  broken?" to "do 52 measures resolve against 17 separately published libraries in each
  tool?"

## The invariant that proves it

Before the change, save every measure's `oq fhir-bundle` output (baseline). After, for
each of the 52 measures, the **set of `Library` resources** in the new bundle must equal
the baseline set, compared on CQL content, id, url and version. The only allowed
difference is the asset-collection Library's `relatedArtifact` types. If the set differs
for any measure, a dependency edge is wrong.

That check runs once as a migration test against the baseline. A permanent test then
holds `get_bundle` equal to the CLI bundle (it exists already, and is extended to
dependencies).

## Testing

- `library.ts`: both blocks present, header mismatch, two CQL files, no CQL, valid.
- `manifest.measure`: passes with `library`, fails with neither.
- `resolveDependencies`: chain, diamond, cycle, missing.
- Importer: golden fixture regenerated; a plan test for a library package; a test that
  measures carry no vendored copies.
- `validate-all`: an unresolved dependency fails it.
- MCP: `get_bundle` includes dependencies; `search_measures` excludes libraries by default.
- Full corpus: `pnpm oq-import 2026-08-01` then `git diff` shows only the intended
  restructuring; `validate-all measures/cms-fhir-2026` → 69 packages (52 measures, 17 libraries), 0 below Level 1.

## Risks

- **Every downstream reading packages directly loses the copies.** Tim's CQL Studio demo
  registry may read a CMS package directory. The emitted bundle and npm package stay
  self-contained, but a raw directory read does not. Tell Tim and Preston before merge.
- **The drift check must still pass.** The importer's output is the source of truth, so
  hand edits would fail it. All changes come from the importer.
- **Package versions.** Removing artifacts changes a measure package's contents but not
  its upstream version. The manifest version tracks upstream by design, so it does not
  bump. The commit is the precise reference, as before.
