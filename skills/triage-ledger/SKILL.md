---
name: triage-ledger
description: 'Use when working with a triage ledger (docs/backlog.yml with `schema: 1`) — triaging a backlog, dismissing or accepting entries, choosing a dismissal reason, defining vocabulary, or retiring the ledger. Also use when asked to work through an inherited backlog of issues or a TODO pile.'
schema: 1
---

# Working a triage ledger

A triage ledger is a backlog **designed to end**. It is seeded, drained, and then retired —
the file empties and the project stops using the system. Your job is to move it toward
empty without cheating, and the ways of cheating are specific and listed below.

**Read `SPEC.md` in the ledger's own project, or at
https://github.com/shbernal/triage-ledger, for the format and the rules.** This skill does
not repeat them. It carries the judgment that neither the spec nor the validator can:
the validator cannot tell whether a `describes` is any good, and it will never notice that
your new reason is a synonym of an old one.

## First, find out where you are

```sh
npx triage-ledger@0.1 status --json
```

That reports a `phase`. Read the matching file and work from it:

| phase | read |
|---|---|
| `setup` | [references/setup.md](references/setup.md) — the vocabulary is not written yet |
| `seed` | [references/seed.md](references/seed.md) — the vocabulary exists, the ledger is empty |
| `drain` | [references/drain.md](references/drain.md) — entries are outstanding |
| `retire` | [references/retire.md](references/retire.md) — everything is terminal |

If the command is not available, the project has adopted the spec without the tooling.
That is a supported path, not a broken setup. Read the ledger directly, work out the phase
from it, and see "When the CLI is not installed" below.

## The rules that survive every phase

**Reuse the closest existing term. Never invent a synonym.** This is the single most
important line in this document. The vocabulary is *data*, so any dismissal reason you
invent is legal by construction and nothing will stop you. An agent triaging four hundred
entries will mint forty near-duplicate reasons unless it is told not to, and forty reasons
that each mean "we don't want it" destroy the instrument: at retirement, a reason whose
entries have nothing in common cannot be distilled into one true sentence, so retirement
degrades back into per-item migration — the exact failure the design exists to prevent.

Before adding any value to the vocabulary, run:

```sh
npx triage-ledger@0.1 values non_target_reasons
```

That prints every reason with the text that distinguishes it from its neighbours. Read all
of them. If one fits, use it. If you genuinely need a new one, add it **in the same edit
that first uses it**, write a `describes` of the form *"distinct from X, because Y"*, and
say in your message why the existing reasons did not fit.

**Never assert something you did not check.** A reason may declare
`requires_evidence: [...]`, and where it does, that is a hard-won lesson someone wrote down.
Reading the source and concluding something *should* work is not evidence that it *does*.
If a reason demands a reproduction, run one. If you cannot, the entry is parked, not
dismissed — and parking is honest.

**Both exits cost something, and that is the point.** Dismissing costs a declared
destination; accepting costs evidence and a real `next_action`. If you find yourself
wanting to skip either, you are about to convert a backlog into a differently-coloured
backlog. Park it instead: a parked entry blocks retirement, which is exactly what an
unmade decision should do.

**Batch. Do not loop.** Dismissing eighty entries for one reason is one command, not
eighty:

```sh
npx triage-ledger@0.1 set-status --to <status> --reason <reason> --search "<text>" --dry-run
```

Always `--dry-run` first and read the ids it lists. Then run it again without.

**Never hand-edit `items:` where the CLI is installed.** Not because the CLI is mandatory —
the spec is deliberately adoptable by hand — but because you will reach for a YAML
round-trip, and that eats the comments in the vocabulary block. Those comments carry the
history of why the vocabulary looks the way it does, and they are not recoverable. The
point is comment survival, not tool loyalty.

## When the CLI is not installed

Hand-edit, carefully, the way a human would:

- Preserve every comment, every block scalar, and the existing key order. Do not reformat.
- Write `summary` as a double-quoted scalar, always.
- Write only the fields the entry's class requires. Do not add empty placeholders.
- Re-read the file after editing and check it against `SPEC.md` yourself.

## Referring to an entry from source code

If a workaround in the code exists because of a ledger entry, tag it with the declared
prefix so that teardown is one grep for one literal string:

```js
// triage-ledger:upstream-issue-412 — remove when oklch lands upstream
```

Every such reference must resolve to a live entry. Before removing an entry, grep the repo
for its id: a reference to a deleted entry is worse than no reference, because it still
reads as explained.

## What to tell the person you are working for

Report what you dismissed and under which reason, in groups rather than one line per entry.
If you added anything to the vocabulary, say so first and say why — that is the change that
is hard to undo, and it is the one they most need to review.
