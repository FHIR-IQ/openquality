---
id: cql-2026-001
scope: cql
type: implementation-note
status: open
categories: [cql, performance]
reporter: evan-machusak
---

## Summary

A define is evaluated once per patient and its result is reused. A function is
evaluated on every call. Logic written as functions therefore re-runs its
retrieves each time it is invoked, which turns one pass over a patient's data
into repeated full scans of the bundle.

Restructuring the same logic into prefiltered defines took one eligibility
library from 30 to 40 seconds per patient to under a second, returning the same
results.

## Detail

Recorded with the permission of Evan Machusak, who diagnosed it. The library was
an eligibility screening set written for a dissertation project; its author is
not named here pending their say-so, and this entry will name them if they want
it.

The author could not tell whether the cause was their logic, their engine, or
their data. It was the logic, and specifically the shape of it rather than
anything wrong with it. The criteria had been written as functions, which reads
well and composes well. Each call re-evaluated the retrieve inside it, so the
cost scaled with the number of call sites rather than with the number of
patients' worth of data.

The fix was not to write less logic. It was to move the retrieves and their
filters into defines, so each one is evaluated once and every later reference
reuses the cached result, and to prefilter before iterating rather than
iterating and then filtering.

Two things make this worth writing down where every measure can see it, rather
than filing it against whichever measure exposed it:

1. It is a fact about how CQL is evaluated. It is true of every library anyone
   writes, and nothing about it is specific to a measure, a steward, or a
   measurement year.
2. Nothing in the logic looks wrong. There is no error, no warning, and no
   validator finding. The measure returns correct results. It is simply too slow
   to run at population scale, and the author has no signal pointing at the
   cause.

## Why the tooling will not save you yet

Evan relays a remark from Bryn, made a couple of years ago: *"Performance is a
tooling problem, not an authorship problem."* The thought was that CQL engines
would eventually build optimized execution plans the way SQL engines do, so
that the restructuring described above would be applied by the tooling rather
than by the author.

In principle this whole entry could be codified as an ELM rewriter that
optimizes bad ELM. In Evan's assessment the difficulty is comparable to writing
a query planner for SQL, it is PhD-level work, and no engine that exists today
attempts it.

His conclusion, which is the part to take away:

> So for the time being, performance **is** an authorship problem.

That is a statement about the present, not a prediction. When an engine does
start planning, this entry should be revisited rather than deleted, because it
will then be a record of what the tooling took over and when.

## What is still open

Whether define caching is guaranteed by the CQL specification and ELM semantics,
or is an implementation choice that happens to be shared by the engines in
common use. The advice above is sound either way, but the two cases differ in
what a reader is entitled to rely on, and the entry should say which. Left open
rather than guessed at.

Also open: what a reader can do to spot this in their own library before it
costs them a week. The lesson so far arrived by way of an expert reading the
source. That does not scale, and it is the gap this corpus exists to close.
