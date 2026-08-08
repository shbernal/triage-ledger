import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { CLASSES } from '../src/model.mjs'

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')

/**
 * Status names that appear in the shipped templates and in SPEC.md's examples.
 *
 * Deliberately excludes the five class names. `accepted` and `done` are both a class and a
 * conventional status name, and the class names are the one piece of lifecycle vocabulary
 * the code is allowed to know — so testing for the string `accepted` would fail on
 * `model.mjs` for the wrong reason.
 */
const STATUS_NAMES = [
	'needs-triage',
	'needs-repro',
	'non-target',
	'deferred',
	'on-hold',
	'implemented',
	'partially-implemented',
	'superseded',
	'wontfix',
]

const REASON_NAMES = [
	'out-of-project-scope',
	'composition-belongs-downstream',
	'dropped-platform-target',
	'upstream-architecture',
	'not-reproducible',
	'stale-no-repro',
	'superseded-upstream',
	'commonjs',
]

const TYPE_NAMES = ['pull-request', 'downstream-need', 'fork-internal-proposal']

/**
 * Source with the prose removed: block comments, line comments, and template literals.
 *
 * The invariant is about behaviour, not vocabulary hygiene in documentation. A comment
 * explaining why `deferred` and `on-hold` need distinguishing is doing its job, and the
 * `--help` text has to name real examples or it teaches nothing. Template literals are
 * safe to strip wholesale here because this codebase uses them for exactly one thing —
 * `usage()`. If that stops being true, this stripper has to get smarter rather than the
 * invariant getting weaker.
 */
function code(text) {
	return text
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/^[^\n'"`]*\/\/.*$/gm, '')
		.replace(/`(?:[^`\\]|\\.)*`/g, '``')
}

async function sourceFiles() {
	const names = await fs.readdir(SRC)
	return Promise.all(
		names
			.filter((name) => name.endsWith('.mjs'))
			.map(async (name) => ({ name, text: code(await fs.readFile(path.join(SRC, name), 'utf8')) }))
	)
}

test('no project vocabulary appears anywhere in src/', async () => {
	// The mechanical form of the check the nonsense-status fixture makes behaviourally.
	// Every level of this design that regressed did so by a string literal creeping back
	// into shared code, so both forms are kept: one catches it, the other explains it.
	const files = await sourceFiles()
	const offences = []
	for (const { name, text } of files) {
		for (const needle of [...STATUS_NAMES, ...REASON_NAMES, ...TYPE_NAMES]) {
			if (text.includes(needle)) offences.push(name + ' contains the project-vocabulary literal `' + needle + '`')
		}
	}
	assert.deepEqual(offences, [])
})

test('the five classes are the only lifecycle vocabulary, and there are exactly five', () => {
	assert.deepEqual(CLASSES, ['untriaged', 'parked', 'dismissed', 'accepted', 'done'])
})

test('`upstream_patch` is profile data, not something the code knows', async () => {
	// It has a values list, a type restriction and a required-when rule — all of them
	// declared in the ledger. The moment the CLI knows the string, the fourth inversion
	// has been undone.
	const files = await sourceFiles()
	const offenders = files.filter((file) => file.text.includes("'upstream_patch'") || file.text.includes('"upstream_patch"'))
	assert.deepEqual(offenders.map((file) => file.name), [])
})

test('the templates are the only place a profile exists', async () => {
	// Profiles have no runtime existence: `init --profile x` copies `templates/x.yml` and
	// nothing else in the CLI branches on which profile was chosen.
	const files = await sourceFiles()
	for (const { name, text } of files) {
		assert.ok(!text.includes('fork-triage'), name + ' branches on a profile name')
	}
})
