# The Triage Ledger

**A backlog designed to end.**

Version: **schema 1** · Status: draft

A triage ledger is an in-repo, human-readable record of *decisions* about undecided
work — inherited from an abandoned upstream, accumulated in a `TODO.md`, or simply
accreted. You seed it, you drain it, and then you **retire** it: the file empties and
the project stops using this system entirely.

That last step is the point. Every other backlog tool is designed to be kept.

## How to read this document

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** are used as
in RFC 2119, and they appear only where a rule is checkable: the ledger format and the
vocabulary (§3, §7), the seeding obligations (§4), the status ratchet (§5), the
retirement obligation (§6), and the single condition on graduation (§8). Sections 1, 2
and 9 carry none. They are reasoning and advice — you can disagree with all of it and
still conform.

The split is deliberate. A project adopting this by hand reads the MUSTs and ignores
the rest; a project running the reference tooling gets the MUSTs checked mechanically.
**A ledger declares conformance with `schema: 1` at its root**, and nothing in this
document requires you to install anything. If the spec only works when you run our
tool, it is a README, not a spec.

---

## 1. What this is, and when to use it

You have a pile of work nobody has decided about. Maybe you forked a project with 900
open issues. Maybe your `TODO.md` has been growing for three years. The pile has one
property that makes it corrosive: **it implies coverage that does not exist.** Nobody
can tell the difference between "we looked at this and said no" and "nobody has ever
read it."

A triage ledger converts the pile into decisions, and then disposes of itself.

### The lifecycle is the differentiator

**Seed → drain → retire.** A backlog that cannot reach empty is a different tool, and
most of the design follows from insisting that this one can. If you want a permanent
record of everything anyone ever wanted, use an issue tracker; it is better at that
than this is.

### The two-sided cost

Both exits from "undecided" have a price, and this is what stops the middle filling up:

- **Dismissal is cheap to assert but costs a retirement destination.** Saying no is one
  word. Saying where that no *lives* after the ledger is deleted is a design decision,
  and you pay it when you define the reason, not when you are deleting 200 entries at
  the end.
- **Acceptance is cheap to retire but costs evidence up front.** Saying yes is one word
  too. Saying yes with a file path, a spec reference or a reproduction attached is work.

Remove either cost and the ledger stops shrinking. Without the first, dismissals pile
up forever and the file asymptotes at "everything we said no to." Without the second,
everything becomes `accepted`, the backlog has not shrunk — it has only changed colour.

These two ideas are opinionated about *mechanism*, not about your domain. That is why
they apply to a fork of an abandoned renderer and to a solo project's `TODO.md` alike.

### Why not just GitHub labels?

It is the first question, so here is the answer, in the order that matters:

1. **Labels carry no evidence.** `accepted` on an issue means someone clicked a
   dropdown. There is no slot for the file you read or the reproduction you ran, so
   there is nothing to check and nothing to review later.
2. **Labels gate nothing.** Any label can be applied to anything, in any order. There
   is no way to express "you cannot mark this done without naming the files that
   changed" — which is the entire mechanism here.
3. **Labels cannot retire.** Closing 400 issues as `wontfix` scatters the reasoning
   across 400 comment threads. A future contributor re-opens them one at a time,
   because nothing put the reasoning in front of the person about to redo the work.
   §6 is about nothing else.

### Non-goals

Not an issue tracker. Not a replacement for your project's own issues — new work you
choose to do belongs wherever your project already tracks work. Not a permanent
backlog; if you find yourself curating it in year two, read §8.

---

## 2. The lifecycle

| Phase | State of the ledger | You are doing |
|---|---|---|
| **Seed** | populated, mostly undecided | getting the pile into the file (§4) |
| **Drain** | shrinking | deciding, with a cost on each decision (§5) |
| **Retire** | empty, then gone | distilling and tearing down (§6) |

### Status classes — what "drainable" actually means

Every entry has a `status`. **The status names are yours**; this spec does not care
whether you call it `wontfix` or `non-target`. What the spec is normative about is the
**class** each status declares, because a class is a statement about the lifecycle:
*what is still owed, and what is finished.*

There are five, and there will only ever be five:

| Class | The project has… | Ledger can retire? |
|---|---|---|
| `untriaged` | not decided | **no** |
| `parked` | decided to decide later | **no** |
| `dismissed` | decided against | yes — terminal |
| `accepted` | decided for; work outstanding | **no** |
| `done` | finished the work | yes — terminal |

An entry in a terminal class owes the project nothing further. An entry in any other
class is an outstanding obligation, and **retirement is exactly the condition that no
outstanding obligations remain.** That sentence is the whole lifecycle, and it is
computable — which is why the classes exist as data rather than as advice.

Read it once here. §3 uses the classes to say when each field becomes required, and §5
uses them to say what triage owes. Neither introduces new vocabulary.

You may name as many statuses as you like against these five. A project that wants
`deferred` and `on-hold` to mean different things (routine review may re-raise the
first; only the owner may un-park the second) declares both as class `parked` and
writes the difference down — see §7. A project that invents `mostly-done` and classes
it `accepted` gets the "this still has work outstanding, do not delete it" protection
for free.

What you **may not** do is invent a lifecycle with no class for one of the five. There
is no honest ledger in which "decided against" is not a thing that can happen.

---

## 3. The ledger file

One YAML file, by convention `docs/backlog.yml`. It **MUST** be valid YAML 1.2 and it
**MUST** carry `schema: 1` at the root.

One file, not a directory of them. This is a measured choice, not an aesthetic one: a
thousand undecided entries emit about 6,500 lines under the rules below, which is a
file you can open. The reason it stays small is the omission rule at the end of this
section, and the reason a *triaged* ledger stays small is that it is draining.

### Root shape

```yaml
schema: 1                                   # MUST
purpose: >                                  # SHOULD
  What this ledger is for and what it is not.

source_kinds:                               # MUST
  - type: issue
    source_pattern: '^[\w.-]+/[\w.-]+#\d+$'
    id_prefix: upstream-issue-

upstream:                                   # MUST when entries carry upstream provenance
  repo: acme/renderer
  imported_at: 2026-08-08
  filter: 'updated_at >= 2023-08-08'
  matched: 337
  skipped: 714
  total_open: 1051

vocabulary:                                 # MUST
  statuses: […]
  non_target_reasons: […]
  evidence_kinds: […]
  fields: […]                               # optional — entry fields your project adds

items:                                      # MUST — may be empty; an empty list is retirement
  - id: upstream-issue-412
    source: acme/renderer#412
    type: issue
    summary: "Unsupported color function \"oklch\""
    status: needs-triage
    first_seen: 2026-08-08
```

### `source_kinds` — where entry types are declared

An entry's `type` is not a fixed list in this spec. Each kind of thing your ledger can
hold is declared once at the root:

```yaml
source_kinds:
  - type: issue
    source_pattern: '^[\w.-]+/[\w.-]+#\d+$'   # optional
    id_prefix: upstream-issue-                # optional
  - type: todo                                # a local kind: no pattern, no prefix
```

- `type` **MUST** be present and unique. Every entry's `type` **MUST** name a declared
  kind.
- `source_pattern` is a regular expression an entry's `source` **MUST** match. A kind
  with **no** `source_pattern` is a **local kind** — work that came from nowhere but
  your own head, whose `source` is a free string like `local`.
- `id_prefix`, when declared, **MUST** prefix the `id` of every entry of that type, and
  where both the id and the source end in a number, the numbers **MUST** agree. This
  catches the copy-paste error, which happens during bulk seeding and nowhere else.

A ledger with **no external `source_pattern` anywhere** is a project with no upstream.
That case needs no special support; it is one line of your YAML.

### `upstream` — provenance, and the filter that produced it

Required when your entries came from somewhere external. `filter` **MUST** record the
exact predicate applied, not a description of it.

Six months later, a reader has to be able to tell *"we triaged this backlog"* from
*"we triaged the last three years of it."* Nothing else in the file records that, and
if you seeded with any filter at all, the honest claim is the second one. `matched`,
`skipped` and `total_open` are what the retirement summary (§6) is written from.

### `vocabulary` — the file teaches the tooling, not the other way round

Every constrained value your ledger uses is declared here. **A value not declared in the
vocabulary MUST be an error, not a new value.** That invariant is what makes a typo a typo
instead of a silently invented category.

There are four lists, and only four: **a key under `vocabulary:` that is not one of them
MUST be an error.** Three name things this spec is about — `statuses`,
`non_target_reasons`, `evidence_kinds` — and the fourth, `fields`, is where everything
else goes: tags, priorities, target areas, whatever your project wants an entry to carry
(§7). Giving `tags` and `priority` slots of their own would privilege two arbitrary
examples over every other field a project might want constrained, and would need a second
mechanism to check what the first one already checks.

Refusing the fifth key is not tidiness. `fields` is the one list a ledger may leave out,
so a misspelt `feilds:` is otherwise a legal document: every field declaration parks
somewhere nothing reads, every `values:` and `required_when_triaged` in it silently stops
applying, and the ledger validates. The three required lists are protected by their own
absence; this rule is what protects the fourth.

**Every vocabulary entry MUST be a mapping with a name key**, not a bare string. The name
key is the singular of the list it appears in: `status:` under `statuses`, `reason:`
under `non_target_reasons`, `kind:` under `evidence_kinds`, `field:` under `fields`. On a
dismissal reason `describes` is a **MUST** — see §7, which is about what goes in those
mappings and why this is the section that stops the whole method degenerating into "use
YAML."

Everywhere else `describes` is a **SHOULD**, and it is worth asking for exactly where an
entry can be confused with a neighbour. For statuses the neighbourhood is the class:
`deferred` next to `on-hold`, both `parked`, is where a project has to write the
difference down, whereas `accepted` describing itself as "decided for" tells a reader
what they already knew. Evidence kinds and fields have no such partition — every entry in
those lists is an alternative to every other — so there the SHOULD is on all of them.
Stated flatly over every vocabulary entry instead, it would fire on every well-named
status, and a warning that always fires is a warning nobody reads.

The asymmetry with dismissal reasons is deliberate. A status survives being obvious; a
dismissal reason carries a boundary that two hundred entries will be sorted against and
one sentence will later have to be written from (§6). That one is not optional, and it is
not conditional on having a neighbour.

### Entries

```yaml
- id: upstream-issue-412
  source: acme/renderer#412
  type: issue
  summary: "Unsupported color function \"oklch\""
  status: needs-triage
  first_seen: 2026-08-08
```

Every date in the ledger — `first_seen`, `last_reviewed`, and `upstream.imported_at`
above — **MUST** be an ISO calendar date, `YYYY-MM-DD`: no time, no zone, no other
format. The only questions anyone asks of these fields are *what has sat here longest*
and *when did anyone last look at this*, and in that form both are string comparisons
that sort correctly and that a human reads without conversion. A ledger is not a log.

`id` **MUST** be unique across the ledger. It is the entry's only handle: the prune
commit names it, a source comment may be tagged with it, and teardown is a grep for it
(§6). Two entries sharing one make every one of those ambiguous, and the moment it can
happen is a bulk seed — the same moment `id_prefix` above exists to police.

`summary` **MUST** be written as a double-quoted scalar — always, not only when the
content requires it. Measured against a real issue backlog, roughly a quarter of titles
cannot survive as plain YAML scalars: they contain `: `, quotes, brackets, or — the one
that costs you an hour —
leading and trailing whitespace, which a plain scalar discards silently and no diff
will show you. A JSON string is a valid YAML double-quoted scalar, so this is one rule
with no branches, and a rule with no branches cannot be got wrong at entry 900.

`summary` **SHOULD** fit on one line, roughly 120 characters. There is no hard limit and
nothing checks it; truncating is worse than a long line, because `summary` is the only
self-contained field an entry has. It **MAY** be rewritten at any time — a bad
upstream title (`"12"`, `"css3 issues"`) is *meant* to be replaced with a real summary
during triage. That is not tampering and it loses nothing, because `source` is the
provenance field.

### When each field becomes required — the ratchet

Required fields depend on the entry's **class** (§2). Every class adds to the first row,
and `done` adds to `accepted`; the three middle rows are alternatives, not a ladder.

| Class | Requires the base row, plus |
|---|---|
| `untriaged` | *(the base row)* `id`, `source`, `type`, `summary`, `status`, `first_seen` |
| `parked` | `last_reviewed` |
| `dismissed` | `last_reviewed`, at least one `non_target_reasons` entry |
| `accepted` | `next_action`, `evidence` with at least one kind |
| `done` | everything `accepted` requires, and `evidence.local_files` non-empty, and `next_action: none` |

Plus: any field named in that status's own `requires:` list, and any field your project
declared with an obligation attached. Both are §7.

**The ratchet is the process.** You cannot accept without evidence; you cannot close
without naming files. Writing it into the format means the rule is enforced instead of
documented, and it means a bulk seed of 400 undecided entries validates cleanly — which
the flat "every entry needs everything" alternative does not.

The two fields the ratchet adds that are not self-evident, in full. `non_target_reasons`
is a list of *names* — the `reason:` keys of declared vocabulary entries, not copies of
the mappings:

```yaml
- id: upstream-issue-91
  source: acme/renderer#91
  type: issue
  summary: "Ship a CommonJS build"
  status: non-target
  first_seen: 2026-08-08
  last_reviewed: 2026-08-12
  non_target_reasons: [commonjs]
```

More than one is allowed and means exactly what it says: the entry was dismissed for
both, and at retirement it counts toward both destinations (§6).

`evidence` is a mapping, not a note:

```yaml
evidence:
  kinds: [source-read, repro]        # MUST name declared evidence_kinds
  local_files: [src/css/color.ts]
  spec_refs: ['CSS Color 4 §12']
  result: pass                       # pass | fail | inconclusive
```

`kinds` is the only sub-field the ratchet requires, and it **MUST** name declared
`evidence_kinds`. `result` is optional; when present it **MUST** be one of `pass`, `fail`
or `inconclusive`. Three and not two, because a check that neither confirmed the
behaviour nor refuted it has an honest outcome, and recording it as `fail` is how a
reproduction nobody managed to run becomes a bug nobody has.

### Omission, not empty placeholders

**A field carrying no value MUST be absent, not present-and-empty.** No `priority: null`.
No `target_area: []`. No stub `evidence:` block on an undecided entry.

The rule is about empty placeholders, not about earliness. A field the ratchet does not
*yet* require **MAY** carry a real value as soon as there is one to carry: §5 sanctions a
seeding mode setting `upstream_patch` mechanically while entries are still `untriaged`,
and an `accepted` entry recording `last_reviewed` is stating a fact, not padding. What
must never appear is the key with nothing behind it.

This is worth 3× on the size of a seeded ledger — the difference between a file you can
open and one you cannot — but the reason it is a MUST rather than a suggestion is
semantic: at a classified status, `non_target_reasons: []` is a real and *different*
assertion from having no such key. Absent and empty **MUST** stay distinguishable.

### Comments are part of the format

The file is meant to be edited by hand *and* by tooling. Comments in the vocabulary
block are load-bearing — they carry the history of why the vocabulary looks the way it
does — and any tool that rewrites this file **MUST** preserve them, along with block
scalars and key order. A tool that round-trips the file through a parser and a dumper
destroys the instrument.

---

## 4. Seeding

Seeding is a phase, not an importer. Three modes:

| Mode | What it does |
|---|---|
| **empty** | start with `items: []` and a vocabulary you write first |
| **import** | bulk-populate from an external issue tracker |
| **migrate** | convert an existing pile — a `TODO.md`, an export, a spreadsheet |

**Write the vocabulary before you seed.** In every mode. Deciding what you will and
will not carry *before* you have seen the 400 specific things is the difference between
a policy and 400 case-by-case rationalizations. It is also when declaring `retire_to`
(§6) is an honest design act rather than a chore.

### The ledger is a decision record, not a view

**Seed once. Never reconcile.** Whatever you seeded from, nothing in this design goes
back and re-reads it. A live sync turns the ledger into a mirror of the source instead
of a record of *your* decisions, and when the source is abandoned there is nothing to
sync against anyway.

The corollary is a real constraint: after seeding, `source` is provenance, not a live
link. **A ledger MUST remain fully readable with the network down and the upstream
repository deleted** — which means `summary` has to be self-contained, and it is why
§3 lets you rewrite one that isn't.

State the timing of that honestly, because a bulk seed cannot satisfy it on the day.
Some fraction of any real corpus has titles that are unreadable alone — three words, a
bare number, a script you do not read — and a seeding mode that tried to fix them would
be doing triage without a date attached. **The obligation attaches when an entry leaves
`untriaged`, not when it is seeded.** Rewriting an unreadable summary is a triage act
(§5); a freshly seeded ledger is not yet offline-readable, and admitting that is better
than a MUST no import can meet.

Do not copy issue bodies into the ledger. It duplicates a public record, and it turns a
readable file into an unusable one. Metadata-first survives contact with real data:
titles are short — a median around 45 characters in one measured corpus — and they
usually name a symptom, which is enough to triage against.

### Seeding MUST be resumable, and MUST NOT overwrite a triaged entry

Several hundred entries will not arrive in one uninterrupted pass: a rate limit, a
dropped connection, a closed laptop. Re-running a seed **MUST** skip ids already present
and **MUST NOT** touch an entry whose status has moved. Without that, "seed once, never
reconcile" hands you nothing but bad options at the halfway mark, and re-running becomes
the reconciliation the rule exists to forbid.

A seeding mode that carries constrained values across — imported labels, priorities,
anything landing in a vocabulary-backed field — **MUST declare them in the vocabulary in
the same write that first uses them**, per §3's closure invariant. Collect the distinct
set, write it in with a comment recording that the seed put it there, then attach it to
entries. Bulk seeding is the one moment large enough to breach closure without anyone
noticing.

### Filter by default — a safety feature, not a convenience

The realistic failure of this whole method is: import 600 issues, triage 40, abandon the
file. That is **worse than never starting**, because a stale ledger implies coverage that
does not exist.

So seed a subset on purpose, take the whole pile only by explicit choice, and **print
what was skipped and why**. A silent subset is its own kind of false coverage — which is
what §3's mandatory `filter` field exists to prevent.

Where the source has activity timestamps, recent activity is the filter that holds up.
On a dead project, "last updated" is not a measure of project activity at all — the
maintainers are gone. It measures **"this still hurts someone,"** which is exactly the
signal a triage wants. Filtering on when something was *filed* selects for a different
and much worse set.

---

## 5. Triage — draining the ledger

The drain phase is the opposite of how backlogs normally grow: several hundred entries
arrive at once, and most of them will be dismissed. **The job of your tooling and your
process in this phase is to make discarding fast.** If dismissal costs a ceremony each,
the triage stalls and the file rots.

### Every entry leaves `untriaged` by paying one of two prices

This is §1's two-sided cost, stated operationally:

- **To dismiss**, name a declared reason. That reason already carries a destination
  (§6) — you are not deciding where the finding goes, you are spending a decision
  someone made when the vocabulary was written.
- **To accept**, attach evidence: at least one declared evidence kind, and a
  `next_action` that names something real. Nothing reaches class `accepted` without an
  evidence path. **MUST**, per §3's ratchet.

Parking is legitimate and it is not an exit. A `parked` entry blocks retirement forever
by design; "we'll look at it later" is an obligation, and the ledger's job is to keep
saying so.

The sharpest illustration is a pair that sounds like two shades of one thing and is not.
`needs-repro` — *we will try to reproduce this* — is class `parked`: an outstanding
obligation that holds retirement open. `stale-no-repro` — *nobody reproduced it and
nothing has moved since* — is a dismissal reason: terminal, and it owes a destination
(`null` is fine here; it is `about: item-state`). The same two words point at opposite
ends of the lifecycle, and a vocabulary that blurs them will blur others.

### Working at volume

- **Bulk transitions are the load-bearing operation.** Dismissing eighty entries for one
  reason should cost one action, not eighty. Do it by filter, print the affected ids,
  and be able to preview it.
- **Track the burn-down**, and specifically track *days since the last triage activity*.
  A stalled triage is silent, and silence is the failure mode this whole section is
  designed against.
- **Work a queue, not a pile.** Hand yourself the next N undecided entries. Four hundred
  things is a mood; ten things is a task.
- **Re-summarize as you go.** Some fraction of any real import has titles that are
  unreadable on their own. Rewriting those is a triage act with a date attached, not a
  seeding transformation, and until they are done the ledger is not yet offline-readable.

### Inherited patches triage differently

An open pull request contains code, so the first question is whether the diff still
applies. Record the answer as a *value* rather than in prose, so it can be filtered and
counted — a declared field with a declared value set (§7), not a sentence in a note. The
`fork-triage` profile calls it `upstream_patch` and offers
`applies | conflicts | obsolete | not-assessed`; nothing here requires that name or those
four. Where the source exposes mergeability directly, a seeding mode **MAY** set the field
mechanically — which is worth doing, because it removes the "not assessed" value as the
universal starting point for the one entry type whose triage is most expensive.

Correct one intuition first, because it changes the shape of the work: on a genuinely
abandoned project, **most inherited patches still apply cleanly.** The base branch is
frozen, so nothing drifted out from under them; deadness there comes from nobody
merging, not from conflict. So mergeability usually will not decide anything for you. A
patch that applies is not thereby wanted — it still has to earn acceptance on the same
evidence as everything else, and "it merges" is not evidence that you want the feature.

Where a patch is genuinely obsolete but its intent is not, the move is **dismiss the
patch, keep the idea as a new entry.** Name that move explicitly in your notes, because
otherwise it reads as data loss.

---

## 6. Retirement

Nothing else specs the exit, and it is the reason this document exists.

### The problem

The natural rule is "implemented entries get pruned; dismissals stay, because a
recorded dismissal is a decision the ledger exists to keep." That rule is correct for a
permanent ledger and **fatal for one designed to reach empty**, because dismissals are
the *majority* of any triage. A ledger under that rule asymptotes at "everything we said
no to" and phase 3 never arrives.

### `retire_to` — the mechanism

**Every dismissal reason MUST declare, in the vocabulary, where its findings go when
the ledger retires.**

```yaml
non_target_reasons:
  - reason: commonjs
    describes: The ask depends on CJS packaging this project dropped.
    about: project-policy
    retire_to: docs/project-target.md
  - reason: stale-no-repro
    describes: No reproduction, and no activity upstream since the import window.
    about: item-state
    retire_to: null    # evaporates; git history is enough
```

A dismissal's value was never "it is recorded somewhere." It is **"the person about to
redo this work will encounter it."** A backlog entry fails that test almost always —
nobody reads the backlog before writing code. A doc in the path of the work passes it.

Three properties follow:

- Retirement becomes **mechanical** instead of a judgment call made under fatigue at the
  very end, when nobody is willing to make two hundred individual decisions.
- It is **checkable**: every reason has a destination, every destination exists.
- The ledger empties **by construction** rather than by willpower.

`retire_to: null` — "this evaporates; git history is enough" — is legitimate, and it
**MUST** be written explicitly so that it is a choice rather than an omission. But if
null were freely available, every reason would take it and the cost deliberately
attached to dismissal would vanish. So it is constrained by what the reason is *about*:

- **`about: item-state`** — the reason describes the incoming item (no reproduction, a
  duplicate, fixed before the project was abandoned). `retire_to` **MAY** be `null`.
- **`about: project-policy`** — the reason encodes something about *your* project (we
  are ESM-only; that capability is out of scope). `retire_to` **MUST NOT** be `null`.

Policy reasons are precisely the ones a future contributor will re-litigate, which is
why they are the ones that owe a destination.

**Completeness is checked when the reason is defined, not at retirement.** A destination
missing from a reason is an error the moment the reason exists. Checking only at
teardown defeats the entire argument for declaring destinations early — that it is
honest then and a chore later.

### Distillation is per *reason*, not per item

A destination path alone is not a contract. Twelve entries dismissed `commonjs` should
produce **one sentence** in `docs/project-target.md` — "this project is ESM-only; CJS
packaging requests are out of scope" — not twelve migrated entries. Each reason owes
exactly one durable statement at its destination; the individual entries evaporate into
git history.

Without this rule, retirement is a file move, and your two hundred dismissals become two
hundred lines somewhere else.

### Keep the integration surface enumerable

Everything this system touches in your repository **MUST** be something you can list:
the ledger file, whatever CI line checks it, the pointer in your agent instructions, any
installed tooling, any link to the ledger from your own docs, and the form entry ids
take when referenced from source. The reason is not tidiness — **the integration surface
is the removal checklist**, and a surface you cannot enumerate makes retirement
archaeology instead of a procedure. Every convenience this system might grow is worth
exactly what it costs to remove.

The docs link is the one that gets left behind, because it was written to be helpful: a
README line pointing contributors at the ledger reads as documentation rather than as
integration, and nothing about it looks like tooling on the day you tear the tooling out.

**It is the adoption checklist too, and that is the reading that keeps it true.** The
list is not compiled at teardown; it is written one line at a time while adopting, and a
line is only enumerable later if it went in deliberately. Two entries on it are also
claims about each other — the pointer in your agent instructions says CI checks this
file — so adopting them out of order leaves a statement that is false until the other
lands, and nothing in a passing build will tell you.

That constraint is what makes the next list short enough to be real.

### The teardown checklist

1. **Check preconditions**: no entry remains in a non-terminal class (§2), and every
   declared `retire_to` destination exists.
2. **Distil** each remaining dismissal reason into its destination — one statement per
   reason, per above.
3. **Write the retirement summary** into your project's own docs: *"Triaged N issues and
   M PRs inherited from `owner/repo` as of DATE, filtered by `<predicate>`; kept X,
   dropped Y."* This is the one artifact that outlives everything, and it is what stops
   a future contributor re-asking every dismissed question. It is derivable from the
   root `upstream:` block (§3) plus counts — which is why that block is mandatory.
4. **Delete the ledger file.**
5. **Remove the tooling**: CI wiring, scripts entries, any installed agent skill, the
   pointer in your agent instructions, and any link to the ledger from your own docs.
6. **Grep** for the ledger path and for entry ids across the whole repo.

Step 6 matters more than it looks. Source comments referencing entry ids are a real
pattern — a workaround in code, tagged with the entry that explains it — and every one
of them becomes a dangling reference the moment the ledger goes. If you reference entry
ids from source at all, use a single declared prefix for it, so that teardown is one
grep for one literal string rather than archaeology.

### Prune in a later commit than the one that closes the entry

The commit that does the work carries the entry at its `done` status with its full
closing notes; a **separate, later** commit removes it. Then `git log -- <ledger>` still
leads a future reader to the reasoning. Delete it in the same commit and those notes
never exist anywhere.

A prune commit **SHOULD** name each removed id and the commit that closed it; the
message is the index back into history. The final deletion commit **SHOULD** name the
retirement summary document.

---

## 7. Defining your own vocabulary

This is the section that decides whether your ledger is an instrument or a pile of tags
that accrete until they mean nothing. The format gives you slots; what you write in
them is the actual work.

Four requirements. **The first three are MUSTs on the vocabulary block** and can be
checked mechanically. The fourth cannot be checked by anything, and saying so plainly is
more useful than pretending otherwise.

### 1. Every entry documents what distinguishes it from its neighbours — `describes`

**MUST** be present and non-empty on every dismissal reason. The text that earns its
place is not a definition; it is a *boundary*:

```yaml
- reason: composition-belongs-downstream
  describes: >
    The capability is in scope, but assembling it belongs to the consumer.
    Distinct from out-of-project-scope, which dismisses the capability itself.
  about: project-policy
  retire_to: docs/project-target.md
```

"Distinct from X, because Y" is the shape to aim for. A reason you cannot distinguish
from its neighbour is a reason you will apply inconsistently across four hundred
entries, and inconsistently-applied reasons cannot be distilled — you will not be able
to write the one true sentence at retirement, because the entries under that reason will
not have one thing in common.

### 2. A reason that demands particular evidence says so — `requires_evidence`

Some dismissals are only honest with a specific kind of proof:

```yaml
- reason: not-supported-by-renderer
  describes: Valid input, but the target renderer never displays it.
  about: item-state
  retire_to: docs/renderer-notes.md
  requires_evidence: [render-check]
```

Then an entry dismissed for that reason **MUST** carry those evidence kinds. Reading the
spec and concluding it *should* work is not evidence that it *does*; that is a lesson
projects learn once, expensively, and then write in a comment where nothing can enforce
it.

### 3. Every dismissal reason declares its retirement destination

`retire_to` and `about`, per §6. **MUST**, both of them.

### 4. Reuse the closest existing term; never invent a synonym

If nothing fits, extend the vocabulary **in the same edit** and say why.

Nothing can check this one. A validator sees a declared reason and a conforming entry;
it cannot see that you have just created the third reason meaning "we don't want it."
This is the judgment that stays with the human — or with an agent reading the
`describes` text, which is what that field is *for*.

### Statuses

```yaml
statuses:
  - status: needs-triage
    class: untriaged
  - status: deferred
    class: parked
    describes: Not now. Routine review may re-raise it on its own.
  - status: on-hold
    class: parked
    describes: >
      Owner-gated parking. MUST NOT be re-raised until green-lit — that is the
      whole distinction from deferred, and the whole point of the status.
  - status: non-target
    class: dismissed
  - status: accepted
    class: accepted
  - status: partially-implemented
    class: accepted        # work outstanding — which is why it must not prune
  - status: implemented
    class: done
  - status: superseded
    class: done
    requires: [superseded_by]
```

- `class` **MUST** be one of the five in §2.
- `requires` is the escape hatch that keeps the class set small: a status **MAY** name
  extra fields required of entries at that status. `superseded` needs a pointer to what
  replaced it and nothing else does — that is one extra field, not a sixth class.

**Classing a status `done` costs `evidence.local_files`**, per §3's ratchet, and that
price is not negotiable from the vocabulary layer — it is the rule that makes retirement
mean something. Which decides what `superseded` above can honestly be. If the work that
superseded the entry landed, the files *it* changed are this entry's evidence and `done`
is right. If nothing changed — the ask was covered by a decision rather than by a diff —
then what happened is that the project decided against doing this as filed, which is
class `dismissed`, under a reason whose `retire_to` points at where that decision now
lives. Reaching for `done` in the second case means attaching a file that did not change
for it, and the format has then extracted a small lie instead of a fact.

Read that as the general test, because `superseded` is only the sharpest instance of it:
a status is class `done` when there is something in this repository to point at, and
class `dismissed` when the honest output is a sentence.

A project **SHOULD** define at least one status per class it intends to use, and the
names are entirely its own.

### Evidence kinds

```yaml
evidence_kinds:
  - kind: source-read
    describes: Read the relevant source in this repository and cited the files.
  - kind: repro
    describes: >
      Reproduced the reported behaviour, or established that it does not reproduce.
      Distinct from source-read, which is an argument about the code and not a run of it.
```

This is the list an entry's `evidence.kinds` draws from, and it is the acceptance half
of the two-sided cost — so name the kinds of proof that actually settle questions in
your project. A renderer's `render-check` and a parser's `repro` are not
interchangeable, and a set adopted from someone else's domain converges on
`source-read` for everything, which is the same as having no evidence requirement.

`describes` is a **SHOULD** here rather than the **MUST** it is on a dismissal reason: an
evidence kind is a claim about what you did, and the entry's `local_files` and
`spec_refs` show it. But a kind whose boundary is unclear gets applied to whatever is
nearest, so the "distinct from X" shape earns its place here as well.

### Fields your project adds

The six base fields and the ratchet above them are the spec's. Everything else an entry
carries is yours, and **a field whose values are constrained MUST be declared**, for the
same reason every other constrained value is: otherwise a typo is a new category.

```yaml
fields:
  - field: upstream_patch
    describes: Whether an inherited diff still applies to this project's base branch.
    values: [applies, conflicts, obsolete, not-assessed]
    types: [pull-request]
    required_when_triaged: true
```

- `field` **MUST** be present and unique, and **MUST NOT** be one of the base fields.
- `values`, when declared, is the field's vocabulary: an entry carrying a value not on
  the list is an error. A field with no `values` is free text.
- `types`, when declared, restricts which entry kinds **MAY** carry the field.
- `required_when_triaged: true` makes it required on every entry that has left class
  `untriaged`. Deliberately coarser than the ratchet — "not undecided yet" and nothing
  finer. The ratchet is normative because it is short; per-class obligations on
  project-declared fields would make it neither.

This is the same inversion as `source_kinds` and as `class`, applied to fields, and it
is the last one. What remains fixed — the six base fields, the five classes, the shape
of `evidence` — is this document; a format that let you redeclare those would not be
specifying anything.

Note the division of labour with the previous section. A status's `requires:` names a
field obligatory *at one status* and says nothing about its values; a `fields:` entry
constrains *values* and knows nothing about statuses. `superseded_by` is free text
required at exactly one status. `upstream_patch` is a constrained value required at
many. They are different axes, and one mechanism covering both would be a matrix.

### Profiles

A profile is a starting vocabulary for a recognizable situation, and it is a worked
example of this section rather than a privileged case. The `fork-triage` profile — for
triaging what you inherited from an abandoned upstream — ships statuses, dismissal
reasons with destinations already declared, evidence kinds, and `source_kinds` for
issues and pull requests.

The **core** of this spec must hold for a ledger that has never heard of an upstream:
a conformant core ledger is one that validates with every profile-specific line deleted.
If you adopt a profile, you are expected to edit it. A vocabulary you did not think
about is one you will not apply consistently.

---

## 8. Graduation — the other exit

Some projects drain the pile they inherited and then want to keep the file for their own
work. That is not a failure and not drift, provided it is explicit.

**This spec governs entries with external provenance.** A project **MUST** retire all of
those — distil, summarize, prune — before keeping the file for its own accretion. At the
moment you add your own item types and your own reasons for your own work, you have
forked the vocabulary and this spec stops applying. You now own a permanent ledger, and
the tooling is yours to keep or drop.

The point that graduation preserves is the only one that mattered: **the inherited
backlog still had to reach empty.** What you build on the empty file afterwards is your
business.

---

## 9. Reference implementation

Three deliverables, three audiences, deliberately distinct:

| Layer | Artifact | Carries |
|---|---|---|
| Human | **this document** | the method, normatively |
| Agent | an agent skill | the judgment — §7's fourth requirement above all |
| Machine | a CLI (`validate`, and the rest) | mechanical enforcement of the MUSTs |

The division is not organizational tidiness; it is what keeps each layer honest. The
validator checks that a reason has a `describes` — it cannot check whether the text is
any good, and it will never notice that your new reason is a synonym of an old one. An
agent can weigh that, and cannot be trusted to enforce a ratchet. A human wrote the
vocabulary and will not re-read it at entry 300.

Wire `validate` into CI. Drift in a file this size is a build failure, not a review
comment.

Both the CLI and the skill are optional, and both are designed to be removed in one
command — because a spec whose tooling is hard to uninstall has quietly contradicted §6.
