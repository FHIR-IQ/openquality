library Example version '0.5.000'

using QICore version '6.0.0'

include FHIRHelpers version '4.4.000' called FHIRHelpers

codesystem "CPT": 'http://www.ama-assn.org/go/cpt'
codesystem "LOINC": 'http://loinc.org'

valueset "Diabetes": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.103.12.1001'

code "Medical nutrition therapy": '97804' from "CPT" display 'Medical nutrition therapy; group'
code "Glucose management indicator": '97506-0' from "LOINC" display 'Glucose management indicator'

define "Initial Population":
  AgeInYearsAt(start of "Measurement Period") between 18 and 75
