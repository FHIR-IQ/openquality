---
id: cms506-2026-001
type: implementation-note
measure: cms/safe-use-of-opioids-concurrent-prescribing
measureVersion: "0.3.7"
measurementPeriod: 2026
status: open
categories: [measure-logic, clinical-evidence]
reporter: codex
---

## Summary

CMS506FHIR's discharge prescribing indicator should not be interpreted as an
absolute clinical prohibition on every concurrent opioid/benzodiazepine prescription.

## Detail

Reviewed on 2026-11-03. The pinned [CQL](../../measures/cms-fhir-2026/safe-use-of-opioids-concurrent-prescribing/cql/CMS506FHIRSafeUseofOpioids.cql)
uses inpatient encounters with an opioid or benzodiazepine at discharge. Its
numerator identifies two or more distinct opioid medications, or an opioid
and benzodiazepine. The exclusion definition includes cancer-related pain,
sickle cell disease, palliative/hospice interventions, qualifying opioid-use-disorder
treatment, and specified discharge dispositions, with explicit timing and data
requirements. Merely having one of these clinical circumstances is not proof
that the encoded exclusion has been satisfied.

The [CDC 2022 opioid prescribing guideline](https://www.cdc.gov/mmwr/volumes/71/rr/rr7103a1.htm),
published November 4, 2022, addresses outpatient pain prescribing and excludes
sickle-cell-related pain, cancer-related pain, palliative care, and end-of-life
care from its scope. Recommendation 11 advises particular caution and an
individual benefit–risk assessment for concurrent opioid/benzodiazepine use.
It also states that buprenorphine or methadone for opioid use disorder should
not be withheld solely because a patient takes benzodiazepines or other CNS
depressants. These are clinical guidance statements, not replacements for the
measure's discharge numerator or exclusions.

## Resolution

Open for clinical and measure-steward review. Explain a numerator result in
the context of the discharge measure and its encoded exclusions; avoid using
it alone to prescribe abrupt discontinuation or denial of opioid-use-disorder
treatment. Proposed implementation tests should distinguish two-opioid and
opioid/benzodiazepine branches and verify exclusion timing. No such tests have
been executed for this note.
