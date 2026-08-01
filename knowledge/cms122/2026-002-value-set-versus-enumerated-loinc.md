---
id: cms122-2026-002
type: interpretation-issue
measure: cms/diabetes-glycemic-status-assessment-greater-than-9
measureVersion: "0.5.0"
measurementPeriod: 2026
status: open
categories: [measure-logic, terminology]
reporter: aks129
---

## Summary

The CQL implementation resolves HbA1c results through the "HbA1c Laboratory
Test" value set. The SQL-on-FHIR implementation in the same corpus enumerates
LOINC codes directly. The two agree today and will diverge the moment the
value set changes.

## Detail

`cms/diabetes-glycemic-status-assessment-greater-than-9` declares
`valueset "HbA1c Laboratory Test": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.198.12.1013'`
and matches observations against it, so the set of qualifying codes is
whatever VSAC currently expands that OID to.

`community/glycemic-status-assessment-sql-on-fhir` filters on an inline list
of LOINC codes (`4548-4`, `17856-6`, `4549-2`) in the ViewDefinition `where`
clause. That list was correct when it was written and is not bound to the
value set.

This is not a defect in either implementation. It is the tradeoff a SQL
implementation usually has to make, because expanding a value set at query
time needs terminology service access the warehouse often does not have. The
point of recording it is that the tradeoff is usually invisible: a reader
comparing the two would assume they compute the same thing.

The input that exposes it is any HbA1c LOINC code added to the value set
after the ViewDefinition was written. The CQL picks it up; the SQL does not.

## Resolution

Open. Two candidate answers worth discussing:

1. The SQL implementation ships the expansion it was built against as a
   versioned lookup table, making the binding explicit and dated. This
   conflicts with the content policy, which forbids redistributing VSAC
   expansions, so it would have to be a reference to a locally materialised
   table rather than shipped content.
2. The package format grows a way to declare "this artifact uses a frozen
   expansion of value set X as of date Y", so the staleness is
   machine-readable rather than a comment.

Neither is decided. Comments welcome.
