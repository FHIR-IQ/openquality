# Hospital at Home Eligibility (Leff Criteria)

Hospital-at-Home (HaH) delivers acute, inpatient-level care in a patient's home. In practice, eligibility is screened manually and is labor-intensive and inefficient (~5-10min / patient). This package is a FHIR R4 CQL library that encodes HaH admission screening criteria from Leff et al. (1997). It supports clinicians in answering the screening question: of patients presenting for acute admission, which can be safely treated at home instead? The library evaluates each qualifying inpatient encounter against inclusion and exclusion criteria for three target conditions (CHF, COAD, CAP) plus shared general exclusions, and returns one result tuple per encounter.

## Intent

Identify patients who meet published HaH inclusion criteria and do not trip a coded exclusion, so eligibility screening can be supported computationally rather than by manual chart review alone. Output is structured at the criterion level (`Encounter Eligibility Results`, with section rollups and a final `Z.6. HaH Eligible` determination) to support clinician adjudication, not to replace it.

## Known Limitations

Not clinically validated. Not for clinical use. The criteria are a published research protocol, not any organization's admission policy.

Several criteria are `[manual-review stub]`s: they cannot be decided from coded FHIR data and are surfaced for human review rather than silently passed or failed. Value sets are referenced by VSAC canonical URL only; expansions are not bundled, so a terminology server (or locally authored substitutes) is required to execute the library.

## Provenance

Original CQL, structure, and packaging authored by Tim Schwirtlich (Institute for AI in Medicine, Northwestern University). The eligibility criteria are derived from the published work of Leff et al. on Hospital-at-Home admission criteria; that work is cited, not reproduced (https://doi.org/10.1111/j.1532-5415.1997.tb05968.x). Original logic has no upstream redistribution source, so the manifest carries no `provenance` block.
