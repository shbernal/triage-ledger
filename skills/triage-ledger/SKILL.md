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
| `seed` | [references/seed.md](references/seed.md) — the vocabulary exists and nothing has been seeded |
| `drain` | [references/drain.md](references/drain.md) — entries are outstanding |
| `retire` | [references/retire.md](references/retire.md) — nothing is outstanding; distil and tear down |

**If it exits non-zero it has not named a phase, and that is the one case you must not
route past.** It refuses for exactly two reasons and prints them: an unresolved merge
conflict, or a ledger that does not validate. Both mean the same thing to you — the file
in front of you does not yet say what it appears to say, every count computed from it is
drawn from data the validator rejects, and there is no phase to be in. Fix what it lists,
`npx triage-ledger@0.1 validate` for the full set, and probe again.

Do not fall through to the paragraph below when this happens. That one is about the tool
being **absent**, which is a different condition with a different answer, and treating a
failing probe as a missing one sends you to hand-edit a file you have not yet understood.

The conflict case has one resolution and it is worth having here, because a conflicted
ledger is one you cannot read the drain reference from:

```sh
git config merge.conflictStyle zdiff3   # so the merge base is visible
```

Then resolve **entry by entry** — the union of both sides' decisions *and* the union of
both sides' deletions. Do not keep both sides wholesale: a conflict boundary falls where
the text differs, not where an entry ends, so both together can put a trailing field on the
entry after the one it belongs to and restore every entry the other branch pruned. The
result usually validates, because an entry back at `untriaged` is a legal entry and nothing
in the format knows it was ever decided. Count the decisions that came back and say so.

If the command is **not available**, the project has adopted the spec without the tooling.
That is a supported path, not a broken setup. Read the ledger directly, work out the phase
from it, and see "When the CLI is not installed" below.

## What the probe cannot tell you

Two things, and both are worth knowing before you act on a phase:

**An empty ledger.** `seed` means nothing was ever seeded here. The probe establishes that
from the `upstream:` block, which records what one import actually did — so a project that
seeded from something the file does not describe, a `TODO.md` or a spreadsheet, leaves no
trace at all once the entries have been pruned. If you are told `seed` and anything else
suggests this project already drained, `git log -- <ledger>` is the only thing that knows.
Seeding a second time is the one mistake this phase cannot undo.

**Whether the ledger moved backwards.** Nothing here compares against an earlier version.
A merge resolved by keeping both sides restores pruned entries and reads afterwards as a
young, healthy triage — it validates, and the burn-down says activity was today. Where you
are picking up work somebody else left, `git log -- <ledger>` before you trust the counts.

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

**A reason that is true of everything is worth nothing.** The rule above is about not
minting synonyms; this is its opposite failure, and it is the one an agent under time
pressure commits. The cheapest reasons in any vocabulary — no `requires_evidence`, and
`retire_to: null` — are the ones a bulk transition reaches for, and what they produce is
not a false claim that somebody would catch. It is a *true and empty* one: "no reproduction
was ever provided" is true of a feature request the way it is true of a rock. Before
dismissing a batch, read the reason's own sentence aloud against one of the entries. If it
does not say something about *that* entry, it is the wrong reason, however legal the file
is afterwards.

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
- Write `summary` as a double-quoted scalar, always, and on one line — a line break in a
  summary is illegal.
- Quote anything free-text. A plain scalar has a type and YAML picks it, so `3.10` written
  bare is the number 3.1 and the file still reads `3.10` afterwards.
- Write only the fields the entry's class requires. Do not add empty placeholders.
- When you change a decision, remove the one you are replacing. A dismissal reason on an
  entry you have just accepted, or a `next_action` on one you have just dismissed, makes
  the entry assert both.
- Write today's date, never a later one. `last_reviewed` is what "how long has this been
  silent" is computed from, and a date that has not happened makes an abandoned triage
  read as a fresh one. It must also not precede the entry's `first_seen`.
- Delete an entry only once it is terminal. Removing an undecided one leaves a ledger that
  validates, owes nothing, and is ready to retire — having decided nothing.
- Re-read the file after editing and check it against `SPEC.md` yourself.

## Referring to an entry from source code

If a workaround in the code exists because of a ledger entry, tag it with the declared
prefix so that teardown is one grep for one literal string:

```js
// triage-ledger:upstream-issue-412 — remove when oklch lands upstream
```

Every such reference must resolve to a live entry. Before removing an entry, grep the repo
for its id — `remove` prints the exact command — because a reference to a deleted entry is
worse than no reference: it still reads as explained. Exclude `.git`; the history keeps
every id permanently and is meant to.

## What to tell the person you are working for

Report what you dismissed and under which reason, in groups rather than one line per entry.
If you added anything to the vocabulary, say so first and say why — that is the change that
is hard to undo, and it is the one they most need to review.
