/**
 * The command surface.
 *
 * Read commands take `--json` and emit losslessly, because at several hundred entries the
 * thing doing the reading is usually an agent. Mutations take `--dry-run`, validate before
 * writing, and refuse an ambiguous id rather than guessing.
 */

import fs from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { CLASSES, TERMINAL_CLASSES, VOCABULARY_LISTS } from './model.mjs'
import { indexLedger, isMapping, readLedgerText, todayIsoDate } from './ledger.mjs'
import { missingRetireDestinations, outstandingItems, validateLedgerText } from './validate.mjs'
import { addLedgerItemText, removeLedgerItemText, setLedgerItemStatusText } from './surgery.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATES = path.join(HERE, '..', 'templates')

function json(value) {
	return JSON.stringify(value, null, 2)
}

async function loadLedger(options) {
	let text
	try {
		text = await fs.readFile(options.ledger, 'utf8')
	} catch (error) {
		if (error.code === 'ENOENT') {
			throw new Error('no ledger at ' + options.ledger + ' — run `triage-ledger init`, or pass --ledger <path>')
		}
		throw error
	}
	const { data, errors, index } = readLedgerText(text)
	if (errors.length > 0) throw new Error(errors.join('\n'))
	return { text, data, index: index ?? indexLedger(data) }
}

// ------------------------------------------------------------------------- filtering

function matchesAny(values, candidate) {
	return !values?.length || values.includes(candidate)
}

function searchText(item) {
	return Object.values(item)
		.filter((value) => typeof value === 'string')
		.join('\n')
		.toLowerCase()
}

export function filterItems(index, filters = {}) {
	const search = filters.search?.toLowerCase()
	return index.items.filter((item) => {
		if (!matchesAny(filters.status, item.status)) return false
		if (!matchesAny(filters.type, item.type)) return false
		if (filters.class?.length && !filters.class.includes(index.classOfItem(item))) return false
		if (filters.reason?.length) {
			const reasons = Array.isArray(item.non_target_reasons) ? item.non_target_reasons : []
			if (!filters.reason.some((reason) => reasons.includes(reason))) return false
		}
		if (filters.id?.length && !filters.id.includes(item.id)) return false
		if (search && !searchText(item).includes(search)) return false
		return true
	})
}

export function hasFilters(filters) {
	return Object.values(filters).some((value) => (Array.isArray(value) ? value.length > 0 : value !== undefined))
}

// ------------------------------------------------------------------------------ init

export async function commandInit(options, io) {
	// A profile has no runtime existence: it is a file in templates/ that `init` copies,
	// and nothing downstream branches on which one was chosen. So the list of profiles is
	// a directory listing, not a constant — the moment it is a constant, the CLI has
	// opinions about domains again.
	const profile = options.profile || 'core'
	const template = path.join(TEMPLATES, profile === 'core' ? 'backlog.yml' : profile + '.yml')
	if (!existsSync(template)) {
		const available = (await fs.readdir(TEMPLATES))
			.filter((name) => name.endsWith('.yml'))
			.map((name) => (name === 'backlog.yml' ? 'core' : name.replace(/\.yml$/, '')))
		throw new Error('unknown profile: ' + profile + ' (available: ' + available.join(', ') + ')')
	}
	if (existsSync(options.ledger)) throw new Error('refusing to overwrite an existing ledger at ' + options.ledger)

	const body = await fs.readFile(template, 'utf8')
	if (options.dryRun) {
		io.stdout(options.json ? json({ ledger: options.ledger, profile, wrote: false }) : 'Would write ' + options.ledger)
		return 0
	}
	await fs.mkdir(path.dirname(options.ledger), { recursive: true })
	await fs.writeFile(options.ledger, body)
	if (options.json) {
		io.stdout(json({ ledger: options.ledger, profile, wrote: true }))
		return 0
	}
	io.stdout(
		[
			'Wrote ' + options.ledger + (profile === 'core' ? '' : ' (profile: ' + profile + ')'),
			'',
			'Next: fill in the vocabulary BEFORE you seed. Deciding what you will and will not',
			'carry before you have seen the specific items is the difference between a policy',
			'and a pile of case-by-case rationalizations.',
			'',
			'Every dismissal reason needs a `retire_to` destination — where that "no" lives once',
			'this file is deleted. That is the one design decision this format asks of you.',
		].join('\n')
	)
	return 0
}

// -------------------------------------------------------------------------- validate

/**
 * The installed agent skill is a *copy*, so it drifts as the spec moves. A stale skill
 * teaching schema 1 against a schema 2 ledger poisons agent work silently — the agent
 * follows confident, wrong instructions and nothing else looks unusual.
 */
function skillDriftWarning(schema) {
	const skillPath = path.join(process.cwd(), '.claude', 'skills', 'triage-ledger', 'SKILL.md')
	if (!existsSync(skillPath)) return null
	let head
	try {
		head = readFileSync(skillPath, 'utf8').slice(0, 2000)
	} catch {
		return null
	}
	const declared = head.match(/^schema:\s*(\d+)\s*$/m)?.[1]
	if (declared === undefined) return null
	if (Number(declared) === schema) return null
	return (
		'the installed agent skill targets schema ' + declared + ' but this ledger declares schema ' + schema +
		' — reinstall it with `npx skills add shbernal/triage-ledger --skill triage-ledger`'
	)
}

export async function commandValidate(options, io) {
	let text
	try {
		text = await fs.readFile(options.ledger, 'utf8')
	} catch (error) {
		if (error.code === 'ENOENT') throw new Error('no ledger at ' + options.ledger)
		throw error
	}
	const { report, data } = validateLedgerText(text)
	const drift = report.ok ? skillDriftWarning(data?.schema) : null
	if (drift) report.warn(drift)

	if (options.json) {
		io.stdout(
			json({
				ledger: options.ledger,
				valid: report.ok,
				errorCount: report.errors.length,
				warningCount: report.warnings.length,
				errors: report.errors,
				warnings: report.warnings,
			})
		)
		return report.ok ? 0 : 1
	}
	const lines = []
	if (report.errors.length > 0) {
		lines.push('Validation failed: ' + report.errors.length + ' error(s)')
		for (const error of report.errors) lines.push('  ✗ ' + error)
	} else {
		lines.push('Validation passed')
	}
	for (const warning of report.warnings) lines.push('  ! ' + warning)
	io.stdout(lines.join('\n'))
	return report.ok ? 0 : 1
}

// ------------------------------------------------------------------------ read commands

function compactRow(index, item) {
	const cls = index.classOfItem(item)
	return item.id + '  [' + item.status + (cls ? '' : ' ?') + ']  ' + (item.summary ?? '')
}

export async function commandList(options, io) {
	const { index } = await loadLedger(options)
	const items = filterItems(index, options.filters)
	if (options.json) {
		io.stdout(json({ ledger: options.ledger, count: items.length, items }))
		return 0
	}
	const limit = options.printLimit === 0 ? items.length : Math.min(options.printLimit, items.length)
	const lines = [items.length + ' entr' + (items.length === 1 ? 'y' : 'ies')]
	for (const item of items.slice(0, limit)) lines.push('  ' + compactRow(index, item))
	const remaining = items.length - limit
	if (remaining > 0) lines.push('  … ' + remaining + ' more; --print-limit 0 prints all')
	if (items.length > 0) lines.push('', 'These are compact rows. Use `show` or --json for full entries.')
	io.stdout(lines.join('\n'))
	return 0
}

export async function commandShow(options, io) {
	const { index } = await loadLedger(options)
	let selected
	if (options.args.length > 0) {
		selected = options.args.map((id) => {
			const matches = index.items.filter((item) => item.id === id)
			if (matches.length === 0) throw new Error('ledger entry not found: ' + id)
			if (matches.length > 1) throw new Error('ledger entry id is duplicated: ' + id)
			return matches[0]
		})
	} else if (hasFilters(options.filters)) {
		selected = filterItems(index, options.filters)
	} else {
		throw new Error('show requires one or more entry ids, or a filter (e.g. --class untriaged)')
	}
	if (options.json) {
		io.stdout(json({ ledger: options.ledger, count: selected.length, items: selected }))
		return 0
	}
	io.stdout(selected.map(renderItem).join('\n\n'))
	return 0
}

/**
 * One entry, for a human.
 *
 * `show` used to print `non_target_reasons: ["not-reproducible"]` and
 * `evidence: {"kinds":["repro"]}` — JSON, in the human-readable command, next to a `--json`
 * flag that exists for exactly the other case. A list is rendered as a list and a mapping
 * as indented keys, which is also how the field looks in the ledger the reader is about to
 * open. Depth stops at two because nothing in this format goes deeper.
 */
function renderItem(item) {
	const lines = []
	for (const [key, value] of Object.entries(item)) {
		if (Array.isArray(value)) {
			lines.push(key + ':')
			for (const element of value) lines.push('  - ' + (isMapping(element) ? JSON.stringify(element) : element))
		} else if (isMapping(value)) {
			lines.push(key + ':')
			for (const [innerKey, innerValue] of Object.entries(value)) {
				lines.push('  ' + innerKey + ': ' + (Array.isArray(innerValue) ? innerValue.join(', ') : innerValue))
			}
		} else {
			lines.push(key + ': ' + value)
		}
	}
	return lines.join('\n')
}

/**
 * `values` is a teaching command as much as a query.
 *
 * Named a vocabulary list, it prints each entry with the text that distinguishes it from
 * its neighbours and — for dismissal reasons — where it retires to. "Which reason is this
 * one?" is the question asked constantly during a drain, and the answer used to require
 * opening the YAML and reading comments.
 */
export async function commandValues(options, io) {
	const { index } = await loadLedger(options)
	const name = options.args[0]
	if (!name || options.args.length !== 1) throw new Error('values requires exactly one vocabulary list or entry field')

	if (name in VOCABULARY_LISTS) {
		const listKey = { statuses: 'statuses', non_target_reasons: 'reasons', evidence_kinds: 'evidenceKinds', fields: 'fields' }[name]
		const entries = [...index[listKey].entries()].map(([value, entry]) => ({ value, ...entry }))
		if (options.json) {
			io.stdout(json({ ledger: options.ledger, list: name, count: entries.length, entries }))
			return 0
		}
		const lines = [name + ' (' + entries.length + ')']
		for (const entry of entries) {
			const suffix = []
			if (entry.class) suffix.push('class: ' + entry.class)
			if ('retire_to' in entry) suffix.push('retire_to: ' + (entry.retire_to === null ? 'null' : entry.retire_to))
			if (entry.about) suffix.push(entry.about)
			lines.push('')
			lines.push('  ' + entry.value + (suffix.length ? '  [' + suffix.join(', ') + ']' : ''))
			if (entry.describes) lines.push('    ' + String(entry.describes).trim().replace(/\s*\n\s*/g, ' '))
			// A restriction nobody can see is one they find out about from a validation error
			// after the decision is made, and this listing is what gets consulted while making
			// it. Printed for whichever list carries it — statuses and reasons both do.
			if (entry.types?.length) lines.push('    only for: ' + entry.types.join(', '))
			if (entry.requires_evidence?.length) lines.push('    requires evidence: ' + entry.requires_evidence.join(', '))
		}
		io.stdout(lines.join('\n'))
		return 0
	}

	const counts = new Map()
	for (const item of filterItems(index, options.filters)) {
		const value = item[name]
		if (value === undefined) continue
		for (const entry of Array.isArray(value) ? value : [value]) {
			const key = typeof entry === 'string' ? entry : JSON.stringify(entry)
			counts.set(key, (counts.get(key) || 0) + 1)
		}
	}
	const values = [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count)
	if (options.json) {
		io.stdout(json({ ledger: options.ledger, field: name, count: values.length, values }))
		return 0
	}
	io.stdout([name + ' (' + values.length + ' distinct)', ...values.map((v) => '  ' + v.value + '  ' + v.count)].join('\n'))
	return 0
}

/** Hand back a queue. Four hundred things is a mood; ten things is a task. */
export async function commandNext(options, io) {
	const { index } = await loadLedger(options)
	const count = options.args[0] ? Number(options.args[0]) : 10
	if (!Number.isInteger(count) || count <= 0) throw new Error('next takes a positive integer')
	const undecided = filterItems(index, options.filters).filter((item) => index.classOfItem(item) === 'untriaged')
	// Never-opened first. `last_reviewed` on an entry that is still undecided is the file's
	// only record that somebody read it and did not decide, and a queue that ignores it hands
	// the next session the top of the file — which is precisely what the last session read and
	// put down. Stable within each group, so a ledger where nothing has been stamped is served
	// in file order exactly as before.
	const queue = [
		...undecided.filter((item) => typeof item.last_reviewed !== 'string'),
		...undecided.filter((item) => typeof item.last_reviewed === 'string'),
	]
	const batch = queue.slice(0, count)
	const outstanding = outstandingItems(index)
	if (options.json) {
		io.stdout(
			json({ ledger: options.ledger, remaining: undecided.length, outstanding: outstanding.length, count: batch.length, items: batch })
		)
		return 0
	}
	// An empty queue used to answer "run `status`", and `status` answers `drain`, and the
	// drain reference opens by telling its reader to run this command. That is a closed loop,
	// and a ledger sits in it for as long as its accepted work takes to do — which is to say
	// for most of the time anyone is holding one, because deciding is fast and building is
	// not. What is outstanding here is *work*, and naming it is the exit.
	if (batch.length === 0) {
		if (outstanding.length === 0) {
			io.stdout('Nothing undecided and nothing outstanding. `triage-ledger retire --check` is the gate.')
			return 0
		}
		const one = outstanding.length === 1
		const lines = [
			'Nothing undecided — the deciding is done. ' + outstanding.length + (one ? ' entry' : ' entries') +
				' still ' + (one ? 'owes' : 'owe') + ' this project something, which is work rather than a decision:',
			'',
		]
		for (const item of outstanding.slice(0, 10)) lines.push('  ' + item.id + '  [' + item.status + ']')
		if (outstanding.length > 10) lines.push('  … ' + (outstanding.length - 10) + ' more')
		lines.push('')
		lines.push('`retire --check` is what tracks those; this queue refills only if something is')
		lines.push('un-parked or a new entry is added.')
		io.stdout(lines.join('\n'))
		return 0
	}
	const width = Math.max(...batch.map((item) => item.id.length))
	const lines = ['Next ' + batch.length + ' of ' + undecided.length + ' undecided:', '']
	for (const item of batch) lines.push('  ' + item.id.padEnd(width) + '  ' + (item.summary ?? '').trim())
	io.stdout(lines.join('\n'))
	return 0
}

function computeStats(index) {
	const byStatus = new Map()
	const byClass = new Map(CLASSES.map((cls) => [cls, 0]))
	let undeclared = 0
	let oldestUndecided = null
	let lastActivity = null
	for (const item of index.items) {
		byStatus.set(item.status, (byStatus.get(item.status) || 0) + 1)
		const cls = index.classOfItem(item)
		if (cls === null) undeclared += 1
		else byClass.set(cls, byClass.get(cls) + 1)
		if (cls === 'untriaged' && typeof item.first_seen === 'string') {
			if (oldestUndecided === null || item.first_seen < oldestUndecided.first_seen) oldestUndecided = item
		}
		if (typeof item.last_reviewed === 'string' && (lastActivity === null || item.last_reviewed > lastActivity)) {
			lastActivity = item.last_reviewed
		}
	}
	const outstanding = outstandingItems(index)
	const daysSince =
		lastActivity === null ? null : Math.floor((Date.parse(todayIsoDate()) - Date.parse(lastActivity)) / 86400000)
	return {
		total: index.items.length,
		outstanding: outstanding.length,
		terminal: index.items.length - outstanding.length,
		undeclaredStatus: undeclared,
		byClass: Object.fromEntries(byClass),
		byStatus: Object.fromEntries(byStatus),
		oldestUndecided: oldestUndecided?.id ?? null,
		lastTriageActivity: lastActivity,
		daysSinceLastTriageActivity: daysSince,
	}
}

/**
 * The burn-down, and specifically days-since-last-activity.
 *
 * A stalled triage is silent, and a stale ledger is worse than no ledger because it
 * implies coverage that does not exist. This number is the instrument that makes the
 * failure visible.
 */
export async function commandStats(options, io) {
	const { index } = await loadLedger(options)
	const stats = computeStats(index)
	if (options.json) {
		io.stdout(json({ ledger: options.ledger, ...stats }))
		return 0
	}
	const lines = [
		stats.total + ' entries — ' + stats.outstanding + ' outstanding, ' + stats.terminal + ' terminal',
		'',
		'By class:',
	]
	for (const [cls, count] of Object.entries(stats.byClass)) {
		lines.push('  ' + cls.padEnd(10) + count + (TERMINAL_CLASSES.has(cls) ? '  (terminal)' : ''))
	}
	if (stats.undeclaredStatus > 0) lines.push('  ' + 'undeclared'.padEnd(10) + stats.undeclaredStatus + '  (validation error)')
	lines.push('', 'By status:')
	for (const [status, count] of Object.entries(stats.byStatus)) lines.push('  ' + String(status).padEnd(24) + count)
	lines.push('')
	if (stats.oldestUndecided) lines.push('Oldest undecided: ' + stats.oldestUndecided)
	if (stats.daysSinceLastTriageActivity !== null) {
		lines.push('Days since last triage activity: ' + stats.daysSinceLastTriageActivity)
		if (stats.daysSinceLastTriageActivity > 30 && stats.outstanding > 0) {
			lines.push('')
			lines.push('A stalled triage is silent. A stale ledger implies coverage it does not have —')
			lines.push('either pick it back up, or retire what you can and delete the rest honestly.')
		}
	}
	io.stdout(lines.join('\n'))
	return 0
}

/**
 * The machine-readable phase probe. Distinct from `stats`, which is the human's
 * burn-down: this exists so the agent skill can route itself to the right reference
 * without the skill having to reimplement the lifecycle.
 *
 * It names no phase for a ledger that does not validate. That is `retire --check`'s
 * argument moved one command earlier, and it belongs here more than it belongs there: a
 * status whose `class` was mistyped makes every entry terminal, so the phase computed from
 * it is a confident `retire` over a file the validator rejects outright. This is the first
 * command run and the only one the routing reads, and nothing downstream is obliged to
 * catch it — the retirement reference opens with a gate that would, but the drain reference
 * opens with `next`, which computes just as happily from the same wrong classes.
 */
export async function commandStatus(options, io) {
	let text
	try {
		text = await fs.readFile(options.ledger, 'utf8')
	} catch (error) {
		if (error.code === 'ENOENT') {
			throw new Error('no ledger at ' + options.ledger + ' — run `triage-ledger init`, or pass --ledger <path>')
		}
		throw error
	}
	const report = validateLedgerText(text).report
	if (!report.ok) {
		if (options.json) {
			io.stdout(
				json({ ledger: options.ledger, phase: null, valid: false, errorCount: report.errors.length, errors: report.errors })
			)
			return 1
		}
		// The errors themselves, not a pointer to them. The single most common way to arrive
		// here is an unresolved merge conflict, and that error carries the marker line numbers
		// and the warning against keeping both sides — which is the whole of what its reader
		// needs, and is worth nothing behind a second command.
		const lines = ['No phase: this ledger does not validate (' + report.errors.length + ' error(s)).']
		for (const error of report.errors.slice(0, 5)) lines.push('  ✗ ' + error)
		if (report.errors.length > 5) lines.push('  … ' + (report.errors.length - 5) + ' more')
		lines.push('')
		lines.push('Routing on this would be a guess: the phase is computed from a file the validator')
		lines.push('has just rejected, and nothing downstream is obliged to re-check it. Fix what is')
		lines.push('listed — `triage-ledger validate` prints them all — then probe again.')
		io.stdout(lines.join('\n'))
		return 1
	}

	const { index } = await loadLedger(options)
	const stats = computeStats(index)

	// Was anything ever seeded into this file? The `upstream:` block (§3) records what one
	// specific import actually did, and a `matched` count is the only durable trace of it —
	// §6 has you prune each entry as it closes, so by the end the entries themselves are gone.
	// Null where the project declares no upstream at all: a `TODO.md` migration leaves no such
	// record, and that limit is real and is stated below rather than papered over.
	const upstream = index.data?.upstream
	const priorSeed = isMapping(upstream) && Number.isInteger(upstream.matched) ? upstream.matched : null

	// A ledger with entries to decide and no dismissal reasons declared is in `setup`, not
	// `drain` — whatever order it got there in. Dismissal is the majority operation, and
	// routing to the drain reference would send a reader to "pick the closest existing
	// reason" against an empty list. Checked against outstanding rather than unconditionally,
	// so a project that only ever accepted and implemented still reaches `retire`.
	let phase
	if (stats.outstanding > 0) phase = index.reasons.size === 0 ? 'setup' : 'drain'
	else if (stats.total > 0) phase = 'retire'
	else if (index.reasons.size === 0) phase = 'setup'
	// An empty ledger is `seed` only where nothing was ever seeded into it. Three roads reach
	// zero entries — never seeded, drained and pruned per §6, and emptied without deciding —
	// and two of the three are *past* seeding rather than before it. The seed reference opens
	// by telling its reader to import a pile and three paragraphs later says "seed once, never
	// reconcile", so sending an already-seeded ledger there routes it straight into that
	// contradiction. What is left on both of the other roads is the same work — distil what
	// happened, tear the tooling down — and the retirement commands are the ones that say out
	// loud that the record has left this file.
	else phase = priorSeed === null ? 'seed' : 'retire'

	const undecided = stats.byClass.untriaged ?? 0
	const payload = {
		ledger: options.ledger,
		schema: index.data?.schema ?? null,
		phase,
		valid: true,
		...stats,
		undecided,
		vocabulary: {
			statuses: index.statuses.size,
			non_target_reasons: index.reasons.size,
			evidence_kinds: index.evidenceKinds.size,
			fields: index.fields.size,
		},
		// Two different questions that read alike. `hasUpstream` is about the *vocabulary* —
		// does any declared source kind carry external provenance — and is what makes an
		// `upstream:` block required; it is true of a fork-triage ledger that has never been
		// seeded. `priorSeed` is about the *history*: how many entries an import actually
		// brought in, or null where the file has no record either way.
		hasUpstream: index.hasExternalSource(),
		priorSeed,
	}
	if (options.json) {
		io.stdout(json(payload))
		return 0
	}
	const ledgerPath = path.relative(process.cwd(), options.ledger).split(path.sep).join('/')
	const lines = [
		'phase: ' + phase,
		'entries: ' + stats.total + ' (' + stats.outstanding + ' outstanding, ' + undecided + ' undecided)',
		'vocabulary: ' + payload.vocabulary.statuses + ' statuses, ' + payload.vocabulary.non_target_reasons + ' dismissal reasons',
	]
	if (stats.total === 0 && priorSeed !== null) {
		lines.push('')
		lines.push('This ledger is empty and its import record says ' + priorSeed + ' entries arrived. Whether')
		lines.push('they were decided and pruned or deleted undecided is not written here — only')
		lines.push('`git log -- ' + ledgerPath + '` knows, and `retire --distil` says the same.')
	} else if (stats.total === 0 && index.reasons.size > 0) {
		lines.push('')
		lines.push('Nothing in this file records an import, so it reads as never seeded. If this project')
		lines.push('did seed and has since drained, the phase is `retire` and nothing here can tell —')
		lines.push('a ledger without an `upstream:` block keeps no trace of its own seeding.')
	} else if (phase === 'drain' && undecided === 0) {
		lines.push('')
		lines.push('Nothing is undecided: what is outstanding is work, not decisions. `retire --check`')
		lines.push('names it, and `next` will stay empty until something is un-parked or added.')
	}
	io.stdout(lines.join('\n'))
	return 0
}

// ---------------------------------------------------------------------- mutations

async function write(options, io, text, message) {
	if (!options.dryRun) await fs.writeFile(options.ledger, text)
	io.stdout((options.dryRun ? 'Would ' : '') + message)
}

export async function commandAdd(options, io) {
	const { text } = await loadLedger(options)
	// `--set` reaches `add` as well as `set-status`. It used to be parsed, stored and never
	// read here: the entry was written without the field and validated cleanly, which is the
	// same silent-and-plausible failure as the `--summary` collision.
	const updated = addLedgerItemText(text, { ...options.fields, ...options.set }, options.today)
	await write(options, io, updated, (options.dryRun ? 'add ' : 'Added ') + options.fields.id)
	return 0
}

export async function commandSetStatus(options, io) {
	const { text, index } = await loadLedger(options)
	let ids
	let status

	if (options.args.length === 2) {
		;[ids, status] = [[options.args[0]], options.args[1]]
		if (options.to) throw new Error('pass the new status either positionally or with --to, not both')
	} else if (options.args.length === 0 && options.to) {
		if (!hasFilters(options.filters)) {
			throw new Error('bulk set-status requires a filter — refusing to transition the whole ledger by accident')
		}
		status = options.to
		ids = filterItems(index, options.filters).map((item) => item.id)
		if (ids.length === 0) throw new Error('no entries match that filter')
	} else {
		throw new Error('set-status takes `<id> <status>`, or `--to <status>` with a filter')
	}

	const fields = { ...options.set }
	if (options.reasons) fields.non_target_reasons = options.reasons
	if (options.fields.next_action !== undefined) fields.next_action = options.fields.next_action
	if (options.fields.summary !== undefined) fields.summary = options.fields.summary
	if (Object.keys(options.evidence).length > 0) {
		// Merged with whatever is already there, so evidence can be built up across several
		// calls — which is what actually happens: you read the source, then later you run the
		// reproduction, and the second call must not erase the first.
		const existing = index.items.find((item) => ids.includes(item.id))?.evidence
		fields.evidence = isMapping(existing) ? { ...existing, ...options.evidence } : options.evidence
	}

	let current = text
	for (const id of ids) current = setLedgerItemStatusText(current, id, status, { reviewDate: options.today, fields })

	await write(options, io, current, (options.dryRun ? 'set ' : 'Set ') + ids.length + ' → ' + status + ':\n  ' + ids.join('\n  '))
	return 0
}

export async function commandRemove(options, io) {
	const { text, index } = await loadLedger(options)
	let ids
	if (options.args.length === 1) ids = [options.args[0]]
	else if (options.args.length === 0 && hasFilters(options.filters)) {
		ids = filterItems(index, options.filters).map((item) => item.id)
		if (ids.length === 0) throw new Error('no entries match that filter')
	} else throw new Error('remove takes one entry id, or a filter')

	// Pruning and deleting the question are the same command, and until now they read the
	// same afterwards. §6 sanctions removing an entry that is *terminal* — the decision is in
	// the commit, and the file is meant to shrink. Removing one that is not deletes the
	// decision instead of recording it, and the ledger that results validates, reports
	// nothing outstanding and is ready to retire.
	//
	// A warning rather than a refusal, for the reason §4 gives about hand edits: removing an
	// entry that should never have been seeded — a duplicate, or something that turned out
	// not to be a work item at all — is legitimate and common, and a refusal would send the
	// writer to a text editor to do it less carefully. So this names them and gets out of the
	// way. It is the last thing between an undecided backlog and a green gate, and it is
	// advice; that is a limit worth knowing rather than one to paper over.
	const undecided = ids
		.map((id) => index.items.find((item) => item.id === id))
		.filter((item) => item && !TERMINAL_CLASSES.has(index.classOfItem(item)))

	let current = text
	for (const id of ids) current = removeLedgerItemText(current, id)
	await write(options, io, current, (options.dryRun ? 'remove ' : 'Removed ') + ids.length + ':\n  ' + ids.join('\n  '))
	if (undecided.length > 0 && !options.json) {
		const one = undecided.length === 1
		io.stderr('')
		io.stderr(
			(one ? 'This entry was' : undecided.length + ' of these were') +
				' never decided, so removing ' + (one ? 'it' : 'them') + ' deletes the question rather than recording the answer:'
		)
		for (const item of undecided.slice(0, 12)) io.stderr('  ' + item.id + '  [' + item.status + ']')
		if (undecided.length > 12) io.stderr('  … ' + (undecided.length - 12) + ' more')
		io.stderr('Pruning is for entries that reached a terminal status. Everything else leaves a')
		io.stderr('ledger that validates, owes nothing and is ready to retire, having decided nothing.')
	}
	if (!options.json) {
		// This used to be three fixed lines telling the reader to grep, printed whether or
		// not there was anything to find — and a warning that always says the same thing
		// carries no information, so it gets skipped. The tool holds the literal strings the
		// grep needs; handing them back as a runnable command is the whole of the fix that
		// does not require walking the working tree. `.git` is excluded because the history
		// keeps these ids forever and is meant to: without the exclusion the check can never
		// come back clean, which teaches its reader to ignore it.
		io.stderr('')
		io.stderr('A source comment referencing a removed entry is now a dangling reference. Check:')
		io.stderr('  ' + danglingReferenceGrep(ids))
	}
	return 0
}

/**
 * The grep, with the ids in it.
 *
 * Fixed strings rather than a pattern, because an id is free to contain a `.`. Past a
 * dozen the command stops being readable, and the fallback is the single declared id
 * prefix §6 asks projects to use for exactly this — which over-matches entries that are
 * still live, so it is a fallback and says so rather than the default.
 */
function danglingReferenceGrep(ids) {
	const tail = ' . --exclude-dir=.git'
	if (ids.length <= 12) return 'grep -rnF ' + ids.map((id) => '-e ' + JSON.stringify(id)).join(' ') + tail
	let prefix = ids[0]
	for (const id of ids) {
		while (prefix && !id.startsWith(prefix)) prefix = prefix.slice(0, -1)
	}
	return prefix.length >= 3
		? 'grep -rnF -e ' + JSON.stringify(prefix) + tail + '   # ' + ids.length + ' ids; this prefix also matches live entries'
		: 'grep -rnF ' + ids.slice(0, 12).map((id) => '-e ' + JSON.stringify(id)).join(' ') + tail + '   # first 12 of ' + ids.length
}

// ---------------------------------------------------------------------------- retire

function distil(index) {
	const groups = new Map()
	for (const item of index.items) {
		if (index.classOfItem(item) !== 'dismissed') continue
		for (const name of Array.isArray(item.non_target_reasons) ? item.non_target_reasons : []) {
			if (!groups.has(name)) groups.set(name, [])
			groups.get(name).push(item)
		}
	}
	return [...groups.entries()].map(([reason, items]) => ({
		reason,
		retire_to: index.reasons.get(reason)?.retire_to ?? null,
		describes: index.reasons.get(reason)?.describes ?? null,
		count: items.length,
		items: items.map((item) => ({ id: item.id, summary: item.summary })),
	}))
}

export async function commandRetire(options, io) {
	const { text, index } = await loadLedger(options)
	// Every mode here reads a ledger that parses, which is not the same as one that is
	// valid — `loadLedger` only stops at parse errors. A ledger with 48 validation errors
	// still has statuses, so all three modes below will happily compute something from it.
	const invalid = validateLedgerText(text).report

	if (options.retireMode === 'check') {
		// The gate refuses. `--check` is what a project automates in front of teardown, and
		// answering "ready" about a file the validator rejects is the one wrong answer it can
		// give: a status whose class was mistyped makes every entry terminal and every entry
		// invalid at the same time, and only one of those two facts used to reach the reader.
		if (!invalid.ok) {
			const lines = [
				'Not ready: this ledger does not validate (' + invalid.errors.length + ' error(s)).',
				'Nothing below is trustworthy until it does — `triage-ledger validate` lists them.',
			]
			if (options.json) {
				io.stdout(json({ ledger: options.ledger, ready: false, valid: false, errorCount: invalid.errors.length, errors: invalid.errors }))
				return 1
			}
			io.stdout(lines.join('\n'))
			return 1
		}
		const outstanding = outstandingItems(index)
		// Destinations are repo-relative, like the paths a reader would type. Resolve them
		// against the working directory, not against the ledger's own directory.
		const missing = missingRetireDestinations(index.data, (relPath) => existsSync(path.resolve(process.cwd(), relPath)))
		const ok = outstanding.length === 0 && missing.length === 0
		if (options.json) {
			io.stdout(
				json({
					ledger: options.ledger,
					ready: ok,
					valid: true,
					outstanding: outstanding.map((i) => ({ id: i.id, status: i.status })),
					missingDestinations: missing,
					verified: 'every declared retire_to path resolves; not that anything is written there',
				})
			)
			return ok ? 0 : 1
		}
		const lines = []
		if (outstanding.length > 0) {
			const one = outstanding.length === 1
			lines.push(outstanding.length + (one ? ' entry still owes' : ' entries still owe') + ' this project something:')
			for (const item of outstanding.slice(0, 20)) lines.push('  ' + item.id + '  [' + item.status + ']')
			if (outstanding.length > 20) lines.push('  … ' + (outstanding.length - 20) + ' more')
		}
		if (missing.length > 0) {
			lines.push('')
			lines.push('Declared retirement destinations that do not exist:')
			for (const entry of missing) lines.push('  ' + entry.reason + ' → ' + entry.retire_to)
		}
		if (ok) {
			// Say what was checked, because the words "every declared destination exists" were
			// doing more work in a reader's head than in the code. A path resolving is not a
			// sentence written, and it cannot become one here: this gate runs *before*
			// `--distil` produces the sentences, so nothing in the sequence ever verifies that
			// the destination says anything. The reader is the only one who can.
			lines.push('Ready to retire: nothing outstanding, and every declared `retire_to` path resolves.')
			lines.push('')
			lines.push('That is a path check and not a content check. `--distil` writes the sentences and')
			lines.push('runs after this gate, so read each destination once more before you delete the')
			lines.push('ledger — an existing file that never got its paragraph is what this cannot see.')
		}
		io.stdout(lines.join('\n'))
		return ok ? 0 : 1
	}

	if (options.retireMode === 'distil') {
		const groups = distil(index)
		if (options.json) {
			io.stdout(json({ ledger: options.ledger, count: groups.length, groups }))
			return 0
		}
		if (!invalid.ok) io.stderr('! this ledger does not validate (' + invalid.errors.length + ' error(s)); what follows is drawn from it anyway')
		// Nothing to distil used to print the preamble and stop, which reads as "done" — and it
		// is the shape every thorough way of gaming this file ends in. Deleting the entries
		// leaves nothing to group; mistyping a status class makes every entry terminal and none
		// of them dismissed. Both then say "ready to retire" and hand you a blank page to write
		// the record from, and a blank page is not an answer to "why did you drop those".
		if (groups.length === 0) {
			io.stdout(
				[
					'Nothing to distil: no entry in this ledger carries a dismissal reason.',
					'',
					'That is right for a project that carried out everything it kept and turned down',
					'nothing. If it is not — if entries were removed rather than decided, or a status',
					'is classed `dismissed` with no reasons recorded — then the record of why is not',
					'in this file, and `git log -- ' + path.relative(process.cwd(), options.ledger).split(path.sep).join('/') +
						'` is the only place left to look.',
				].join('\n')
			)
			return 0
		}
		const lines = [
			'One sentence per reason, at its destination. Not one line per entry — twelve entries',
			'dismissed for one reason owe one durable statement, and the entries evaporate into',
			'git history.',
			'',
		]
		for (const group of groups) {
			lines.push('── ' + group.reason + ' (' + group.count + ') → ' + (group.retire_to === null ? 'null (evaporates)' : group.retire_to))
			if (group.describes) lines.push('   ' + String(group.describes).trim().replace(/\s*\n\s*/g, ' '))
			for (const item of group.items) lines.push('     ' + item.id + '  ' + (item.summary ?? ''))
			lines.push('')
		}
		io.stdout(lines.join('\n'))
		return 0
	}

	if (options.retireMode === 'summary') {
		const upstream = index.data?.upstream
		const stats = computeStats(index)
		const byType = new Map()
		for (const item of index.items) byType.set(item.type, (byType.get(item.type) || 0) + 1)
		// Type names are the project's, so the plural has to be computed rather than assumed:
		// appending `s` to a name ending in `y` printed `5 advisorys` in the one artifact §6
		// says outlives everything.
		const plural = (word) =>
			/[^aeiou]y$/.test(word)
				? word.slice(0, -1) + 'ies'
				: /(?:s|x|z|ch|sh)$/.test(word)
					? word + 'es'
					: word + 's'
		const phrase = (entries) =>
			entries.map(([type, count]) => count + ' ' + (count === 1 ? type : plural(type))).join(' and ')
		// §3: the upstream block describes one import, and only kinds with a `source_pattern`
		// were in it. Counting every type into the "inherited from `repo`" clause attributes a
		// local `todo` — or a scan you ran yourself — to somebody else's issue tracker, in the
		// sentence a future contributor reads instead of re-asking the questions.
		const external = [...byType.entries()].filter(([type]) => typeof index.sourceKinds.get(type)?.source_pattern === 'string')
		const local = [...byType.entries()].filter(([type]) => typeof index.sourceKinds.get(type)?.source_pattern !== 'string')
		const dismissed = stats.byClass.dismissed ?? 0
		const done = stats.byClass.done ?? 0
		const ledgerPath = path.relative(process.cwd(), options.ledger).split(path.sep).join('/')

		// How many of the imported entries are still here. §6 tells you to prune each entry as
		// it closes, so by retirement the file is a *survivor* of the triage and not a record of
		// it — and the counts below are drawn from the file. Warning about that in prose was the
		// old fix and it was not enough: `upstream.matched` is the number that was imported and
		// it is sitting in the same sentence, so the tool can say how many are missing instead
		// of asking the reader to remember. Counted over entries carrying external provenance,
		// because `matched` counts the import and a local `todo` was never part of it.
		const imported = external.reduce((total, [, count]) => total + count, 0)
		const pruned = isMapping(upstream) && Number.isInteger(upstream.matched) ? Math.max(0, upstream.matched - imported) : 0
		const missing =
			pruned === 0
				? ''
				: ' A further ' + pruned + (pruned === 1 ? ' entry has' : ' entries have') +
				  ' already been pruned from this ledger and ' + (pruned === 1 ? 'is' : 'are') +
				  ' in neither count — `git log -- ' + ledgerPath + '`.'

		const clauses = []
		if (isMapping(upstream)) {
			clauses.push(
				(phrase(external) || 'nothing still in the file') + ' inherited from `' + upstream.repo + '` as of ' +
				upstream.imported_at + ', filtered by `' + upstream.filter + '` (' + upstream.matched + ' of ' +
				upstream.total_open + ' open; ' + upstream.skipped + ' outside the filter)'
			)
		} else if (external.length) {
			clauses.push(phrase(external))
		}
		if (local.length) clauses.push(phrase(local) + ' raised in this project')
		const draft =
			'Triaged ' + (clauses.join(', and ') || '0 entries') +
			'. Kept ' + done + ', dropped ' + dismissed + '.' + missing

		if (options.json) {
			io.stdout(
				json({
					ledger: options.ledger,
					draft,
					upstream: upstream ?? null,
					kept: done,
					dropped: dismissed,
					imported: isMapping(upstream) ? (upstream.matched ?? null) : null,
					stillPresent: imported,
					pruned,
					countedFrom: 'entries still in the ledger',
				})
			)
			return 0
		}
		if (!invalid.ok) io.stderr('! this ledger does not validate (' + invalid.errors.length + ' error(s)); the counts below are drawn from it anyway')
		io.stdout(
			[
				'Draft retirement summary — put this in your own docs, then edit it. It is the one',
				'artifact that outlives everything, and it is what stops a future contributor',
				're-asking every question you already answered.',
				'',
				// True on every run, which is why it is preamble rather than a warning: pruning
				// removes exactly the entries that count as kept, so the ordering is the fix.
				// What is new is the sentence after it, which only appears when it is true.
				'Kept and dropped are counted from the entries still in this ledger, and pruning',
				'removes exactly the ones that count as kept — so draft this before you prune.',
				pruned === 0 ? null : 'It is already too late for ' + pruned + ' of them; the draft says so, and `git log` has them.',
				'',
				draft,
			]
				.filter((line) => line !== null)
				.join('\n')
		)
		return 0
	}

	throw new Error('retire requires one of --check, --distil, --summary')
}
