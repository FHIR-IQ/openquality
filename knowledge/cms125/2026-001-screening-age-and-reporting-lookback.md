---
id: cms125-2026-001
type: implementation-note
measure: cms/breast-cancer-screening
measureVersion: "0.4.0"
measurementPeriod: 2026
status: open
categories: [measure-logic, clinical-evidence]
reporter: codex
---

## Summary

Age 42 at measurement-period end in CMS125FHIR is a reporting-population rule,
not a recommendation to defer initial mammography until age 42.

## Detail

Reviewed on 2026-11-03. The pinned [CQL](../../measures/cms-fhir-2026/breast-cancer-screening/cql/CMS125FHIRBreastCancerScreening.cql)
uses ages 42 through 74 at period end and a mammography window beginning
October 1 two years before the measurement year. Its strata are ages 42–51 and
52–74. Interpret these definitions together with exclusions and qualifying
encounters, rather than comparing an age expression alone with clinical guidance.

The [USPSTF final recommendation](https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/breast-cancer-screening)
(April 30, 2024) recommends biennial mammography for women ages 40–74 in its
specified screening population. The [2026 CMS eligible-clinician measure table](https://ecqi.healthit.gov/sites/default/files/2026-EligibleClinician-MeasuresTable.pdf)
likewise describes screening ages 40–74, but specifies women ages 42–74 at
period end for the initial population and a 27-month screening window. The
[2026 technical release notes](https://ecqi.healthit.gov/sites/default/files/2026-EligibleClinician-TRN.pdf)
state that the initial-population age was changed from 52–74 to 42–74 to align
with updated USPSTF guidance.

These published QDM materials support interpreting the end-of-period age in
its reporting context. They do not prove complete equivalence with this draft
FHIR package or resolve every birth-date and time-boundary case. The 27-month
reporting window is not itself a clinical recommendation for a 27-month interval.
This note does not assess competing society recommendations or high-risk protocols.

## Resolution

Open for clinical and implementation review. The age expression alone is not
evidence of an outdated starting age or a confirmed defect. Remaining work is an
executable set of birth-date, mammogram-window, and exclusion boundary cases.
