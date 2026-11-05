---
id: cms135-2026-001
type: implementation-note
measure: cms/heart-failure-hf-angiotensin-converting-enzyme-ace-inhibitor-or-angiotensin-receptor-blocker-arb-or-angiotensin-receptor-neprilysin-inhibitor-arni-therapy-for-left-ventricular-systolic-dysfunction-lvsd
measureVersion: "0.4.0"
measurementPeriod: 2026
status: open
categories: [measure-logic, clinical-evidence]
reporter: codex
---

## Summary

The ACE inhibitor/ARB/ARNI and beta-blocker measures assess selected medication
processes. Meeting their numerators does not establish comprehensive HFrEF therapy.

## Detail

Reviewed on 2026-11-03. The pinned [CMS135FHIR CQL](../../measures/cms-fhir-2026/heart-failure-hf-angiotensin-converting-enzyme-ace-inhibitor-or-angiotensin-receptor-blocker-arb-or-angiotensin-receptor-neprilysin-inhibitor-arni-therapy-for-left-ventricular-systolic-dysfunction-lvsd/cql/CMS135FHIRHFACEIorARBorARNIforLVSD.cql)
checks an ordered or current ACE inhibitor, ARB, or ARNI. The related
[CMS144FHIR CQL](../../measures/cms-fhir-2026/heart-failure-hf-beta-blocker-therapy-for-left-ventricular-systolic-dysfunction-lvsd/cql/CMS144FHIRHFBetaBlockerTherapyforLVSD.cql)
at package version 1.5.0 checks ordered or current beta-blocker therapy for LVSD.
Each has its own eligibility, exclusions, and exceptions. Neither numerator
requires an MRA or an SGLT2 inhibitor.

The [ACC 2024 HFrEF consensus summary](https://www.acc.org/latest-in-cardiology/ten-points-to-remember/2024/03/06/19/22/2024-acc-expert-consensus-hfref)
(March 8, 2024) identifies core therapy including an ARNI, evidence-based
beta-blocker, MRA, and SGLT inhibitor, with initiation and titration as tolerated.
This is a broader clinical assessment than either medication numerator.

As supporting primary research, [EMPEROR-Reduced](https://doi.org/10.1056/NEJMoa2022190)
(2020) found a lower risk of cardiovascular death or heart-failure hospitalization
with empagliflozin than placebo in its HFrEF trial population. That result
supports considering therapy beyond the two measured processes; it does not
establish eligibility or safety for every patient in these packages.

## Resolution

Open for clinical review. Describe the specific medication process measured,
rather than labeling numerator attainment as complete guideline-directed care.
A proposed comprehensive-therapy measure would need separate eligibility,
contraindication, tolerance, timing, and testing requirements. This comparison
does not change either imported measure or assert that the cited 2024 pathway
exhausts subsequent heart-failure guidance.
