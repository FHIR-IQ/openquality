---
id: cms165-2026-001
type: implementation-note
measure: cms/controlling-high-blood-pressure
measureVersion: "0.5.0"
measurementPeriod: 2026
status: open
categories: [measure-logic, clinical-evidence]
reporter: codex
---

## Summary

CMS165FHIR's below-140/90 numerator threshold should not be presented as the
clinical treatment goal in the 2025 multisociety hypertension guideline.

## Detail

Reviewed on 2026-11-03. The pinned [CQL](../../measures/cms-fhir-2026/controlling-high-blood-pressure/cql/CMS165FHIRControllingHighBloodPressure.cql)
requires systolic pressure below 140 and diastolic pressure below 90 mmHg. It
selects the lowest respective readings on the most recent blood-pressure day.
For an otherwise eligible, nonexcluded patient whose only qualifying readings
are 135/85, those two threshold expressions are true. This is a static reading
of the source, not an executed patient test.

The [published 2026 CMS165v14 QDM specification](https://ecqi.healthit.gov/sites/default/files/ecqm/measures/CMS165-v14.0.000-QDM.html)
also uses below 140/90. This establishes a shared threshold, not equivalence of
the complete QDM and draft FHIR implementations.

The [2025 AHA/ACC multisociety guideline summary](https://professional.heart.org/en/science-news/2025-high-blood-pressure-guideline/top-things-to-know),
published August 14, 2025 and including AMA, describes an overarching treatment
goal below 130/80, with special considerations for institutional care, limited
predicted lifespan, and pregnancy. A reading of 135/85 therefore illustrates why
meeting the reporting threshold need not mean reaching the clinical goal.

For research context, the [SPRINT final report](https://doi.org/10.1056/NEJMoa1901281)
(2021) compared systolic targets below 120 and below 140 in adults at increased
cardiovascular risk without diabetes or previous stroke. Intensive treatment
reduced major cardiovascular events and mortality but increased several adverse
events. It does not justify assigning its target to every measure-eligible patient.

The [AMA measurement resource](https://map.ama-assn.org/resources/how-measure-blood-pressure-accurately)
(updated March 5, 2025) emphasizes measurement accuracy for diagnosis and treatment.
A computed numerator alone cannot demonstrate correct measurement technique.

## Resolution

Open for clinical review. Document reporting performance and clinical-goal
attainment separately. Do not replace the package's threshold with 130/80 based
on this comparison. Remaining work includes executable boundary cases at 140
systolic and 90 diastolic and review of reading selection and exclusions against
the applicable reporting specification.
