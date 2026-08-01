# cms-fhir-2026

CMS-program eCQMs against FHIR R4 / QI-Core for the 2026 measurement year, redistributed
from the CC0 [cqframework/ecqm-content-qicore-2025](https://github.com/cqframework/ecqm-content-qicore-2025)
content. Seed content for Open Quality.

These are not reimplementations. Each package carries the upstream CQL, with a machine-readable
`provenance` block naming the exact commit it came from and any modification made to it.

**Status: Draft.** These packages are examples and works in progress, not final
specifications or clinical guidance.

This collection currently holds the measures listed in
[`../import-report.md`](../import-report.md), imported from the pinned upstream
commit recorded there.

## Provenance

Content is redistributed from the upstream repository named above, under CC0-1.0, with the
commit pinned in every package's `provenance` block and restated in its README. Open Quality
is not a measure steward and is not affiliated with or endorsed by CMS, NCQA, or any other
steward named on these packages.

Six packages are marked `relationship: derived` rather than `unmodified`. In each, licensed
CPT display descriptors were removed from the CQL, keeping the code and the code system. The
`modifications` list in the manifest names every code affected. See
[TERMINOLOGY](../../TERMINOLOGY.md).

## About the steward line

Every package's `steward` field is copied straight from the upstream
`Measure.publisher`. Across the 52 imported packages: 18 show
`steward: Centers for Medicare & Medicaid Services (CMS)`, 9 show
`steward: National Committee for Quality Assurance`, 7 show
`steward: The Joint Commission`, and the remaining 18 are split across 11
other organizations — professional societies, specialty registries, and
public-health bodies — each stewarding one to three measures.

NCQA appearing as steward on 9 packages does not mean this collection
contains HEDIS content. HEDIS is a separate NCQA product with its own
licence, and Open Quality's content policy excludes it. These are
CMS-programme eCQMs published under CC0 through MADiE. The steward of a
measure and the licensor of a specification are different things.
