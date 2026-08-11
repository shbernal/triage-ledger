/**
 * Reading a ledger: parse, and index the vocabulary into something the validator and the
 * commands can ask questions of.
 *
 * The index is the only place that turns declared data into behaviour. Everything
 * downstream asks it — "what class is this status?", "may this type carry this field?" —
 * and therefore never needs to know a status name or a field name of its own.
 */

import { parseDocument } from 'yaml'
import { CLASSES, VOCABULARY_LISTS } from './model.mjs'

function yamlErrorMessage(error) {
	const line = error.linePos?.[0]?.line
	const column = error.linePos?.[0]?.col
	const location = line ? ':' + line + (column ? ':' + column : '') : ''
	// `prettyErrors` is what makes the parser compute `linePos`. It also appends the position
	// in prose *and* a caret diagram of the offending lines. Keep the machine-readable
	// prefix and drop the rest: the position is then given once, and — the reason this is
	// not merely tidiness — every error stays a single line, which is what the report prints
	// one of per row.
	return 'YAML' + location + ': ' + error.message.replace(/ at line \d+, column \d+:[\s\S]*$/, '')
}

/** Git's four conflict markers, each of which is seven identical characters at column 0. */
const CONFLICT_MARKER = /^(?:<{7}|>{7}|\|{7}|={7})(?:\s|$)/

/**
 * The lines carrying merge conflict markers, if this file still has any.
 *
 * Triggered by `<<<<<<<` or `>>>>>>>` rather than by any of the four, because those two
 * cannot be anything else — seven identical angle brackets at column 0 is not YAML under
 * any reading, whereas a bare `=======` is a setext underline in some other file's dialect.
 * Once one of the unambiguous pair is present, every marker line is worth naming.
 */
export function conflictMarkerLines(text) {
	const lines = String(text).split(/\r?\n/)
	if (!lines.some((line) => /^(?:<{7}|>{7})(?:\s|$)/.test(line))) return []
	const found = []
	lines.forEach((line, position) => {
		if (CONFLICT_MARKER.test(line)) found.push(position + 1)
	})
	return found
}

/**
 * Parse ledger text.
 *
 * Returns the YAML `doc` as well as the plain data, because two rules can only be checked
 * against the document: that `summary` was written as a double-quoted scalar (§3), and
 * that a key is absent rather than present-and-empty (§3). Both are invisible once the
 * file has become JavaScript objects.
 *
 * Conflict markers are answered before the parser sees the text, and answered *instead* of
 * everything else. A conflicted ledger produces one YAML error per hunk and not one of them
 * mentions a merge — the reader is handed "Implicit keys need to be on a single line" seven
 * times over and has to work out for themselves what happened. It is also the one
 * malformation an adopter reliably produces, because the ledger is a single file that two
 * branches both write to.
 */
export function parseLedgerText(text) {
	const conflicts = conflictMarkerLines(text)
	if (conflicts.length > 0) {
		return {
			doc: null,
			data: null,
			errors: [
				'unresolved merge conflict: markers at line ' +
					conflicts.join(', ') +
					'. Resolve them before anything else — and do not simply keep both sides: ' +
					'a conflict boundary falls where the text differs, not where an entry ends, ' +
					'so both can put a field on the wrong entry and bring back entries the other branch pruned',
			],
		}
	}
	const doc = parseDocument(text, { prettyErrors: true })
	const errors = doc.errors.map(yamlErrorMessage)
	if (errors.length > 0) return { doc: null, data: null, errors }
	try {
		return { doc, data: doc.toJS(), errors: [] }
	} catch (error) {
		return { doc: null, data: null, errors: ['YAML: ' + (error instanceof Error ? error.message : String(error))] }
	}
}

/**
 * Would this text, written unquoted, be read back as the same string?
 *
 * Asked of the parser rather than answered with a regex, and deliberately: the question
 * is not "does this look like a number" in the abstract, it is "does *this* file's reader
 * think so". Those are the same question only for as long as a hand-written pattern keeps
 * up with the schema, and the failure when it does not is silent. Handing the text to the
 * same parser the ledger is read with makes them the same question by construction.
 */
export function readsBackAsItself(text) {
	try {
		return parseDocument(text, { prettyErrors: false }).toJS() === text
	} catch {
		return false
	}
}

export function isMapping(value) {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function hasOwn(object, field) {
	return isMapping(object) && Object.prototype.hasOwnProperty.call(object, field)
}

export function isIsoDate(value) {
	return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
}

/**
 * Today, on the calendar of the machine writing the file.
 *
 * Not `toISOString()`, which is UTC. §3's dates are zoneless calendar dates, and the two
 * date rules have deliberately asymmetric tolerance: a future `last_reviewed` gets one
 * day of slack so that two machines in different zones can write the same ledger, while
 * `last_reviewed >= first_seen` gets none. Reading the clock in UTC spends that slack on
 * a single machine and then needs it in the direction it does not exist. West of
 * Greenwich an ordinary working evening stamps tomorrow, which is the permanently-fresh
 * signal §3 made illegal; east of it, entries seeded today cannot be transitioned today.
 */
export function todayIsoDate(now = new Date()) {
	const pad = (value) => String(value).padStart(2, '0')
	return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
}

/**
 * Is a present value an empty placeholder?
 *
 * `absent` and `empty` are different assertions (§3): at a classified status,
 * `non_target_reasons: []` claims "dismissed for no reason", which is not the same as
 * having no such key. So this is only ever used to decide whether a *present* key is a
 * placeholder that should not have been written.
 */
export function isEmptyValue(value) {
	if (value === null || value === undefined) return true
	if (typeof value === 'string') return value.trim() === ''
	if (Array.isArray(value)) return value.length === 0
	if (isMapping(value)) return Object.keys(value).length === 0
	return false
}

/**
 * The name of a vocabulary entry: the value under the singular of its list's name.
 *
 * There are four lists and only four (§3), so the key is always known — no list a project
 * invented can arrive here to be read generically.
 */
export function vocabularyEntryName(listName, entry) {
	if (!isMapping(entry)) return null
	const value = entry[VOCABULARY_LISTS[listName]]
	return typeof value === 'string' && value.length > 0 ? value : null
}

function indexList(vocabulary, listName) {
	const raw = vocabulary?.[listName]
	const entries = new Map()
	if (!Array.isArray(raw)) return entries
	for (const entry of raw) {
		const name = vocabularyEntryName(listName, entry)
		if (name !== null && !entries.has(name)) entries.set(name, entry)
	}
	return entries
}

/**
 * Index a parsed ledger.
 *
 * Deliberately total: it never throws and never reports. A malformed vocabulary yields an
 * empty or partial index, and `validate` is what says so. Keeping the two apart means
 * every read command works on a ledger the validator would reject, which is what you want
 * when you are trying to find out why.
 */
export function indexLedger(data) {
	const vocabulary = isMapping(data?.vocabulary) ? data.vocabulary : {}
	const statuses = indexList(vocabulary, 'statuses')
	const reasons = indexList(vocabulary, 'non_target_reasons')
	const evidenceKinds = indexList(vocabulary, 'evidence_kinds')
	const fields = indexList(vocabulary, 'fields')

	const sourceKinds = new Map()
	if (Array.isArray(data?.source_kinds)) {
		for (const kind of data.source_kinds) {
			if (isMapping(kind) && typeof kind.type === 'string' && !sourceKinds.has(kind.type)) {
				sourceKinds.set(kind.type, kind)
			}
		}
	}

	return {
		data,
		statuses,
		reasons,
		evidenceKinds,
		fields,
		sourceKinds,
		items: Array.isArray(data?.items) ? data.items : [],

		/**
		 * The class a status declares — one of the five, or null.
		 *
		 * Null covers two different mistakes: no such status, and a status declared with a
		 * `class` that is not one of the five. Both are reported elsewhere, and neither may
		 * leave here as a string, because every caller uses the result to look something up —
		 * a requirements list, a counter keyed by class. An unrecognised class handed onward
		 * is a lookup that misses, which is a crash or a silent NaN rather than a diagnosis.
		 */
		classOf(status) {
			const declared = statuses.get(status)
			return CLASSES.includes(declared?.class) ? declared.class : null
		},

		/** The class of an entry, via its status. */
		classOfItem(item) {
			return this.classOf(item?.status)
		},

		/** Extra fields a status requires of entries at that status (§7). */
		requiredByStatus(status) {
			const declared = statuses.get(status)
			return Array.isArray(declared?.requires) ? declared.requires.filter((f) => typeof f === 'string') : []
		},

		/** Does this project declare an upstream anywhere? Drives whether `upstream:` is required. */
		hasExternalSource() {
			for (const kind of sourceKinds.values()) if (typeof kind.source_pattern === 'string') return true
			return false
		},
	}
}

/** Convenience: parse and index in one step. */
export function readLedgerText(text) {
	const parsed = parseLedgerText(text)
	return { ...parsed, index: parsed.errors.length === 0 ? indexLedger(parsed.data) : null }
}
