---
id: cms122-2026-001
type: interpretation-issue
measure: cms/diabetes-glycemic-status-assessment-greater-than-9
measureVersion: "0.5.0"
measurementPeriod: 2026
status: resolved
categories: [measure-logic, cql]
reporter: aks129
---

## Summary

A patient with diabetes and **no** HbA1c result during the measurement period counts in the
numerator of CMS122 (poor control), not the denominator only. This trips up first-time
implementers who assume "poor control > 9%" requires an actual result above 9%.

## Detail

CMS122 measures the percentage of patients 18–75 with diabetes whose most recent HbA1c was
**greater than 9.0% during the measurement period**. The measure treats a **missing** result
the same as a poor-control result: if no HbA1c was performed, or the most recent result is
absent, the patient is counted as poorly controlled.

The naive reading — "numerator = patients with a result > 9%" — undercounts, because it drops
every patient who was never tested. The correct logic is closer to "numerator = patients
whose most recent HbA1c is > 9% **or** who have no qualifying HbA1c result in the period."

Input that exposes the difference: a denominator-eligible diabetic patient with zero
`Observation` HbA1c results in the measurement period. Naive logic excludes them from the
numerator; the measure includes them.

## Resolution

Resolved — this is the intended behavior of the published measure, not a defect. The
numerator logic must count "missing result" as poor control. Implementations should include a
no-result branch in the numerator definition and test it with a patient who has no HbA1c
observation. This entry is seeded as a worked example of the corpus format; corrections and
additional detail are welcome.

Repointed on 2026-08-01 from `cms/diabetes-hba1c-poor-control` version 13.0.0,
which was a hand-written package that disagreed with the upstream content on
steward, version and title. See [`cms122-2026-003`](2026-003-measure-renamed-and-retitled.md).
The measure now also accepts a glucose management indicator result, so the
no-result branch this entry describes must consider both.
