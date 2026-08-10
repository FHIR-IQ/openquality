/*
 * A minimal, syntactically valid CQL skeleton. It is a starting point, not a
 * measure: the numerator is a literal false and computes nothing clinically
 * meaningful. Replace the whole file.
 *
 * Name the file after the library. Most CQL tooling resolves an include by
 * looking for <LibraryName>.cql, so a mismatch breaks translation.
 */
library TemplateMeasure version '0.1.0'

using FHIR version '4.0.1'

/*
 * Value sets are referenced, never embedded. This is a real VSAC canonical
 * URL, shown so the exact reference format is visible. Replace it with the
 * value sets your logic uses, and list each one in openquality.yaml under
 * valueSets.
 *
 * You expand these yourself against VSAC with a free UMLS account. This
 * corpus ships the reference, not the expansion.
 */
valueset "Diabetes": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.103.12.1001'

parameter "Measurement Period" Interval<DateTime>

context Patient

define "Initial Population":
  exists ( [Condition: "Diabetes"] )

define "Denominator":
  "Initial Population"

define "Numerator":
  false
