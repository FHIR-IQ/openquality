---
id: cms122-2026-005
type: test-case
measure: cms/diabetes-glycemic-status-assessment-greater-than-9
measureVersion: "0.5.0"
measurementPeriod: 2026
status: open
categories: [measure-logic, test-data]
reporter: aks129
---

## Summary

A denominator-eligible patient with no glycemic status result in the
measurement period belongs in the numerator. This is the case first-time
implementers get wrong, and it is the one worth running first.

## Input

Referenced, not copied. The upstream repository is about 360 MB, so this
corpus points at the data rather than duplicating it.

- Repository: <https://github.com/cqframework/ecqm-content-qicore-2025>
- Commit: `d4e0edd01b7da2a3b43d5360156b43761438190a`
- Path: `input/tests/measure/CMS122FHIRDiabetesAssessGreaterThan9Percent/ab29ab81-b4fc-4817-bd9c-98d8d4b4a3a3/CMS122FHIR-v0.5.000-NUMPass-LabA1cNoResultInMP.json`

Fetch it with:

```bash
curl -sL "https://raw.githubusercontent.com/cqframework/ecqm-content-qicore-2025/d4e0edd01b7da2a3b43d5360156b43761438190a/input/tests/measure/CMS122FHIRDiabetesAssessGreaterThan9Percent/ab29ab81-b4fc-4817-bd9c-98d8d4b4a3a3/CMS122FHIR-v0.5.000-NUMPass-LabA1cNoResultInMP.json"
```

The bundle includes an `Observation` (`17855-8`, Hemoglobin A1c/Hemoglobin.total
in Blood by calculation, status `corrected`) that carries no `value`: an HbA1c
was ordered and resulted in the measurement period, but with no reportable
quantity. That is the "no result" condition this case is named for, not a
missing order.

## Expected result

Taken from the `MeasureReport` (`MeasureReport-768dd5c9-d00e-4536-a899-235c0c3ac790.json`)
upstream ships alongside the bundle in the same directory, not asserted
independently:

- initial-population: 1
- denominator: 1
- denominator-exclusion: 0
- numerator: 1

The patient is aged 18 to 75, has an active diabetes diagnosis, and has no
valued HbA1c or GMI observation in the measurement period. The measure counts
a missing result as poor control, so the numerator is 1 and not 0.

## Why this one

Logic written as "numerator = patients with a result above 9%" passes every
test with a result and fails only this one. See
[`cms122-2026-001`](../2026-001-missing-hba1c-counts-as-poor-control.md) for
the reasoning behind the behaviour.

## Status

Open: referenced but not yet executed by any tooling in this repository.
Reference execution against a cohort is out of scope until the deep validator
subsystem exists. Recording the case now means it is ready when execution is.
