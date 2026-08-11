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
| **Drain** | shrinking | deciding, with a cost on each decision — then doing what you accepted (§5) |
| **Retire** | empty, then gone | distilling and tearing down (§6) |

Three phases and there is no fourth. The drain is the long one and it has two halves —
deciding, and then carrying out what was accepted — which §5 says more about, because a
ledger spends most of its life in the second half and it does not look like triage.

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
- `id_prefix`, when declared, **MUST** prefix the `id` of every entry of that type. Where
  the kind **also** declares a `source_pattern` and both the id and the source end in a
  number, the numbers **MUST** agree. This catches the copy-paste error, which happens
  during bulk seeding and nowhere else.

The number half is conditioned on `source_pattern` because that is the declaration that
each entry maps to one numbered thing somewhere else, which is the only arrangement in
which two numbers are *meant* to be the same one. A local kind's `source` is a location
rather than an identifier, and a pile migrated out of one document is many entries to one
location — `q1-3` under `TODO.md#Q1`, the source's number naming the group and the id's
naming the item. Checked there, the rule refuses correct entries wholesale and admits
whichever ones collide, so the survivors of a seed that mostly failed are the ones that
got lucky. A local kind has every reason to declare `id_prefix` anyway, for the other
thing it does: making teardown one grep for one literal string (§6). That half stands
alone and is why the two are separable.

Inside the external case the rule assumes the source is numbered, and that assumption
fails too. Against an identifier that is not — `GHSA-fx2h-pf6j-xcff`, a commit hash, a
UUID — the check applies or not according to whether the last character happens to be a
digit, which is to say at random, and an entry can pass by coincidence: a source ending
in `3` sitting at `-3` in your own numbering. Passing by coincidence is worse than
failing, because failing is visible.
Where the source id is alphanumeric, **carry it into your own id** —
`adv-fx2h-pf6j-xcff` for `GHSA-fx2h-pf6j-xcff` — and the guessing stops. Neither id ends
in a number, the check no longer fires either way, and the mismatch it exists to catch has
been made impossible by construction rather than caught by luck.

A ledger with **no external `source_pattern` anywhere** is a project with no upstream.
That case needs no special support; it is one line of your YAML.

### `upstream` — provenance, and the filter that produced it

Required when your entries came from somewhere external. `filter` **MUST** record the
exact predicate applied, not a description of it.

Six months later, a reader has to be able to tell *"we triaged this backlog"* from
*"we triaged the last three years of it."* Nothing else in the file records that, and
if you seeded with any filter at all, the honest claim is the second one. `matched`,
`skipped` and `total_open` are what the retirement summary (§6) is written from.

**The block describes one import, and only the kinds carrying a `source_pattern` are in
it.** One `repo`, one `filter`, one set of counts. Entries of a local kind — a `todo`
somebody wrote down, a finding from a scan you ran yourself, a note from reading the code
— came from nowhere external and were never what `matched` counted, so a tool writing the
retirement summary **MUST NOT** attribute them to `repo`. A ledger holding both is the
ordinary case rather than an odd one: the pile you inherited is what starts the file, and
your own work is what keeps arriving in it. What the block cannot record is a second
import, and that is the point — see §4 on why nothing re-reads the source.

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

**The keys inside a vocabulary entry are closed in the same way**, and one that is not on
its list **MUST** be an error. On a status: `status`, `class`, `describes`, `requires`,
`types`. On a dismissal reason: `reason`, `describes`, `about`, `retire_to`,
`requires_evidence`, `types`. On an evidence kind: `kind` and `describes`. On a field:
`field`, `describes`, `values`, `types`, `required_when_triaged`. §7 is what each of them
means.

The rule above catches a mistake; this one catches an intention, which is why it is worth
the second sentence. A project writing `requires: [conclusion]` on a dismissal reason is
reaching for a constraint this format does not have — §6's line-per-entry obligation is
per *reason*, and nothing here attaches a field requirement to that axis (§7). Accepting
the key in silence answers the reach with a decoration, and the ledger then reads as
though the rule were being enforced — to its author first, and to every reader after.
Refusing it says the true thing, which is that there is no such rule to write.

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

**No date in the ledger may describe work that has not happened.** `first_seen`,
`last_reviewed` and `upstream.imported_at` **MUST NOT** be later than today, and
`last_reviewed` **MUST NOT** be earlier than the same entry's `first_seen` — nobody
reviewed an entry before this project had it. A validator **SHOULD** allow one day of
slack on the first rule: these are calendar dates with no zone, so a ledger written in the
morning in UTC+13 carries a date that is tomorrow to a validator running in UTC, and a
rule with no tolerance fails a build for being east of London. Nothing is 48 hours wide.

The rule reads like bookkeeping and is not. `last_reviewed` is what "when did anyone last
look at this" is computed from, and that number is the only signal a project gets that a
triage was quietly abandoned — a ledger nobody has touched in four months is worse than no
ledger, because it implies coverage that does not exist. A date in the future does not
merely record something false; it makes the signal read as *fresh*, permanently, for one
flag's worth of effort. Note also which way time moves this: a future date becomes a past
one, so a ledger that validates today still validates tomorrow. The rule can only ever let
more through.

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

`summary` **MUST NOT** contain a line break. That is a rule about portability rather than
about length, and it is why it is a MUST where the length is only a SHOULD: a newline is
the one character in a summary whose survival depends on the platform that typed it. On
Windows the `npx` shim re-parses the command line and drops a newline inside an argument
along with every argument after it, so a summary typed with one arrives truncated, the
dropped fields are never set, and the entry validates. Making the character illegal is
what stops a ledger's contents depending on the operating system of whoever seeded it.

**A plain scalar has a type, and YAML picks it.** A value meant as text that reads as a
number comes back a number — `3.10` becomes `3.1`, `1.0` becomes `1` — and no diff will
show you, because the file still says what you typed; the loss happens on the way in.
Where the value is drawn from the vocabulary this is harmless: an undeclared name is an
error, so the coercion surfaces as one. Where it is free text nothing catches it, and the
free-text values in this format are `evidence.local_files`, `evidence.spec_refs`, and any
field your project carries without declaring its values (§7). **Quote those.**

`evidence.local_files` and `evidence.spec_refs` **MUST** be lists of non-empty strings.
That is the enforceable half of the rule, and it is the whole of it that a validator can
own: a format cannot know what an undeclared field was meant to hold.

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

**What the ratchet buys here is narrower than it looks, and the difference is worth
stating.** A reason declaring `requires_evidence: [repro]` is satisfied by *naming* the
kind. Nothing in the file distinguishes an entry whose reproduction was genuinely
attempted from one where the flag was typed, and no format can — this is a record, not a
witness. What it does buy is that somebody had to name a kind of proof **the project
declared in advance**, which is a real constraint on the vocabulary and none at all on the
individual. Read an evidence block as a claim made under a rule, and do not trust a
dismissal further than that.

Where a reason declares `requires_evidence`, the entry **SHOULD** also record
`evidence.result`, and a validator **SHOULD** say so when it does not. It verifies nothing
either — but "I ran it and it did not reproduce" is a different sentence from `repro`, and
the difference is one the writer notices while writing it. That is the only place the
mechanism can apply pressure.

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

### One entry, one decision

The rule above is about a field with nothing behind it. This one is about a field with
something behind it that the entry's own status denies.

Two fields *are* a decision written down. `non_target_reasons` says the project decided
against this; `next_action` says work on it is outstanding. So:

- `non_target_reasons` **MUST NOT** be present unless the entry's status is class
  `dismissed`.
- `next_action` **MUST NOT** be present at class `dismissed`.

An entry that carries both a dismissal reason and an acceptance is not expressing nuance,
it is expressing two decisions, and a reader six months from now has no way to tell which
one the project acted on. The same goes for a terminal entry naming work still to do: `done`
requires `next_action: none` precisely because a finished entry has to say so explicitly,
and a dismissed one has nothing to say.

**This is not the ratchet's complement, and conflating the two would break §3's own
example.** "Not required at this class" is emphatically not "forbidden at this class" —
`last_reviewed` on an untriaged entry means somebody looked and did not decide, which is
worth recording. `evidence` is likewise not on the list above, and deliberately: it records
what was found rather than what was decided, so it survives a change of mind intact, and a
dismissal reason may even demand it.

The rule exists because the contradictory state is easy to reach and validated for a long
time. Dismiss an entry, change your mind, accept it — a writer that sets the new status
without withdrawing the old decision leaves both. **A tool performing a status transition
MUST withdraw the fields the new class forbids**, rather than refusing: the old decision is
in the history, which is where this format keeps everything it stops asserting, and
refusing would leave the writer hand-editing the file, which §4 exists to prevent.

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

An importer **MUST** strip line terminators from a title before it becomes a `summary`,
once, at the parse boundary — not repeatedly downstream, and not by hoping the emitter
will escape them. `gh` on Windows hands back titles ending in `\r`, and §3 makes such a
summary illegal exactly so that the strip has to happen somewhere nameable, instead of
being found as an invisible character in a diff six weeks later.

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

### The vocabulary decides *which* dismissal, not *whether* to dismiss

Both prices above are charged for the exit you have already chosen. Nothing is charged for
the choosing, and the choosing is what decides whether the project owes work: dismissal is
terminal, `accepted` and `parked` are not. Two readers of one well-written vocabulary will
sort the same entry under the same reason, pointed at the same destination, and still
disagree about whether it should have been dismissed at all. The reason set answers *which
door*; it is silent on *whether*.

That silence is deliberate — a format that decided which door an entry leaves by would be
deciding what your project is for, which §1 explicitly does not. What can be written down
is the question that separates the doors, and it is not "is this real":

> **Would we do this if it arrived today, with no history attached?**

No, for a reason about this project → dismiss, under the reason that says so. No, for a
reason about the item itself → dismiss, and it may evaporate (§6). Yes, but not now →
`parked`, which is an obligation and not an exit. Yes → `accepted`, and pay the evidence.

Ask it out loud, because an inherited entry arrives carrying weight that has nothing to do
with its merits. A defect filed four years ago against code this project still ships is
neither more nor less worth fixing for having waited; the queue position it earned is the
one fact about it that carries no information, and it is the fact hardest to put down.

### The drain has a second half, and it is longer than the first

Everything above is about an entry leaving `untriaged`. That is not the whole phase.
§2's class table already names the gap: `accepted` is *decided for, work outstanding*, and
`parked` is *decided to decide later*. Both are decisions, and neither is terminal. So a
ledger reaches a state where nothing is undecided, nothing is retirable, and no amount of
triage will move it — because what is left is the work itself.

**This is where a real drain spends most of its calendar time**, and it is a state to
recognise rather than a corner case: deciding four hundred entries is days, building the
nine you accepted is months. It is still the drain phase. Nothing new becomes true at the
boundary and there is no fourth phase; a lifecycle with a phase for "doing the work" would
be claiming to govern your project's own work, which §1 explicitly does not.

What the phase owes here is different, and it is two things:

- **Close each entry in the commit that does its work**, not in the one after. See §6 —
  the rule is about what `git log -- <ledger>` leads a future reader to, and it is cheap
  only if you follow it while the work is happening.
- **Re-open a decision that did not survive contact with the work.** A `next_action`
  written six months ago against an abandoned upstream may turn out to be wrong, and
  reversing it is a normal event (§5's prices are payable in either direction). What is
  not acceptable is leaving it `accepted` indefinitely, which converts the backlog you
  inherited into a backlog you own — the failure §8 exists to catch.

Tooling **SHOULD** report the two numbers separately — how many entries are undecided, and
how many are outstanding — because a single count conflates a triage that has stalled with
one that is finished deciding and getting on with it. Those need opposite responses, and
a burn-down that shows one number cannot tell its reader which one it is looking at.

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

One consequence of that split is worth naming, because nothing else here says it: **the
cheapest exit and the traceless exit are the same exit.** A reason permitted to evaporate
is a reason that owes no document, so the dismissals leaving nothing behind in the tree
are exactly the ones that cost least to make — and what they discard is not scope but
claims about the software: nobody reproduced it, nothing moved. Recoverable from git,
which is the whole deal, and absent from the documents anyone actually reads. That is not
an argument for making `item-state` owe a destination; it has nothing durable to say once
its item is gone. It is an argument for spending the care where the format stops charging.

**Completeness is checked when the reason is defined, not at retirement.** A destination
missing from a reason is an error the moment the reason exists. Checking only at
teardown defeats the entire argument for declaring destinations early — that it is
honest then and a chore later.

Which means a reason that dismissed nothing still holds the gate open, and that is the rule
working rather than a wrinkle in it. Writing a vocabulary against a pile you have not read
means over-declaring — §7 tells you to expect that, and to add reasons late — and the ones
written earliest are the likeliest to go unused, so the destination you never had cause to
write is a plausible last thing standing between you and `items: []`. There are only two
honest ways past it: the boundary is one you still believe in, and it owes its sentence
whether or not anything was sorted against it, or it is not, and it comes out of the
vocabulary.

### Distillation is per *reason*, not per item

A destination path alone is not a contract. Twelve entries dismissed `commonjs` should
produce **one sentence** in `docs/project-target.md` — "this project is ESM-only; CJS
packaging requests are out of scope" — not twelve migrated entries. Each reason owes
exactly one durable statement at its destination; the individual entries evaporate into
git history.

Without this rule, retirement is a file move, and your two hundred dismissals become two
hundred lines somewhere else.

**Where the reason is a category of argument rather than a finding, the destination owes a
line per entry.** The `commonjs` twelve owe one sentence because there the reason *is* the
finding: knowing the project is ESM-only tells you everything all twelve were dismissed
for, and no two of them differ in any way a reader will ever care about. A reason like
*not applicable to this project's inputs* is not that. It names the shape of an argument,
and each entry under it made a different one — this input is never attacker-controlled,
that code path is unreachable from any entry point — so distilling to the reason keeps the
shape and throws away every instance of it. The next reader has to redo the work the ledger
already charged for, which is the failure this rule exists to prevent, arrived at by
following the rule.

The vocabulary already marks which kind you have. **A reason declaring `requires_evidence`
(§7) is a reason whose instances each carry a distinct claim** — demanding evidence per
entry is precisely the statement that the boundary does not settle them — and those are the
reasons whose destination gets a line apiece. A reason demanding no evidence is one the
boundary does settle, and one sentence is the whole of it. Note what this does not license:
the per-entry lines are the *conclusions*, one clause each, not the migrated entries. If
they cannot be written that short, the reason was covering several decisions wearing one
name, and the fix is upstream of retirement.

**Which of the two is the common case inverts between the two piles §1 names.** A fork's
reasons are **boundaries**: properties of the forking project — we are ESM-only, we
replaced that subsystem — true of every entry under them in the same way. One sentence
really is the whole of it, and the line-per-entry case above is the exception. A project
triaging a pile of its own has no foreign side and nothing in it is out of scope, because
every entry was written by somebody who wanted it. The reasons that fire there are
**routings**: which repository owns this, what would have to exist before it can be
answered, which standing rule already answered it. A routing is per-entry by construction
— the repository differs, the trigger differs, the rule that fired differs — so on that
path the exception is the whole file and the `commonjs` example is the case that does not
occur. Neither is a defect and neither is the default. The vocabulary decides, and
`requires_evidence` is where it says so.

That is also where `retire_to` strains, because it is declared per reason. Right when the
destination is a property of the boundary; wrong when the reason is a routing, where five
entries under one reason can belong to four different repositories and the honest
destination is one document naming where each went — a per-entry answer wearing a
per-reason key. Writing that document is the fix, and it is what this rule was asking for
in the first place.

**And nothing verifies that the sentence got written.** A destination is checkable to the
extent that a path resolves, which is what "checkable" above means and all it means: a
reason pointed at a `README.md` that has never mentioned it passes every check in this
document. Nor can that be tightened by checking harder, because of the order the steps run
in — the preconditions are checked, *then* the entries are distilled, *then* the ledger is
deleted. The gate runs before the sentences exist. A tool reporting those preconditions
**SHOULD** say which of the two it verified, so that "every destination exists" is not read
as "every destination says something".

So the dismissal half of the two-sided cost is enforced everywhere except at the end: the
reason must be declared before it is used, `about` constrains whether it may evaporate, the
destination must exist — and then a human writes the paragraph, or does not. That is not a
gap to be closed by a better validator. It is where this format stops and the person
retiring the project starts, and the honest thing is to say so here rather than let a green
check imply otherwise.

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
4. **Reach `items: []`**, then **delete the ledger file**.
5. **Remove the tooling**: CI wiring, scripts entries, any installed agent skill *and
   everything installing it wrote*, the pointer in your agent instructions, and any link
   to the ledger from your own docs.
6. **Grep** for the ledger path and for entry ids across the working tree, excluding
   `.git`.

**The kept count comes from entries that are still in the file, so draft the summary
before you prune** — or read it out of `git log`. Pruning as you go (below) removes
exactly the entries the summary would count as kept, and a tool computing that number
after the fact reports the opposite of what happened without any way to know it has. This
is the one place where two rules in this section pull against each other, and the ordering
is how they are reconciled.

**Step 4 is two things, and the first is the one people skip.** A file deleted with nine
entries still in it is textually indistinguishable from a file *abandoned* with nine
entries in it, and telling those apart is the entire product. Empty the list in the last
commit before the deletion, so the final committed state of the ledger is self-evidently a
completed drain rather than a claim about one.

Step 6 matters more than it looks. Source comments referencing entry ids are a real
pattern — a workaround in code, tagged with the entry that explains it — and every one
of them becomes a dangling reference the moment the ledger goes. If you reference entry
ids from source at all, use a single declared prefix for it, so that teardown is one
grep for one literal string rather than archaeology. Exclude `.git` when you run it: the
history holds every one of these strings permanently and is *meant* to, so a grep stated
without the exclusion can never come back clean and trains its reader to ignore it.

### Prune in a later commit than the one that closes the entry

The commit that does the work carries the entry at its `done` status with its full
closing notes; a **separate, later** commit removes it. Then `git log -- <ledger>` still
leads a future reader to the reasoning. Delete it in the same commit and those notes
never exist anywhere.

**Close the entry in the commit that does the work, not the one after it.** The rule
above is careful about the prune and silent about the close, and the natural working
order — do the work, commit it, then move the entry — puts the status change in the
*next* commit. That is one misleading hop: `git log -- <ledger>` sends a reader to
whatever change happened to land next, which is not the change that closed anything.
Record the close before you commit, so the diff that did the work and the diff that
closed the entry are the same diff.

A prune commit **SHOULD** name each removed id and the commit that closed it; the
message is the index back into history. The final deletion commit **SHOULD** name the
retirement summary document.

**Prune only what is terminal.** An entry removed before it reached a terminal class is
not pruned; the question is deleted, and the answer was never written. Nothing downstream
can tell the difference — the ledger validates, `items` is shorter, nothing is outstanding,
and every retirement precondition is met by a project that decided nothing. A tool
performing a removal **SHOULD** say so when the entry is not terminal. It is a SHOULD
rather than a MUST because removing an entry that should never have been seeded is
legitimate and common, and a refusal would push that edit into a text editor where it is
done less carefully.

This is the sharpest form of a limit worth stating plainly: **an empty ledger is the goal
and also the easiest thing to fake.** Everything in this document prices the *transitions*
out of `untriaged` — evidence, a destination, a next action — and none of it prices
deletion, because deletion is the operation retirement is made of. The only defences are
that the removal is a diff somebody can read, that the ids are named in the commit message
(above), and that the distilled record at retirement will be empty. Which is why the
retirement summary is a document a person signs their name under, and not a number a tool
reports.

### Two people, one file

The ledger is one file in a repository, so two people draining it on two branches will
merge it, and everything above assumes a single writer. The rules in this section are what
that assumption costs.

**Every rule in this document constrains a state, not a transition.** The ratchet says what
an entry at class `done` must carry; nothing says that an entry which reached `done` may not
return to `untriaged`, because no rule ever sees two versions of the ledger at once. A
merge that undoes a week of triage therefore violates nothing, and the burn-down count
simply gets smaller. **Monotonicity is a property of your workflow and not of this format**,
and a validator cannot be asked to supply it.

Say that limit out loud to whoever picks the ledger up, because it is stated here for
someone who was there. A ledger whose decisions were reverted validates, reports its last
activity as today, and offers entries that were already dismissed — every instrument
computed from the file agrees it is a young, healthy triage, and the file holds no record
of what it used to hold. The reader who most needs to know this is the one who cannot
supply the missing workflow knowledge from memory: whoever arrives at the ledger without
having been there. `git log -- <ledger>` is what they have, and tooling **SHOULD** say so
rather than assuming the reader already knows to look.

That matters because of how the file merges. Triage is additive — deciding an entry appends
fields inside it, and two such edits in different entries do not interact, so branches that
decided different entries merge cleanly and correctly. **Pruning is what conflicts**, because
removing an entry deletes an entry-sized block and the two sides realign; the resulting
conflict boundary falls where the *text* differs, which is not where an entry ends.

So:

- **Prune on the shared branch, not on a feature branch.** This is not the same advice as
  the subsection above: separating prune from close into two commits does not help a merge,
  which compares trees and never sees your commits.
- A conflict in the ledger **MUST NOT** be resolved by keeping both sides. Both sides can
  put a trailing field onto the wrong entry and reinstate entries the other branch pruned,
  and the result frequently validates — the ratchet checks each entry, and an entry restored
  to `untriaged` is a perfectly legal entry.
- For the same reason, a union merge driver (`merge=union` in `.gitattributes`) **MUST NOT**
  be configured for the ledger. It performs exactly that resolution, on every merge, with no
  conflict raised and nothing for anyone to review.
- Set `merge.conflictStyle` to `diff3` or `zdiff3` before you resolve one. In the default
  two-sided marker, an entry that one branch pruned is indistinguishable from an entry the
  other branch added, and the natural reading is the wrong one. With the merge base shown,
  both are unambiguous.
- A tool **MUST** refuse to read or mutate a ledger containing conflict markers, and
  **SHOULD** say that is what it found. Left to a YAML parser this is several errors about
  implicit keys and none about a merge.

What the format does defend, and it is worth knowing which half you are getting: the
two-sided cost catches a decision assembled out of two branches' halves, because an entry
that took its status from one side and its trailing fields from the other is incomplete on
whichever side it moved to. What nothing catches is a decision quietly reverted, because a
reverted entry is indistinguishable from one never decided.

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

### 3. A reason whose sentence is only true of some entries says which — `types`

The same key as on a declared field, with the same meaning: a list of declared entry
types, and the reason **MUST NOT** be applied to an entry of any other type. Optional, and
most reasons should not carry it — a scope decision is about the ask, not about how the
ask arrived.

```yaml
- reason: stale-no-repro
  describes: >
    No reproduction was ever provided and nothing has moved since the import window.
  about: item-state
  retire_to: null
  types: [issue]
```

Two things make this worth a key rather than a note in the `describes`. The first is that
the cheapest reasons in a vocabulary are the ones that attract volume: a reason with
`retire_to: null` and no `requires_evidence` costs nothing to apply, so it is what gets
reached for at entry 300, and it is where a whole backlog goes if it goes anywhere at once.

The second is what makes it enforceable at all. Nothing in this format can tell whether a
dismissal is *true* — and the failure that matters here is not a false statement anyway,
it is a **vacuous** one. "No reproduction was ever provided" is true of a pull request and
of a feature request, and it is true of them the way "this rock has never been convicted of
perjury" is true. A reviewer reading the diff sees a legal reason on a legal entry and has
nothing to point at. The type is the one part of that mismatch a validator can see, so it
is the one part this format asks you to write down.

The same argument reaches the status side, and the key is available there too — see
*Statuses* below. Parking is an exit in practice and it is the cheapest one in the format:
a `parked` status owes no destination and no evidence, so *we intend to try to reproduce
this* goes vacuously true on a feature request in precisely the way the cheapest dismissal
reason does. The key belongs wherever a project writes a sentence that hundreds of entries
will be sorted against, which is both lists and not only one of them.

### 4. Every dismissal reason declares its retirement destination

`retire_to` and `about`, per §6. **MUST**, both of them.

### 5. Reuse the closest existing term; never invent a synonym

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
- `types` **MAY** be declared, with the same meaning it has on a dismissal reason above: a
  list of declared entry types, and the status **MUST NOT** be applied to an entry of any
  other type. Most statuses should not carry it — `accepted` is about the ask and not about
  how the ask arrived. The one it is for is a parking status whose `describes` names an
  action somebody intends to take: *we will try to reproduce this* is a sentence about a
  reported behaviour, and there is nothing to reproduce in a feature request or a patch.
  Parking one anyway is legal, validates, and holds retirement open on a promise nobody can
  keep, which is the true-and-empty failure with the obligation left running.

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

**A decision that has to be revisited on a date — or on an event — is one this format
records and does not schedule.** An accepted risk, a waiver, an exception granted until
the next release, a question nobody can answer until a second consumer exists: each
is honestly `dismissed`, because each is a decision *against* doing the work as filed, and
a class that blocks retirement would turn every one of them into a permanent open item —
which is the outcome the register they are written into exists to prevent. What follows is
that nothing re-raises them. `dismissed` is terminal, and `last_reviewed` records when
somebody looked, never when somebody must look again. Put the trigger in the destination
document. That is the artifact still there when the ledger is gone, and a trigger that must
outlive the ledger cannot be stored in it.

The event half is the one that parks a pile, and it does not look like a decision when it
arrives. *Not until there is a second engagement* is not expensive — it is
**unanswerable**, because the thing it would be reasoned against does not exist yet — and
parking is the honest-looking move. It promises a return nobody can schedule, which is the
one promise a file designed to be deleted cannot keep, and a pile of open questions can
park half of itself this way and never close. Dismissed instead, with the trigger written
into the document that carries the decision, the promise is kept by the artifact that
survives it: whoever arrives with the second engagement in hand finds the question where
it was left, and whoever arrives without one finds the answer.

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
carries is yours, and **a field constrained to a fixed set of names MUST declare them**,
for the same reason every other constrained value is: otherwise a typo is a new category.

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
  the list is an error. `values` is a flat list of names; an entry's value **MAY** be a
  list, and then **every element MUST be declared**. Some attributes are natively
  multi-valued — an advisory that is both a path traversal and an information disclosure
  is a different thing from either alone — and the check is the same check, applied
  element-wise. A field with no `values` is free text.
- `types`, when declared, restricts which entry kinds **MAY** carry the field.
- `required_when_triaged: true` makes it required on every entry that has left class
  `untriaged`. Deliberately coarser than the ratchet — "not undecided yet" and nothing
  finer. The ratchet is normative because it is short; per-class obligations on
  project-declared fields would make it neither.

**Constrained to a fixed set of names is narrower than constrained**, and much of what a
project wants to pin down is the wider thing. An identifier with a shape rather than a
value set (`GHSA-fx2h-pf6j-xcff`, a semver range); a number in a range (a severity score,
0.0 to 10.0, and absent as often as not); a taxonomy you neither own nor can enumerate
(CWE has some 940 identifiers, and you will meet the 13th during seeding, as a validation
error). All three are constrained. None belongs in `values:`. Declare them as free text,
and let the destination document carry what they mean.

The temptation is to grow a `pattern:` key, and it should be resisted twice over. It puts a
regular-expression engine into a format whose first design requirement is that it works in
a text editor. And it misreads what `values:` is for: the failure being prevented is a
*silently invented category*, which only a fixed set of names can suffer. A mistyped
severity score is wrong, and wrong is a different problem from new — nobody sorts two
hundred entries against it, and no sentence has to be written from it at retirement.

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

Some projects drain the pile they started from and then want to keep the file for their
own work. That is not a failure and not drift, provided it is explicit.

**This spec governs the pile the ledger was seeded with.** A project **MUST** retire all
of it — distil, summarize, prune — before keeping the file for its own accretion.

Not *"all the entries that came from somewhere else"*. Conditioned on provenance the
requirement is satisfied by the empty set on any ledger that never had an upstream, so a
project that migrated its own `TODO.md` could keep the file permanently, with the whole
pile undecided, and be conformant — which would make the second of the two exits
unreachable on the path §1 spends half its examples on. Where the pile came from was
never what made it a pile.

Nor does writing your own vocabulary end it. Adding your own item types and your own
reasons is what §4 and the setup guidance tell a project with no upstream to do *before*
seeding, so read as the trigger it would stop this spec applying to every such ledger at
the moment its vocabulary was written. **The trigger is the file reaching empty.** After
that you own a permanent ledger, the tooling is yours to keep or drop, and the vocabulary
is yours to fork.

The point that graduation preserves is the only one that mattered: **the pile still had
to reach empty.** What you build on the empty file afterwards is your business.

---

## 9. Reference implementation

Three deliverables, three audiences, deliberately distinct:

| Layer | Artifact | Carries |
|---|---|---|
| Human | **this document** | the method, normatively |
| Agent | an agent skill | the judgment — §7's fifth requirement above all |
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
