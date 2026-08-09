/**
 * The complete set of things this tool is allowed to know.
 *
 * Everything in this file is SPEC.md, not domain. Nothing else may be hardcoded anywhere
 * in `src/`: no status name, no dismissal reason, no entry type, no tag, no priority.
 * Those are per-project vocabulary data declared in the ledger, and a validator that
 * matched one of them by string would have somebody else's project baked into it.
 *
 * The inversion runs four levels deep, and every level regressed the same way — a string
 * literal creeping back into shared code:
 *
 *   1. values     declared in `vocabulary:`      (inherited from the prior art)
 *   2. types      declared in `source_kinds:`
 *   3. lifecycle  declared as `class:` on a status
 *   4. fields     declared in `vocabulary.fields:`
 *
 * What is left below is the spec itself. A fifth inversion would dissolve the thing being
 * specified, so this is where the ladder stops.
 */

/** The five status classes. Normative; §2. Status *names* are the project's. */
export const CLASSES = ['untriaged', 'parked', 'dismissed', 'accepted', 'done']

/** An entry in a terminal class owes the project nothing further. */
export const TERMINAL_CLASSES = new Set(['dismissed', 'done'])

/** Required of every entry, at every class. §3's ratchet, first row. */
export const BASE_FIELDS = ['id', 'source', 'type', 'summary', 'status', 'first_seen']

/**
 * Fields the spec itself governs. A project may not redeclare these under
 * `vocabulary.fields` — it would be redefining the ratchet.
 */
export const SPEC_FIELDS = [...BASE_FIELDS, 'last_reviewed', 'non_target_reasons', 'next_action', 'evidence']

/**
 * The vocabulary lists the spec defines, and the key that names an entry in each.
 *
 * Four, and only four (§3): a fifth key under `vocabulary:` is an error rather than an
 * inert list nothing reads, because `fields` is the one of the four a ledger may omit and
 * a misspelling of it would otherwise be a legal document with every field constraint in
 * it switched off. Everything a project wants constrained goes under `fields`, which is
 * the general mechanism.
 */
export const VOCABULARY_LISTS = {
	statuses: 'status',
	non_target_reasons: 'reason',
	evidence_kinds: 'kind',
	fields: 'field',
}

/** What a dismissal reason is *about*. This is what makes `retire_to: null` enforceable. */
export const ABOUT_VALUES = ['item-state', 'project-policy']

/** `evidence.result`. Three, because `inconclusive` is the honest outcome of a check that did not reproduce. */
export const EVIDENCE_RESULTS = ['pass', 'fail', 'inconclusive']

/** `evidence` sub-fields the spec names. `kinds` is the only one the ratchet requires. */
export const EVIDENCE_LIST_FIELDS = ['kinds', 'local_files', 'spec_refs']

/**
 * The evidence lists whose elements are free text rather than declared vocabulary.
 *
 * `kinds` is deliberately not here: its elements are checked against `evidence_kinds`, so
 * a value YAML turned into a number is already reported as an undeclared kind. These two
 * have nothing to check against, which is exactly why their element type has to be — a
 * `spec_ref` written plain as `3.10` is the number 3.1, and nothing downstream will
 * notice (§3).
 */
export const EVIDENCE_TEXT_LIST_FIELDS = ['local_files', 'spec_refs']

/** The value `next_action` must carry at class `done`: there is nothing left to do. */
export const NO_NEXT_ACTION = 'none'

/** The schema version this implementation speaks. */
export const SCHEMA_VERSION = 1

/** Where a ledger lives unless told otherwise. Convention, overridable with `--ledger`. */
export const DEFAULT_LEDGER_PATH = 'docs/backlog.yml'

/**
 * Field obligations by class, beyond {@link BASE_FIELDS}.
 *
 * NOT a chain. `parked`, `dismissed` and `accepted` are siblings that each add to the
 * base row; only `done` inherits, and it inherits from `accepted`. Reading the spec's
 * table as strictly cumulative top-to-bottom would make an accepted entry require a
 * dismissal reason, which is nonsense — see the note in SPEC.md §3.
 */
export const CLASS_REQUIREMENTS = {
	untriaged: [],
	parked: ['last_reviewed'],
	dismissed: ['last_reviewed', 'non_target_reasons'],
	accepted: ['next_action', 'evidence'],
	done: ['next_action', 'evidence'],
}

/** Every field the ratchet can require of an entry in some class. */
export function ratchetedFields() {
	const fields = new Set()
	for (const list of Object.values(CLASS_REQUIREMENTS)) for (const field of list) fields.add(field)
	return fields
}

/** Is `field` required of an entry whose status is in `cls`? */
export function isRequiredAtClass(field, cls) {
	if (BASE_FIELDS.includes(field)) return true
	return (CLASS_REQUIREMENTS[cls] || []).includes(field)
}
