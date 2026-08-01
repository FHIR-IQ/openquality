---
id: cms122-2026-004
type: implementation-note
measure: cms/diabetes-glycemic-status-assessment-greater-than-9
measureVersion: "0.5.0"
measurementPeriod: 2026
status: resolved
categories: [measure-metadata, licensing]
reporter: aks129
---

## Summary

The steward of CMS122 is the National Committee for Quality Assurance, not
CMS. NCQA is not the dominant steward across the imported collection, but it
stewards enough of it that the distinction is worth stating once here rather
than relearning it measure by measure.

## Detail

`Measure.publisher` in the upstream FHIR content reads
`National Committee for Quality Assurance` for CMS122 and several other
measures in the same import. Across all 52 packages in
`measures/cms-fhir-2026/`: 18 name CMS as steward, 9 name NCQA, 7 name The
Joint Commission, and the remaining 18 are split across 11 other
organizations — professional societies, specialty registries, and
public-health bodies. NCQA is the second most common steward, not the most
common, and no single steward is a majority. The measures are still
CMS-programme eCQMs, published through MADiE and redistributable under CC0.

The distinction that resolves the apparent conflict with the content policy:
**the steward of a measure and the licensor of a specification are different
things.** NCQA develops and stewards a number of eCQMs whose specifications
CMS publishes openly. HEDIS is a separate NCQA product, separately licensed,
and none of it is in this corpus.

An earlier hand-written package in this repository recorded `steward: CMS`
for this measure. That was wrong, and the import corrected it.

## Resolution

Resolved. The manifest records the steward as upstream states it, and
`measures/cms-fhir-2026/README.md` gives the full breakdown across the
collection so a reader does not have to reconstruct it.
