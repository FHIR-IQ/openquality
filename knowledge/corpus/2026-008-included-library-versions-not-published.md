---
id: corpus-2026-008
scope: corpus
type: defect
measurementPeriod: 2026
status: open
categories: [packaging, cql]
reporter: aks129
---

## Summary

Seventeen imported measures, and one imported library, include a shared CQL library at a
version the corpus does not carry. Each includes an older version than the one upstream
publishes in `input/cql`. The importer matches includes by library name only, so it pairs
every one of them with the newer library, and nothing reported the difference until
`oq validate-all` gained the `cql.includes` warning on 2026-10-18.

## What was observed

At the pinned upstream commit
(`cqframework/ecqm-content-qicore-2025@d4e0edd01b7da2a3b43d5360156b43761438190a`), the
measure CQL in `input/cql` includes these versions, while `input/cql` holds the version
on the right:

| Included | Published in `input/cql` | Includes | Older copy elsewhere upstream |
|---|---|---|---|
| Status 1.13.000 | 1.15.000 | 9 | `bundles/mat/CMS996FHIR-v1.4.001-FHIR6/cql/` |
| Hospice 6.15.000 | 6.18.000 | 8 | none |
| CQMCommon 4.0.000 | 4.1.000 | 4 | none |
| CQMCommon 3.0.000 | 4.1.000 | 1 | `bundles/mat/CMS832FHIR-R1-MeasureExport/cql/` |
| CumulativeMedicationDuration 5.0.000 | 6.0.000 | 2 | `bundles/mat/CMS832FHIR-R1-MeasureExport/cql/` |
| TJCOverall 8.23.000 | 8.24.000 | 2 | `bundles/mat/CMS108FHIR/cql/` |
| QICoreCommon 3.0.000 | 4.0.000 | 1 | `bundles/mat/CMS832FHIR-R1-MeasureExport/cql/` |
| PalliativeCare 1.15.000 | 1.18.000 | 1 | none |
| AlaraCommonFunctions 1.6.000 | 1.10.000 | 1 | none |

"Includes" counts `include` statements across the 18 imported packages. The QICoreCommon
3.0.000 and CQMCommon 3.0.000 includes are in `cms/lib-hospitalharm`; the rest are in
measures. Run `pnpm oq validate-all measures/cms-fhir-2026 measures/community` for the
full list by package and file.

This predates shared library packages. The Library set recorded before that change
(`tools/test/fixtures/library-sets-2026-10-12.json`) already pairs
`cms/appropriate-testing-for-pharyngitis`, which includes Status 1.13.000, with Status
1.15.000. Vendoring copied the newer file under the older name; it did not cause the gap
and did not close it.

The one community package with a warning is a separate case:
`community/hospital-at-home-eligibility` includes FHIRHelpers 4.0.1 and neither carries
nor depends on any FHIRHelpers. The corpus has only FHIRHelpers 4.4.000.

## What is not known

Whether this matters to a consumer. That depends on how each tool resolves a library
include, and nothing here has tested it: the repository has no CQL translator, so
`cql.translate` is unimplemented. A tool that resolves by name will load these bundles.
A tool that requires the exact included version will not find the library for 17
measures. Which tools do which is the question for Scenario 2 of
[the connectathon scenario](../../docs/connectathon-clinical-reasoning.md).

Also unknown: whether upstream intends the mismatch (the measures were authored against
the older libraries and not yet re-pointed) or would treat it as a defect.

## Consequences in this corpus

- A measure's `dependencies` name a library package by package version, and the version
  is taken from the library upstream publishes, not from the measure's `include`.
- The `depends-on` canonicals in an emitted bundle carry the newer version. The measure's
  CQL inside the same bundle names the older one.
- `corpus-2026-002` says a measure "still loads on its own". For these 17 measures, that
  holds only for a tool that resolves includes by name.

## Options, none taken yet

1. Report it upstream to `cqframework/ecqm-content-qicore-2025` and re-import once the
   includes are aligned. Changes nothing here until upstream changes.
2. Import the older versions that exist in `bundles/mat` as additional library packages.
   Covers 15 of the 29 imported includes; Hospice 6.15.000, CQMCommon 4.0.000, PalliativeCare
   1.15.000 and AlaraCommonFunctions 1.6.000 have no source in the pinned commit.
3. Have the importer state the substitution in each affected package's README and
   manifest `modifications`. Accurate, but the CQL itself is unmodified, so this needs a
   way to say "the dependency differs from the include" that the provenance block does
   not have yet.
4. Promote `cql.includes` from warning to error. That would drop these 18 imported
   packages and the hospital at home package below Level 1 and fail CI, so it waits on
   one of the above.
