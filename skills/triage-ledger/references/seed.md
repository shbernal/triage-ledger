# Phase: seed — getting the pile into the file

The vocabulary is written and the ledger is empty. Three ways in: start empty and `add` as
things arrive, bulk-import from an issue tracker, or migrate an existing pile (a `TODO.md`,
an export, a spreadsheet). The last two are the same command — see [the bulk
seed](#the-bulk-seed-import) below — because they differ only in where the records came
from, which is something the ledger cannot see and does not need to.

## First: is it empty, or is it finished?

An empty ledger is the state this phase begins from and also the state a successful triage
*ends* in — §6 has you prune each entry as it closes, so a project that drained everything
it inherited leaves a file that looks exactly like one nobody has started. The probe
separates them where it can, from the `upstream:` block's record of what an import actually
brought in, and routes an already-seeded ledger to [retire.md](retire.md) instead of here.

Where it cannot, it says so, and you are the check. A ledger seeded from something the file
does not describe — a `TODO.md`, an export, a spreadsheet — keeps no record of its own
import, so nothing in it distinguishes never-started from finished. Before you import
anything:

```sh
git log -- <ledger>
```

An empty history is a ledger that has never held entries. Anything else is a triage that
already happened, and you are in retirement, not seeding — go and read what it decided
before you consider putting the pile back. This matters more than it sounds, because the
rule below makes it the one mistake this phase cannot take back.

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

**A source whose unit is not the ledger's has a step before the ledger.** The ledger's unit
is the entry — one entry, one decision — and where the source counts in something else,
there is a decision above the entry that the ledger has no unit for and cannot record
afterwards. Two shapes of this, and both are common.

*Rules.* If the pile comes from a scanner, a
linter or a grep — anything applying rules rather than reporting incidents — then most of
what it emits is one decision repeated, not many decisions. A single pattern routinely
accounts for the overwhelming majority of the hits and is wrong on every one of them: a
path-traversal rule that matches every relative import produces hundreds of findings and a
single verdict, *that rule is off here*. The ledger's unit is the entry — one entry, one
decision — and it has no unit for "this rule does not apply to this project", so seeding
first means paying per entry for something you decided once.

So tune the rules, then import. Run the scan, group the hits by rule, and decide per rule
whether it is worth reading at all. That decision belongs in the scanner's configuration,
where it keeps working, and not in a ledger designed to be deleted; what survives it is
what the ledger is for. Record which rules you turned off and why, next to the filter and
for the same reason — it is the difference between "we triaged the scan" and "we triaged
the part of it we kept".

*Documents.* If the pile comes out of something somebody wrote — a `TODO.md`, a list of
open questions — the unit is the writing, and the step is **choosing what an entry is**.
Six headings can honestly be six entries or eighteen. One per heading makes every decision
after it a compound one, and the entry then cannot reach a status without being partly
false; one per bullet splits questions that are genuinely single, and the same argument
gets made three times. The document declares its own unit in places (*"the sub-questions,
in order"*) and not in others, and where it does not, the choice is the seeder's and is
invisible from the ledger afterwards — nothing in an entry records that it used to be a
third of something. So make it once, deliberately, before any entry exists, and say what
you counted in the retirement summary, next to the filter and for the same reason.

**Be resumable.** Several hundred entries will not arrive in one pass — a rate limit, a
dropped connection, a closed laptop. Re-running must skip ids already present and must not
touch an entry whose status has moved. `import` does both; if you are seeding some other
way, build that in first, not after the first interruption.

**Declare before you use.** If you carry values across — imported labels, priorities,
anything landing in a constrained field — collect the distinct set, write it into the
vocabulary in the same edit, with a comment recording that the seed put it there, and only
then attach it to entries. Bulk seeding is the one moment large enough to breach vocabulary
closure without anyone noticing.

## The bulk seed: `import`

```sh
gh issue list --state open --limit 400 --json number,title,url,labels > issues.json

npx triage-ledger@0.1 import issues.json \
  --type issue --status needs-triage \
  --map 'id=upstream-issue-{number}' \
  --map 'source=acme/renderer#{number}' \
  --map 'summary={title}' \
  --map 'tags[]={labels[].name}' \
  --repo acme/renderer --filter 'is:open updated:>2023-08-08' --total-open 1051
```

**It does not fetch, and the query being yours is the point.** `upstream.filter` has to be
the exact predicate that ran; if the tool built the query, that field would hold the tool's
account of what it thinks it asked for. Run your own `gh`, `curl`, or export, hand over the
JSON — an array or one object per line, from a file or `-` for stdin.

`--map field={path}` takes a value from each record. A path reads a key, may be dotted
(`author.login`), and `labels[].name` fans out over an array. Mixing a placeholder with
literal text builds a value, which is how an id gets the prefix its kind declares.
`--map 'field[]={path}'` writes a list, one element per array element, and takes exactly one
path. Anything constant across every entry goes in `--type`, `--status`, `--source` or
`--set` instead.

**Run it and read what it refuses.** Every refusal below is one of the rules above, and
none of them is worth working around:

- *Values landing in a constrained field are undeclared.* Re-run with `--declare` and they
  are written into the vocabulary in the same write as the entries, with a comment saying
  the seed put them there. It never invents a type or a status: those arriving undeclared
  is a mapping mistake, not a value carried across.
- *No `--repo` / `--filter` / `--total-open`.* Owed once an entry's type declares a
  `source_pattern`. A pile of your own — a migrated `TODO.md` under a local kind — owes
  none of it, and none is invented.
- *A different filter from the one already recorded.* The `upstream:` block describes one
  import. Seed once, never reconcile.
- *A record that does not resolve a field an entry cannot be written without.* Nothing is
  written, deliberately: a mapping wrong for one record is suspect for the ones it happened
  to resolve, and a half-seeded ledger is the state with no good way out.

Interrupted, or a bigger export later? Run the same command again without the upstream
flags. It skips ids already present and does not touch an entry whose status has moved.

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
