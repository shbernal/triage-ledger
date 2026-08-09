# Phase: drain — deciding

Entries are outstanding. Most of them will be dismissed — that is normal, and it is the
operation to make fast. If dismissal costs a ceremony each, the triage stalls and the file
rots into false coverage.

## Work a queue, not a pile

```sh
npx triage-ledger@0.1 next 10
```

Ten things is a task; four hundred things is a mood. Take a batch, decide all of it, take
the next.

## For each entry, one of four moves

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
Park when you genuinely intend to come back, not when you want the queue shorter.

**Rewrite the summary, then decide.** Some entries arrived with useless titles — a bare
number, three words, a stack trace. Rewriting one is a triage act, not tampering: `source`
is the provenance field and nothing is lost. Until those are done the ledger is not yet
readable offline, which is a promise it has to keep.

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

`validate` refusing with **unresolved merge conflict** means exactly that, and it is the
first thing to fix — nothing can read the file until you do.

Do not resolve it by keeping both sides. The conflict boundary falls where the text
differs, not where an entry ends, so both sides together can put a trailing field on the
entry *after* the one it belongs to and bring back every entry the other branch pruned. The
result usually validates: an entry restored to `needs-triage` is a legal entry, and nothing
in the format knows it was ever decided. Run `git config merge.conflictStyle zdiff3` so the
merge base is visible, then resolve entry by entry — the union of both sides' decisions and
the union of both sides' deletions. Report the reversal count to the human if there was one;
it is not something they can see in a passing build.

If you are the one on a branch: decide freely, and leave pruning to the shared branch.
Deciding entries merges cleanly. Removing them is what conflicts.

## When it is done

`status` reports `retire`. Go to [retire.md](retire.md).
