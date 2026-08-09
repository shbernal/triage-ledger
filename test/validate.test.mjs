import assert from 'node:assert/strict'
import test from 'node:test'

import { validateLedgerText } from '../src/validate.mjs'
import { LEDGER, NONSENSE_LEDGER, UPSTREAM_LEDGER } from './fixtures.mjs'

function errorsFor(text) {
	return validateLedgerText(text).report.errors
}

function replaceItems(text, items) {
	return text.replace(/items:\n[\s\S]*$/, 'items:\n' + items)
}

test('the fixtures validate', () => {
	assert.deepEqual(errorsFor(LEDGER), [])
	assert.deepEqual(errorsFor(UPSTREAM_LEDGER), [])
})

test('renaming every status changes nothing', () => {
	// The load-bearing test of the whole design. If this ever fails, a status name has
	// found its way back into src/.
	const plain = errorsFor(LEDGER)
	const nonsense = errorsFor(NONSENSE_LEDGER).map((error) =>
		error.replace(/blorp/g, 'needs-triage').replace(/zonk/g, 'dropped').replace(/quux/g, 'taken').replace(/frobnicate/g, 'shipped')
	)
	assert.deepEqual(nonsense, plain)
})

test('the ratchet is keyed on class, and names the status in its message', () => {
	const accepted = replaceItems(
		LEDGER,
		`  - id: todo-1
    source: local
    type: todo
    summary: "A thing"
    status: taken
    first_seen: 2026-01-01
`
	)
	const errors = errorsFor(accepted)
	assert.ok(errors.some((e) => e.includes('`taken` requires `evidence`')), errors.join('\n'))
	assert.ok(errors.some((e) => e.includes('`taken` requires `next_action`')), errors.join('\n'))
	// The message names the status the project chose, not the class behind the rule.
	assert.ok(!errors.some((e) => e.includes('class `accepted`')))
})

test('a dismissal needs a declared reason, and undeclared reasons are refused', () => {
	const missing = replaceItems(
		LEDGER,
		`  - id: todo-1
    source: local
    type: todo
    summary: "A thing"
    status: dropped
    first_seen: 2026-01-01
    last_reviewed: 2026-01-01
`
	)
	assert.ok(errorsFor(missing).some((e) => e.includes('non_target_reasons')))

	const invented = replaceItems(
		LEDGER,
		`  - id: todo-1
    source: local
    type: todo
    summary: "A thing"
    status: dropped
    first_seen: 2026-01-01
    last_reviewed: 2026-01-01
    non_target_reasons: [we-just-dont-want-it]
`
	)
	assert.ok(errorsFor(invented).some((e) => e.includes('undeclared dismissal reason')))
})

test('requires_evidence is enforced on the entries dismissed for that reason', () => {
	const text = replaceItems(
		LEDGER,
		`  - id: todo-1
    source: local
    type: todo
    summary: "A thing"
    status: dropped
    first_seen: 2026-01-01
    last_reviewed: 2026-01-01
    non_target_reasons: [no-repro]
`
	)
	assert.ok(errorsFor(text).some((e) => e.includes('requires evidence kind `repro`')))
})

test('a policy reason may not retire to null; an item-state reason may', () => {
	const nulled = LEDGER.replace('retire_to: docs/target.md', 'retire_to: null')
	assert.ok(errorsFor(nulled).some((e) => e.includes('must not be null when `about: project-policy`')))

	const absent = LEDGER.replace('      retire_to: docs/target.md\n', '')
	assert.ok(errorsFor(absent).some((e) => e.includes('`retire_to` is required')))
})

test('describes is a MUST on a dismissal reason and not on a status', () => {
	const noDescribes = LEDGER.replace(/    - reason: no-repro\n      describes: [^\n]*\n/, '    - reason: no-repro\n')
	assert.ok(errorsFor(noDescribes).some((e) => e.includes('`describes` is required')))

	// The spec's own status block leaves `describes` off where the name is the whole
	// meaning. A validator that rejected that would reject the spec's own examples.
	assert.deepEqual(errorsFor(LEDGER), [])
})

test('describes is warned about only where two statuses share a class', () => {
	const clean = validateLedgerText(LEDGER).report
	assert.equal(clean.warnings.filter((w) => w.includes('describes')).length, 0)

	const twinned = LEDGER.replace(
		'    - status: dropped\n      class: dismissed\n',
		'    - status: dropped\n      class: dismissed\n    - status: also-dropped\n      class: dismissed\n'
	)
	const warnings = validateLedgerText(twinned).report.warnings.filter((w) => w.includes('describes'))
	assert.equal(warnings.length, 2)
	assert.ok(warnings[0].includes('shares class'))
})

test('a value not in the vocabulary is an error, not a new value', () => {
	const text = LEDGER.replace('status: needs-triage\n    first_seen: 2026-01-01', 'status: nearly-triaged\n    first_seen: 2026-01-01')
	assert.ok(errorsFor(text).some((e) => e.includes('undeclared status')))
})

test('a field not required at this class must be absent, not present-and-empty', () => {
	const text = replaceItems(
		LEDGER,
		`  - id: todo-1
    source: local
    type: todo
    summary: "A thing"
    status: needs-triage
    first_seen: 2026-01-01
    non_target_reasons: []
`
	)
	assert.ok(errorsFor(text).some((e) => e.includes('omit the key instead')))
})

test('the omission rule is about empty placeholders, not about earliness', () => {
	// The other half of the rule above, and the half that is easy to over-enforce: a field
	// the ratchet does not *yet* require may carry a real value as soon as there is one.
	// Seeding sets fields mechanically on entries still untriaged, and a `last_reviewed` on
	// an entry that has been looked at is a fact, not padding. SPEC.md §3.
	const text = replaceItems(
		LEDGER,
		`  - id: todo-1
    source: local
    type: todo
    summary: "A thing"
    status: needs-triage
    first_seen: 2026-01-01
    last_reviewed: 2026-01-02
`
	)
	assert.deepEqual(errorsFor(text), [])
})

test('a field with nothing behind it is refused even when the tool has never heard of it', () => {
	// SPEC.md §3 illustrates the omission rule with `priority: null` — and `priority` is
	// exactly the kind of field a project carries *without* declaring, because §7 asks for a
	// declaration only where the values are constrained. Enforced over the fields this tool
	// knows the names of, the rule would miss its own example.
	const text = replaceItems(
		LEDGER,
		`  - id: todo-1
    source: local
    type: todo
    summary: "A thing"
    status: needs-triage
    first_seen: 2026-01-01
    priority: null
    note: ""
`
	)
	const errors = errorsFor(text)
	assert.ok(errors.some((e) => e.includes('`priority` is empty')), errors.join('\n'))
	assert.ok(errors.some((e) => e.includes('`note` is empty')), errors.join('\n'))
})

test('a required field is not satisfied by an empty placeholder', () => {
	// The ratchet asks whether the key is present. If that were the whole rule, the price of
	// an acceptance would be typing `next_action:` and stopping — the two-sided cost payable
	// with nothing.
	const text = replaceItems(
		LEDGER,
		`  - id: todo-1
    source: local
    type: todo
    summary: "A thing"
    status: taken
    first_seen: 2026-01-01
    next_action: null
    evidence:
      kinds: [repro]
`
	)
	const errors = errorsFor(text)
	assert.ok(errors.some((e) => e.includes('`next_action` is required at `taken` and empty')), errors.join('\n'))
	// Not the missing-field message. The key is on the page; sending the reader to add one
	// they can already see is how a validator teaches people to stop reading it.
	assert.ok(!errors.some((e) => e.includes('requires `next_action`')), errors.join('\n'))
})

test('the same holds for a field a status requires of itself', () => {
	const withRequires = LEDGER.replace('    - status: shipped\n      class: done\n', '    - status: shipped\n      class: done\n      requires: [superseded_by]\n')
	const text = replaceItems(
		withRequires,
		`  - id: todo-1
    source: local
    type: todo
    summary: "A thing"
    status: shipped
    first_seen: 2026-01-01
    next_action: none
    superseded_by: null
    evidence:
      kinds: [source-read]
      local_files: [src/a.mjs]
`
	)
	const errors = errorsFor(text)
	assert.ok(errors.some((e) => e.includes('`superseded_by` is required at `shipped` and empty')), errors.join('\n'))
})

test('a status whose class is not one of the five is reported, not thrown', () => {
	// The class is what every requirement lookup below it is keyed on. Handed onward as an
	// arbitrary string it reached a table that has five keys, threw, and took the whole
	// report with it — including the correct message this same run had already written.
	const text = replaceItems(
		LEDGER.replace('      class: dismissed\n', '      class: on-ice\n'),
		`  - id: todo-1
    source: local
    type: todo
    summary: "A thing"
    status: dropped
    first_seen: 2026-01-01
`
	)
	assert.doesNotThrow(() => validateLedgerText(text))
	const errors = errorsFor(text)
	assert.ok(errors.some((e) => e.includes('status `dropped`: `class` must be one of')), errors.join('\n'))
	// The entry is not where the mistake is, and its status *is* declared. Telling the
	// reader to declare it points at the one line that is already right.
	assert.ok(!errors.some((e) => e.includes('undeclared status')), errors.join('\n'))
})

test('summary must be double-quoted, always', () => {
	const plain = LEDGER.replace('summary: "A thing nobody has decided about"', 'summary: A thing nobody has decided about')
	assert.ok(errorsFor(plain).some((e) => e.includes('double-quoted scalar')))

	const single = LEDGER.replace('summary: "A thing nobody has decided about"', "summary: 'A thing nobody has decided about'")
	assert.ok(errorsFor(single).some((e) => e.includes('double-quoted scalar')))
})

test('an empty summary is an error — it is what a dropped argument looks like', () => {
	const text = LEDGER.replace('summary: "A thing nobody has decided about"', 'summary: ""')
	assert.ok(errorsFor(text).some((e) => e.includes('must not be empty')))
})

test('upstream is required once entries carry external provenance, and not before', () => {
	const withoutBlock = UPSTREAM_LEDGER.replace(/upstream:\n(?:  .*\n)+\n/, '')
	assert.ok(errorsFor(withoutBlock).some((e) => e.includes('`upstream:` is required')))

	// A ledger that declares an external kind but holds nothing does not need it — which
	// is the state every fork-triage ledger is in on the day it is created.
	const empty = UPSTREAM_LEDGER.replace(/upstream:\n(?:  .*\n)+\n/, '').replace(/items:\n[\s\S]*$/, 'items: []\n')
	assert.deepEqual(errorsFor(empty), [])
})

test('the id and the source must agree on their number', () => {
	const text = UPSTREAM_LEDGER.replace('source: acme/renderer#412', 'source: acme/renderer#413')
	assert.ok(errorsFor(text).some((e) => e.includes('id ends in 412 but source ends in 413')))
})

test('duplicate ids are refused', () => {
	const text = LEDGER.replace('id: todo-2', 'id: todo-1')
	assert.ok(errorsFor(text).some((e) => e.includes('duplicate id')))
})

test('a project-declared field constrains its values, its types and when it is required', () => {
	const withField = UPSTREAM_LEDGER.replace(
		'  evidence_kinds:',
		`  fields:
    - field: upstream_patch
      describes: Does the diff still apply?
      values: [applies, obsolete]
      types: [issue]
      required_when_triaged: true
  evidence_kinds:`
	)
	assert.deepEqual(errorsFor(withField), [])

	// Target the entry, not the vocabulary declaration of the same name above it.
	const bad = withField.replace(
		'    status: needs-triage\n    first_seen: 2026-01-01',
		'    status: dropped\n    first_seen: 2026-01-01\n    last_reviewed: 2026-01-01\n    non_target_reasons: [no-repro]'
	)
	assert.ok(errorsFor(bad).some((e) => e.includes('`upstream_patch` is required once an entry leaves')), errorsFor(bad).join('\n'))

	const wrongValue = bad.replace('    first_seen: 2026-01-01', '    first_seen: 2026-01-01\n    upstream_patch: maybe')
	assert.ok(errorsFor(wrongValue).some((e) => e.includes('undeclared value for `upstream_patch`')))
})

test('a project may not redeclare a field the spec governs', () => {
	const text = LEDGER.replace(
		'  evidence_kinds:',
		`  fields:
    - field: status
      values: [a, b]
  evidence_kinds:`
	)
	assert.ok(errorsFor(text).some((e) => e.includes('governed by the spec')))
})
