---
id: cms122-2026-006
type: implementation-note
measure: cms/diabetes-glycemic-status-assessment-greater-than-9
measureVersion: "0.5.0"
measurementPeriod: 2026
status: open
categories: [measure-logic, clinical-evidence]
reporter: codex
---

## Summary

Not meeting CMS122FHIR's poor-control numerator does not mean that a patient has
achieved an appropriate individualized glycemic goal.

## Detail

Reviewed on 2026-11-03. The pinned [CQL](../../measures/cms-fhir-2026/diabetes-glycemic-status-assessment-greater-than-9/cql/CMS122FHIRDiabetesAssessGreaterThan9Percent.cql)
counts an assessment above 9%, a selected assessment without a result, or no
assessment in the numerator. It considers HbA1c and glucose management indicator.
The [existing missing-result note](2026-001-missing-hba1c-counts-as-poor-control.md)
explains why absence of testing must not be dropped.

The [ADA Standards of Care 2026, section 6](https://doi.org/10.2337/dc26-s006)
recommends an A1C goal below 7% for many nonpregnant adults, while individualizing
goals for treatment risks, frailty, function, and comorbidity. It also addresses
CGM time in range and hypoglycemia. Thus, a qualifying A1C of 8% can be outside
the measure's elevated-result branch while above an individual's treatment goal.
Conversely, intensification solely to achieve a uniform low A1C can be unsuitable
for someone at substantial hypoglycemia risk.

The same ADA section summarizes foundational trial evidence and its limitations;
this note relies on that guideline synthesis rather than independently reviewing
each underlying trial. The measure does not by itself assess comprehensive
cardiovascular or kidney risk management.

## Resolution

Open for clinical review. Keep poor-control reporting, missing assessments, and
individualized goal attainment distinct in explanations. Proposed tests should
include a value exactly at 9%, above 9%, missing results, and HbA1c/GMI selection.
These are test proposals; no CQL execution or new clinical target is established
by this note.
