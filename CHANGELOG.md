# Changelog

This project versions **the spec**, and the CLI follows it. `SPEC.md` is the product; the
CLI is the reference implementation, so a change that makes a previously valid ledger
invalid is a breaking change even when no CLI flag changed.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] — 2026-08-11

No change to the spec, the CLI, or anything in the published tarball. The version exists
because the way the tarball gets there changed, and that is not something you can verify
without doing it once.

### Changed

- **Published from CI through npm trusted publishing**, rather than from a laptop holding a
  long-lived token. The credential is now minted per-run through GitHub OIDC against a
  named workflow file and expires when the run ends, so there is nothing left to leak
  between releases. Practical consequence for anyone installing: this release carries a
  provenance attestation, and `npm audit signatures` can tie the tarball to the commit and
  the workflow that built it. `0.1.0` cannot make that claim, and never will be able to.

## [0.1.0] — 2026-08-11

First release. The spec and the tooling that enforces it, pressure-tested against nine
experiments before publication rather than after.

### The method

- **`SPEC.md`** — the normative document. Seed → drain → retire, the two-sided cost that
  keeps the middle from filling up (dismissal owes a retirement destination, acceptance
  owes evidence), and a §6 removal checklist that is six rows long on purpose.
- **`docs/adoption.md`** — the one-page ordering, with the mistakes people actually make.
- **`skills/triage-ledger/`** — the agent skill, carrying the judgment a validator cannot
  enforce. Install with `npx skills add shbernal/triage-ledger --skill triage-ledger`.

### The CLI

Runs via `npx` on Node 22 or newer. Nothing enters your dependency tree.

- Setting up — `init` (with a `fork-triage` profile), `validate` for CI.
- Seeding — `import` from a JSON array or JSONL, on a file or stdin. It does not fetch, so
  the query stays yours and `upstream.filter` records the predicate you actually ran.
  Re-running skips ids already present and leaves anything triaged alone, which is how a
  seed survives a rate limit or a closed laptop.
- Reading — `list`, `show`, `values`, `next`, `stats`, and `status`, a machine-readable
  phase probe that routes the agent skill.
- Deciding — `add`, `set-status` for one entry or for every entry matching a filter,
  `remove`.
- Retiring — `retire --check`, `--distil`, `--summary`.
- `--json` on every read command, `--dry-run` on every mutation.

### Known limits, both deliberate and both stated in `SPEC.md`

- **Nothing validates monotonicity.** No rule sees two versions of the ledger at once, so
  a decision quietly reverted is indistinguishable from one never made. Catching it needs
  a git ref to compare against — a new dependency in a tool whose claim is that it has
  none, and a CI verdict that depends on which ref it ran against. §6 states the limit
  instead, so an adopter knows there is nothing underneath them.
- **The bulk-dismissal gap is narrowed, not closed.** A dismissal reason may declare the
  entry `types` it can truthfully apply to, and the shipped `fork-triage` vocabulary
  declares it on both reproduction reasons. That makes the vocabulary *this project ships*
  no longer the weapon, which is the part it owns. A project declaring no `types` on its
  own reason can still empty a pile in one command.

[0.1.1]: https://github.com/shbernal/triage-ledger/releases/tag/v0.1.1
[0.1.0]: https://github.com/shbernal/triage-ledger/releases/tag/v0.1.0
