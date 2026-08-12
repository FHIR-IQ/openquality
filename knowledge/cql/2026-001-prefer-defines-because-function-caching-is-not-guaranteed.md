---
id: cql-2026-001
title: "Prefer defines, because function caching is not guaranteed"
scope: cql
type: implementation-note
status: open
categories: [cql, performance]
reporter: evan-machusak
---

## Summary

Engines in common use evaluate a define once per patient and reuse the result.
They do not reliably do the same for a function call. Logic written as functions
therefore tends to re-run its retrieves on every invocation, which turns one
pass over a patient's data into repeated full scans of the bundle.

Restructuring the same logic into prefiltered defines took one eligibility
library from 30 to 40 seconds per patient to under a second, returning the same
results.

Neither behaviour is required by the specification. Both are engine
implementation choices, which is what makes this an authorship problem rather
than something you can look up. See "What the specification actually says"
below, which corrects an earlier version of this entry.

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

## What the specification actually says

Nothing. An earlier version of this entry left that open and stated the
behaviour as though it were a rule; Evan Machusak answered it, and the answer
changes what a reader is entitled to rely on.

**Caching a define is an implementation choice, not something the specification
dictates.** No engine is obliged to do it. Every engine in common use does, which
is why the advice above works, but it is a habit rather than a guarantee and a
conforming engine could drop it.

**A function call can be cached too.** That is memoization: if a function is
invoked twice with the same arguments, the second call can reuse the first
result. So "functions never cache" is wrong as a blanket statement, and this
entry said it.

**The catch is deciding what "the same arguments" means.** In CQL that is often
hard, particularly when a function takes a list of FHIR resources as a
parameter, which is exactly what measure logic does. Comparing two such
arguments for equality can cost more than re-running the function. Engines
therefore tend to apply memoization conditionally, based on the parameter types,
and a function taking lists of resources is usually on the wrong side of that
condition.

So the practical advice is unchanged, but the reason for it is different and
more useful. Prefer defines not because functions can never be cached, but
because whether a given call is cached depends on your engine and on the types
of the arguments, and with the argument types measure logic actually uses it
usually will not be. A define's reuse is predictable. A function's is not
something you should plan around.

## What is still open

What a reader can do to spot this in their own library before it costs them a
week. The lesson so far arrived by way of an expert reading the source. That
does not scale, and it is the gap this corpus exists to close.

A concrete follow-on: which engines memoize, and under what parameter-type
conditions. That would turn "do not plan around it" into something a reader can
check against the engine they run.
