import assert from 'node:assert/strict'
import test from 'node:test'

import { parseLedgerText } from '../src/ledger.mjs'
import { validateLedgerText } from '../src/validate.mjs'
import {
	addLedgerItemText,
	dominantLineEnding,
	findItemBlocks,
	removeLedgerItemText,
	setLedgerItemStatusText,
	updateLedgerItemText,
	yamlScalar,
	yamlSummary,
} from '../src/surgery.mjs'
import { HOSTILE_SUMMARY, LEDGER } from './fixtures.mjs'

function itemById(text, id) {
	return parseLedgerText(text).data.items.find((item) => item.id === id)
}

function commentsIn(text) {
	return text.split('\n').filter((line) => /^\s*#/.test(line))
}

test('comments survive a status change — the reason line surgery exists', () => {
	const before = commentsIn(LEDGER)
	assert.ok(before.length > 0)
	const after = setLedgerItemStatusText(LEDGER, 'todo-1', 'dropped', {
		reviewDate: '2026-02-02',
		fields: { non_target_reasons: ['out-of-scope'] },
	})
	assert.deepEqual(commentsIn(after), before)
	// And the folded block scalar in `purpose:` and in `describes:` is untouched.
	assert.ok(after.includes('    - reason: out-of-scope\n      describes: >'))
})

test('only the targeted entry is rewritten', () => {
	const after = setLedgerItemStatusText(LEDGER, 'todo-1', 'dropped', {
		reviewDate: '2026-02-02',
		fields: { non_target_reasons: ['out-of-scope'] },
	})
	// Compared structurally, not by line number: inserting two fields shifts every line
	// below, so a positional diff would call the whole file changed and prove nothing.
	const head = (text) => text.slice(0, text.indexOf('  - id: todo-1'))
	assert.equal(head(after), head(LEDGER), 'everything above the edited entry must be byte-identical')

	const blockFor = (text, id) => findItemBlocks(text).blocks.find((block) => block.item.id === id).text
	assert.equal(blockFor(after, 'todo-2'), blockFor(LEDGER, 'todo-2'), 'the neighbouring entry must be byte-identical')

	const edited = blockFor(after, 'todo-1')
	assert.ok(edited.includes('status: dropped'))
	assert.ok(edited.includes('summary: "A thing nobody has decided about"'), 'untouched fields keep their exact text')
})

test('a hostile summary round-trips byte for byte', () => {
	// Every character class that has ever corrupted a write, including the one nothing
	// else catches: leading and trailing whitespace, which a plain scalar discards
	// silently and no diff shows you.
	const added = addLedgerItemText(
		LEDGER,
		{ id: 'todo-3', source: 'local', type: 'todo', status: 'needs-triage', summary: HOSTILE_SUMMARY },
		'2026-03-03'
	)
	assert.equal(itemById(added, 'todo-3').summary, HOSTILE_SUMMARY)
	assert.deepEqual(validateLedgerText(added).report.errors, [])

	const updated = updateLedgerItemText(added, 'todo-1', { summary: HOSTILE_SUMMARY })
	assert.equal(itemById(updated, 'todo-1').summary, HOSTILE_SUMMARY)
})

test('summary is emitted double-quoted even when it did not have to be', () => {
	assert.equal(yamlSummary('plain'), '"plain"')
	assert.equal(yamlScalar('plain'), 'plain')
	const added = addLedgerItemText(
		LEDGER,
		{ id: 'todo-3', source: 'local', type: 'todo', status: 'needs-triage', summary: 'plain' },
		'2026-03-03'
	)
	assert.ok(added.includes('summary: "plain"'))
})

test('a value that looks like a number is still a string when it comes back', () => {
	// Everything from the CLI is a string: `--set spec_refs=3.10` hands over "3.10". Written
	// plain, YAML reads it back as 3.1 — a spec reference renumbered, in a line that looks
	// right in the diff. Found by the fuzzer, which is the only way anyone finds this one.
	assert.equal(yamlScalar('3.10'), '"3.10"')
	assert.equal(yamlScalar('007'), '"007"')
	assert.equal(yamlScalar('1e5'), '"1e5"')
	assert.equal(yamlScalar('2026-01-01'), '2026-01-01', 'a date is a string to this parser and needs no quoting')
	assert.equal(yamlScalar(2), '2', 'a value that really is a number must still be written as one')

	const updated = updateLedgerItemText(LEDGER, 'todo-1', { next_action: '1.10' })
	assert.equal(itemById(updated, 'todo-1').next_action, '1.10')
})

test('CRLF files stay CRLF', () => {
	// Not cosmetic on Windows: `gh` emits CRLF, and a tool that appends LF to a CRLF file
	// produces a whole-file diff that hides the one line that changed.
	const crlf = LEDGER.replace(/\n/g, '\r\n')
	assert.equal(dominantLineEnding(crlf), '\r\n')
	const added = addLedgerItemText(
		crlf,
		{ id: 'todo-3', source: 'local', type: 'todo', status: 'needs-triage', summary: 'x' },
		'2026-03-03'
	)
	assert.ok(!/(?<!\r)\n/.test(added), 'a bare LF was introduced into a CRLF file')
	assert.equal(itemById(added, 'todo-3').summary, 'x')
})

test('a summary carrying a stray CR does not reach the file', () => {
	// The B0 recon failure mode: `gh` output ends in \r and the \r reaches a summary value.
	// Escaping it faithfully was the first answer, and it was the weaker one — a summary
	// that reads `"title\r"` is visible only to whoever looks. §3 now makes a line break in
	// a summary illegal outright, so the importer has to strip it at the parse boundary,
	// which is the one place the strip can be named.
	assert.throws(
		() =>
			addLedgerItemText(
				LEDGER,
				{ id: 'todo-3', source: 'local', type: 'todo', status: 'needs-triage', summary: 'title\r' },
				'2026-03-03'
			),
		/must not contain a line break/
	)

	// The escaping itself still has to work, because a summary can carry invisible
	// whitespace that is *not* a line terminator and that a plain scalar would eat.
	const added = addLedgerItemText(
		LEDGER,
		{ id: 'todo-3', source: 'local', type: 'todo', status: 'needs-triage', summary: 'title\t' },
		'2026-03-03'
	)
	assert.ok(added.includes('summary: "title\\t"'), 'a raw tab was written into the file instead of being escaped')
	assert.equal(itemById(added, 'todo-3').summary, 'title\t')
})

test('mutations refuse to leave an invalid ledger', () => {
	assert.throws(
		() => setLedgerItemStatusText(LEDGER, 'todo-1', 'taken', { reviewDate: '2026-02-02' }),
		/requires `evidence`/
	)
	assert.throws(() => setLedgerItemStatusText(LEDGER, 'todo-1', 'not-a-status'), /undeclared status/)
})

test('an ambiguous or missing id is refused rather than guessed', () => {
	assert.throws(() => removeLedgerItemText(LEDGER, 'todo-9'), /not found/)
	const duplicated = LEDGER.replace('id: todo-2', 'id: todo-1')
	assert.throws(() => removeLedgerItemText(duplicated, 'todo-1'), /duplicated/)
})

test('remove works on an already-invalid ledger, because it is the repair tool', () => {
	// If a bad entry can only be deleted from a clean ledger, the way out of a bad write
	// is to hand-edit the YAML — which is the prior art's workaround and the thing the
	// acceptance criteria forbid.
	const broken = LEDGER.replace('summary: "Another thing"', 'summary: ""')
	assert.ok(validateLedgerText(broken).report.errors.length > 0)
	const repaired = removeLedgerItemText(broken, 'todo-2')
	assert.deepEqual(validateLedgerText(repaired).report.errors, [])
})

test('removing the last entry leaves `items: []`, which is retirement', () => {
	let text = removeLedgerItemText(LEDGER, 'todo-1')
	text = removeLedgerItemText(text, 'todo-2')
	assert.ok(/^items: \[\]/m.test(text))
	assert.deepEqual(findItemBlocks(text).blocks, [])
	assert.deepEqual(validateLedgerText(text).report.errors, [])
})

test('evidence is written as a readable block and merges rather than replacing', () => {
	const accepted = setLedgerItemStatusText(LEDGER, 'todo-1', 'taken', {
		reviewDate: '2026-02-02',
		fields: { next_action: 'do the thing', evidence: { kinds: ['source-read'], local_files: ['src/a.ts'] } },
	})
	assert.ok(accepted.includes('    evidence:\n      kinds: [source-read]\n      local_files: [src/a.ts]'))
	assert.deepEqual(validateLedgerText(accepted).report.errors, [])

	const enriched = updateLedgerItemText(accepted, 'todo-1', {
		evidence: { kinds: ['source-read', 'repro'], local_files: ['src/a.ts'], result: 'pass' },
	})
	assert.deepEqual(itemById(enriched, 'todo-1').evidence.kinds, ['source-read', 'repro'])
	assert.equal(itemById(enriched, 'todo-1').evidence.result, 'pass')
	// The block was replaced whole, not appended to twice.
	assert.equal((enriched.match(/^      kinds:/gm) || []).length, 1)
})
