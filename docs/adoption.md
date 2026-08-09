# Adopting a triage ledger

One page. `SPEC.md` is the normative document; this is the order to do things in and the
two or three places people get it wrong.

## The general path

```sh
npx triage-ledger@0.1 init
npx skills add shbernal/triage-ledger --skill triage-ledger    # optional
```

1. **Write the vocabulary.** What this project will and will not carry, with a `retire_to`
   destination declared for every dismissal reason.
2. **Seed it.** Start empty and `add` as things arrive, or migrate an existing pile.
3. **Drain it.** `next`, `set-status`, `stats`, until nothing is outstanding.
4. **Implement what survived.** Prune each entry in a *later* commit than the one that
   closed it.
5. **Retire.** `retire --check`, `retire --distil`, `retire --summary`, then delete the
   ledger and the tooling.

**Step 1 comes before step 2, and that ordering is the whole method.** Deciding what you
will drop *before* you have seen the four hundred specific things is the difference between
a policy and four hundred case-by-case rationalizations. Afterwards each dismissal applies
a decision already made; beforehand each one is a fresh argument, and you will not make the
same argument twice across four hundred entries.

## The fork path

Same thing, with a starting vocabulary for the case of inheriting an abandoned project:

```sh
npx triage-ledger@0.1 init --profile fork-triage
```

Then **edit it** — the destinations it declares are guesses about your repository — and
continue from step 2. The profile is a worked example of `SPEC.md` §7, not a privileged
case: everything in it is ordinary ledger data you could have typed yourself.

## Install the skill project-scoped, never `--global`

```sh
npx skills add shbernal/triage-ledger --skill triage-ledger
```

Global scope puts the skill outside the teardown checklist and leaves it on the machine
after this project's triage has ended. Project scope means it is committed, visible in the
repo, and removed by one line of a checklist you can actually enumerate.

## Wire the validator into CI

```yaml
- run: npx triage-ledger@0.1 validate
```

Pinned to a compatible range — pre-1.0, that is the minor, so `@0.1` is the unit that will
not change under you. Drift in a file this size is a build failure, not a review comment. Run it
on Windows as well as Linux if you seed from `gh`: that is where CRLF gets into summaries,
and Linux-only CI never sees it.

Do not copy this repo's `.gitattributes` while you are at it. It pins LF because our own
tests compare fixture text against literal `\n`, which is a fact about testing a
line-surgery tool and not about ledgers. A CRLF ledger validates, and every mutation keeps
whichever ending the file already uses — so under `core.autocrlf=true` the ledger behaves
like every other text file in your repo, which is the only thing you want from it.

## The integration surface, which is also the removal checklist

Six things. If you cannot list everything the system touches, you cannot remove it, and
retirement becomes archaeology instead of a procedure.

| # | Touchpoint | Removed by |
|---|---|---|
| 1 | the ledger file (`docs/backlog.yml`) | `rm` |
| 2 | one CI line — `npx triage-ledger@0.1 validate` | delete the line |
| 3 | a pointer in `AGENTS.md` (3 lines) | delete the paragraph |
| 4 | `triage-ledger:<id>` references in source comments | one grep for one literal string |
| 5 | the installed skill in `.claude/skills/` | `npx skills remove triage-ledger` |
| 6 | any link to the ledger from your own docs | delete the link |

Row 6 is the one that gets left behind, and it is worth knowing why: a README line
pointing contributors at the ledger was written to be *helpful*, so it reads as
documentation rather than as integration, and on the day you tear the tooling out nothing
about it looks like tooling. It is on this list so that it is written down when it goes
in. The grep at teardown catches it either way; the list is what stops you being surprised.

Nothing enters your dependency tree. That is deliberate: a tool designed to be deleted
should not be something your linters, coverage and CI have to own first.

**Explicitly not an integration point:** a copy of the process in your own docs. Link to
`SPEC.md` instead. A copied process document is a sixth thing to remove, and it goes stale.

### The `AGENTS.md` pointer

Three lines, so that runtimes which do not read skills still find the ledger:

```markdown
## Backlog

Undecided work lives in `docs/backlog.yml`, a triage ledger (see
https://github.com/shbernal/triage-ledger). Do not add entries by hand-editing;
run `npx triage-ledger@0.1 --help`. Every dismissal needs a declared reason.
```

**Write it in the same pass as the CI line, in that order.** Rows 2 and 3 are the two
touchpoints that make claims about each other: the moment this paragraph says the ledger
is checked, something had better be checking it. Adopt them apart and you are left with an
instruction to agents that is false until the other lands — and nothing tells you, because
a repository with no CI line has no failing build to notice.

The general point is that the table above is the *adoption* checklist as much as the
removal one. It is not compiled at teardown; it is written a row at a time on the way in,
and a row is only enumerable later if it went in deliberately.

## The failure this is designed against

Import six hundred entries, triage forty, abandon the file.

That is **worse than never starting**, because a stale ledger implies coverage that does
not exist — nobody can tell "we looked at this and said no" from "nobody has ever read it",
which is the exact confusion the ledger existed to remove.

Three things in the design push against it, and they only work if you let them:

- **Seed a subset on purpose.** Filter, and record the exact predicate. A silent subset is
  its own kind of false coverage.
- **Watch `stats`, especially days-since-last-activity.** A stalled triage is silent.
- **Keep dismissal cheap.** Bulk transitions exist because dismissal is the majority
  operation; if it costs a command each, the triage stalls.

If it does stall, the honest move is not to leave the file sitting there. Retire what can
be retired, write the summary saying how far you got and what the filter was, and delete
the rest.
