# Working on triage-ledger

This is the repo that *defines* the triage ledger method. It is not a repo that uses one.
(A repo that uses one would have a three-line pointer here instead — see `SPEC.md` §6's
integration surface.)

## The one rule that matters

**`SPEC.md` is the product. `src/` is the reference implementation.** When they disagree,
the spec wins and the code is the bug — unless writing the code exposed something the spec
got wrong, in which case fix the spec first and the code second, in that order, so the two
never drift with the drift undocumented.

Three deliverables, three audiences, deliberately distinct:

| Layer | Artifact | Carries | Failure if it absorbs another layer |
|---|---|---|---|
| Human | `SPEC.md` | the method, normatively | becomes a README |
| Agent | `skills/triage-ledger/` | judgment a validator cannot enforce | paraphrases the spec, rots, two sources of truth |
| Machine | `src/` | mechanical enforcement of the MUSTs | acquires opinions it has no business having |

## Invariants in the code

**No status name may appear as a string literal in `src/`.** Not `needs-triage`, not
`accepted`, not `implemented`. The status *names* are per-project vocabulary data; only
the five status **classes** (`untriaged`, `parked`, `dismissed`, `accepted`, `done`) are
normative, and the code may know those and nothing else. `grep` for a status name in
`src/` returning nothing is the mechanical form of this check, and there is a fixture whose
statuses are renamed to nonsense that must validate identically.

This is the same inversion four levels deep, and every level regressed the same way — a
string literal creeping back into shared code:

1. Constrained *values* are declared in the ledger, not hardcoded.
2. Entry *types* are declared (`source_kinds`), not hardcoded.
3. The *lifecycle* is declared (a status names its `class`), not hardcoded.
4. Entry *fields* are declared (`vocabulary.fields`), not hardcoded.

**Four is where the ladder stops**, and that is a claim rather than an absence of
imagination. What the core still fixes — the six base fields, the five classes, `evidence`'s
sub-shape — is `SPEC.md` itself, so a fifth inversion would dissolve the thing being
specified. Level 4 was caught before the CLI existed by going looking for it, and the tell
generalizes: **a constrained value with no home in the vocabulary.** If you meet that tell
again, you have probably found a field that belongs under `vocabulary.fields`, not a fifth
level — check that first.

Expect that check to succeed and the rung still not to hold, because the tell is wider than
`values:` is. An id with a shape, a number in a range, a taxonomy nobody owns — each is a
constrained value, each is a field, and none of them is a fixed set of names. That is a
limit of `values:`, stated in §7, and not a fifth inversion waiting to be found; the answer
there is free text and a sentence in the document the entries retire into.

**Mutations are line surgery, never parse→dump.** Comments in the vocabulary block are
load-bearing — they carry the history of why the vocabulary looks the way it does — and a
round-trip through a YAML parser and dumper destroys them, along with block scalars and key
order. The mutation layer is ported from prior art rather than rewritten for exactly this
reason. Read it before changing it.

**Absent and empty are different.** A field not yet required at an entry's class must be
*absent*. At a classified status, `non_target_reasons: []` is a real and different
assertion from having no such key, and it is also worth 3× on the size of a seeded ledger.

**`summary` is always a double-quoted scalar.** Always, not only when the content requires
it. A rule with no branches cannot be got wrong at entry 900.

## Conventions

- ESM, Node ≥ 22, zero-to-minimal dependencies. A YAML parser is the only obvious one.
  The floor was 20 until Node 20 went end-of-life; nothing in `src/` needs 22, so raise it
  again only when something does or when 22 itself goes EOL.
- `--json` on every read command; `--dry-run` on every mutation; validate before write;
  refuse ambiguous ids rather than guessing.
- Tests run on Windows as well as Linux. This is not optional: the known defects in the
  prior art are a literal `&` corrupting a write, and `gh` emitting CRLF that reaches a
  `summary:` value where it is invisible in a diff. Linux-only CI catches neither.
- `npm test` is bare `node --test`, with no path and no glob. Discovery is the point: any
  spelled-out form — a file list, or `node --test "test/**/*.test.mjs"` — lets a new test
  file be added and silently never run, which is the failure mode a test suite is least
  able to notice about itself. The cost is that everything under `test/` is discovered, so
  `fixtures.mjs` reports as one empty passing test. That is the cheaper mistake.
  (The glob form additionally did not work at all below Node 21, which is how it was found:
  the floor row of the matrix failed while current stayed green. The floor has since moved
  past that, so the glob would work now — the reason not to reintroduce it is the one
  above, not the version.)
- `plan/` is gitignored scratch and is not documentation. Do not cite it from a
  deliverable, do not promote it to `docs/`, and do not un-ignore it.
