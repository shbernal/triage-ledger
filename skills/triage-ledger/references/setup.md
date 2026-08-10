# Phase: setup — the vocabulary is not written yet

`status` reports `setup` when the ledger exists but declares no dismissal reasons. Nothing
can be dismissed yet, which is deliberate: the format enforces vocabulary-before-seeding
rather than recommending it.

**Do not seed anything until this is done.** Deciding what the project will and will not
carry *before* seeing the four hundred specific things is the difference between a policy
and four hundred case-by-case rationalizations. Afterwards, every dismissal is an
application of a decision already made; beforehand, every dismissal is a new argument, and
you will not make the same one twice.

## What you are writing

Ask the person you are working for, and write down their answers rather than your guesses.
These are policy decisions about their project, not facts you can derive from the code.

**Statuses.** The names are theirs; the `class` is not. Start with what `init` wrote and
only rename. If they want two statuses of the same class — `deferred` and `on-hold`, say —
write the difference into `describes`, because that is exactly the pair that will otherwise
be applied interchangeably. Do not invent a status for something that is really an extra
field: a status may declare `requires: [some_field]` instead.

A status may also declare `types`, the same key described under the reasons below: the entry
kinds it may be applied to. Reach for it on a parking status whose `describes` promises an
action. Parking is the cheapest move in the whole format — no destination, no evidence — and
*"we will try to reproduce this"* is a promise nobody can keep about a feature request or a
patch, while the entry it is written on holds retirement open for as long as it stands.

Classing a status `done` costs `evidence.local_files` on every entry that reaches it, so
class `done` only what will have files to name. "Covered by something else" reads like a
`done` and usually is not one — see [drain.md](drain.md).

**Dismissal reasons.** The important ones. For each, three things:

- `describes` — what distinguishes it from its **neighbours**. Aim for the shape *"distinct
  from X, because Y"*. A definition is not enough; a boundary is what you need, because
  the question at entry 300 is never "what does this mean" but "which of these two is it".
- `about` — `item-state` (something about the incoming report) or `project-policy`
  (something about *this* project).
- `retire_to` — where the finding lives once the ledger is deleted.

And a fourth where it applies: `types`, a list of declared entry types the reason may be
used on. Most reasons should not carry it — a scope decision is about the ask, not about how
the ask arrived. Reach for it when the reason's sentence is only *about* one kind of entry:
anything phrased around a reproduction is about something that claimed a behaviour, so it
says nothing whatever about a pull request. That is the one form of a meaningless dismissal
a validator can catch, which is why the format offers a key for it and nothing else.

**On `retire_to: null`.** It means "this evaporates; git history is enough", and it is
honest for `item-state` reasons: nobody needs a permanent document saying that one
particular report was never reproducible. It is not available for `project-policy` reasons,
and the validator will refuse it there — because policy reasons are precisely the ones a
future contributor will re-litigate. "We are ESM-only" belongs in a document in the path of
the work. A dismissal's value is not that it was recorded somewhere; it is that the person
about to redo the work will encounter it, and nobody reads a backlog before writing code.

If you find yourself wanting `null` on a policy reason, the honest move is to name the
document it should go in, even if that document does not exist yet.

**You are not going to get the complete list here, and the format does not ask you to.**
Write the reasons you can defend now — the ones you can draw a boundary around — and expect
to add one later. The gap that stays invisible longest is a reason about *price*: for as
long as "later" is an available answer, everything expensive parks instead of being
dismissed, and no reason about subject matter or reproducibility can answer a question
about cost. `retire --check` is usually the first thing that forces it, which is why
[retire.md](retire.md) says the parked entries are where the missing reason shows up.

A late reason is a normal event. What matters is that it arrives with a `describes`, an
`about` and a destination like every other one — not that it was there on day one. What
vocabulary-before-seeding buys is that the reasons you *did* write get applied
consistently, and that holds whether the list ends at four or at five.

**Evidence kinds.** What would someone have to have actually *done* to claim this? Group
them — reading a spec and running the thing are different claims. Then, for any reason that
is only honest with a particular kind of proof, add `requires_evidence: [kind]`. That is
one of the few places a hard-won lesson can be made mechanical.

## When it is done

`npx triage-ledger@0.1 validate` passes and prints no warnings you have not read. Then move
to [seed.md](seed.md).
