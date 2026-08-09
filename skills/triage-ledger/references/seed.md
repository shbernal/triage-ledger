# Phase: seed — getting the pile into the file

The vocabulary is written and the ledger is empty. Three ways in: start empty and `add` as
things arrive, bulk-import from an issue tracker, or migrate an existing pile (a `TODO.md`,
an export, a spreadsheet).

## The rules that make seeding safe

**Seed once. Never reconcile.** Nothing goes back and re-reads the source. A live sync
turns the ledger into a mirror of somewhere else instead of a record of *this project's*
decisions — and when the source is abandoned, there is nothing to sync against anyway.

The consequence is a real constraint: after seeding, `source` is provenance, not a live
link. The ledger must stay fully readable with the network down and the upstream repository
deleted. That is why summaries have to be self-contained, and why rewriting a useless one
is allowed and expected.

**Do not copy issue bodies into the ledger.** It duplicates a public record and turns a
readable file into an unusable one. Metadata-first survives contact with real data: titles
are short and usually name a symptom, which is enough to triage against.

**Filter, and say what you filtered.** The realistic failure of this whole method is:
import six hundred entries, triage forty, abandon the file. That is *worse than never
starting*, because a stale ledger implies coverage that does not exist. So take a subset on
purpose, take everything only by explicit choice, and record the exact predicate in
`upstream.filter` — not a description of it. Six months from now a reader has to be able to
tell "we triaged this backlog" from "we triaged the last three years of it".

Where the source has activity timestamps, recent activity is the filter that holds up. On a
dead project "last updated" does not measure project activity — the maintainers are gone.
It measures *"this still hurts someone"*, which is exactly the signal a triage wants.
Filtering on when something was *filed* selects for a different and much worse set.

**Be resumable.** Several hundred entries will not arrive in one pass — a rate limit, a
dropped connection, a closed laptop. Re-running must skip ids already present and must not
touch an entry whose status has moved. If you are writing the import yourself, build that
in first, not after the first interruption.

**Declare before you use.** If you carry values across — imported labels, priorities,
anything landing in a constrained field — collect the distinct set, write it into the
vocabulary in the same edit, with a comment recording that the seed put it there, and only
then attach it to entries. Bulk seeding is the one moment large enough to breach vocabulary
closure without anyone noticing.

## Two things that bite on Windows

`gh` emits CRLF. Strip `\r` at the boundary where you parse its output, once, and never
build a downstream argument from unstripped text. It fails loudly when the `\r` lands in a
URL; a `\r` reaching a `summary` value is now a validation error rather than an invisible
character, so `add` refuses the entry — which is the point of the rule, but it means the
strip has to happen and it has to happen in one nameable place.

That rule has a second edge, and it is the one nothing can catch for you: **on Windows the
`npx` shim drops a newline inside an argument along with every argument after it.** A
summary built from unstripped multi-line text arrives truncated, the flags that followed it
are silently never applied, and the command prints `Added` and exits 0. The dropped
arguments never reach the process, so no amount of care inside the tool helps. Strip line
terminators before you build the argument.

Titles are full of `&`, `|`, `<`, `>`, quotes and — the expensive one — leading and
trailing whitespace. Pass them as arguments, not through a shell; the emitter double-quotes
every summary and that handles the rest.

## Freshly seeded is not yet offline-readable

Some fraction of any real corpus has titles that are unreadable alone — three words, a bare
number, a stack trace. Do not fix them during the seed: rewriting a summary is a triage act
with a date attached, and doing it at import time is triage without a record. Leave them,
and rewrite them as you reach them in [drain.md](drain.md).
