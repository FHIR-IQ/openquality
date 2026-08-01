---
id: cms122-2026-003
type: implementation-note
measure: cms/diabetes-glycemic-status-assessment-greater-than-9
measureVersion: "0.5.0"
measurementPeriod: 2026
status: resolved
categories: [measure-metadata]
reporter: aks129
---

## Summary

CMS122 is titled "Diabetes: Glycemic Status Assessment Greater Than 9%" in the
2026 FHIR content. Older material calls it "Diabetes: Hemoglobin A1c (HbA1c)
Poor Control (> 9%)". Searching for the old name finds nothing in this corpus.

## Detail

The measure was retitled to reflect that it now accepts a glucose management
indicator (GMI) result as well as an HbA1c result. The logic changed with it:
an implementation that matches only HbA1c will undercount.

Two further naming traps in the same content:

- The upstream `Measure.title` carries a trailing `FHIR`, as in
  "Diabetes: Glycemic Status Assessment Greater Than 9%FHIR". It is an
  artifact of the QDM-to-FHIR translation pipeline, not part of the measure
  name. The Open Quality importer strips it.
- The CQL library is named `CMS122FHIRDiabetesAssessGreaterThan9Percent`,
  which matches neither the old nor the new title.

## Resolution

Resolved as documentation. The package uses the current title, and this entry
exists so a search for the old name reaches it.
