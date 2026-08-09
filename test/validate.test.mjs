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

test('a reason that demanded evidence and got no result is warned about, not refused', () => {
	// The ratchet cannot verify that work happened, and requiring `result` would only move
	// the assertion one field along — so this is a SHOULD in §3 and a warning here. What it
	// buys is that the writer has to turn `repro` into a sentence while they are writing it.
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
    evidence:
      kinds: [repro]
`
	)
	const report = validateLedgerText(text).report
	assert.deepEqual(report.errors, [])
	assert.ok(report.warnings.some((w) => w.includes('no `evidence.result` records how it came out')), report.warnings.join('\n'))

	const withResult = text.replace('      kinds: [repro]\n', '      kinds: [repro]\n      result: fail\n')
	assert.deepEqual(validateLedgerText(withResult).report.warnings, [])
})

test('a summary must not contain a line break, whatever typed it', () => {
	// Not a length rule. A newline is the one character in a summary whose survival depends
	// on the platform: the Windows npx shim drops it and every argument after it, so the
	// entry that arrives is truncated, its other fields are silently unset, and it validates.
	for (const escape of ['\\n', '\\r']) {
		const text = LEDGER.replace('summary: "A thing nobody has decided about"', 'summary: "one' + escape + 'two"')
		assert.ok(errorsFor(text).some((e) => e.includes('must not contain a line break')), escape)
	}
	// The rule is about the value, not about how many lines the file spends on it. A
	// double-quoted scalar wrapped across two lines folds to a single space, so it carries
	// no line break and is legal — which is the distinction that keeps this from being a
	// rule about formatting.
	const wrapped = LEDGER.replace('summary: "A thing nobody has decided about"', 'summary: "one\n      two"')
	assert.deepEqual(errorsFor(wrapped), [])
})

test('free-text evidence lists must hold strings, because YAML types a plain scalar', () => {
	// `spec_refs: [3.10]` is a legal document in which the value is the number 3.1, and the
	// file still reads `3.10` afterwards — the loss happens on the way in and no diff shows
	// it. These two lists are the only free-text ones the spec owns; everywhere else an
	// undeclared name is already an error, which is what makes the coercion visible there.
	const withEvidence = (block) =>
		replaceItems(
			LEDGER,
			`  - id: todo-1
    source: local
    type: todo
    summary: "A thing"
    status: taken
    first_seen: 2026-01-01
    next_action: do it
    evidence:
      kinds: [source-read]
${block}`
		)

	const coerced = withEvidence('      spec_refs: [3.10]\n')
	assert.ok(errorsFor(coerced).some((e) => e.includes('quote a value meant as text')), errorsFor(coerced).join('\n'))

	const quoted = withEvidence("      spec_refs: ['3.10']\n")
	assert.deepEqual(errorsFor(quoted), [])

	const blank = withEvidence("      local_files: ['']\n")
	assert.ok(errorsFor(blank).some((e) => e.includes('is blank')), errorsFor(blank).join('\n'))

	// `kinds` is deliberately not checked this way: its elements are matched against the
	// declared vocabulary, so a coerced one is already reported as an undeclared kind, and
	// reporting it twice would tell the reader they made two mistakes when they made one.
	const badKind = withEvidence('').replace('      kinds: [source-read]', '      kinds: [3.10]')
	const kindErrors = errorsFor(badKind).filter((e) => e.includes('evidence'))
	assert.deepEqual(kindErrors, ['todo-1: undeclared evidence kind: 3.1'])
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

test('there are four vocabulary lists and only four', () => {
	// The case worth a test is not the invented fifth list — it is the misspelling. `fields`
	// is the one list a ledger may leave out, so `feilds:` would otherwise be a legal
	// document in which every field declaration sits somewhere nothing reads.
	const misspelt = LEDGER.replace(
		'  evidence_kinds:',
		`  feilds:
    - field: upstream_patch
      values: [applies, obsolete]
      required_when_triaged: true
  evidence_kinds:`
	)
	assert.ok(errorsFor(misspelt).some((e) => e.includes('four vocabulary lists and only four')), errorsFor(misspelt).join('\n'))

	const invented = LEDGER.replace('  evidence_kinds:', '  priorities:\n    - priority: high\n  evidence_kinds:')
	assert.ok(errorsFor(invented).some((e) => e.includes('belongs under `fields`')), errorsFor(invented).join('\n'))
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

test('an entry may not assert two decisions at once', () => {
	// Reachable without a merge: dismiss an entry, then accept it, and before the writer
	// withdrew it the reason stayed. The entry then said the project decided against
	// something it had decided for, and this validated.
	const contradictory = replaceItems(
		LEDGER,
		`  - id: todo-1
    source: local
    type: todo
    summary: "A thing"
    status: taken
    first_seen: 2026-01-01
    last_reviewed: 2026-02-02
    non_target_reasons: [out-of-scope]
    next_action: "do the thing"
    evidence:
      kinds: [source-read]
`
	)
	assert.ok(
		errorsFor(contradictory).some((e) => e.includes('says this was decided against, and `taken` says it was not')),
		errorsFor(contradictory).join('\n')
	)

	// The mirror, and the worse half: a terminal entry naming work still outstanding.
	const terminalWithWork = replaceItems(
		LEDGER,
		`  - id: todo-1
    source: local
    type: todo
    summary: "A thing"
    status: dropped
    first_seen: 2026-01-01
    last_reviewed: 2026-02-02
    non_target_reasons: [out-of-scope]
    next_action: "profile the render loop"
`
	)
	assert.ok(
		errorsFor(terminalWithWork).some((e) => e.includes('is terminal and `next_action` names work outstanding')),
		errorsFor(terminalWithWork).join('\n')
	)
})

test('evidence is a record and survives a change of mind, so it is not on that list', () => {
	// The distinction the rule above turns on. `evidence` says what was found; the other two
	// say what was decided. A dismissal that gathered evidence keeps it, and a reason may
	// even demand it.
	const dismissedWithEvidence = replaceItems(
		LEDGER,
		`  - id: todo-1
    source: local
    type: todo
    summary: "A thing"
    status: dropped
    first_seen: 2026-01-01
    last_reviewed: 2026-02-02
    non_target_reasons: [no-repro]
    evidence:
      kinds: [repro]
      result: inconclusive
`
	)
	assert.deepEqual(errorsFor(dismissedWithEvidence), [])
})

test('a conflicted ledger is told it is conflicted, once, with the lines', () => {
	// The one malformation an adopter reliably produces, because the ledger is one file and
	// two branches write to it. Before this it produced seven parser errors about implicit
	// keys, none of which mentioned a merge.
	const conflicted = LEDGER.replace(
		'    status: needs-triage\n    first_seen: 2026-01-01',
		'<<<<<<< HEAD\n    status: taken\n=======\n    status: dropped\n>>>>>>> other\n    first_seen: 2026-01-01'
	)
	const errors = errorsFor(conflicted)
	assert.equal(errors.length, 1, errors.join('\n'))
	assert.match(errors[0], /^unresolved merge conflict: markers at line 45, 47, 49\./)
	// And it says what not to do, because the natural resolution is the damaging one.
	assert.match(errors[0], /do not simply keep both sides/)

	// A half-resolved file still counts: one marker left behind is one too many.
	const halfResolved = LEDGER.replace('items:\n', 'items:\n>>>>>>> other\n')
	assert.equal(errorsFor(halfResolved).length, 1)
})

test('a YAML error says where, because the parser knows and we were throwing it away', () => {
	const broken = LEDGER.replace('  - id: todo-2', '  - id: todo-2\n   bad-indent: 1')
	const errors = errorsFor(broken)
	assert.ok(errors.length > 0)
	assert.ok(
		errors.every((e) => /^YAML:\d+:\d+: /.test(e)),
		errors.join('\n')
	)
	// The position is given once, not twice — `prettyErrors` also writes it into the prose.
	assert.ok(!errors.some((e) => / at line \d+, column \d+/.test(e)), errors.join('\n'))
})

test('a ledger cannot record work that has not happened yet', () => {
	// `last_reviewed` is what days-since-last-triage-activity is computed from, and that
	// number is the only signal a project gets that its triage was quietly abandoned. A date
	// in the future does not merely record something false — it makes the signal read fresh,
	// for as long as the writer cares to type.
	const future = replaceItems(
		LEDGER,
		`  - id: todo-1
    source: local
    type: todo
    summary: "A thing"
    status: needs-triage
    first_seen: 2026-01-01
    last_reviewed: 2027-12-31
`
	)
	const errors = validateLedgerText(future, { today: '2026-08-09' }).report.errors
	assert.equal(errors.length, 1, errors.join('\n'))
	assert.match(errors[0], /`last_reviewed` is 2027-12-31, which has not happened yet/)

	// One day of slack, and it is load-bearing rather than polite: these are calendar dates
	// with no zone, so a ledger written in the morning in UTC+13 is dated tomorrow to a
	// validator running in UTC. Two days is not a timezone.
	const tomorrow = future.replace('2027-12-31', '2026-08-10')
	assert.deepEqual(validateLedgerText(tomorrow, { today: '2026-08-09' }).report.errors, [])
	const dayAfter = future.replace('2027-12-31', '2026-08-11')
	assert.equal(validateLedgerText(dayAfter, { today: '2026-08-09' }).report.errors.length, 1)

	// And the rule can only ever let more through: a future date becomes a past one, so a
	// ledger that validates today still validates later.
	assert.deepEqual(validateLedgerText(future, { today: '2028-01-01' }).report.errors, [])
})

test('nobody reviewed an entry before the project had it', () => {
	const backwards = replaceItems(
		LEDGER,
		`  - id: todo-1
    source: local
    type: todo
    summary: "A thing"
    status: needs-triage
    first_seen: 2026-01-01
    last_reviewed: 1999-01-01
`
	)
	const errors = validateLedgerText(backwards, { today: '2026-08-09' }).report.errors
	assert.equal(errors.length, 1, errors.join('\n'))
	assert.match(errors[0], /`last_reviewed` \(1999-01-01\) is before `first_seen` \(2026-01-01\)/)

	// Backdating on its own is legitimate and stays so — a triage session that happened last
	// week is recorded as last week. Only the impossible ordering is an error.
	assert.deepEqual(
		validateLedgerText(backwards.replace('1999-01-01', '2026-01-01'), { today: '2026-08-09' }).report.errors,
		[]
	)
})

test('a dismissal reason whose sentence is only true of some entries says which', () => {
	// The cheapest reason in a vocabulary is what a tired triager reaches for at entry 300,
	// and the failure it produces is not a false statement but a vacuous one: "nobody ever
	// provided a reproduction" is true of a feature request the way it is true of a rock.
	// The type mismatch is the only part of that a validator can see.
	const typed = LEDGER.replace(
		'      requires_evidence: [repro]',
		'      requires_evidence: [repro]\n      types: [chore]'
	).replace('source_kinds:\n  - type: todo', 'source_kinds:\n  - type: todo\n  - type: chore')
	const dismissed = replaceItems(
		typed,
		`  - id: todo-1
    source: local
    type: todo
    summary: "A thing"
    status: dropped
    first_seen: 2026-01-01
    last_reviewed: 2026-02-02
    non_target_reasons: [no-repro]
    evidence:
      kinds: [repro]
      result: fail
`
	)
	const errors = errorsFor(dismissed)
	assert.equal(errors.length, 1, errors.join('\n'))
	assert.match(errors[0], /is declared only for types chore, not `todo`/)

	// The same entry under a reason carrying no restriction is fine — most reasons should
	// carry none, because a scope decision is about the ask and not about how it arrived.
	assert.deepEqual(errorsFor(dismissed.replace('      types: [chore]\n', '')), [])
})

test('a reason cannot restrict itself to a type nothing declares', () => {
	const bogus = LEDGER.replace('      about: item-state', '      about: item-state\n      types: [nonexistent]')
	assert.ok(
		errorsFor(bogus).some((e) => /`types` names an undeclared entry type: nonexistent/.test(e)),
		errorsFor(bogus).join('\n')
	)
	// Empty is not a restriction, it is a mistake — and read as "no types at all" it would
	// silently forbid every dismissal under the reason.
	const empty = LEDGER.replace('      about: item-state', '      about: item-state\n      types: []')
	assert.ok(errorsFor(empty).some((e) => /`types` must be a non-empty list/.test(e)), errorsFor(empty).join('\n'))
})
