# triage-ledger

[![CI](https://github.com/shbernal/triage-ledger/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/shbernal/triage-ledger/actions/workflows/ci.yml)

**A backlog designed to end.**

You have a pile of work nobody has decided about — inherited from an abandoned upstream,
accumulated in a `TODO.md`, or just accreted. A triage ledger turns it into an in-repo,
human-readable record of *decisions*, drains it, and then **retires**: the file empties and
your project stops using this system entirely.

That last step is the point. Every other backlog tool is designed to be kept.

## Start here: [`SPEC.md`](SPEC.md)

**The spec is the product; this CLI is the reference implementation.** You can adopt the
whole method by hand, with a text editor and no tooling at all — that is a design
requirement, not a concession. If it only worked when you ran our tool, it would be a
README, not a spec.

## Adopt it

```sh
npx triage-ledger@0.1 init           # an empty ledger and a vocabulary skeleton
```

1. **Write the vocabulary first** — what this project will and will not carry, with a
   `retire_to` destination declared for every dismissal reason. Before you seed. Deciding
   what you will drop *before* you have seen the 400 specific things is the difference
   between a policy and 400 case-by-case rationalizations.
2. **Seed it** — start empty and `add` as you go, or migrate an existing pile.
3. **Drain it** — `next`, bulk `set-status --to <status>` with a filter, `stats`, until
   nothing is undecided.
4. **Retire it** — `retire --check`, distil each dismissal reason into one sentence at its
   destination, write the summary, delete the file and the tooling.

[`docs/adoption.md`](docs/adoption.md) is the one-page version of that, with the ordering
mistakes people actually make and the five-item integration surface that doubles as the
removal checklist.

Optionally install the agent skill, project-scoped:

```sh
npx skills add shbernal/triage-ledger --skill triage-ledger
```

Wire the validator into CI. Drift in a file this size is a build failure, not a review
comment:

```sh
npx triage-ledger@0.1 validate
```

### Forking an abandoned project?

That is one use case, not the definition — but it is the one this was built against, so
there is a starting vocabulary for it:

```sh
npx triage-ledger@0.1 init --profile fork-triage
```

You are expected to edit it. A vocabulary you did not think about is one you will not
apply consistently.

## Two ideas carry the whole design

**The lifecycle.** Seed → drain → retire. A backlog that cannot reach empty is a
different tool; most of what follows is a consequence of insisting that this one can.

**The two-sided cost.** Both exits from "undecided" have a price, and that is what stops
the middle filling up. Dismissal is cheap to assert but costs a *retirement destination* —
where that "no" lives after the ledger is gone. Acceptance is cheap to retire but costs
*evidence* up front. Remove either and the ledger stops shrinking.

Both are opinionated about mechanism rather than about your domain, which is why they
apply to a fork of an abandoned renderer and to a solo project's `TODO.md` alike.

## Nothing enters your dependency tree

The CLI runs via `npx` on Node 22 or newer, pinned to a compatible range. The skill installs
and removes with one command each. There is no package to add, no lockfile churn, and nothing to uninstall beyond a
line in CI — because a tool designed to be deleted should be easy to delete. The full
integration surface is six items, and it doubles as the removal checklist (`SPEC.md` §6).

## Three deliverables, three audiences

| Layer | Artifact | Carries |
|---|---|---|
| Human | [`SPEC.md`](SPEC.md) | the method, normatively |
| Agent | `skills/triage-ledger/` | the judgment a validator cannot enforce |
| Machine | this CLI | mechanical enforcement of the MUSTs |

The division keeps each layer honest. The validator checks that a dismissal reason has a
`describes`; it cannot check whether the text is any good, and it will never notice that
your new reason is a synonym of an old one. An agent can weigh that, and cannot be trusted
to enforce a ratchet.

## License

MIT
