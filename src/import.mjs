/**
 * `import` — the seeding mode that reads records somebody else fetched.
 *
 * §4 names three seeding modes and calls seeding "a phase, not an importer". This module is
 * the mechanical half of two of them: **import** (bulk-populate from an external tracker)
 * and **migrate** (convert an existing pile). They are one mechanism here because they
 * differ only in what the records came from, and the ledger cannot tell — what it can tell
 * is whether the entry's `type` declares a `source_pattern`, which is the same distinction
 * §3 draws and the thing that decides whether an `upstream:` block is owed.
 *
 * **This does not fetch.** The tool reads records that already exist on disk, or on stdin.
 * The one `gh issue list --json …` belongs to the person seeding, and that is not
 * squeamishness about dependencies:
 *
 *   - §6 requires the integration surface to be enumerable, and a network call is the one
 *     part of a tool nobody can enumerate. What it fetched is not in the repository, so
 *     nothing at teardown can say what it touched.
 *   - §4's `filter` MUST record the exact predicate applied. If the tool builds the query,
 *     the predicate written into `upstream:` is the tool's rendering of what it thinks it
 *     asked for. If the person seeding wrote the query, it is the query.
 *   - The fork case would be served and `migrate` would not. A `TODO.md`, an export, a
 *     spreadsheet — every one of those reaches a JSON array with something the seeder
 *     already has, and none of them reaches a GitHub client.
 *
 * The price is real and worth stating: the tool cannot know `total_open`, because it never
 * sees the unfiltered pile. So `--total-open` is asked for rather than measured, which is
 * exactly the number §3 says a reader needs six months later and exactly the number a
 * fetching importer would have had to run a second query to learn.
 */

import fs from 'node:fs/promises'

import { BASE_FIELDS } from './model.mjs'

/**
 * Fields a record MUST resolve for, or the import refuses.
 *
 * The other half of the rule is §3's omission clause: a *project* field whose template
 * resolves to nothing is left off the entry, not written empty. An issue with no labels
 * gets no `tags`, which is the correct entry. An issue with no number gets no id, which is
 * not an entry at all — and the export or the mapping is wrong for all of the others too,
 * so this half is fatal rather than skipped.
 */
const REQUIRED_FIELDS = ['id', 'source', 'type', 'summary', 'status']

// ----------------------------------------------------------------------- reading records

/** Strip a BOM, which is what a spreadsheet export hands over and what JSON.parse rejects. */
function stripBom(text) {
	return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

async function readStdin() {
	const chunks = []
	for await (const chunk of process.stdin) chunks.push(chunk)
	return Buffer.concat(chunks).toString('utf8')
}

export async function readRecordSource(source) {
	if (source === '-') return stripBom(await readStdin())
	try {
		return stripBom(await fs.readFile(source, 'utf8'))
	} catch (error) {
		if (error.code === 'ENOENT') throw new Error('no such file: ' + source + ' (use `-` to read records from stdin)')
		throw error
	}
}

/**
 * Normalize one string, once, at the parse boundary.
 *
 * §4 makes this a MUST and says where: here, not repeatedly downstream and not by hoping
 * the emitter escapes it. `gh` on Windows hands back titles ending in `\r`, and §3 makes a
 * `summary` containing a line terminator illegal precisely so the strip has one nameable
 * home. Runs of line terminators collapse to a single space rather than to nothing, because
 * a wrapped title joined without one reads as a different word.
 *
 * Applied to every string in the record, not only to the one that becomes `summary`. Every
 * value this format holds is a single line, so there is no case where the distinction
 * would pay for the branch it costs.
 */
export function normalizeText(value) {
	return value.replace(LINE_BREAK, ' ').trim()
}

/** Every line terminator YAML and JavaScript recognise, with the horizontal space around it. */
const LINE_BREAK = /[ \t]*[\r\n\u2028\u2029]+[ \t]*/g

function normalizeDeep(value) {
	if (typeof value === 'string') return normalizeText(value)
	if (Array.isArray(value)) return value.map(normalizeDeep)
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, normalizeDeep(nested)]))
	}
	return value
}

function asRecord(value, position, label) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(label + ': record ' + position + ' is not an object — expected one mapping per record')
	}
	return normalizeDeep(value)
}

/**
 * Read a JSON array, or one JSON object per line.
 *
 * Both, because both are what the sources actually emit: `gh … --json` writes an array, and
 * anything streaming or hand-assembled writes JSONL. Deciding between them on the first
 * non-space character is not a guess — an array and an object are different documents.
 */
export function parseRecords(text, label = 'input') {
	const trimmed = text.trim()
	if (trimmed === '') return []
	if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
		let parsed
		try {
			parsed = JSON.parse(trimmed)
		} catch (error) {
			if (trimmed.startsWith('{')) return parseJsonLines(trimmed, label)
			throw new Error(label + ': not valid JSON — ' + error.message)
		}
		if (!Array.isArray(parsed)) {
			throw new Error(label + ': expected an array of records, or one JSON object per line — got a single object')
		}
		return parsed.map((record, index) => asRecord(record, index + 1, label))
	}
	return parseJsonLines(trimmed, label)
}

function parseJsonLines(text, label) {
	const records = []
	const lines = text.split(/\r?\n/)
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i].trim()
		if (line === '') continue
		let parsed
		try {
			parsed = JSON.parse(line)
		} catch (error) {
			throw new Error(label + ' line ' + (i + 1) + ': not valid JSON — ' + error.message)
		}
		records.push(asRecord(parsed, 'on line ' + (i + 1), label))
	}
	return records
}

// -------------------------------------------------------------------------- field mapping

/**
 * Resolve a dotted path against a record, fanning out over `[]`.
 *
 * `number` reads a key, `author.login` reads through a mapping, and `labels[].name` reads
 * a key off every element of an array. That third form is the one the whole mechanism
 * exists for: labels, assignees and any other many-valued column, which is where §4's
 * closure obligation bites.
 */
export function resolvePath(record, path) {
	let current = record
	const segments = path.split('.')
	for (let i = 0; i < segments.length; i += 1) {
		const segment = segments[i]
		const each = segment.endsWith('[]')
		const key = each ? segment.slice(0, -2) : segment
		if (current === null || current === undefined) return undefined
		if (key !== '') {
			if (typeof current !== 'object' || Array.isArray(current)) return undefined
			current = current[key]
		}
		if (each) {
			if (!Array.isArray(current)) return undefined
			const rest = segments.slice(i + 1).join('.')
			const mapped = rest === '' ? current : current.map((entry) => resolvePath(entry, rest))
			return mapped.flat().filter((entry) => entry !== null && entry !== undefined)
		}
	}
	return current
}

const PLACEHOLDER = /\{([^{}]+)\}/g
const WHOLE_PLACEHOLDER = /^\{([^{}]+)\}$/

/**
 * Expand one template against one record.
 *
 * A template that is exactly one placeholder yields that value with its type intact, so
 * `{labels[].name}` can produce a list. A template mixing literal text with placeholders
 * yields a string — `upstream-issue-{number}`, which is how an id gets the prefix §3 asks
 * for. A template with no placeholder at all is a constant, which is how a local kind gets
 * `source: local` for every entry.
 *
 * Returns the offending path rather than throwing when something does not resolve, because
 * whether that is fatal depends on which field it was for, and this function does not know.
 */
export function expandTemplate(template, record) {
	const whole = WHOLE_PLACEHOLDER.exec(template)
	if (whole) {
		const path = whole[1].trim()
		const value = resolvePath(record, path)
		// The path travels with the value even when it resolved, because the caller may still
		// reject what came back — a list where the field is scalar — and needs to name it.
		return { value: value === null ? undefined : value, path }
	}

	let unresolved = null
	let listPath = null
	const text = template.replace(PLACEHOLDER, (match, raw) => {
		const path = raw.trim()
		const value = resolvePath(record, path)
		if (value === undefined || value === null) {
			unresolved ??= path
			return ''
		}
		if (Array.isArray(value)) {
			listPath ??= path
			return ''
		}
		return String(value)
	})

	if (listPath !== null) {
		throw new Error(
			'{' + listPath + '} is a list, and it is used in a template with other text: ' + template +
				' — a list value must be the whole template, on a `field[]=` mapping'
		)
	}
	if (unresolved !== null) return { value: undefined, path: unresolved }
	return { value: text, path: null }
}

/**
 * Build one entry's fields from constants plus per-record mappings.
 *
 * Constants come from the ordinary field flags (`--type`, `--status`, `--set`) and apply to
 * every entry; `--map` overrides them per record. Unresolved fields are reported rather
 * than written, and the caller decides which of those are fatal.
 */
export function buildRecordFields(record, mappings, constants = {}) {
	const fields = { ...constants }
	const unresolved = []
	for (const { field, isList, template } of mappings) {
		if (isList) {
			const whole = WHOLE_PLACEHOLDER.exec(template)
			if (!whole) {
				throw new Error(
					'--map ' + field + '[]= takes exactly one {path} and nothing else: ' + template +
						' — every element of a list comes from the same place'
				)
			}
			const value = resolvePath(record, whole[1].trim())
			if (value === undefined || value === null) {
				unresolved.push({ field, path: whole[1].trim() })
				delete fields[field]
				continue
			}
			const list = (Array.isArray(value) ? value : [value]).map(String)
			// An empty list is omission, not a value — §3 forbids the empty placeholder — and it
			// is reported for the same reason a path that did not resolve is: an issue with no
			// labels and a mapping that names the wrong key look identical in the written file.
			if (list.length === 0) {
				unresolved.push({ field, path: whole[1].trim() })
				delete fields[field]
			} else {
				fields[field] = list
			}
			continue
		}

		const { value, path } = expandTemplate(template, record)
		if (value === undefined) {
			unresolved.push({ field, path })
			delete fields[field]
			continue
		}
		if (Array.isArray(value)) {
			throw new Error(
				'--map ' + field + '={' + path + '} resolves to a list — write it as `' + field + '[]=` if ' + field +
					' is a list-valued field'
			)
		}
		const text = String(value)
		if (text === '') {
			unresolved.push({ field, path: path ?? template })
			delete fields[field]
		} else {
			fields[field] = text
		}
	}
	return { fields, unresolved }
}

/** Which unresolved fields stop the import, as opposed to being left off the entry. */
export function fatalUnresolved(unresolved) {
	return unresolved.filter((entry) => REQUIRED_FIELDS.includes(entry.field))
}

// ------------------------------------------------------------------- vocabulary closure

/**
 * The values these entries would write into a vocabulary-constrained field, and which of
 * them are not declared yet.
 *
 * §4: a seeding mode carrying constrained values across MUST declare them in the vocabulary
 * in the same write that first uses them. That is the rule this feeds; it is not a warning
 * about neatness. Bulk seeding is the one moment large enough to breach §3's closure
 * invariant without anyone noticing, and the reason it is worth a mechanism is that the
 * failure looks like success — four hundred entries land, the file validates, and the
 * vocabulary quietly means nothing.
 *
 * Only `vocabulary.fields` is considered. A `type` or a `status` arriving undeclared is a
 * mapping mistake rather than a value carried across, and the validator already refuses it
 * with a message naming the entry; auto-declaring either would let an import invent the
 * lifecycle it is supposed to be seeding into.
 */
export function pendingFieldValues(index, entries) {
	const pending = new Map()
	for (const entry of entries) {
		for (const [field, value] of Object.entries(entry)) {
			if (BASE_FIELDS.includes(field)) continue
			const declared = index.fields.get(field)
			if (!Array.isArray(declared?.values)) continue
			for (const one of Array.isArray(value) ? value : [value]) {
				if (typeof one !== 'string' || declared.values.includes(one)) continue
				if (!pending.has(field)) pending.set(field, new Set())
				pending.get(field).add(one)
			}
		}
	}
	return new Map([...pending].map(([field, values]) => [field, [...values].sort()]))
}
