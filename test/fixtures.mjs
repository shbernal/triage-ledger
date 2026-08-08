/**
 * Fixtures.
 *
 * `LEDGER` and `NONSENSE_LEDGER` are the same ledger with every status renamed. They must
 * validate identically — that is the mechanical form of "no status name appears in
 * `src/`", and it is the check that has caught every regression of this design at every
 * level it has been applied.
 */

export const LEDGER = `schema: 1
purpose: >
  A fixture. Comments in this file are load-bearing and must survive every mutation.

source_kinds:
  - type: todo

vocabulary:
  statuses:
    - status: needs-triage
      class: untriaged
    - status: dropped
      class: dismissed
    - status: taken
      class: accepted
    - status: shipped
      class: done

  # This comment sits inside the vocabulary block and carries history that no field
  # holds. If a mutation eats it, the instrument is gone.
  non_target_reasons:
    - reason: out-of-scope
      describes: >
        Not something this project does. Distinct from no-repro, which is about the
        report rather than about us.
      about: project-policy
      retire_to: docs/target.md
    - reason: no-repro
      describes: Nobody could reproduce it.
      about: item-state
      retire_to: null
      requires_evidence: [repro]

  evidence_kinds:
    - kind: repro
      describes: Actually ran it.
    - kind: source-read
      describes: Read the source and cited files.

items:
  - id: todo-1
    source: local
    type: todo
    summary: "A thing nobody has decided about"
    status: needs-triage
    first_seen: 2026-01-01
  - id: todo-2
    source: local
    type: todo
    summary: "Another thing"
    status: needs-triage
    first_seen: 2026-01-02
`

/** The same ledger, with every status name replaced by a nonsense word. */
export const NONSENSE_LEDGER = LEDGER.replace(/needs-triage/g, 'blorp')
	.replace(/status: dropped/, 'status: zonk')
	.replace(/status: taken/, 'status: quux')
	.replace(/status: shipped/, 'status: frobnicate')

/** A ledger whose only entry type carries external provenance. */
export const UPSTREAM_LEDGER = `schema: 1

source_kinds:
  - type: issue
    source_pattern: '^[\\w.-]+/[\\w.-]+#\\d+$'
    id_prefix: upstream-issue-

upstream:
  repo: acme/renderer
  imported_at: 2026-01-01
  filter: 'updated_at >= 2023-01-01'
  matched: 2
  skipped: 8
  total_open: 10

vocabulary:
  statuses:
    - status: needs-triage
      class: untriaged
    - status: dropped
      class: dismissed
  non_target_reasons:
    - reason: no-repro
      describes: Nobody could reproduce it.
      about: item-state
      retire_to: null
  evidence_kinds:
    - kind: repro
      describes: Actually ran it.

items:
  - id: upstream-issue-412
    source: acme/renderer#412
    type: issue
    summary: "Something broke"
    status: needs-triage
    first_seen: 2026-01-01
`

/** Every character class that has ever corrupted a write, in one string. */
export const HOSTILE_SUMMARY = '  A & B | C < D > "E" $HOME `f` [g] {h} #i: j\\k  '
