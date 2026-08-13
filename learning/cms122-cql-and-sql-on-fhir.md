# Diabetes: Glycemic Status Assessment Greater Than 9%

The same measure, twice: once as CQL against QI-Core, once as a SQL-on-FHIR
ViewDefinition. Run them side by side and the interesting part is where they
stop agreeing.

CMS122 looks simple. Patients 18 to 75 with diabetes, and the measure reports
the share whose glycemic status is poorly controlled. Almost everyone gets the
numerator wrong on the first read, which is why it is worth an hour of your
time rather than five minutes.

## What is in the package

`us.openquality.cms.diabetes-glycemic-status-assessment-greater-than-9`

The measure logic, plus every library it includes, vendored so it loads without
fetching anything: `FHIRHelpers`, `QICoreCommon`, `Status`, `Hospice`,
`PalliativeCare`, `AdvancedIllnessandFrailty`, `CumulativeMedicationDuration`
and `SupplementalDataElements`.

`us.openquality.community.glycemic-status-assessment-sql-on-fhir`

One ViewDefinition that flattens HbA1c observations into columns.

## Exercise 1: predict the numerator, then read it

Before opening the CQL, write down your answer.

A 54 year old patient has diabetes and a qualifying encounter in the
measurement period. Their chart contains **no HbA1c result at all**. No test was
ordered, none was resulted, nothing.

Are they in the numerator?

Now open `CMS122FHIRDiabetesAssessGreaterThan9Percent.cql` and read `define
"Numerator"`. It is three clauses joined by `or`, and only one of them is about
a number being above 9.

The measure is named "greater than 9%" and it counts patients with no
measurement at all. That is deliberate: unmeasured is treated as uncontrolled,
because a diabetic patient nobody tested is not a patient known to be fine.

Two separate absence paths reach the numerator. Find both, and work out how they
differ. One is an assessment that happened and produced nothing; the other is an
assessment that never happened.

An implementer who assumes the numerator needs a result above 9 reports a rate
that is too low. Every patient they dropped is one their organization was
supposed to follow up.

## Exercise 2: the same concept, resolved two ways

Open the ViewDefinition and find its `where` clause. It selects HbA1c
observations by three LOINC codes, written out.

Now find how the CQL identifies the same concept. It does not enumerate codes.
It references a value set, and the value set is resolved at execution time
against a terminology server.

Neither is wrong. They fail differently, which is the point:

- Enumerated codes are readable and reproducible. Nothing resolves at runtime,
  so nothing changes underneath you. They also go stale the moment the value set
  gains a code, and nothing warns you.
- A value set reference stays current and is what the steward actually
  specified. It also means your result depends on a server, on a binding, and on
  which expansion you got on the day you ran it.

Two teams can implement this measure faithfully, from the same specification,
and disagree about a patient. Neither has a bug. Write down which behaviour you
would want in a regulatory submission, and which in a dashboard, and why the
answers might differ.

## Exercise 3: make it slow, then make it fast

Take any define in the measure that filters a retrieve. Rewrite it as a function
that takes the same filter as a parameter and call it from three places.

Measure both. On a patient bundle of any size the second version does more work.
A define is evaluated once per patient and its result reused. A function call is
not reliably treated the same way.

This is the single most common reason a correct measure is too slow to run at
population scale, and it produces no error, no warning, and no validator
finding. The measure returns the right answer. It just cannot finish.

The full write-up, including why the specification does not settle it and when a
function call *can* be cached, is at
<https://openquality.us/knowledge/cql-2026-001>.

## What this is and is not

Repackaged for reading, teaching and testing. Not for production reporting, and
not an authoritative publication of this logic. The `Library` resources are
marked `experimental` and their canonical URLs point at `openquality.us` rather
than at the measure steward, because a repackaged copy is not a publication.

**Content**: cqframework/ecqm-content-qicore-2025, under CC0-1.0.
**Measure steward**: National Committee for Quality Assurance.
**Packaged by**: Open Quality, <https://openquality.us>.

Value sets are referenced by OID and canonical URL and never embedded, so you
will need your own free UMLS account to expand them against VSAC. No CPT display
descriptors are included; codes and code systems are.

Open Quality is not a measure steward and is not affiliated with or endorsed by
CMS, NCQA, or HL7.
