library DiabetesHemoglobinA1cPoorControl version '13.0.000'

using FHIR version '4.0.1'

valueset "Diabetes": 'urn:oid:2.16.840.1.113883.3.464.1003.103.12.1001'
valueset "HbA1c Laboratory Test": 'urn:oid:2.16.840.1.113883.3.464.1003.198.12.1013'

parameter "Measurement Period" Interval<DateTime>

context Patient

define "Initial Population":
  AgeInYearsAt(start of "Measurement Period") between 18 and 75
    and exists "Diabetes Diagnosis"

define "Diabetes Diagnosis":
  [Condition: "Diabetes"] C
    where C.clinicalStatus ~ 'active'

define "Denominator":
  "Initial Population"

define "Numerator":
  exists "Most Recent HbA1c Above Threshold"

define "Most Recent HbA1c Above Threshold":
  Last([Observation: "HbA1c Laboratory Test"] O
    where O.effective during "Measurement Period"
    sort by effective) R
    where R.value as Quantity > 9.0 '%'
