# Phase: retire — the part nothing else specs

Nothing is outstanding. Now the ledger gets deleted, and so does the tooling. This is the
reason the format exists; do not stop at "the queue is empty".

## 1. Check

```sh
npx triage-ledger@0.1 retire --check
```

Two conditions: no entry in a non-terminal class, and every declared `retire_to`
destination exists on disk. If a destination is missing, create the document — that is not
a formality. It is the whole mechanism.

## 2. Distil, per *reason* — not per item

```sh
npx triage-ledger@0.1 retire --distil
```

This groups the remaining dismissals by reason under their destinations. Each reason owes
**one durable statement** at its destination. Twelve entries dismissed `commonjs` become
one sentence in `docs/project-target.md` — *"this project is ESM-only; CJS packaging
requests are out of scope"* — not twelve migrated entries.

This is the step that is easiest to get wrong, and getting it wrong quietly defeats
everything: if you move entries instead of distilling them, retirement was a file move and
two hundred dismissals became two hundred lines somewhere else.

Write for the person about to redo the work, not for the archive. They will not read a
backlog; they will read the document their own task sends them to. That is the whole reason
`retire_to` points where it points.

If a reason's entries turn out to have nothing in common — if you cannot write one true
sentence — say so rather than writing a vague one. It means that reason was applied
inconsistently, and the honest fix is to split the entries across better reasons first.

## 3. Write the summary

```sh
npx triage-ledger@0.1 retire --summary
```

Drafted from the root `upstream:` block plus counts. Edit it and put it in the project's own
docs. This is the one artifact that outlives everything, and it is what stops a future
contributor re-asking every question that was already answered. Keep the filter in it — the
honest claim is usually "we triaged the last three years of it", and saying so costs
nothing and buys trust.

**Draft it before you prune.** The kept count is a count of entries still in the file, and
step 4's rule removes exactly the ones that count as kept — so run this against a ledger
that still holds them, or read the number out of `git log -- <ledger>`. Run after pruning
it will tell you nine were dropped and none kept, for a triage that implemented five, and
there will be nothing left in the file to notice with.

The summary is also the document most likely to name this tool, and it is written after the
teardown list has been walked. Include it when you check step 6.

## 4. Tear down

In this order, and in **two commits**:

1. `remove --class dismissed` (and any remaining terminal entries) so the last committed
   state of the ledger is `items: []`, then delete the file. Both halves matter: a file
   deleted with nine entries in it is textually indistinguishable from a file *abandoned*
   with nine entries in it, and telling those apart is the entire product.
2. Remove the CI line that ran `validate`.
3. Remove the pointer in `AGENTS.md` (or equivalent).
4. `npx skills remove triage-ledger`, then delete what it leaves: `skills-lock.json` at the
   repository root, and the now-empty `.agents/skills/` and `.claude/skills/`. Installing
   wrote four things; removing finishes three of them.
5. Remove any link to the ledger from the project's own docs — a README or `CONTRIBUTING`
   line pointing contributors at it. Written to be helpful, so it does not read as
   integration, which is why it is the one left behind.
6. `grep -ri "triage-ledger" . --exclude-dir=.git` **and** grep the ledger's path, and check
   both are empty — including any `triage-ledger:<id>` references in source comments, which
   become dangling the moment the ledger goes, and including the summary you just wrote.

**`--exclude-dir=.git` is load-bearing, not noise.** The history holds every one of these
strings permanently and is meant to — that archive is the point of pruning in a separate
commit. Stated without the exclusion the check can never come back clean, and a check that
always fails is one its reader learns to skip.

**Prune in a later commit than the one that closed the entry.** The commit that did the
work carries the entry at its terminal status with its closing notes; a separate, later
commit removes it. Then `git log -- <ledger>` still leads a future reader to the reasoning.
Delete it in the same commit and those notes never existed anywhere. Name each removed id
in the prune commit message, and name the retirement summary document in the final one.

**And close the entry in the commit that does the work, not the one after it.** The natural
order — do the work, commit, then `set-status` — puts the status change in the *next*
commit, so `git log -- <ledger>` sends a reader to whatever change happened to land next.
That is one misleading hop, and it costs nothing to avoid: run `set-status` before you
commit, so the diff that did the work and the diff that closed the entry are the same diff.

**A reason you have to add here is a normal event, not a failure.** The parked entries are
where it shows up: `retire --check` is usually the first thing that ever forces the question
"are we ever doing this?", and no reason about subject matter or reproducibility can answer
a question about price. Add it with a `describes`, an `about` and a destination like every
other one — see [setup.md](setup.md).

## The other exit: graduation

Some projects drain what they inherited and then want to keep the file for their own work.
That is fine, provided it is explicit. The spec governs entries with external provenance:
retire all of those — distil, summarize, prune — before keeping the file. At the moment the
project adds its own item types and its own reasons for its own work, it has forked the
vocabulary and the spec stops applying. It now owns a permanent ledger, and the tooling is
its own to keep or drop.

The point graduation preserves is the only one that mattered: **the inherited backlog still
had to reach empty.**
