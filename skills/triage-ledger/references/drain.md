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

## When it is done

`status` reports `retire`. Go to [retire.md](retire.md).
