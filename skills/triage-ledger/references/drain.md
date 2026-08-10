# Phase: drain — deciding, and then doing

Entries are outstanding. Most of them will be dismissed — that is normal, and it is the
operation to make fast. If dismissal costs a ceremony each, the triage stalls and the file
rots into false coverage.

**If the probe said `0 undecided`, skip to "If the queue is empty" below.** Almost nothing
else on this page applies to you: the deciding is finished and what is left is work.

## Work a queue, not a pile

```sh
npx triage-ledger@0.1 next 10
```

Ten things is a task; four hundred things is a mood. Take a batch, decide all of it, take
the next.

The queue serves entries nobody has opened before entries somebody already read and left
undecided, so working from the top does not re-cover the ground the last session covered.

## If the queue is empty and the phase is still `drain`

Read this before anything else on this page, because most of it will not apply to you.
This phase has two halves and they are different work:

- **Deciding.** Entries leave `untriaged`. Everything below is about this.
- **Doing.** Entries sit at a class-`accepted` status with a real `next_action`, or at a
  `parked` one. Both are outstanding, so the ledger is not retirable — and neither is a
  triage decision waiting to be made.

`next` empty with entries still outstanding means the first half is finished. It will name
what is left; `retire --check` is the standing list. What those entries need is the work
itself, done in your project the way any other work is done, and then `set-status` to a
class-`done` status **in the commit that does the work** — see [retire.md](retire.md), which
is where that rule and its reason live.

The one thing worth checking here rather than later: a decision made months ago may not
survive contact with the work. Changing it is a normal event and it is one command; see
"Changing a decision is normal" below. What is not acceptable is quietly leaving it
accepted forever, which is how a ledger becomes a differently-coloured backlog.

Parked entries are the other half of what is left, and they are the ones `retire --check`
will eventually force a question about. Do not un-park them to shorten the list.

## For each entry, one of four moves

One question picks the move, and it is not "is this real":

> **Would we do this if it arrived today, with no history attached?**

No, for a reason about us → dismiss. No, for a reason about the item → dismiss, and it
evaporates. Yes, but not now → park, which is an obligation. Yes → accept, and pay the
evidence. Everything below prices the move you picked; nothing prices the picking, and the
picking is what decides whether the project owes work. Ask it out loud, because an
inherited entry arrives carrying weight that has nothing to do with its merits: four years
in a queue is the one fact about it that carries no information.

**Dismiss.** Name a declared reason. You are not deciding where the finding goes — that
decision was made when the vocabulary was written, and you are spending it. Run
`values non_target_reasons` and pick the closest existing one. Do not invent a synonym; see
the main skill file, this is the failure that matters most.

**Accept.** Attach evidence — at least one declared kind — and a `next_action` that names
something real. "Look into it" is not a next action. Nothing reaches accepted without an
evidence path, and that cost is what stops everything becoming accepted and the backlog
merely changing colour.

```sh
npx triage-ledger@0.1 set-status <id> <status> --evidence source-read --local-file src/x.ts --next-action "…"
```

**Park.** Legitimate, and *not* an exit. A parked entry blocks retirement forever by
design: "we'll look at it later" is an obligation and the ledger's job is to keep saying so.
Park when you genuinely intend to come back, not when you want the queue shorter. It is also
the move that costs least, so read the status's own sentence against the entry the same way
you would a dismissal reason — "we will try to reproduce this" says nothing about a feature
request, and there is nothing to reproduce in a patch. A status may declare `types` and the
tool will refuse that mismatch; the rest is yours.

**Rewrite the summary, then decide.** Some entries arrived with useless titles — a bare
number, three words, a stack trace. Rewriting one is a triage act, not tampering: `source`
is the provenance field and nothing is lost. Until those are done the ledger is not yet
readable offline, which is a promise it has to keep.

## Read it and did not decide — record that, it is not a park

The fifth thing that happens and is not one of the four. You open an entry, it is not
obvious, and you are out of time. Park is the wrong answer: parking says *we intend to come
back to this specific thing*, and it holds retirement open forever on the strength of that
promise. "I have not worked out what this is yet" is not that promise.

Re-assert the status the entry already has:

```sh
npx triage-ledger@0.1 set-status <id> <the status it already has>
```

That stamps `last_reviewed` and changes nothing else. On an entry still at `untriaged` it
is the only thing in the file that says *somebody looked at this one* — and it is what
moves the entry to the back of the queue, so the next session reads what has not been read
instead of starting again at the top. It also counts as triage activity, which is correct:
reading forty entries and deciding none of them is a session that happened.

Without it the next reader cannot tell a hard entry from an untouched one, and there is
nothing else in the format that carries the difference.

## "Something else covered it"

The move that looks like a fifth option and is really one of the four. Decide it by asking
what you can point at:

- The superseding work **landed** → the entry is class `done`, and its
  `evidence.local_files` names the files *that* work changed. It owes a pointer to what
  replaced it, which is what `requires: [superseded_by]` is for.
- **Nothing changed** — it was covered by a decision, not by a diff → that is a dismissal.
  Pick the reason whose `retire_to` is where the decision now lives.

Do not close the second case as `done` against a file that did not really change for it.
Class `done` costs `evidence.local_files` precisely so that "finished" is checkable, and an
attached file that is not evidence of anything is how that stops being true — quietly, and
in the direction that makes retirement look further along than it is.

## Batch the obvious ones

```sh
npx triage-ledger@0.1 set-status --to <status> --reason <reason> --search "IE11" --dry-run
```

Always dry-run first and read the ids. On `set-status`, `--reason` *sets* the reason; use
`--status`, `--class` or `--search` to select what to transition.

**Read what a batch would claim before you run it, not just how many it matches.** The
reasons that cost least — no `requires_evidence`, `retire_to: null` — are the ones a batch
naturally reaches for, and the failure they produce is not a false statement, which somebody
would catch. It is a *true and empty* one. "No reproduction was ever provided" is perfectly
true of a feature request, in the way that it is true of a rock, and an entry dismissed that
way is legal, validates, and tells a future reader nothing at all. If a reason declares
`types`, the tool will refuse the mismatch it can see; the rest is yours. The test is
whether the reason's own sentence, read aloud against this entry, says something about
*this* entry.

Two questions worth asking of a batch that matches most of the ledger: is it one decision or
several wearing one name, and would the distilled sentence at retirement be worth reading?
A reason covering everything distils to a sentence that says nothing, and there is no
recovering that later — the entries are gone by then.

## Inherited pull requests

An open PR contains code, so the first question looks like "does the diff still apply?" —
but correct one intuition before you spend time on it. On a genuinely abandoned project
**most inherited patches still apply cleanly**: the base branch is frozen, so nothing
drifted out from under them. Deadness there comes from nobody merging, not from conflict.

So mergeability usually decides nothing. A patch that applies is not thereby wanted — it
has to earn acceptance on the same evidence as everything else, and "it merges" is not
evidence that the feature is wanted. Where a patch is genuinely obsolete but its intent is
not, dismiss the patch and open a new entry for the idea, and say explicitly that you did,
or it reads as data loss.

## Watch the burn-down, and especially the silence

```sh
npx triage-ledger@0.1 stats
```

Days-since-last-triage-activity is the number that matters. A stalled triage is silent, and
silence is the failure this whole phase is designed against. If it is climbing and the
outstanding count is not falling, say so out loud rather than quietly continuing — the
honest options are to pick it back up or to retire what can be retired and delete the rest.

That number is computed from `last_reviewed`, so leave `--date` alone unless you are
recording a session that genuinely happened on another day — and then only a day that has
been. A date in the future makes the one instrument pointed at this failure read as fresh;
the format now refuses it, and the reason it is worth knowing anyway is that reaching for it
is a sign the answer you want is "we are still on this" rather than "we are not".

## Changing a decision is normal; say what you are replacing

An entry you dismissed last week can be accepted this week. `set-status` withdraws the
decision you are replacing — the dismissal reason comes off when you accept, `next_action`
comes off when you dismiss — and keeps the evidence, which is a record of what was found
rather than a claim about the outcome. Both directions are one command; you never edit the
file to undo a decision.

What the tool cannot do is explain the reversal. Put that in the commit message, because
the entry itself will only ever show the decision currently in force, and after retirement
the commit is all there is.

## If the ledger has been touched on another branch

The resolution is in the main skill file, under the phase probe — deliberately, because a
conflicted ledger is one you cannot reach this page from: `status` refuses to name a phase
until the markers are gone, so anything written here arrives too late to be read. The short
of it: never keep both sides, resolve entry by entry, count the decisions that came back.

Two things that belong here rather than there:

**If you are the one on a branch: decide freely, and leave pruning to the shared branch.**
Deciding entries merges cleanly. Removing them is what conflicts.

**A merge that resolved cleanly is not thereby correct.** A ledger whose decisions were
reverted validates, reports today's date as its last activity, and offers you entries in
`next` that were already dismissed — every instrument in this tool agrees it is a young,
healthy triage. Nothing in the file records what it used to hold. If you are picking up
somebody else's work, read `git log -- <ledger>` before you trust the burn-down; it is the
only reader of this format that can see backwards, and the format says so on purpose.

## When it is done

`status` reports `retire`. Go to [retire.md](retire.md).
