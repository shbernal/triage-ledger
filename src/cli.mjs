#!/usr/bin/env node
/**
 * Argument parsing and dispatch.
 *
 * Note what is absent: any shell indirection. The prior art was invoked as
 * `pnpm run backlog -- add --summary "…"`, and a literal `&` in that summary silently
 * corrupted the write — on Windows, even with --dry-run. This is a bin, so arguments
 * arrive through `process.argv` as typed, and the emitter double-quotes every `summary`
 * unconditionally. Both halves of that defect are closed, and both are regression-tested
 * with a deliberately hostile string.
 *
 * One exception, and it is not ours to close. On Windows the `npx` shim re-parses the
 * command line, and a newline inside an argument takes that argument and every argument
 * after it with it: `add --summary "one<LF>two" --set area=cli` writes a truncated summary,
 * never sets `area`, and exits 0. Nothing here can detect it — the dropped arguments never
 * arrive — so the answer is upstream of the process: §3 makes a line break in a `summary`
 * illegal, which turns the one case that reaches the file into a validation error instead
 * of a plausible-looking entry.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { DEFAULT_LEDGER_PATH } from './model.mjs'
import { todayIsoDate } from './ledger.mjs'
import {
	commandAdd,
	commandInit,
	commandList,
	commandNext,
	commandRemove,
	commandRetire,
	commandSetStatus,
	commandShow,
	commandStats,
	commandStatus,
	commandValidate,
	commandValues,
} from './commands.mjs'

const COMMANDS = {
	init: commandInit,
	validate: commandValidate,
	list: commandList,
	show: commandShow,
	values: commandValues,
	next: commandNext,
	stats: commandStats,
	status: commandStatus,
	add: commandAdd,
	'set-status': commandSetStatus,
	remove: commandRemove,
	retire: commandRetire,
}

export function usage() {
	return `triage-ledger — a backlog designed to end.

Usage: npx triage-ledger@0.1 <command> [options]

Setting up
  init                        Write a ledger with a vocabulary skeleton (--profile fork-triage)
  validate                    Check the ledger against the spec. Wire this into CI.

Reading
  list                        Compact rows for matching entries
  show <id…>                  Full entries by id, or by filter
  values <list|field>         A vocabulary list with its distinguishing text, or value counts
  next [n]                    The next n undecided entries (default 10)
  stats                       Burn-down, including days since the last triage activity
  status                      Machine-readable phase probe (routes the agent skill)

Deciding
  add                         Append one entry
  set-status <id> <status>    Move one entry; stamps last_reviewed
  set-status --to <status>    Move every entry matching a filter (a filter is required)
  remove [id]                 Remove one entry, or every entry matching a filter

Retiring
  retire --check              Preconditions: nothing outstanding, every destination exists
  retire --distil             Remaining dismissals grouped by reason, under their destinations
  retire --summary            Draft the retirement summary from the upstream block

Options
  --ledger <path>             Default: ${DEFAULT_LEDGER_PATH}
  --profile <name>            init only: core (default) or fork-triage
  --json                      Machine-readable output on every read command
  --dry-run                   Validate a mutation without writing
  --print-limit <n>           Rows to print; 0 prints all (default 50)

Filters (list, show, values, next, set-status --to, remove)
  --status <v[,v…]>           By status name
  --class <v[,v…]>            By status class: untriaged, parked, dismissed, accepted, done
  --type <v[,v…]>             By entry type
  --reason <v[,v…]>           By dismissal reason
  --id <v[,v…]>               By id
  --search <text>             Substring, over every text field

Fields (add, set-status) — add requires --id, --source, --type and --status
  --id <id>                   Entry id
  --source <ref>              Provenance; must match the pattern its type declares
  --type <name>               add: the entry type, declared in source_kinds
  --status <name>             add: the entry's status, declared in vocabulary.statuses.
                              (Everywhere else --status filters.)
  --summary <text>            One line — a line break is illegal, and on Windows it also
                              truncates the command. Always written double-quoted.
  --to <status>               New status, for bulk set-status
  --reason <v[,v…]>           set-status: the dismissal reasons to record. (Everywhere
                              else --reason filters; on set-status it sets, so filter a
                              bulk transition with --status, --class or --search.)
  --next-action <text>        next_action
  --first-seen <YYYY-MM-DD>   Defaults to today
  --date <YYYY-MM-DD>         The date written as last_reviewed (default: today)
  --set field=value           Any field your project declared for itself

Evidence (set-status) — nothing reaches a class that requires it without these
  --evidence <k[,k…]>         evidence.kinds; must name declared evidence kinds
  --local-file <p[,p…]>       evidence.local_files
  --spec-ref <text>           evidence.spec_refs; repeatable
  --result <pass|fail|inconclusive>

A value that begins with a dash must use the --flag=value form.

Examples
  npx triage-ledger@0.1 init --profile fork-triage
  npx triage-ledger@0.1 next 10
  npx triage-ledger@0.1 values non_target_reasons
  npx triage-ledger@0.1 set-status upstream-issue-412 accepted
  npx triage-ledger@0.1 set-status --to non-target --reason stale-no-repro --search "IE11" --dry-run
  npx triage-ledger@0.1 retire --check
`
}

function parseCsv(value) {
	return value
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean)
}

const VALUE_FLAGS = new Set([
	'--ledger',
	'--profile',
	'--print-limit',
	'--status',
	'--class',
	'--type',
	'--reason',
	'--id',
	'--search',
	'--to',
	'--source',
	'--summary',
	'--next-action',
	'--first-seen',
	'--date',
	'--evidence',
	'--local-file',
	'--spec-ref',
	'--result',
	'--set',
])

/**
 * Which command is being run, decided before the options are parsed.
 *
 * Needed because `--summary` means two things: the field on `add`, and the mode on
 * `retire`. Resolving that by position alone silently dropped the field — the entry was
 * written with an empty summary and the ledger still validated, which is the failure mode
 * this project exists to be paranoid about. A flag that means different things to
 * different commands has to be read in the context of its command.
 */
function findCommand(argv) {
	for (let i = 0; i < argv.length; ) {
		const arg = argv[i]
		if (arg === '--') {
			i += 1
		} else if (arg.startsWith('--')) {
			const flag = arg.split('=', 1)[0]
			i += VALUE_FLAGS.has(flag) && !arg.includes('=') ? 2 : 1
		} else if (arg.startsWith('-')) {
			i += 1
		} else {
			return arg
		}
	}
	return null
}

function readValue(argv, index, flag) {
	const raw = argv[index]
	const equals = raw.indexOf('=')
	if (equals >= 0) return { value: raw.slice(equals + 1), consumed: 1 }
	const value = argv[index + 1]
	if (value === undefined || value.startsWith('--')) {
		throw new Error('missing value for ' + flag + ' (for a value that begins with a dash, use ' + flag + '=value)')
	}
	return { value, consumed: 2 }
}

export function parseArgs(argv, { today = todayIsoDate() } = {}) {
	const options = {
		command: null,
		args: [],
		ledger: DEFAULT_LEDGER_PATH,
		profile: null,
		json: false,
		dryRun: false,
		help: false,
		printLimit: 50,
		filters: {},
		fields: {},
		evidence: {},
		set: {},
		to: null,
		reasons: null,
		retireMode: null,
		today,
	}
	const positional = []
	const isRetire = findCommand(argv) === 'retire'

	for (let i = 0; i < argv.length; ) {
		const arg = argv[i]
		const flag = arg.startsWith('--') ? arg.split('=', 1)[0] : null

		if (arg === '--') {
			i += 1
		} else if (arg === '--help' || arg === '-h') {
			options.help = true
			i += 1
		} else if (arg === '--json') {
			options.json = true
			i += 1
		} else if (arg === '--dry-run') {
			options.dryRun = true
			i += 1
		} else if (arg === '--check' || arg === '--distil' || (isRetire && arg === '--summary')) {
			options.retireMode = arg.slice(2)
			i += 1
		} else if (flag && VALUE_FLAGS.has(flag)) {
			const { value, consumed } = readValue(argv, i, flag)
			switch (flag) {
				case '--ledger':
					options.ledger = value
					break
				case '--profile':
					options.profile = value
					break
				case '--print-limit': {
					if (!/^\d+$/.test(value)) throw new Error('--print-limit must be a non-negative integer')
					options.printLimit = Number(value)
					break
				}
				case '--status':
					options.filters.status = [...(options.filters.status ?? []), ...parseCsv(value)]
					break
				case '--class':
					options.filters.class = [...(options.filters.class ?? []), ...parseCsv(value)]
					break
				case '--type':
					options.filters.type = [...(options.filters.type ?? []), ...parseCsv(value)]
					options.fields.type = parseCsv(value)[0]
					break
				case '--reason':
					options.filters.reason = [...(options.filters.reason ?? []), ...parseCsv(value)]
					options.reasons = [...(options.reasons ?? []), ...parseCsv(value)]
					break
				case '--id':
					options.filters.id = [...(options.filters.id ?? []), ...parseCsv(value)]
					options.fields.id = value
					break
				case '--search':
					options.filters.search = value
					break
				case '--to':
					options.to = value
					break
				case '--source':
					options.fields.source = value
					break
				case '--summary':
					options.fields.summary = value
					break
				case '--next-action':
					options.fields.next_action = value
					break
				case '--first-seen':
					options.fields.first_seen = value
					break
				case '--date':
					options.today = value
					break
				case '--evidence':
					options.evidence.kinds = [...(options.evidence.kinds ?? []), ...parseCsv(value)]
					break
				case '--local-file':
					options.evidence.local_files = [...(options.evidence.local_files ?? []), ...parseCsv(value)]
					break
				case '--spec-ref':
					options.evidence.spec_refs = [...(options.evidence.spec_refs ?? []), value]
					break
				case '--result':
					options.evidence.result = value
					break
				case '--set': {
					// `--set field=value` covers every field a project declared for itself.
					// The alternative was a flag per field, which the CLI cannot know.
					const split = value.indexOf('=')
					if (split < 0) throw new Error('--set takes field=value')
					options.set[value.slice(0, split)] = value.slice(split + 1)
					break
				}
			}
			i += consumed
		} else if (arg.startsWith('--')) {
			throw new Error('unknown option: ' + arg)
		} else {
			positional.push(arg)
			i += 1
		}
	}

	options.command = positional.shift() ?? null
	options.args = positional

	// Three flags name a value on a mutation and a filter everywhere else. Resolve that by
	// command rather than by inventing `--set-reason` alongside `--reason`: two names for
	// one idea is how a vocabulary rots, and the same argument applies to a CLI.
	//
	// The cost is real and worth stating: on `set-status` you cannot filter by the reason
	// an entry already carries. Filter with --status, --class or --search instead.
	if (options.command === 'add') {
		options.fields.status = options.filters.status?.[0]
		options.filters = {}
	}
	if (options.command === 'set-status') delete options.filters.reason

	if (options.command === null) options.help = true
	else if (!(options.command in COMMANDS) && !options.help) throw new Error('unknown command: ' + options.command)
	return options
}

function defaultIo() {
	return {
		stdout: (message) => console.log(message),
		stderr: (message) => console.error(message),
	}
}

export async function run(argv, io = defaultIo()) {
	const options = parseArgs(argv)
	if (options.help) {
		io.stdout(usage())
		return 0
	}
	options.ledger = path.resolve(process.cwd(), options.ledger)
	return COMMANDS[options.command](options, io)
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
	run(process.argv.slice(2))
		.then((code) => {
			process.exitCode = code
		})
		.catch((error) => {
			console.error(error.message)
			process.exitCode = 1
		})
}
