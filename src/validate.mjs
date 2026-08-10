/**
 * The validator.
 *
 * Every rule here is a MUST or SHOULD in SPEC.md, and every rule is expressed against the
 * five status *classes* and the four vocabulary lists — never against a status name, a
 * reason name or an entry type. That is the load-bearing property of this file: grep it
 * for a status name and find nothing, and the fixture whose statuses are renamed to
 * nonsense validates identically.
 *
 * Errors fail. Warnings are things the spec says SHOULD and a project may reasonably
 * decline — they are printed, and they do not change the exit code.
 */

import {
	ABOUT_VALUES,
	BASE_FIELDS,
	CLASSES,
	CLASS_REQUIREMENTS,
	DECISION_FIELD_CLASSES,
	EVIDENCE_LIST_FIELDS,
	EVIDENCE_RESULTS,
	EVIDENCE_TEXT_LIST_FIELDS,
	NO_NEXT_ACTION,
	SCHEMA_VERSION,
	SPEC_FIELDS,
	TERMINAL_CLASSES,
	VOCABULARY_LISTS,
	isRequiredAtClass,
} from './model.mjs'
import {
	hasOwn,
	indexLedger,
	isEmptyValue,
	isIsoDate,
	isMapping,
	parseLedgerText,
	todayIsoDate,
	vocabularyEntryName,
} from './ledger.mjs'

class Report {
	constructor() {
		this.errors = []
		this.warnings = []
	}
	error(message) {
		this.errors.push(message)
	}
	warn(message) {
		this.warnings.push(message)
	}
	get ok() {
		return this.errors.length === 0
	}
}

function itemLabel(item, index) {
	return typeof item?.id === 'string' && item.id ? item.id : 'items[' + index + ']'
}

/**
 * The latest date a ledger may claim: tomorrow.
 *
 * One day of slack, and it is not politeness. These dates are calendar dates with no zone
 * (§3), so a ledger written at 09:00 in UTC+13 carries a date the validator in UTC calls
 * tomorrow, and a rule with no tolerance would fail a build for being east of London.
 * Beyond a day the excuse runs out — no timezone is 48 hours wide.
 */
function latestDate(today) {
	return new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10)
}

/**
 * Dates that describe work that has not happened.
 *
 * The tell this protects is `stats`'s days-since-last-triage-activity, which is the only
 * instrument pointed at a triage that was quietly abandoned — and a `last_reviewed` in the
 * future turns it negative and keeps the stall warning from ever firing. The ordering rule
 * is the same mistake read the other way: an entry cannot have been reviewed before this
 * project first saw it.
 *
 * Note which direction time moves these: a future date becomes a past one, so a ledger
 * that validates today still validates tomorrow. The rule can only ever let more through.
 */
function validateItemDates(report, item, label, today) {
	const limit = latestDate(today)
	for (const field of ['first_seen', 'last_reviewed']) {
		if (!isIsoDate(item[field]) || item[field] <= limit) continue
		report.error(
			label + ': `' + field + '` is ' + item[field] + ', which has not happened yet — a ledger records what was done, not what is planned'
		)
	}
	if (isIsoDate(item.first_seen) && isIsoDate(item.last_reviewed) && item.last_reviewed < item.first_seen) {
		report.error(
			label + ': `last_reviewed` (' + item.last_reviewed + ') is before `first_seen` (' + item.first_seen +
				') — nobody reviewed this before the project had it'
		)
	}
}

/**
 * Name the *status*, not the class, in messages.
 *
 * "`accepted` requires evidence" is something a human can act on. "class `accepted`
 * requires evidence" makes them go and look up which of their statuses that is, to be
 * told something they already knew. The class is an implementation of the rule; the
 * status is where they have to make the edit.
 */
function atStatus(item) {
	return typeof item?.status === 'string' ? '`' + item.status + '`' : 'its status'
}

// ---------------------------------------------------------------------------- root

function validateRoot(report, data) {
	if (!isMapping(data)) {
		report.error('ledger root must be a mapping')
		return false
	}
	if (!hasOwn(data, 'schema')) report.error('missing `schema:` at the ledger root — it is the conformance handle')
	else if (data.schema !== SCHEMA_VERSION) {
		report.error('schema ' + JSON.stringify(data.schema) + ' is not supported; this tool speaks schema ' + SCHEMA_VERSION)
	}
	if (!hasOwn(data, 'purpose')) report.warn('no `purpose:` — one or two sentences on what this ledger is for and what it is not')
	if (!Array.isArray(data.items)) {
		report.error('`items:` must be a list (an empty list is legal — it is retirement)')
		return false
	}
	return true
}

function validateSourceKinds(report, index) {
	const raw = index.data?.source_kinds
	if (!Array.isArray(raw) || raw.length === 0) {
		report.error('`source_kinds:` must declare at least one kind — every entry has a `type`, and this is where types are declared')
		return
	}
	const seen = new Set()
	raw.forEach((kind, i) => {
		const label = 'source_kinds[' + i + ']'
		if (!isMapping(kind)) {
			report.error(label + ': must be a mapping')
			return
		}
		if (typeof kind.type !== 'string' || kind.type === '') report.error(label + ': `type` must be a non-empty string')
		else if (seen.has(kind.type)) report.error(label + ': duplicate type `' + kind.type + '`')
		else seen.add(kind.type)

		if (hasOwn(kind, 'source_pattern')) {
			if (typeof kind.source_pattern !== 'string') report.error(label + ': `source_pattern` must be a string')
			else {
				try {
					new RegExp(kind.source_pattern)
				} catch (error) {
					report.error(label + ': `source_pattern` is not a valid regular expression: ' + error.message)
				}
			}
		}
		if (hasOwn(kind, 'id_prefix') && typeof kind.id_prefix !== 'string') {
			report.error(label + ': `id_prefix` must be a string')
		}
	})
}

/**
 * `upstream:` is required once entries carry external provenance, and `filter` must be
 * the predicate rather than a description of it — six months on, a reader has to be able
 * to tell "we triaged this backlog" from "we triaged the last three years of it".
 */
function validateUpstream(report, index, today) {
	const upstream = index.data?.upstream
	// The trigger is an *entry* that carries external provenance, not a declared kind that
	// could. A freshly written ledger declares issue and pull-request kinds and holds
	// nothing — requiring provenance there would make the tool's own starting template
	// invalid on the day it is written, which is how a validator teaches people to ignore it.
	const carriesProvenance = index.items.some((item) => typeof index.sourceKinds.get(item?.type)?.source_pattern === 'string')
	if (!carriesProvenance) {
		if (hasOwn(index.data, 'upstream') && !isMapping(upstream)) report.error('`upstream:` must be a mapping')
		return
	}
	if (!isMapping(upstream)) {
		report.error(
			'`upstream:` is required: entries carry provenance from outside this repository. Add a root block with ' +
				'`repo`, `imported_at`, `filter` (the exact predicate, or `none`), `matched`, `skipped` and `total_open`'
		)
		return
	}
	if (typeof upstream.repo !== 'string' || upstream.repo === '') report.error('upstream.repo must be a non-empty string')
	if (!isIsoDate(upstream.imported_at)) report.error('upstream.imported_at must be YYYY-MM-DD')
	else if (upstream.imported_at > latestDate(today)) {
		report.error('upstream.imported_at is ' + upstream.imported_at + ', which has not happened yet — this block records an import that ran')
	}
	if (typeof upstream.filter !== 'string' || upstream.filter === '') {
		report.error('upstream.filter must record the exact predicate applied, as a string (use `none` if you took everything)')
	}
	for (const field of ['matched', 'skipped', 'total_open']) {
		if (!Number.isInteger(upstream[field]) || upstream[field] < 0) {
			report.error('upstream.' + field + ' must be a non-negative integer — the retirement summary is written from these')
		}
	}
}

// ---------------------------------------------------------------- vocabulary lists

function validateVocabularyShape(report, index) {
	const vocabulary = index.data?.vocabulary
	if (!isMapping(vocabulary)) {
		report.error('`vocabulary:` must be a mapping')
		return
	}
	for (const [listName, nameKey] of Object.entries(VOCABULARY_LISTS)) {
		if (!hasOwn(vocabulary, listName)) continue
		const raw = vocabulary[listName]
		if (!Array.isArray(raw)) {
			report.error('vocabulary.' + listName + ' must be a list')
			continue
		}
		const seen = new Set()
		raw.forEach((entry, i) => {
			const label = 'vocabulary.' + listName + '[' + i + ']'
			if (!isMapping(entry)) {
				report.error(label + ': every vocabulary entry must be a mapping with a `' + nameKey + ':` key, not a bare string')
				return
			}
			const name = vocabularyEntryName(listName, entry)
			if (name === null) report.error(label + ': `' + nameKey + '` must be a non-empty string')
			else if (seen.has(name)) report.error(label + ': duplicate ' + nameKey + ' `' + name + '`')
			else seen.add(name)
		})
	}
	// Four lists and only four (§3). The case this is really for is `feilds:` — `fields` is
	// the one list a ledger may leave out, so a misspelling of it otherwise validates with
	// every field constraint in the file silently switched off.
	for (const listName of Object.keys(vocabulary)) {
		if (listName in VOCABULARY_LISTS) continue
		report.error(
			'vocabulary.' + listName + ': there are four vocabulary lists and only four — ' + Object.keys(VOCABULARY_LISTS).join(', ') +
				'. Anything else this project wants an entry to carry belongs under `fields`'
		)
	}
	if (!hasOwn(vocabulary, 'statuses') || index.statuses.size === 0) {
		report.error('vocabulary.statuses must declare at least one status — otherwise no entry can have a legal status')
	}
}

function validateStatuses(report, index) {
	for (const [name, entry] of index.statuses) {
		const label = 'status `' + name + '`'
		if (typeof entry.class !== 'string' || !CLASSES.includes(entry.class)) {
			report.error(label + ': `class` must be one of ' + CLASSES.join(', '))
		}
		if (hasOwn(entry, 'requires')) {
			if (!Array.isArray(entry.requires) || entry.requires.some((f) => typeof f !== 'string' || f === '')) {
				report.error(label + ': `requires` must be a list of field names')
			}
		}
		// The same key and the same meaning as on a dismissal reason: a status whose sentence
		// is only true of some kinds of entry says which. It belongs here because parking is
		// an exit too and it is the one that costs nothing — no destination, no evidence — so
		// "we intend to try to reproduce this" goes vacuously true on a feature request in
		// exactly the way the cheapest dismissal reason does. Until this existed the format
		// could see the one and not the other, and the difference was not a principle.
		if (hasOwn(entry, 'types')) {
			if (!Array.isArray(entry.types) || entry.types.length === 0) {
				report.error(label + ': `types` must be a non-empty list of declared entry types')
			} else {
				for (const type of entry.types) {
					if (!index.sourceKinds.has(type)) report.error(label + ': `types` names an undeclared entry type: ' + type)
				}
			}
		}
	}
	// `describes` is worth asking for exactly where two statuses could be confused, which
	// is when a project declares more than one against the same class — `deferred` next to
	// `on-hold`. Warning on every status without one would fire on `accepted` and
	// `implemented`, where the name is the whole meaning, and a warning that always fires
	// is a warning nobody reads.
	const byClass = new Map()
	for (const [name, entry] of index.statuses) {
		if (typeof entry.class !== 'string') continue
		if (!byClass.has(entry.class)) byClass.set(entry.class, [])
		byClass.get(entry.class).push([name, entry])
	}
	for (const [cls, group] of byClass) {
		if (group.length < 2) continue
		for (const [name, entry] of group) {
			if (typeof entry.describes === 'string' && entry.describes.trim() !== '') continue
			const others = group.filter(([other]) => other !== name).map(([other]) => '`' + other + '`')
			report.warn(
				'status `' + name + '`: no `describes`, and it shares class `' + cls + '` with ' + others.join(', ') +
					'. Write down what makes them different, or someone will apply them interchangeably'
			)
		}
	}
	const declaredClasses = new Set([...index.statuses.values()].map((entry) => entry.class))
	if (!declaredClasses.has('dismissed')) {
		report.warn(
			'no status declares class `dismissed`. There is no honest ledger in which "decided against" cannot happen, and dismissal is the majority of a real triage'
		)
	}
}

/**
 * Dismissal reasons carry the whole retirement mechanism, which is why every rule here is
 * an error and the equivalent rules on other vocabulary entries are warnings. A reason is
 * a boundary hundreds of entries get sorted against and that one distilled sentence is
 * later written from; a status called `accepted` is not.
 */
function validateReasons(report, index) {
	for (const [name, entry] of index.reasons) {
		const label = 'dismissal reason `' + name + '`'

		if (typeof entry.describes !== 'string' || entry.describes.trim() === '') {
			report.error(label + ': `describes` is required and must say what distinguishes it from its neighbours')
		}

		if (!hasOwn(entry, 'about')) {
			report.error(label + ': `about` is required — ' + ABOUT_VALUES.join(' or ') + '. It is what makes `retire_to: null` a decision rather than an omission')
		} else if (!ABOUT_VALUES.includes(entry.about)) {
			report.error(label + ': `about` must be one of ' + ABOUT_VALUES.join(', '))
		}

		if (!hasOwn(entry, 'retire_to')) {
			report.error(label + ': `retire_to` is required. Where does this finding live once the ledger is deleted? `null` is an answer, but it has to be written')
		} else if (entry.retire_to !== null && (typeof entry.retire_to !== 'string' || entry.retire_to.trim() === '')) {
			report.error(label + ': `retire_to` must be a path or `null`')
		} else if (entry.retire_to === null && entry.about === 'project-policy') {
			report.error(
				label + ': `retire_to` must not be null when `about: project-policy`. Policy reasons are exactly the ones a future contributor will re-litigate'
			)
		}

		if (hasOwn(entry, 'requires_evidence')) {
			if (!Array.isArray(entry.requires_evidence)) report.error(label + ': `requires_evidence` must be a list of evidence kinds')
			else {
				for (const kind of entry.requires_evidence) {
					if (!index.evidenceKinds.has(kind)) report.error(label + ': `requires_evidence` names an undeclared evidence kind: ' + kind)
				}
			}
		}

		// Same key, same meaning, as on a declared field (§7) — a reason whose sentence is only
		// true of some kinds of entry says which. Until this existed, the restriction could be
		// written and was inert, so the ledger that reached hardest for the right constraint got
		// the least of it.
		if (hasOwn(entry, 'types')) {
			if (!Array.isArray(entry.types) || entry.types.length === 0) {
				report.error(label + ': `types` must be a non-empty list of declared entry types')
			} else {
				for (const type of entry.types) {
					if (!index.sourceKinds.has(type)) report.error(label + ': `types` names an undeclared entry type: ' + type)
				}
			}
		}
	}
}

function validateEvidenceKinds(report, index) {
	for (const [name, entry] of index.evidenceKinds) {
		if (!hasOwn(entry, 'describes')) {
			report.warn('evidence kind `' + name + '`: no `describes`. What would someone have to have actually done to claim it?')
		}
	}
}

function validateFieldDeclarations(report, index) {
	for (const [name, entry] of index.fields) {
		const label = 'field `' + name + '`'
		if (SPEC_FIELDS.includes(name)) {
			report.error(label + ': is governed by the spec and must not be redeclared — redeclaring it would be redefining the ratchet')
		}
		if (hasOwn(entry, 'values')) {
			if (!Array.isArray(entry.values)) report.error(label + ': `values` must be a list')
			else if (entry.values.some((v) => typeof v === 'object' && v !== null)) report.error(label + ': `values` must be scalars')
		}
		if (hasOwn(entry, 'types')) {
			if (!Array.isArray(entry.types)) report.error(label + ': `types` must be a list of declared entry types')
			else {
				for (const type of entry.types) {
					if (!index.sourceKinds.has(type)) report.error(label + ': `types` names an undeclared entry type: ' + type)
				}
			}
		}
		if (hasOwn(entry, 'required_when_triaged') && typeof entry.required_when_triaged !== 'boolean') {
			report.error(label + ': `required_when_triaged` must be true or false')
		}
		if (!hasOwn(entry, 'describes')) report.warn(label + ': no `describes`')
	}
}

// --------------------------------------------------------------------------- items

function validateItemIdentity(report, index, item, label) {
	const kind = index.sourceKinds.get(item.type)
	if (typeof item.type !== 'string' || !kind) {
		if (typeof item.type === 'string') report.error(label + ': undeclared type `' + item.type + '` — declare it in `source_kinds`')
		return
	}
	if (typeof item.source === 'string' && typeof kind.source_pattern === 'string') {
		let pattern = null
		try {
			pattern = new RegExp(kind.source_pattern)
		} catch {
			return // already reported against source_kinds
		}
		if (!pattern.test(item.source)) {
			report.error(label + ': `source` does not match the pattern declared for type `' + item.type + '`')
		}
	}
	if (typeof kind.id_prefix === 'string' && typeof item.id === 'string') {
		if (!item.id.startsWith(kind.id_prefix)) {
			report.error(label + ': id must start with `' + kind.id_prefix + '`, declared for type `' + item.type + '`')
		} else {
			// Where both ends carry a number, they must agree. This catches the copy-paste
			// error, which happens during bulk seeding and essentially nowhere else.
			const idNumber = item.id.match(/(\d+)$/)?.[1]
			const sourceNumber = typeof item.source === 'string' ? item.source.match(/(\d+)\s*$/)?.[1] : null
			if (idNumber && sourceNumber && idNumber !== sourceNumber) {
				report.error(label + ': id ends in ' + idNumber + ' but source ends in ' + sourceNumber)
			}
		}
	}
}

function validateEvidence(report, index, item, label, cls) {
	const evidence = item.evidence
	if (!isMapping(evidence)) {
		report.error(label + ': `evidence` must be a mapping, not a note')
		return
	}
	if (!Array.isArray(evidence.kinds) || evidence.kinds.length === 0) {
		report.error(label + ': at ' + atStatus(item) + ', `evidence.kinds` must name at least one declared evidence kind')
	} else {
		for (const kind of evidence.kinds) {
			if (!index.evidenceKinds.has(kind)) report.error(label + ': undeclared evidence kind: ' + kind)
		}
	}
	for (const field of EVIDENCE_LIST_FIELDS) {
		if (hasOwn(evidence, field) && !Array.isArray(evidence[field])) report.error(label + ': `evidence.' + field + '` must be a list')
	}
	// A plain scalar has a type and YAML picks it, so a path or a spec reference written
	// unquoted can arrive as something other than text — `3.10` is the number 3.1, and the
	// file still reads as `3.10`, so no diff shows the loss. These two lists are the only
	// free-text ones the spec owns; everywhere else an undeclared name is already an error,
	// which is what makes the coercion visible there and invisible here (§3).
	for (const field of EVIDENCE_TEXT_LIST_FIELDS) {
		if (!Array.isArray(evidence[field])) continue
		for (const value of evidence[field]) {
			if (typeof value === 'string' && value.trim() !== '') continue
			report.error(
				label + ': `evidence.' + field + '` must contain non-empty strings; ' + JSON.stringify(value) +
					(typeof value === 'string' ? ' is blank' : ' came back a ' + typeof value + ' — quote a value meant as text')
			)
		}
	}
	if (hasOwn(evidence, 'result') && !EVIDENCE_RESULTS.includes(evidence.result)) {
		report.error(label + ': `evidence.result` must be one of ' + EVIDENCE_RESULTS.join(', '))
	}
	if (cls === 'done') {
		if (!Array.isArray(evidence.local_files) || evidence.local_files.length === 0) {
			report.error(label + ': at ' + atStatus(item) + ', `evidence.local_files` must name the files that changed')
		}
		if (item.next_action !== NO_NEXT_ACTION) {
			report.error(label + ': at ' + atStatus(item) + ', `next_action` must be `' + NO_NEXT_ACTION + '`')
		}
	}
}

function validateDismissal(report, index, item, label) {
	const reasons = item.non_target_reasons
	if (!Array.isArray(reasons) || reasons.length === 0) {
		report.error(label + ': at ' + atStatus(item) + ', at least one `non_target_reasons` entry is required')
		return
	}
	const kinds = new Set(Array.isArray(item.evidence?.kinds) ? item.evidence.kinds : [])
	for (const name of reasons) {
		const reason = index.reasons.get(name)
		if (!reason) {
			report.error(label + ': undeclared dismissal reason: ' + name)
			continue
		}
		if (Array.isArray(reason.types) && reason.types.length > 0 && !reason.types.includes(item.type)) {
			report.error(
				label + ': dismissal reason `' + name + '` is declared only for types ' + reason.types.join(', ') + ', not `' + item.type +
					'` — its sentence is not true of this kind of entry'
			)
		}
		const demanded = Array.isArray(reason.requires_evidence) ? reason.requires_evidence : []
		for (const required of demanded) {
			if (!kinds.has(required)) {
				report.error(label + ': dismissal reason `' + name + '` requires evidence kind `' + required + '`, which this entry does not carry')
			}
		}
		// Naming a kind is an assertion, and no format can do better than that. `result` is
		// the cheapest thing that makes the assertion a sentence — "I ran it and it did not
		// reproduce" rather than `repro` — and the value is in the writer noticing while
		// they write it, which is why it is a warning at the moment of dismissal and not an
		// error anywhere. A SHOULD in §3, reported as one.
		if (demanded.length > 0 && !hasOwn(isMapping(item.evidence) ? item.evidence : {}, 'result')) {
			report.warn(
				label + ': dismissal reason `' + name + '` demanded evidence, and no `evidence.result` records how it came out. ' +
					'Naming a kind asserts nothing on its own'
			)
		}
	}
}

function validateDeclaredFields(report, index, item, label, cls) {
	for (const [name, declared] of index.fields) {
		const present = hasOwn(item, name)
		if (present && Array.isArray(declared.types) && !declared.types.includes(item.type)) {
			report.error(label + ': `' + name + '` is declared only for types ' + declared.types.join(', ') + ', not `' + item.type + '`')
		}
		if (present && Array.isArray(declared.values)) {
			const values = Array.isArray(item[name]) ? item[name] : [item[name]]
			for (const value of values) {
				if (!declared.values.includes(value)) {
					report.error(label + ': undeclared value for `' + name + '`: ' + JSON.stringify(value))
				}
			}
		}
		const inScope = !Array.isArray(declared.types) || declared.types.includes(item.type)
		if (declared.required_when_triaged === true && inScope && cls && cls !== 'untriaged' && !present) {
			report.error(label + ': `' + name + '` is required once an entry leaves `untriaged`')
		}
	}
}

/**
 * A field carrying no value must be absent, not present-and-empty.
 *
 * Worth 3x on the size of a seeded ledger, but the reason it is an error rather than a
 * suggestion is semantic: at a classified status `non_target_reasons: []` is a real and
 * different claim from having no such key.
 *
 * Over the entry's *own* keys, not over a list of fields this tool knows the names of.
 * SPEC.md §3 illustrates the rule with `priority: null`, and `priority` is exactly the kind
 * of field a project carries without declaring — §7 asks for a declaration only where the
 * values are constrained. Enforced over a closed set, the rule would miss its own example.
 *
 * Required fields are checked here too, and that is the sharp end of it. The ratchet asks
 * whether the key is present; if that were the whole rule then `next_action: null` would
 * satisfy "you cannot accept without naming a next action", and the two-sided cost could be
 * paid by typing a key and stopping. Absent and empty stay distinguishable; neither is a
 * value.
 */
/**
 * A field that asserts a decision the entry's status denies.
 *
 * Reachable two ways, and neither is exotic. Change your mind — dismiss an entry, then
 * accept it — and `set-status` used to leave the dismissal reason behind, so the entry
 * claimed both. Or merge two branches that decided one entry differently: the conflict
 * splits at the lines that differ, so a resolver can take the status from one side and the
 * trailing fields from the other and assemble an entry neither of them wrote.
 *
 * Empty values are the omission rule's, below, for the reason given there: one mistake
 * should report once, and an empty `non_target_reasons: []` is a different complaint.
 */
function validateDecisionFields(report, item, label, cls) {
	for (const [field, classes] of Object.entries(DECISION_FIELD_CLASSES)) {
		if (!hasOwn(item, field) || isEmptyValue(item[field]) || classes.includes(cls)) continue
		report.error(
			field === 'next_action'
				? label + ': ' + atStatus(item) + ' is terminal and `next_action` names work outstanding — an entry decided against has none'
				: label + ': `' + field + '` says this was decided against, and ' + atStatus(item) + ' says it was not'
		)
	}
}

function validateOmission(report, index, item, label, cls) {
	for (const field of Object.keys(item)) {
		if (BASE_FIELDS.includes(field)) continue
		if (!isEmptyValue(item[field])) continue
		const required = isRequiredAtClass(field, cls) || index.requiredByStatus(item.status).includes(field)
		report.error(
			required
				? label + ': `' + field + '` is required at ' + atStatus(item) + ' and empty — what it requires is a value, not the key'
				: label + ': `' + field + '` is empty and not required at ' + atStatus(item) + ' — omit the key instead'
		)
	}
}

function validateItem(report, index, item, position, today) {
	const label = itemLabel(item, position)
	if (!isMapping(item)) {
		report.error(label + ': item must be a mapping')
		return
	}

	for (const field of BASE_FIELDS) {
		if (!hasOwn(item, field)) report.error(label + ': missing required field `' + field + '`')
	}
	if (typeof item.id !== 'string' || item.id === '') report.error(label + ': `id` must be a non-empty string')
	if (typeof item.source !== 'string' || item.source === '') report.error(label + ': `source` must be a non-empty string')
	// Non-empty, not merely a string. An entry whose summary is blank cannot be triaged
	// without going back to the source, which is the one thing §4 promises you will never
	// have to do — and a blank one is what a dropped argument looks like.
	if (typeof item.summary !== 'string') report.error(label + ': `summary` must be a string')
	else if (item.summary.trim() === '') report.error(label + ': `summary` must not be empty — it is the only self-contained field an entry has')
	// A newline is the one character in a summary whose survival depends on the platform
	// that typed it: the Windows `npx` shim drops it and every argument after it, so what
	// arrives is a truncated summary and silently unset fields. An error rather than a
	// warning because the alternative is a ledger whose contents depend on whose machine
	// seeded it, and because the entry it produces is otherwise perfectly valid.
	else if (/[\r\n]/.test(item.summary)) {
		report.error(label + ': `summary` must not contain a line break — it is one line, on every platform')
	}
	if (!isIsoDate(item.first_seen)) report.error(label + ': `first_seen` must be YYYY-MM-DD')
	// An empty value is the omission rule's business, below. There is nothing inside one for
	// a format check to inspect, and reporting it twice tells the reader they made two
	// mistakes when they made one.
	if (hasOwn(item, 'last_reviewed') && !isEmptyValue(item.last_reviewed) && !isIsoDate(item.last_reviewed)) {
		report.error(label + ': `last_reviewed` must be YYYY-MM-DD')
	}
	validateItemDates(report, item, label, today)

	validateItemIdentity(report, index, item, label)

	const cls = index.classOfItem(item)
	if (cls === null) {
		// Two ways to land here, and only one of them is this entry's fault. A status the
		// vocabulary does not declare is; a declared status whose `class` is not one of the
		// five is a vocabulary mistake, reported there against the declaration the reader has
		// to edit. Saying "undeclared status" for it would send them to the wrong line. Either
		// way every rule below is keyed on the class, so there is nothing left to ask.
		if (typeof item.status === 'string' && !index.statuses.has(item.status)) {
			report.error(label + ': undeclared status `' + item.status + '` — declare it in `vocabulary.statuses`')
		}
		return
	}

	// A status may restrict which kinds of entry can hold it, exactly as a dismissal reason
	// may. Checked against the declaration rather than the class, because the restriction is
	// a property of the sentence somebody wrote under `describes` and not of the five.
	const declaredStatus = index.statuses.get(item.status)
	if (Array.isArray(declaredStatus?.types) && declaredStatus.types.length > 0 && !declaredStatus.types.includes(item.type)) {
		report.error(
			label + ': ' + atStatus(item) + ' is declared only for types ' + declaredStatus.types.join(', ') + ', not `' + item.type +
				'` — its sentence is not true of this kind of entry'
		)
	}

	for (const field of CLASS_REQUIREMENTS[cls]) {
		if (!hasOwn(item, field)) report.error(label + ': ' + atStatus(item) + ' requires `' + field + '`')
	}
	for (const field of index.requiredByStatus(item.status)) {
		if (!hasOwn(item, field)) report.error(label + ': ' + atStatus(item) + ' declares `requires: [' + field + ']`, which is missing')
	}

	// Both skip an empty value for the reason given against `last_reviewed` above: `evidence:
	// {}` is one mistake, and the omission rule is what names it.
	if (cls === 'dismissed' && !isEmptyValue(item.non_target_reasons)) validateDismissal(report, index, item, label)
	// Checked whenever present, not only where the ratchet demands it: an entry that
	// volunteers evidence early is welcome to, and a half-written block is still wrong.
	if (hasOwn(item, 'evidence') && !isEmptyValue(item.evidence)) validateEvidence(report, index, item, label, cls)

	validateDecisionFields(report, item, label, cls)
	validateDeclaredFields(report, index, item, label, cls)
	validateOmission(report, index, item, label, cls)
}

// -------------------------------------------------------------- document-level rules

/**
 * `summary` must be written as a double-quoted scalar — always, not only when the content
 * requires it.
 *
 * Only checkable against the document, which is why the parser hands one back. Roughly a
 * quarter of real issue titles cannot survive as plain scalars, and the nastiest case is
 * leading or trailing whitespace: a plain scalar discards it silently and no diff shows
 * you that it did.
 */
function validateSummaryQuoting(report, doc) {
	const items = doc?.get?.('items')
	if (!items?.items) return
	items.items.forEach((node, position) => {
		const idNode = node?.get?.('id', true)
		const label = typeof idNode?.value === 'string' ? idNode.value : 'items[' + position + ']'
		const summary = node?.get?.('summary', true)
		if (!summary || summary.value === undefined) return
		if (summary.type !== 'QUOTE_DOUBLE') {
			report.error(label + ': `summary` must be written as a double-quoted scalar, always — not only when the content requires it')
		}
	})
}

function validateUniqueIds(report, items) {
	const seen = new Map()
	items.forEach((item, position) => {
		const id = item?.id
		if (typeof id !== 'string' || id === '') return
		if (seen.has(id)) report.error(id + ': duplicate id; first seen at items[' + seen.get(id) + ']')
		else seen.set(id, position)
	})
}

// ------------------------------------------------------------------------- entry point

/**
 * Validate already-parsed ledger data. Pure and synchronous.
 *
 * `today` is an argument rather than a call to the clock so that this stays pure and so a
 * test can say what "the future" is without writing a date that stops being one.
 */
export function validateLedgerData(data, { today = todayIsoDate() } = {}) {
	const report = new Report()
	if (!validateRoot(report, data)) return report
	const index = indexLedger(data)
	validateSourceKinds(report, index)
	validateUpstream(report, index, today)
	validateVocabularyShape(report, index)
	validateStatuses(report, index)
	validateReasons(report, index)
	validateEvidenceKinds(report, index)
	validateFieldDeclarations(report, index)
	validateUniqueIds(report, index.items)
	index.items.forEach((item, position) => validateItem(report, index, item, position, today))
	return report
}

/** Validate ledger text: parse errors, data rules, and the rules only the document can answer. */
export function validateLedgerText(text, options) {
	const parsed = parseLedgerText(text)
	if (parsed.errors.length > 0) {
		const report = new Report()
		for (const error of parsed.errors) report.error(error)
		return { data: null, doc: null, report }
	}
	const report = validateLedgerData(parsed.data, options)
	validateSummaryQuoting(report, parsed.doc)
	return { data: parsed.data, doc: parsed.doc, report }
}

/**
 * Do the declared `retire_to` destinations exist on disk?
 *
 * Kept out of {@link validateLedgerData} because that function is pure — this one has to
 * touch the filesystem, so it takes an `exists` predicate and the caller supplies the real
 * one. This is a *retirement-time* check by design: completeness (that every reason
 * declares a destination at all) is checked above, at the moment the reason is written,
 * because that is when declaring one is honest rather than a chore.
 */
export function missingRetireDestinations(data, exists) {
	const index = indexLedger(data)
	const missing = []
	for (const [name, reason] of index.reasons) {
		if (typeof reason.retire_to === 'string' && reason.retire_to.trim() !== '' && !exists(reason.retire_to)) {
			missing.push({ reason: name, retire_to: reason.retire_to })
		}
	}
	return missing
}

/** Entries that still owe the project something. Retirement is exactly the condition that this is empty. */
export function outstandingItems(index) {
	return index.items.filter((item) => {
		const cls = index.classOfItem(item)
		return cls === null || !TERMINAL_CLASSES.has(cls)
	})
}
