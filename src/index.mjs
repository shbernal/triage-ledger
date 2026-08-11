/**
 * Library surface.
 *
 * Exported because an agent driving a ledger programmatically wants the same functions the
 * CLI uses, and because the tests are the safety net for a port — they have to reach the
 * internals, not just the command line.
 */

export {
	ABOUT_VALUES,
	BASE_FIELDS,
	CLASSES,
	CLASS_REQUIREMENTS,
	DEFAULT_LEDGER_PATH,
	EVIDENCE_RESULTS,
	NO_NEXT_ACTION,
	SCHEMA_VERSION,
	SPEC_FIELDS,
	TERMINAL_CLASSES,
	VOCABULARY_LISTS,
	isRequiredAtClass,
} from './model.mjs'

export { indexLedger, isIsoDate, parseLedgerText, readLedgerText, todayIsoDate, vocabularyEntryName } from './ledger.mjs'

export { missingRetireDestinations, outstandingItems, validateLedgerData, validateLedgerText } from './validate.mjs'

export {
	addLedgerItemText,
	addLedgerItemsText,
	declareFieldValuesText,
	dominantLineEnding,
	findItemBlocks,
	findUniqueBlock,
	removeLedgerItemText,
	renderItemBlock,
	setLedgerItemStatusText,
	setUpstreamBlockText,
	updateLedgerItemText,
	yamlScalar,
	yamlSummary,
} from './surgery.mjs'

export {
	buildRecordFields,
	expandTemplate,
	normalizeText,
	parseRecords,
	pendingFieldValues,
	resolvePath,
} from './import.mjs'

export { filterItems, hasFilters } from './commands.mjs'

export { parseArgs, run, usage } from './cli.mjs'
