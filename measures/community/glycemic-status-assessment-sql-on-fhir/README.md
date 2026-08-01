# Diabetes: Glycemic Status Assessment Greater Than 9% (SQL on FHIR)

A SQL-on-FHIR ViewDefinition implementation of the same measure that
[`cms-fhir-2026/diabetes-glycemic-status-assessment-greater-than-9`](../../cms-fhir-2026/diabetes-glycemic-status-assessment-greater-than-9/)
carries in CQL. It exists so the corpus holds one measure implemented two
independent ways, which is the clearest demonstration that `dataModel` and the
conformance ladder do real work.

## Intent

Project HbA1c observations into a tabular form so the measure's numerator can be
computed in SQL against a warehouse, rather than through a CQL engine.
Percentage of patients 18 to 75 years of age with diabetes whose most recent
glycemic status assessment was greater than 9%, or who had none.

## Known Limitations

This package is a partial implementation and says so rather than pretending
otherwise. It ships the observation projection only: `views/patient-hba1c.json`
selects qualifying HbA1c observations and their patient references. The
denominator, the exclusions, and the numerator logic are not implemented here.

It also enumerates HbA1c LOINC codes directly in the `where` clause, while the
CQL implementation resolves the same concept through the HbA1c Laboratory Test
value set. Those two will drift apart the moment the value set changes. That
divergence is the point of publishing both: it is a real interpretation issue,
and it is recorded in [`knowledge/`](../../../knowledge/).

Not clinically validated. Not suitable for reporting.

## Provenance

Original work, authored for Open Quality as a worked example of the package
format. Not redistributed from any upstream source, which is why this package
carries no `provenance` block: that field is required for redistributed
content, and requiring it here would make an original author invent an
upstream that does not exist.

The measure it implements is stewarded by the National Committee for Quality
Assurance. Open Quality is not a measure steward and is not affiliated with or
endorsed by NCQA or CMS.
