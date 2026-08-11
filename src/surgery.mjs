/**
 * Mutations are line surgery, never parse -> dump.
 *
 * Ported from the prior art (ts-pptx `scripts/backlog-ledger.mjs`) rather than rewritten,
 * because it is the hardest part of this project to re-derive and it already worked. The
 * reason it exists: comments in the vocabulary block are load-bearing — `describes` holds
 * the criterion, comments hold the history of why the vocabulary looks like this — and a
 * round-trip through a YAML parser and a dumper eats them, along with block scalars and
 * key order. A tool that does that destroys the instrument it is meant to maintain.
 *
 * So: read the text, find the byte range of one entry, replace one line inside it, write
 * the text back. Everything outside that range is untouched by construction.
 *
 * Every mutation validates the result before returning it. A mutation that would leave an
 * invalid ledger fails instead of writing.
 */

import { hasOwn, indexLedger, isIsoDate, parseLedgerText, readsBackAsItself, todayIsoDate } from './ledger.mjs'
import { DECISION_FIELD_CLASSES, SPEC_FIELDS } from './model.mjs'
import { validateLedgerText } from './validate.mjs'

/**
 * The six base fields, in the order every entry writes them.
 *
 * Order is a readability choice, not a rule — but it is one choice, made here, so that a
 * hand-written entry and a generated one look the same at entry 900.
 */
const BASE_ORDER = ['id', 'source', 'type', 'summary', 'status', 'first_seen']

// -------------------------------------------------------------------- line primitives

export function splitLines(text) {
	const lines = text.split(/(?<=\n)/)
	if (lines.at(-1) === '') lines.pop()
	return lines
}

export function lineContent(line) {
	return line.replace(/\r?\n$/, '')
}

function lineEnding(line) {
	return line.match(/\r?\n$/)?.[0] || ''
}

function setLineContent(line, content) {
	return content + lineEnding(line)
}

/**
 * The line ending this file already uses.
 *
 * Not cosmetic on Windows. `gh` emits CRLF here, and a tool that appends LF to a CRLF file
 * produces a mixed-ending diff that reviewers cannot read and that hides the one line that
 * actually changed.
 */
export function dominantLineEnding(text) {
	const crlf = (text.match(/\r\n/g) || []).length
	const lf = (text.match(/(?<!\r)\n/g) || []).length
	return crlf > lf ? '\r\n' : '\n'
}

// ------------------------------------------------------------------------- emission

const PLAIN_SCALAR = /^[A-Za-z0-9][\w.\-/#+]*$/

/**
 * Words to quote regardless of what our own parser makes of them.
 *
 * Not redundant with the round-trip check below, and the difference is the point: under
 * YAML 1.2, which is what this file is read as, `yes` and `off` are ordinary strings. They
 * are booleans to a 1.1 reader, and a ledger is read by things that are not this tool —
 * a `python yaml.safe_load` in someone's script, an editor's highlighter. Quoting them
 * costs two characters and removes the disagreement.
 */
const YAML_RESERVED = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off', '~'])

/**
 * Emit a scalar, quoting when a plain scalar would not survive the round trip.
 *
 * A JSON string is a valid YAML 1.2 double-quoted scalar, so `JSON.stringify` is the whole
 * escape implementation and there is no per-character list to get wrong.
 *
 * Surviving the round trip is about *type* as much as about characters, and that half is
 * the one with no visible symptom. Everything the CLI receives is a string — `--set
 * spec_refs=3.10` hands over `"3.10"` — and a string that looks like a number, written
 * plain, is read back as one: `3.10` returns as `3.1`, a spec reference silently
 * renumbered, in a line that looks exactly right in a diff. So the type is checked first,
 * because a value that genuinely *is* a number must still be written as one, and then the
 * text is only left unquoted if the parser hands it back unchanged.
 */
export function yamlScalar(value) {
	if (typeof value === 'number' || typeof value === 'boolean') return String(value)
	const text = String(value)
	if (PLAIN_SCALAR.test(text) && !YAML_RESERVED.has(text.toLowerCase()) && readsBackAsItself(text)) return text
	return JSON.stringify(text)
}

/**
 * `summary` is always double-quoted. Always — not only when the content requires it.
 *
 * A rule with no branches cannot be got wrong at entry 900, and it retires the whole class
 * of quoting bugs in one line, including the one nothing else catches: leading and
 * trailing whitespace, which a plain scalar discards silently.
 */
export function yamlSummary(value) {
	return JSON.stringify(String(value))
}

/**
 * Render one entry as YAML, at the ratcheted minimum for its class.
 *
 * Writes only what is required and what was actually supplied. No `priority: null`, no
 * stub `evidence:` block — omission is a MUST, and it is also worth about 3x on the size
 * of a seeded ledger.
 */
export function renderItemBlock(item, eol = '\n') {
	const lines = []
	const push = (indent, key, rendered) => lines.push(indent + key + ': ' + rendered)

	push('  - ', 'id', yamlScalar(item.id))
	push('    ', 'source', yamlScalar(item.source))
	push('    ', 'type', yamlScalar(item.type))
	push('    ', 'summary', yamlSummary(item.summary ?? ''))
	push('    ', 'status', yamlScalar(item.status))
	push('    ', 'first_seen', yamlScalar(item.first_seen))

	for (const [key, value] of Object.entries(item)) {
		if (BASE_ORDER.includes(key)) continue
		if (value === undefined || value === null) continue
		if (Array.isArray(value)) {
			if (value.length === 0) continue
			lines.push('    ' + key + ':')
			for (const entry of value) lines.push('      - ' + yamlScalar(entry))
		} else if (typeof value === 'object') {
			continue // nested mappings (evidence) are written by hand or by an editor, not by `add`
		} else {
			push('    ', key, yamlScalar(value))
		}
	}
	return lines.map((line) => line + eol).join('')
}

// --------------------------------------------------------------------- block location

function parseItemBlock(blockText) {
	const parsed = parseLedgerText('items:\n' + blockText)
	if (parsed.errors.length > 0) throw new Error(parsed.errors.join('\n'))
	return parsed.data?.items?.[0] || null
}

/**
 * Locate every entry in the file as a line range.
 *
 * An entry starts at a `  - ` line under `items:` and runs to the line before the next
 * one. That is a stricter claim than it looks — it is why the format insists entries live
 * at one known indentation.
 */
export function findItemBlocks(text) {
	const lines = splitLines(text)
	const itemsLineIndex = lines.findIndex((line) => /^items:\s*(?:\[\])?\s*(?:#.*)?$/.test(lineContent(line)))
	if (itemsLineIndex < 0) throw new Error('`items:` section not found')
	if (/^items:\s*\[\]\s*(?:#.*)?$/.test(lineContent(lines[itemsLineIndex]))) {
		return { lines, itemsLineIndex, blocks: [] }
	}

	const starts = []
	for (let i = itemsLineIndex + 1; i < lines.length; i += 1) {
		if (/^ {2}-\s+/.test(lines[i])) starts.push(i)
	}

	const blocks = starts.map((startIndex, index) => {
		const endIndex = starts[index + 1] ?? lines.length
		const blockText = lines.slice(startIndex, endIndex).join('')
		return {
			startIndex,
			endIndex,
			startLine: startIndex + 1,
			endLine: endIndex,
			text: blockText,
			item: parseItemBlock(blockText),
		}
	})
	return { lines, itemsLineIndex, blocks }
}

/** Refuse an ambiguous id rather than guessing which one was meant. */
export function findUniqueBlock(blocks, id) {
	const matches = blocks.filter((block) => block.item?.id === id)
	if (matches.length === 0) throw new Error('ledger entry not found: ' + id)
	if (matches.length > 1) throw new Error('ledger entry id is duplicated: ' + id)
	return matches[0]
}

function assertValidAfterMutation(text) {
	const { report } = validateLedgerText(text)
	if (!report.ok) throw new Error('mutation would leave an invalid ledger:\n' + report.errors.map((e) => '- ' + e).join('\n'))
}

function assertValidBeforeMutation(text) {
	const { report, data } = validateLedgerText(text)
	if (!report.ok) throw new Error('ledger is already invalid; fix it before mutating:\n' + report.errors.map((e) => '- ' + e).join('\n'))
	return data
}

/**
 * Render a value for the right-hand side of a field line.
 *
 * Lists are written inline (`[a, b]`) rather than as block sequences. A list field is then
 * always exactly one line, which keeps its mutation a single-line replacement — a block
 * sequence would mean counting following lines, and getting that count wrong somewhere is
 * how line surgery turns into corruption.
 */
function renderScalarOrList(field, value) {
	if (Array.isArray(value)) return '[' + value.map((entry) => yamlScalar(entry)).join(', ') + ']'
	if (field === 'summary') return yamlSummary(value)
	if (value === null) return 'null'
	return yamlScalar(value)
}

/**
 * Render a whole field as the lines it occupies.
 *
 * Mappings — in practice `evidence`, the one nested shape the spec defines — are written
 * as a block with each sub-field inline, because this is a file people read. The
 * alternative was a flow mapping on one line, which would have been simpler here and
 * unpleasant everywhere else.
 */
function renderFieldLines(field, value, eol) {
	if (isPlainObject(value)) {
		const lines = ['    ' + field + ':' + eol]
		for (const [key, nested] of Object.entries(value)) {
			if (nested === undefined) continue
			if (Array.isArray(nested) && nested.length === 0) continue
			lines.push('      ' + key + ': ' + renderScalarOrList(key, nested) + eol)
		}
		return lines
	}
	return ['    ' + field + ': ' + renderScalarOrList(field, value) + eol]
}

function isPlainObject(value) {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** A field's line, plus any block-sequence lines that belong to it. */
function findFieldRange(lines, block, field) {
	const head = new RegExp('^    ' + field + ':(\\s|$)')
	for (let i = block.startIndex; i < block.endIndex; i += 1) {
		if (!head.test(lineContent(lines[i]))) continue
		let end = i + 1
		if (/^\s*$/.test(lineContent(lines[i]).slice(('    ' + field + ':').length))) {
			// The key carried no inline value, so a block sequence or mapping may follow.
			while (end < block.endIndex && /^ {6}/.test(lines[end])) end += 1
		}
		return { start: i, end }
	}
	return null
}

function setField(lines, block, field, value) {
	const eol = lineEnding(lines[block.startIndex]) || '\n'
	const rendered = renderFieldLines(field, value, eol)
	const range = findFieldRange(lines, block, field)
	if (range) {
		lines.splice(range.start, range.end - range.start, ...rendered)
		block.endIndex += rendered.length - (range.end - range.start)
	} else {
		lines.splice(block.endIndex, 0, ...rendered)
		block.endIndex += rendered.length
	}
}

// ------------------------------------------------------------------------ mutations

/**
 * Remove one entry.
 *
 * Deliberately the one mutation that does **not** demand a valid ledger first. `remove` is
 * the repair tool: if a bad entry can only be deleted from a ledger that is already clean,
 * then the way out of a bad write is to hand-edit the YAML — which is the prior art's
 * documented workaround for its own corruption bug, and the thing this project's
 * acceptance criteria are written to forbid.
 *
 * The guarantee is therefore relative rather than absolute: removing an entry may not
 * introduce errors. It may leave existing ones behind, and on a clean ledger it reduces to
 * the same check as everything else.
 */
export function removeLedgerItemText(text, id) {
	const before = validateLedgerText(text).report.errors.length
	const { lines, itemsLineIndex, blocks } = findItemBlocks(text)
	const block = findUniqueBlock(blocks, id)
	if (blocks.length === 1) lines[itemsLineIndex] = setLineContent(lines[itemsLineIndex], 'items: []')
	lines.splice(block.startIndex, block.endIndex - block.startIndex)
	const updated = lines.join('')
	const after = validateLedgerText(updated).report
	if (after.errors.length > before) {
		throw new Error('removing ' + id + ' would introduce errors:\n' + after.errors.map((e) => '- ' + e).join('\n'))
	}
	return updated
}

function removeField(lines, block, field) {
	const range = findFieldRange(lines, block, field)
	if (!range) return
	lines.splice(range.start, range.end - range.start)
	block.endIndex -= range.end - range.start
}

/**
 * The value that means "delete this key" rather than "write this value".
 *
 * A symbol, so it cannot arrive by accident from a `--set` on the command line or from
 * YAML, both of which can produce every other JavaScript value including `null`.
 */
export const REMOVE_FIELD = Symbol('remove field')

/**
 * Set fields on one entry. The single mutation path; everything else is a wrapper.
 *
 * A field set to `undefined` is skipped; a field set to `null` is written as an explicit
 * null; a field set to {@link REMOVE_FIELD} is deleted. Deletion is not offered on the
 * command line and there is no `--unset`: it exists for the one caller below that has to
 * withdraw a decision the entry is no longer making, and a general unset is the operation
 * that turns a valid entry into a stub.
 */
export function updateLedgerItemText(text, id, updates) {
	assertValidBeforeMutation(text)
	const { lines, blocks } = findItemBlocks(text)
	const block = findUniqueBlock(blocks, id)
	for (const [field, value] of Object.entries(updates)) {
		if (value === undefined) continue
		if (value === REMOVE_FIELD) removeField(lines, block, field)
		else setField(lines, block, field, value)
	}
	const updated = lines.join('')
	assertValidAfterMutation(updated)
	return updated
}

/**
 * Move one entry to a new status, stamping `last_reviewed`.
 *
 * The status must be declared. What this function does *not* know is what any status
 * means: it sets the field and lets the validator decide whether the result is legal,
 * which is why moving an entry to a status whose class demands evidence fails with the
 * validator's message rather than with a rule written twice, and why `--reason` is just
 * another field to set rather than a special case for dismissal.
 *
 * The one exception is withdrawing a decision the entry has stopped making. Dismiss an
 * entry and then accept it, and the dismissal reason is still sitting there: the entry now
 * says it was decided against and decided for, and before this it validated. Leaving that
 * to the validator would only convert a silent contradiction into a refusal the writer
 * cannot act on without hand-editing the file, which is the one thing §4 promises they will
 * never have to do. So the transition withdraws it, and git keeps the decision that was
 * replaced — which is where this format puts history everywhere else.
 *
 * Expressed against the class, never a status name, and driven by the same table the
 * validator reads.
 *
 * That table covers the two fields the *spec* attaches to a decision. A project attaches
 * its own, by declaring `requires:` on a status (§7), and those strand exactly the same
 * way: park an entry on a status requiring `unblocked_by`, dismiss it, and the entry
 * asserts a dismissal and a gate it is still waiting behind. The vocabulary already says
 * which field carried which status's decision, so the withdrawal reads it rather than
 * hardcoding a third row. Spec-governed fields are left to the class table above — this
 * rung of the ladder does not get to reach down and remove `evidence`.
 */
export function setLedgerItemStatusText(text, id, status, { reviewDate = todayIsoDate(), fields = {} } = {}) {
	const data = assertValidBeforeMutation(text)
	const index = indexLedger(data)
	if (!index.statuses.has(status)) {
		throw new Error('undeclared status: ' + status + ' — declare it in `vocabulary.statuses` first')
	}
	if (!isIsoDate(reviewDate)) throw new Error('review date must be YYYY-MM-DD')
	const cls = index.classOf(status)
	const withdrawn = {}
	for (const [field, classes] of Object.entries(DECISION_FIELD_CLASSES)) {
		if (cls !== null && !classes.includes(cls) && !hasOwn(fields, field)) withdrawn[field] = REMOVE_FIELD
	}
	const previous = index.items.find((item) => item?.id === id)
	if (previous && previous.status !== status) {
		const stillRequired = new Set(index.requiredByStatus(status))
		for (const field of index.requiredByStatus(previous.status)) {
			if (stillRequired.has(field) || SPEC_FIELDS.includes(field) || hasOwn(fields, field)) continue
			withdrawn[field] = REMOVE_FIELD
		}
	}
	return updateLedgerItemText(text, id, { status, last_reviewed: reviewDate, ...withdrawn, ...fields })
}

/**
 * The entry `add` will write: the six base fields, plus whatever else was supplied.
 *
 * The extras pass through generically rather than by a known-key list. A project declares
 * its own fields (§7) and the CLI reaches them through `--set field=value`, so enumerating
 * them here would mean this function knew a vocabulary it has no business knowing — and
 * silently dropping what it did not recognize, which is precisely how a supplied value
 * disappears into an entry that still validates.
 *
 * Empty is skipped rather than written, because omission is a MUST: a field not required at
 * the entry's class must be absent, not present-and-empty.
 */
function buildItemSkeleton(fields, today) {
	// Every missing flag at once, not the first one. The validator reports everything it
	// finds in a single pass and argument checking used to report one thing per run, so a
	// bare `add` cost four round trips to learn four things this function already knew. An
	// inconsistency in how a tool reports two kinds of the same mistake is a real cost:
	// people learn the cheaper habit from whichever they met first.
	const missing = ['id', 'source', 'type', 'status'].filter((required) => !fields[required])
	if (missing.length > 0) {
		throw new Error('add requires ' + missing.map((name) => '--' + name.replace('_', '-')).join(', '))
	}
	const extra = {}
	for (const [key, value] of Object.entries(fields)) {
		if (BASE_ORDER.includes(key)) continue
		if (value === undefined || value === null || value === '') continue
		extra[key] = value
	}
	return {
		id: fields.id,
		source: fields.source,
		type: fields.type,
		summary: fields.summary ?? '',
		status: fields.status,
		first_seen: fields.first_seen || today,
		...extra,
	}
}

export function addLedgerItemText(text, fields, today = todayIsoDate()) {
	assertValidBeforeMutation(text)
	const item = buildItemSkeleton(fields, today)
	const { blocks } = findItemBlocks(text)
	if (blocks.some((block) => block.item?.id === item.id)) throw new Error('ledger entry id already exists: ' + item.id)

	const eol = dominantLineEnding(text)
	const block = renderItemBlock(item, eol)
	const base = text.endsWith('\n') ? text : text + eol
	const updated =
		blocks.length === 0 ? base.replace(/^items:[^\S\r\n]*(?:\[\])?[^\S\r\n]*$/m, 'items:') + block : base + block
	assertValidAfterMutation(updated)
	return updated
}
