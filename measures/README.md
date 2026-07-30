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
| [`cms-fhir-2026/`](cms-fhir-2026/) | Community reimplementations of published CMS eCQMs against FHIR R4 / QI-Core, for the 2026 measurement year. Seed content. | Draft |
| [`community/`](community/) | Contributed measures across clinical and functional areas, not tied to a single program. | Draft |

More collections get added as content arrives — a `sql-on-fhir` collection for
ViewDefinition-based measures, additional program and year collections, and so on. New
collections earn their place when there is content to fill them, not before.

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

Where measures in a collection share logic, they share a common library rather than copying
it, the same way the eCQM content repositories share `FHIRHelpers`, `FHIRCommon`, and
`QICoreCommon`. Prefer reusing the published cqframework common libraries over writing new
ones.

## Contributing a measure

See [CONTRIBUTING](../CONTRIBUTING.md). Open an issue first if you are not sure which
collection your measure belongs in.
