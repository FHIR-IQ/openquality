---
id: corpus-2026-009
scope: corpus
type: implementation-note
measurementPeriod: 2026
status: open
categories: [measure-metadata, clinical-evidence]
reporter: codex
---

## Summary

This initial evidence crosswalk connects five clinical areas in the seeded CMS
FHIR collection to dated professional guidance and selected research. A reporting
threshold is not necessarily a treatment target, and a narrow process measure
does not establish that a patient received comprehensive guideline-directed care.

## Detail

Reviewed on 2026-11-03 against the packages from upstream commit
`d4e0edd01b7da2a3b43d5360156b43761438190a`, recorded in the
[import report](../../measures/import-report.md). These are draft FHIR packages.
Their versions must not be relabeled as published CMS QDM versions; see
[the versioning note](2026-001-draft-versioning-of-seeded-packages.md).

| Area | Pinned draft FHIR package | Evidence note | Interpretation |
|---|---|---|---|
| Blood pressure | CMS165FHIR 0.5.0 | [Reporting threshold and treatment goal](../cms165/2026-001-reporting-threshold-and-treatment-goal.md) | Below 140/90 in the package and below 130/80 in the 2025 clinical guideline serve different purposes. |
| Diabetes | CMS122FHIR 0.5.0 | [Poor-control reporting and individualized goals](../cms122/2026-006-poor-control-is-not-a-treatment-target.md) | A result not above 9% does not establish achievement of an individualized goal; missing assessments also affect reporting. |
| Breast screening | CMS125FHIR 0.4.0 | [Screening age and reporting lookback](../cms125/2026-001-screening-age-and-reporting-lookback.md) | Age 42 at period end must be read with the screening window; it is not an instruction to begin screening at 42. |
| Heart failure | CMS135FHIR 0.4.0; CMS144FHIR 1.5.0 | [Medication measures and comprehensive therapy](../cms135/2026-001-medication-measures-and-comprehensive-therapy.md) | These two medication numerators do not assess the full four-class HFrEF regimen. |
| Opioid safety | CMS506FHIR 0.3.7 | [Concurrent prescribing and clinical judgment](../cms506/2026-001-concurrent-prescribing-and-clinical-judgment.md) | A discharge prescribing indicator and outpatient prescribing guidance have different scopes. |

This is a targeted review, not a systematic literature review or a claim that
every guideline, 2026 update, or measure in the corpus has been assessed. The
notes identify the specific publications used, distinguish local logic from
external guidance, and describe remaining review work. Research examples are
supporting context, not replacements for a guideline's complete evidence review.

AMA participates in the 2025 multisociety blood-pressure guideline and provides
measurement implementation resources. ADA, USPSTF, ACC/AHA, and CDC supply the
other guidance cited here. Those organizations are not interchangeable authorities
for all clinical topics. External documents are linked and briefly paraphrased;
their inclusion does not extend the seeded packages' CC0 license to those sources.

## Resolution

Open for clinical and measure-steward review. These notes do not establish a
confirmed measure defect, official CMS interpretation, clinical endorsement, or
equivalence between a draft FHIR package and a production reporting specification.
No generated measure logic is changed. A future proposed logic change needs its
own version-specific evidence, steward disposition, and executable test cases.
