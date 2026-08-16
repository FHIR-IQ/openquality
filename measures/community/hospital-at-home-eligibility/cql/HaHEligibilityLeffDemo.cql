library HaHEligibilityLeffDemo version '1.0.0'

// ============================================================
// HaHEligibilityLeffDemo
// Computable phenotype for Hospital-at-Home (HaH) eligibility,
// implementing the Leff (1997/2015) admission criteria over FHIR R4.
// Runs in Patient context and evaluates each qualifying inpatient
// encounter against all enumerated inclusion and exclusion criteria
// for the three target conditions (CHF, COAD, CAP) plus shared
// general exclusions.
// Output: "Encounter Eligibility Results" - one tuple per index
// encounter with every criterion result, the Z.1-Z.5 section
// rollups, and the final "Z.6. HaH Eligible" determination.
// Criteria not computable from coded data are surfaced as
// manual-review stubs rather than silently passed or failed.
// ============================================================

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1'

// ============================================================
// Value Sets
// ============================================================
valueset "CHF Conditions" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1222.1524'
valueset "COPD Conditions" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1222.1466'
valueset "Pneumonia Conditions" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1078.738'
valueset "Arrhythmia Conditions" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.526.3.366'
valueset "Atrial Fibrillation Conditions" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1235.344'
valueset "Valvular Conditions" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1078.1148'
valueset "Unstable Angina Conditions" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1222.611'
valueset "MI Conditions" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1219.160'
valueset "Lung Cancer Conditions" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1078.1219'
valueset "Bronchiectasis Conditions" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1222.1463'
valueset "Pulmonary Fibrosis Conditions" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1222.1469'
valueset "Meningitis Conditions" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1146.715'
valueset "Empyema Conditions" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1146.3222'
valueset "Arthritis Conditions" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1222.81'
valueset "Endocarditis Conditions" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1078.1154'
valueset "Pulmonary Embolism Conditions" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1222.1480'
valueset "Tuberculosis Conditions" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1222.43'
valueset "Leukemia Conditions" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1116.241'
valueset "HIV Conditions" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.120.12.1003'
valueset "Multiple Myeloma Conditions" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.1011'
valueset "Lymphoma Conditions" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1078.1225'
valueset "Cytotoxic Chemotherapy Medications" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1260.511'
valueset "Mechanical Ventilation Procedures" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1029.360'
valueset "Vasopressor Medications" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1248.102'
valueset "Ischemic Conditions" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1078.1277'
valueset "Dialysis Procedures" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.109.12.1013'
valueset "Leukopenia Conditions" : 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1146.3390'

// ============================================================
// Code Systems
// ============================================================
codesystem "ActCode" : 'http://terminology.hl7.org/CodeSystem/v3-ActCode'
codesystem "ConditionClinicalStatusCodes" : 'http://terminology.hl7.org/CodeSystem/condition-clinical'
codesystem "LOINC" : 'http://loinc.org'

// ============================================================
// LOINC Codes (single source of truth for coded observations)
// ============================================================
code "Heart Rate Code" : '8867-4' from "LOINC" display 'Heart rate'
code "WBC Count Code" : '6690-2' from "LOINC" display 'Leukocytes [#/volume] in Blood'
code "FiO2 Code" : '3150-0' from "LOINC" display 'Inhaled oxygen concentration'
code "PaO2 Code" : '2703-7' from "LOINC" display 'Oxygen [Partial pressure] in Arterial blood'
code "Arterial O2 Saturation Code" : '2708-6' from "LOINC" display 'Oxygen saturation in Arterial blood'
code "Pulse Oximetry Code" : '59408-5' from "LOINC" display 'Oxygen saturation by Pulse oximetry'
code "Arterial pH Code" : '2744-1' from "LOINC" display 'pH of Arterial blood'
code "Systolic BP Code" : '8480-6' from "LOINC" display 'Systolic blood pressure'

// ============================================================
// Parameters
// ============================================================

parameter "IndexEncounterStatuses" List < String > default { 'in-progress', 'finished' }
parameter "IndexEncounterClasses" List < String > default { 'ACUTE', 'IMP', 'SS', 'EMER' }
parameter "MinimumIndexEncounterLengthHours" default 24
parameter "MaxEncountersToEvaluate" default 10
parameter "AllowedConditionClinicalStatuses" List < String > default { 'active', 'recurrence', 'relapse', 'resolved' }

// ============================================================
// Context
// ============================================================

context Patient

// ============================================================
// Index Encounter Set
// All qualifying inpatient encounters for this patient.
// ============================================================

define "All Qualifying Encounters" :
  [Encounter] E
  where E.class.code.value in "IndexEncounterClasses"
  and E.status.value in "IndexEncounterStatuses"
  and E.period.end is not null
  and duration in hours between FHIRHelpers.ToDateTime(E.period.start)and FHIRHelpers.ToDateTime(E.period.end)
  >= "MinimumIndexEncounterLengthHours"
  sort by start of period descending

define "Selected Encounters" :
  Take("All Qualifying Encounters", "MaxEncountersToEvaluate")

  // Total number of qualifying encounters for this patient.
define "_Number of Qualifying Encounters" :
  Count("All Qualifying Encounters")

define "_Number of Selected Encounters" :
  Count("Selected Encounters")

  // ============================================================
  // Helper Functions
  // ============================================================
define function "Overlaps Encounter"(I Interval < DateTime >, enc FHIR.Encounter):
  I is not null
  and I overlaps FHIRHelpers.ToInterval(enc.period)

define function "To Interval"(d FHIR.dateTime):
  if d is null then null else Interval[d.value, d.value]

define function "Choice To Interval"(c Choice < FHIR.dateTime, FHIR.Period >):
  if c is FHIR.dateTime then "To Interval"(c as FHIR.dateTime)
  else if c is FHIR.Period then FHIRHelpers.ToInterval(c as FHIR.Period)
  else null

define function "Status OK"(s System.String, allowed List < System.String >):
  s is null or s in allowed

define function "Has Encounter Reference"(ref FHIR.Reference, enc FHIR.Encounter):
  Coalesce(FHIRHelpers.ToString(ref.reference), '')
  = 'Encounter/' + FHIRHelpers.ToString(enc.id)

define function "Linked To Encounter"(ref FHIR.Reference, I Interval < DateTime >, enc FHIR.Encounter):
  "Has Encounter Reference"(ref, enc)
  or "Overlaps Encounter"(I, enc)

  // ============================================================
  // LAYER 0: Per-Patient Base Populations
  // One full retrieve per resource type per patient.
  // Resource-level status filters (encounter-independent) are
  // applied here exactly once, then never re-evaluated.
  // ============================================================

define "All Conditions" :
  [Condition]

define "Qualifying Conditions" :
  "All Conditions" C
  where C.clinicalStatus is null
  or exists(
    from(C.clinicalStatus.coding)cc
    where FHIRHelpers.ToString(cc.code)in "AllowedConditionClinicalStatuses"
    return all 1
  )

define "Final Observations" :
  [Observation] O
  where "Status OK"(FHIRHelpers.ToString(O.status), { 'final', 'amended' })

define "Qualifying Procedures" :
  [Procedure] P
  where "Status OK"(FHIRHelpers.ToString(P.status), { 'in-progress', 'completed' })

define "Qualifying Medication Administrations" :
  [MedicationAdministration] M
  where "Status OK"(FHIRHelpers.ToString(M.status), { 'in-progress', 'completed' })

define "Qualifying Medication Statements" :
  [MedicationStatement] M
  where "Status OK"(FHIRHelpers.ToString(M.status), { 'recorded', 'unknown' })

define "Lookback Encounters" :
  [Encounter] E
  where E.class.code.value in "IndexEncounterClasses"
  and E.status in { 'finished', 'completed' }

  // ============================================================
  // LAYER 1: Fluent Filter Functions
  // (declared before L1/criteria use them)
  // All operate on already-cached in-memory lists - no retrieves.
  // Distinct names per resource type; no overloads.
  // ============================================================

define fluent function "codedAs"(conditions List < FHIR.Condition >, vs System.ValueSet):
  from(conditions)C
  where exists(
    from(C.code.coding)cd
    where FHIRHelpers.ToCode(cd)in vs
    return all 1
  )
  return all C

define fluent function "withCode"(observations List < FHIR.Observation >, c System.Code):
  from(observations)O
  where exists(
    from(O.code.coding)cd
    where FHIRHelpers.ToCode(cd)~ c
    return all 1
  )
  return all O

define fluent function "procedureCodedAs"(procedures List < FHIR.Procedure >, vs System.ValueSet):
  from(procedures)P
  where exists(
    from(P.code.coding)cd
    where FHIRHelpers.ToCode(cd)in vs
    return all 1
  )
  return all P

define fluent function "administrationMedicationIn"(meds List < FHIR.MedicationAdministration >, vs System.ValueSet):
  from(meds)M
  where exists(
    from((M.medication as FHIR.CodeableConcept).coding)cd
    where FHIRHelpers.ToCode(cd)in vs
    return all 1
  )
  return all M

define fluent function "statementMedicationIn"(meds List < FHIR.MedicationStatement >, vs System.ValueSet):
  from(meds)M
  where exists(
    from((M.medication as FHIR.CodeableConcept).coding)cd
    where FHIRHelpers.ToCode(cd)in vs
    return all 1
  )
  return all M

define fluent function "linkedTo"(conditions List < FHIR.Condition >, enc FHIR.Encounter):
  from(conditions)C
  where "Linked To Encounter"(C.encounter, "To Interval"(C.recordedDate), enc)
  return all C

define fluent function "during"(observations List < FHIR.Observation >, enc FHIR.Encounter):
  from(observations)O
  where "Linked To Encounter"(O.encounter, "Choice To Interval"(O.effective), enc)
  return all O

define fluent function "performedDuring"(procedures List < FHIR.Procedure >, enc FHIR.Encounter):
  from(procedures)P
  where "Linked To Encounter"(P.encounter, "Choice To Interval"(P.performed), enc)
  return all P

define fluent function "administeredDuring"(meds List < FHIR.MedicationAdministration >, enc FHIR.Encounter):
  from(meds)M
  where "Linked To Encounter"(M.context, "Choice To Interval"(M.effective), enc)
  return all M

define fluent function "assertedDuring"(meds List < FHIR.MedicationStatement >, enc FHIR.Encounter):
  from(meds)M
  where "Linked To Encounter"(M.context, "To Interval"(M.dateAsserted), enc)
  return all M

define fluent function "knownAsOf"(conditions List < FHIR.Condition >, cutoff DateTime):
  from(conditions)C
  where Coalesce(C.recordedDate,(C.onset as FHIR.dateTime).value)on or before cutoff
  return all C

define fluent function "onsetOrRecordedInKnownBy"(conditions List < FHIR.Condition >, window Interval < DateTime >, cutoff DateTime):
  from(conditions)C
  where(C.onset in window or C.recordedDate in window)
  and Coalesce(C.recordedDate,(C.onset as FHIR.dateTime).value)on or before cutoff
  return all C

  // ============================================================
  // LAYER 2: Per-Patient Coded Subsets
  // Terminology matching executes ONCE per patient per value set
  // and is cached by the engine as an actualized in-memory list.
  // ============================================================

  // --- Conditions ---

define "Any CHF Conditions" :
  "All Conditions"."codedAs"("CHF Conditions")

define "Qualifying CHF Conditions" :
  "Qualifying Conditions"."codedAs"("CHF Conditions")

define "Qualifying COPD Conditions" :
  "Qualifying Conditions"."codedAs"("COPD Conditions")

define "Qualifying Pneumonia Conditions" :
  "Qualifying Conditions"."codedAs"("Pneumonia Conditions")

define "Qualifying Arrhythmia Conditions" :
  "Qualifying Conditions"."codedAs"("Arrhythmia Conditions")

define "Qualifying Atrial Fibrillation Conditions" :
  "Qualifying Conditions"."codedAs"("Atrial Fibrillation Conditions")

define "Qualifying Valvular Conditions" :
  "Qualifying Conditions"."codedAs"("Valvular Conditions")

define "Qualifying Unstable Angina Conditions" :
  "Qualifying Conditions"."codedAs"("Unstable Angina Conditions")

define "Qualifying MI Conditions" :
  "Qualifying Conditions"."codedAs"("MI Conditions")

define "Qualifying Lung Cancer Conditions" :
  "Qualifying Conditions"."codedAs"("Lung Cancer Conditions")

define "Qualifying Bronchiectasis Conditions" :
  "Qualifying Conditions"."codedAs"("Bronchiectasis Conditions")

define "Qualifying Pulmonary Fibrosis Conditions" :
  "Qualifying Conditions"."codedAs"("Pulmonary Fibrosis Conditions")

define "Qualifying Meningitis Conditions" :
  "Qualifying Conditions"."codedAs"("Meningitis Conditions")

define "Qualifying Empyema Conditions" :
  "Qualifying Conditions"."codedAs"("Empyema Conditions")

define "Qualifying Arthritis Conditions" :
  "Qualifying Conditions"."codedAs"("Arthritis Conditions")

define "Qualifying Endocarditis Conditions" :
  "Qualifying Conditions"."codedAs"("Endocarditis Conditions")

define "Qualifying Pulmonary Embolism Conditions" :
  "Qualifying Conditions"."codedAs"("Pulmonary Embolism Conditions")

define "Qualifying Tuberculosis Conditions" :
  "Qualifying Conditions"."codedAs"("Tuberculosis Conditions")

define "Qualifying Leukemia Conditions" :
  "Qualifying Conditions"."codedAs"("Leukemia Conditions")

define "Qualifying HIV Conditions" :
  "Qualifying Conditions"."codedAs"("HIV Conditions")

define "Qualifying Multiple Myeloma Conditions" :
  "Qualifying Conditions"."codedAs"("Multiple Myeloma Conditions")

define "Qualifying Lymphoma Conditions" :
  "Qualifying Conditions"."codedAs"("Lymphoma Conditions")

define "Qualifying Leukopenia Conditions" :
  "Qualifying Conditions"."codedAs"("Leukopenia Conditions")

define "Qualifying Ischemic Conditions" :
  "Qualifying Conditions"."codedAs"("Ischemic Conditions")

  // --- Observations (by LOINC code) ---

define "Heart Rate Results" :
  "Final Observations"."withCode"("Heart Rate Code")

define "WBC Count Results" :
  "Final Observations"."withCode"("WBC Count Code")

define "FiO2 Results" :
  "Final Observations"."withCode"("FiO2 Code")

define "PaO2 Results" :
  "Final Observations"."withCode"("PaO2 Code")

define "Arterial O2 Saturation Results" :
  "Final Observations"."withCode"("Arterial O2 Saturation Code")

define "Pulse Oximetry Results" :
  "Final Observations"."withCode"("Pulse Oximetry Code")

define "Arterial pH Results" :
  "Final Observations"."withCode"("Arterial pH Code")

define "Systolic BP Results" :
  "Final Observations"."withCode"("Systolic BP Code")

  // --- Procedures ---

define "Mechanical Ventilation Performed" :
  "Qualifying Procedures"."procedureCodedAs"("Mechanical Ventilation Procedures")

define "Dialysis Performed" :
  "Qualifying Procedures"."procedureCodedAs"("Dialysis Procedures")

  // --- Medications ---

define "Vasopressor Administrations" :
  "Qualifying Medication Administrations"."administrationMedicationIn"("Vasopressor Medications")

define "Cytotoxic Chemotherapy Administrations" :
  "Qualifying Medication Administrations"."administrationMedicationIn"("Cytotoxic Chemotherapy Medications")

define "Cytotoxic Chemotherapy Statements" :
  "Qualifying Medication Statements"."statementMedicationIn"("Cytotoxic Chemotherapy Medications")

  // ============================================================
  // Shared constant: manual-review stub
  // ============================================================

define "Requires Manual Review Stub" :
  Tuple {
    value : null as Boolean,
    warning : 'Requires manual review',
    requiresManualReview : true
  }

  // ============================================================
  // LAYER 3: ENUMERATED CRITERIA
  // Each criterion is tagged with how it is evaluated:
  //   [per-encounter]      filters a cached L1 list against enc
  //   [lookback]           date window anchored to evalDateTime
  //   [patient-level]      cohort-wide, bounded by retrospective cutoff
  //   [manual-review stub] constant; requires human adjudication
  //   [inline]             computed directly in the LAYER 4 query
  // Declaration order note: sub-parts precede their aggregate
  // (1.A.4.1/.2 before 1.A.4), and 4.C references 3.A - clinical ID
  // order satisfies both, so no hoisting is required.
  // ============================================================

  // SECTION 1: Inclusion

  // ── 1.A.1 ────────────────────────────────  [per-encounter]
  // A. Patient with one of the target conditions (CAP, CHF, or COAD) and felt to require hospital admission for target condition
define function "1.A.1. Requires Hospital Admission"(enc FHIR.Encounter):
  enc is not null

  // ── 1.A.2 ────────────────────────────────  [per-encounter]
define function "1.A.2. CHF Diagnosis"(enc FHIR.Encounter):
  exists("Qualifying CHF Conditions"."linkedTo"(enc))

  // ── 1.A.3 ────────────────────────────────  [per-encounter]
define function "1.A.3. COAD Diagnosis"(enc FHIR.Encounter):
  exists("Qualifying COPD Conditions"."linkedTo"(enc))

  // ── 1.A.4.1 ──────────────────────────────  [per-encounter]
define function "1.A.4.1. CAP Diagnosis"(enc FHIR.Encounter):
  exists("Qualifying Pneumonia Conditions"."linkedTo"(enc))

  // ── 1.A.4.2 ──────────────────────────────  [manual-review stub]
  // In case of community acquired pneumonia, infiltrate must be present on chest radiograph.
define "1.A.4.2. CAP Inclusion Infiltrate on CXR" : "Requires Manual Review Stub"

// ── 1.B ──────────────────────────────  [per-encounter]
// B. Age >= 65 years
define function "1.B. Age >= 65"(evalDateTime DateTime):
  AgeInYearsAt(evalDateTime)>= 65

  // ── 1.C ──────────────────────────────────  [manual-review stub]
  // C. Lives in community within specified catchment area.
define "1.C. Within Catchment Area" : "Requires Manual Review Stub"

// ─────────────────────────────────────────  SECTION 2: CHF Exclusions

// ── 2.A ──────────────────────────────────  [per-encounter]
// Associated with arrhythmia (ventricular tachycardia or complex
// ventricular ectopy, bradycardia < 40 bpm, atrial fibrillation with
// RVR >= 120 bpm, new Mobitz II / complete heart block, sinus arrest
// or pauses >= 2 s, pacemaker failure to capture or sense).
define function "2.A. CHF Exclusion Arrhythmia"(enc FHIR.Encounter):
  // general arrhythmia (covers tachycardia, ectopy, heart block, sinus arrest)
  exists("Qualifying Arrhythmia Conditions"."linkedTo"(enc))
  // bradycardia at rate < 40 beats per minute
  or exists(
    ("Heart Rate Results"."during"(enc))O
    where(O.value as Quantity)< 40 '{beats}/min'
  )
  // atrial fibrillation with rapid ventricular response >= 120 beats per minute
  or(
    exists("Qualifying Atrial Fibrillation Conditions"."linkedTo"(enc))
    and exists(
      ("Heart Rate Results"."during"(enc))O
      where(O.value as Quantity)>= 120 '{beats}/min'
    )
  )

  // ── 2.B ──────────────────────────────────  [per-encounter]
  // Known or suspected severe valvular disease of aortic or mitral valves.
define function "2.B. CHF Exclusion Valvular Disease"(enc FHIR.Encounter):
  exists("Qualifying Valvular Conditions"."linkedTo"(enc))

  // ── 2.C ──────────────────────────────────  [manual-review stub]
  // Continued care for respiratory distress after initial treatment
  // (rales > 1/2 lung fields at completion of initial treatment).
define "2.C. CHF Exclusion Rales Post-Treatment" : "Requires Manual Review Stub"

// ── 2.D ──────────────────────────────────  [per-encounter]
// Unstable angina.
define function "2.D. CHF Exclusion Unstable Angina"(enc FHIR.Encounter):
  exists("Qualifying Unstable Angina Conditions"."linkedTo"(enc))

  // ── 2.E ──────────────────────────────────  [lookback]
  // Myocardial infarction within last 3 months. Window upper edge is
  // evalDateTime (admission); knownAsOf(evalDateTime) blocks hindsight.
define function "2.E. CHF Exclusion MI Within 3 Months"(evalDateTime DateTime):
  exists(
    "Qualifying MI Conditions"."onsetOrRecordedInKnownBy"(
      Interval[evalDateTime - 3 months, evalDateTime], evalDateTime)
  )

  // ─────────────────────────────────────────  SECTION 3: COAD Exclusions

  // ── 3.A ──────────────────────────────────  [patient-level]
  // Other significant pulmonary disease. Associated with current encounter
  // or bounded by retrospective cutoff so a post-encounter diagnosis does not retroactively exclude.
define function "3.A. COAD Exclusion Other Pulmonary Disease"(enc FHIR.Encounter, cutoff DateTime):
  exists("Qualifying Lung Cancer Conditions"."knownAsOf"(cutoff))
  or exists("Qualifying Lung Cancer Conditions"."linkedTo"(enc))
  or exists("Qualifying Bronchiectasis Conditions"."knownAsOf"(cutoff))
  or exists("Qualifying Bronchiectasis Conditions"."linkedTo"(enc))
  or exists("Qualifying Pulmonary Fibrosis Conditions"."knownAsOf"(cutoff))
  or exists("Qualifying Pulmonary Fibrosis Conditions"."linkedTo"(enc))

  // ─────────────────────────────────────────  SECTION 4: CAP Exclusions

  // ── 4.A ──────────────────────────────────  [per-encounter]
  // Suspected suppurative infection e.g., meningitis, empyema,
  // septic arthritis, endocarditis.
define function "4.A. CAP Exclusion Suppurative Infection"(enc FHIR.Encounter):
  exists("Qualifying Meningitis Conditions"."linkedTo"(enc))
  or exists("Qualifying Empyema Conditions"."linkedTo"(enc))
  or exists("Qualifying Arthritis Conditions"."linkedTo"(enc))
  or exists("Qualifying Endocarditis Conditions"."linkedTo"(enc))

  // ── 4.B.1 ────────────────────────────────  [per-encounter]
  // CXR abnormality due to cause other than CAP e.g., lung cancer,
  // pulmonary emboli, tuberculosis.
define function "4.B.1. CAP Exclusion CXR Abnormality Coded"(enc FHIR.Encounter):
  exists("Qualifying Lung Cancer Conditions"."linkedTo"(enc))
  or exists("Qualifying Pulmonary Embolism Conditions"."linkedTo"(enc))
  or exists("Qualifying Tuberculosis Conditions"."linkedTo"(enc))

  // ── 4.B.2 ────────────────────────────────  [manual-review stub]
define "4.B.2. CAP Exclusion CXR Abnormality Other Cause Narrative" : "Requires Manual Review Stub"

// ── 4.C ──────────────────────────────────  [patient-level]
// Other significant pulmonary disease (same set as 3.A). Bounded by
// retrospective cutoff; delegates to 3.A for a single source of truth.
define function "4.C. CAP Exclusion Other Pulmonary Disease"(enc FHIR.Encounter, cutoff DateTime):
  exists("Qualifying Lung Cancer Conditions"."knownAsOf"(cutoff))
  or exists("Qualifying Lung Cancer Conditions"."linkedTo"(enc))
  or exists("Qualifying Bronchiectasis Conditions"."knownAsOf"(cutoff))
  or exists("Qualifying Bronchiectasis Conditions"."linkedTo"(enc))
  or exists("Qualifying Pulmonary Fibrosis Conditions"."knownAsOf"(cutoff))
  or exists("Qualifying Pulmonary Fibrosis Conditions"."linkedTo"(enc))

  // ── 4.D ──────────────────────────────────  [lookback]
  // Pneumonia within 6 weeks of presentation.
define function "4.D. CAP Exclusion Prior Pneumonia"(enc FHIR.Encounter, evalDateTime DateTime):
  exists(
    ("Qualifying Pneumonia Conditions"."onsetOrRecordedInKnownBy"(
        Interval[evalDateTime - 42 days, evalDateTime], evalDateTime))C
    where not("Linked To Encounter"(C.encounter, "To Interval"(C.recordedDate), enc))
  )

  // ── 4.E ──────────────────────────────────  [manual-review stub]
  // Chest radiograph with cavitating lesion.
define "4.E. CAP Exclusion Cavitating Lesion" : "Requires Manual Review Stub"

// ── 4.F ──────────────────────────────────  [per-encounter + patient-level]
// Immunodeficiency states associated with leukopenia e.g. leukemia,
// cytotoxic drugs, HIV, myeloma, lymphoma.
define function "4.F. CAP Exclusion Immunodeficiency Leukopenia"(enc FHIR.Encounter, evalDateTime DateTime, cutoff DateTime):
  // Leukopenia (associated clinical code, cutoff-bounded; or cell count during encounter)
  (
    exists("Qualifying Leukopenia Conditions"."knownAsOf"(cutoff))
    or exists(
      ("WBC Count Results"."during"(enc))O
      where(O.value as Quantity)< 4.0 '10*3/uL'
    )
  )
  // Associated immunodeficiency state
  and(
    (
      exists("Qualifying Leukemia Conditions"."knownAsOf"(cutoff))
      or exists("Qualifying HIV Conditions"."knownAsOf"(cutoff))
      or exists("Qualifying Multiple Myeloma Conditions"."knownAsOf"(cutoff))
      or exists("Qualifying Lymphoma Conditions"."knownAsOf"(cutoff))
    )
    or exists(
      "Cytotoxic Chemotherapy Administrations" M
      where "Choice To Interval"(M.effective)overlaps Interval[evalDateTime - 30 days, evalDateTime]
    )
    or exists("Cytotoxic Chemotherapy Statements"."assertedDuring"(enc))
  )

  // ─────────────────────────────────────────  SECTION 5: General Exclusions

  // ── 5.A.1 ────────────────────────────────  [per-encounter]
  // ICU-level acuity: pressor agents, mechanical ventilation, or FiO2 > 50%.
define function "5.A.1. General Exclusion ICU Acuity Coded"(enc FHIR.Encounter):
  exists("Vasopressor Administrations"."administeredDuring"(enc))
  or exists("Mechanical Ventilation Performed"."performedDuring"(enc))
  or exists(
    ("FiO2 Results"."during"(enc))O
    where(O.value as Quantity)> 50 '%'
  )

  // ── 5.A.2 ────────────────────────────────  [manual-review stub]
define "5.A.2. General Exclusion ICU Acuity Narrative" : "Requires Manual Review Stub"

// ── 5.B.1 ────────────────────────────────  [per-encounter]
// Ischemic chest pain / symptoms suggestive of ischemia or MI.
define function "5.B.1. General Exclusion Ischemic Chest Pain Coded"(enc FHIR.Encounter):
  exists("Qualifying Ischemic Conditions"."linkedTo"(enc))
  or exists("Qualifying MI Conditions"."linkedTo"(enc))

  // ── 5.B.2 ────────────────────────────────  [manual-review stub]
define "5.B.2. General Exclusion Ischemic Chest Pain Narrative" : "Requires Manual Review Stub"

// ── 5.C ──────────────────────────────────  [lookback / cross-encounter]
// Hospitalized within 7 days of current presentation.
define function "5.C. General Exclusion Hospitalized Within 7 Days"(enc FHIR.Encounter, evalDateTime DateTime):
  exists(
    "Lookback Encounters" E
    where E.id != enc.id
    and duration in hours between end of FHIRHelpers.ToInterval(E.period)and evalDateTime >= 24
    and end of E.period in Interval[evalDateTime - 7 days, evalDateTime]
  )

  // ── 5.D room-air helper ──────────────────  [per-encounter]
define function "Breathing Room Air During"(enc FHIR.Encounter):
  exists(
    ("FiO2 Results"."during"(enc))F
    where(F.value as Quantity)<= 21 '%'
  )

  // ── 5.D.1 ────────────────────────────────  [per-encounter]
  // Hypoxemia: PaO2 < 60 mm Hg, or O2 sat < 90% on room air.
define function "5.D.1. General Exclusion Hypoxemia Threshold"(enc FHIR.Encounter):
  exists(
    ("PaO2 Results"."during"(enc))O
    where(O.value as Quantity)< 60 'mm[Hg]'
  )
  or(
    "Breathing Room Air During"(enc)
    and(
      exists(
        ("Arterial O2 Saturation Results"."during"(enc))O
        where(O.value as Quantity)< 90 '%'
      )
      or exists(
        ("Pulse Oximetry Results"."during"(enc))O
        where(O.value as Quantity)< 90 '%'
      )
    )
  )

  // ── 5.D.2 ────────────────────────────────  [manual-review stub]
  // > 10 mm Hg change from baseline.
define "5.D.2. General Exclusion Hypoxemia Delta From Baseline Narrative" : "Requires Manual Review Stub"

// ── 5.E ──────────────────────────────────  [per-encounter]
// Arterial blood pH < 7.30 or > 7.55.
define function "5.E. General Exclusion Arterial pH"(enc FHIR.Encounter):
  exists(
    ("Arterial pH Results"."during"(enc))O
    where(O.value as Quantity)< 7.30 '[pH]'
    or(O.value as Quantity)> 7.55 '[pH]'
  )

  // ── 5.F ──────────────────────────────────  [per-encounter]
  // Suspected pulmonary embolism.
define function "5.F. General Exclusion Suspected PE"(enc FHIR.Encounter):
  exists("Qualifying Pulmonary Embolism Conditions"."linkedTo"(enc))

  // ── 5.G ──────────────────────────────────  [per-encounter]
  // Hypotension: systolic blood pressure < 90 mm Hg.
define function "5.G. General Exclusion Hypotension"(enc FHIR.Encounter):
  exists(
    ("Systolic BP Results"."during"(enc))O
    where(O.value as Quantity)< 90 'mm[Hg]'
  )

  // ── 5.H ──────────────────────────────────  [per-encounter]
  // Dialysis dependent patients.
define function "5.H. General Exclusion Dialysis Dependent"(enc FHIR.Encounter):
  exists("Dialysis Performed"."performedDuring"(enc))

  // ── 5.I ──────────────────────────────────  [manual-review stub]
  // Expected terminal event.
define "5.I. General Exclusion Terminal Event" : "Requires Manual Review Stub"

// ── 5.J ──────────────────────────────────  [manual-review stub]
// Acute illness requiring hospital admission independent of the target
// diagnosis (excepting the other target conditions).
define "5.J. General Exclusion Independent Acute Illness" : "Requires Manual Review Stub"

// ============================================================
// LAYER 4: Output - Per-Encounter Results
// One tuple per qualifying inpatient encounter.
// ============================================================

define "Encounter Eligibility Results" :
  "Selected Encounters" enc
  let
  evalDateTime : start of enc.period,
  cutoff : end of FHIRHelpers.ToInterval(enc.period),

  // Section 1: Inclusion
  requiresAdmission : "1.A.1. Requires Hospital Admission"(enc),
  chfDx : "1.A.2. CHF Diagnosis"(enc),
  coadDx : "1.A.3. COAD Diagnosis"(enc),
  capDx1 : "1.A.4.1. CAP Diagnosis"(enc),
  capDx : capDx1 and Coalesce("1.A.4.2. CAP Inclusion Infiltrate on CXR".value, true),
  admissionWithTarget : requiresAdmission and(chfDx or coadDx or capDx),
  age65 : AgeInYearsAt(evalDateTime)>= 65,
  z1 : admissionWithTarget and age65 and Coalesce("1.C. Within Catchment Area".value, true),

  // Section 2: CHF Exclusions
  exclArrhythmia : "2.A. CHF Exclusion Arrhythmia"(enc),
  exclValvular : "2.B. CHF Exclusion Valvular Disease"(enc),
  exclAngina : "2.D. CHF Exclusion Unstable Angina"(enc),
  exclMi3mo : "2.E. CHF Exclusion MI Within 3 Months"(evalDateTime),
  z2 :
  if chfDx then
  Coalesce(exclArrhythmia, false)
  or Coalesce(exclValvular, false)
  or Coalesce("2.C. CHF Exclusion Rales Post-Treatment".value, false)
  or Coalesce(exclAngina, false)
  or Coalesce(exclMi3mo, false)
  else null,

  // Section 3: COAD Exclusions
  exclCoadOtherPulm : "3.A. COAD Exclusion Other Pulmonary Disease"(enc, cutoff),
  z3 :
  if coadDx then
  Coalesce(exclCoadOtherPulm, false)
  else null,

  // Section 4: CAP Exclusions
  exclSuppurative : "4.A. CAP Exclusion Suppurative Infection"(enc),
  exclCxrCoded : "4.B.1. CAP Exclusion CXR Abnormality Coded"(enc),
  exclCxrOther : exclCxrCoded or "4.B.2. CAP Exclusion CXR Abnormality Other Cause Narrative".value,
  exclCapOtherPulm : "4.C. CAP Exclusion Other Pulmonary Disease"(enc, cutoff),
  exclPriorPna : "4.D. CAP Exclusion Prior Pneumonia"(enc, evalDateTime),
  exclImmunoLeuko : "4.F. CAP Exclusion Immunodeficiency Leukopenia"(enc, evalDateTime, cutoff),
  z4 :
  if capDx then
  Coalesce(exclSuppurative, false)
  or Coalesce(exclCxrOther, false)
  or Coalesce(exclCapOtherPulm, false)
  or Coalesce(exclPriorPna, false)
  or Coalesce("4.E. CAP Exclusion Cavitating Lesion".value, false)
  or Coalesce(exclImmunoLeuko, false)
  else null,

  // Section 5: General Exclusions
  exclIcuCoded : "5.A.1. General Exclusion ICU Acuity Coded"(enc),
  exclIcu : exclIcuCoded or "5.A.2. General Exclusion ICU Acuity Narrative".value,
  exclIschemicCoded : "5.B.1. General Exclusion Ischemic Chest Pain Coded"(enc),
  exclIschemic : exclIschemicCoded or "5.B.2. General Exclusion Ischemic Chest Pain Narrative".value,
  exclHosp7d : "5.C. General Exclusion Hospitalized Within 7 Days"(enc, evalDateTime),
  exclHypoxThresh : "5.D.1. General Exclusion Hypoxemia Threshold"(enc),
  exclHypox : exclHypoxThresh or "5.D.2. General Exclusion Hypoxemia Delta From Baseline Narrative".value,
  exclPh : "5.E. General Exclusion Arterial pH"(enc),
  exclPe : "5.F. General Exclusion Suspected PE"(enc),
  exclHypotension : "5.G. General Exclusion Hypotension"(enc),
  exclDialysis : "5.H. General Exclusion Dialysis Dependent"(enc),
  z5 :
  Coalesce(exclIcu, false)
  or Coalesce(exclIschemic, false)
  or Coalesce(exclHosp7d, false)
  or Coalesce(exclHypox, false)
  or Coalesce(exclPh, false)
  or Coalesce(exclPe, false)
  or Coalesce(exclHypotension, false)
  or Coalesce(exclDialysis, false)
  or Coalesce("5.I. General Exclusion Terminal Event".value, false)
  or Coalesce("5.J. General Exclusion Independent Acute Illness".value, false),

  // Section 6: Final
  z6 :
  z1
  and not Coalesce(z2, false)
  and not Coalesce(z3, false)
  and not Coalesce(z4, false)
  and not z5

  return Tuple {
    // Encounter metadata
    "patientId" : Patient.id.value,
    "encounterId" : enc.id.value,
    "admissionDate" : start of enc.period,
    "dischargeDate" : end of enc.period,
    "ageAtAdmission" : AgeInYearsAt(evalDateTime),

    // Section 1: Inclusion
    "1.A.1. Requires Hospital Admission" : requiresAdmission,
    "1.A.2. CHF Diagnosis" : chfDx,
    "1.A.3. COAD Diagnosis" : coadDx,
    "1.A.4.1. CAP Diagnosis" : capDx1,
    "1.A.4.2. CAP Inclusion Infiltrate on CXR" : "1.A.4.2. CAP Inclusion Infiltrate on CXR",
    "1.A.4. CAP Diagnosis with Infiltrate on CXR" : capDx,
    "1.A. Admission with Target Condition" : admissionWithTarget,
    "1.B. Age >= 65" : age65,
    "1.C. Within Catchment Area" : "1.C. Within Catchment Area",
    "Z.1. Inclusion Criteria Met" : z1,

    // Section 2: CHF Exclusions (inverted: true when exclusion not met)
    "2.A. No CHF Exclusion Arrhythmia" : not exclArrhythmia,
    "2.B. No CHF Exclusion Valvular Disease" : not exclValvular,
    "2.C. No CHF Exclusion Rales Post-Treatment" : "2.C. CHF Exclusion Rales Post-Treatment",
    "2.D. No CHF Exclusion Unstable Angina" : not exclAngina,
    "2.E. No CHF Exclusion MI Within 3 Months" : not exclMi3mo,
    "Z.2. No CHF Specific Exclusions Met" : not z2,

    // Section 3: COAD Exclusions (inverted: true when exclusion not met)
    "3.A. No COAD Exclusion Other Pulmonary Disease" : not exclCoadOtherPulm,
    "Z.3. No COAD Specific Exclusions Met" : not z3,

    // Section 4: CAP Exclusions (inverted: true when exclusion not met)
    "4.A. No CAP Exclusion Suppurative Infection" : not exclSuppurative,
    "4.B.1. No CAP Exclusion CXR Abnormality Coded" : not exclCxrCoded,
    "4.B.2. No CAP Exclusion CXR Abnormality Other Cause Narrative" : "4.B.2. CAP Exclusion CXR Abnormality Other Cause Narrative",
    "4.B. No CAP Exclusion CXR Abnormality Other Cause" : not exclCxrOther,
    "4.C. No CAP Exclusion Other Pulmonary Disease" : not exclCapOtherPulm,
    "4.D. No CAP Exclusion Prior Pneumonia" : not exclPriorPna,
    "4.E. No CAP Exclusion Cavitating Lesion" : "4.E. CAP Exclusion Cavitating Lesion",
    "4.F. No CAP Exclusion Immunodeficiency Leukopenia" : not exclImmunoLeuko,
    "Z.4. No CAP Specific Exclusions Met" : not z4,

    // Section 5: General Exclusions (inverted: true when exclusion not met)
    "5.A.1. No General Exclusion ICU Acuity Coded" : not exclIcuCoded,
    "5.A.2. No General Exclusion ICU Acuity Narrative" : "5.A.2. General Exclusion ICU Acuity Narrative",
    "5.A. No General Exclusion ICU Acuity" : not exclIcu,
    "5.B.1. No General Exclusion Ischemic Chest Pain Coded" : not exclIschemicCoded,
    "5.B.2. No General Exclusion Ischemic Chest Pain Narrative" : "5.B.2. General Exclusion Ischemic Chest Pain Narrative",
    "5.B. No General Exclusion Ischemic Chest Pain" : not exclIschemic,
    "5.C. No General Exclusion Hospitalized Within 7 Days" : not exclHosp7d,
    "5.D.1. No General Exclusion Hypoxemia Threshold" : not exclHypoxThresh,
    "5.D.2. No General Exclusion Hypoxemia Delta From Baseline Narrative" : "5.D.2. General Exclusion Hypoxemia Delta From Baseline Narrative",
    "5.D. No General Exclusion Hypoxemia" : not exclHypox,
    "5.E. No General Exclusion Arterial pH" : not exclPh,
    "5.F. No General Exclusion Suspected PE" : not exclPe,
    "5.G. No General Exclusion Hypotension" : not exclHypotension,
    "5.H. No General Exclusion Dialysis Dependent" : not exclDialysis,
    "5.I. No General Exclusion Terminal Event" : "5.I. General Exclusion Terminal Event",
    "5.J. No General Exclusion Independent Acute Illness" : "5.J. General Exclusion Independent Acute Illness",
    "Z.5. No General Exclusions Met" : not z5,

    // Section 6: Final
    "Z.6. HaH Eligible" : z6
  }
