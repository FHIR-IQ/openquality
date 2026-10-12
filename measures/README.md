# Measure collections

This directory holds Open Quality measure packages, grouped into collections. The layout
follows the pattern the [cqframework content repositories](https://github.com/cqframework/ecqm-content)
use: collections are named by their data model and measurement year, and each carries a
status so a reader knows what to trust.

The measures here are examples and works in progress. Nothing in this directory should be
taken as a final specification or as clinical guidance. Publishing them in the open is how
the community finds the conventions that work.

## Collections

| Collection | Description | Status |
|------------|-------------|--------|
| [`cms-fhir-2026/`](cms-fhir-2026/) | CMS eCQMs for the 2026 reporting year, redistributed from the CC0 cqframework QI-Core content with provenance on each package. Seed content. | Draft |
| [`community/`](community/) | Contributed measures across clinical and functional areas, not tied to a single program. | Draft |

More collections get added as content arrives — a `sql-on-fhir` collection for
ViewDefinition-based measures, additional program and year collections, and so on. New
collections earn their place when there is content to fill them, not before.

[`TEMPLATE/`](TEMPLATE/) is not a collection and not a measure. It is a package skeleton to
copy, annotated field by field, and it reaches Level 1 as it stands. It sits outside both
collections on purpose, so it is never counted in the corpus and never appears in the
library. CI validates it on every pull request so it cannot drift from the rules.

## Status

Every collection carries one of three statuses, with the same meanings cqframework uses:

- **Draft** — under active development, changes frequently.
- **Active** — considered stable and supporting direct testing. Fixes still land, but the
  content is not changing day to day.
- **Retired** — no longer updated, kept for historical and legacy testing.

## Naming

Collections are named `<program-or-source>-<data-model>-<year>`:

- `cms-fhir-2026` — CMS-sourced, FHIR R4, 2026 measurement year.
- `community` — no single source or year; contributed measures live here until a more
  specific collection exists for them.

## What a collection contains

Each collection is a set of packages. A package is a directory with an `openquality.yaml`
manifest and the artifacts it declares — the format is in [`../spec/`](../spec/). Value
sets are referenced by OID or canonical URL and never embedded, which keeps licensed
terminology out of the repository.

Where measures share logic, prefer reusing a published cqframework common library such as
`FHIRHelpers` or `QICoreCommon` over writing a new one.

Shared libraries are published once, as packages of their own. In `cms-fhir-2026` the 52
measures depend on 17 library packages (`lib-fhirhelpers`, `lib-qicorecommon` and so on),
and each measure's manifest lists the ones its CQL includes directly under `dependencies`.
A library package declares `library` (its CQL name and header version) in place of
`measure`.

A package still works on its own. `oq fhir-bundle` and `oq fhir-package` resolve
dependencies transitively and include every library in what they emit, as CRMI `$package`
does, and `oq validate-all` fails if a dependency is missing from the corpus.

Until 2026-10-12 each measure carried its own copy of every library it included, 301 CQL
files where 69 were distinct. That history, and why it changed, is in
[`../knowledge/corpus/2026-002-vendored-library-duplication.md`](../knowledge/corpus/2026-002-vendored-library-duplication.md).
A hand-authored package may still carry its own copy of a library; that remains valid.

## Contributing a measure

See [CONTRIBUTING](../CONTRIBUTING.md). Open an issue first if you are not sure which
collection your measure belongs in.
