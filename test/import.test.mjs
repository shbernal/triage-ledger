/**
 * `import` — §4's seeding modes, and the MUSTs attached to them.
 *
 * The interesting tests here are not "does it write entries". They are the four obligations
 * §4 puts on a seeding mode and that nothing else in the tool can be asked to keep: strip
 * line terminators once at the parse boundary, be resumable without touching a triaged
 * entry, declare constrained values in the same write that first uses them, and say what
 * was left behind rather than implying coverage that does not exist.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { parse } from 'yaml'

import { run } from '../src/cli.mjs'
import { expandTemplate, normalizeText, parseRecords, resolvePath } from '../src/import.mjs'
import { validateLedgerText } from '../src/validate.mjs'
import { SEEDABLE_LEDGER } from './fixtures.mjs'

function capture() {
	const out = []
	const err = []
	return { out, err, io: { stdout: (m) => out.push(m), stderr: (m) => err.push(m) } }
}

async function inSeededDir(body, ledger = SEEDABLE_LEDGER) {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'triage-ledger-import-'))
	const cwd = process.cwd()
	process.chdir(dir)
	try {
		await fs.mkdir('docs', { recursive: true })
		await fs.writeFile('docs/backlog.yml', ledger)
		return await body(dir)
	} finally {
		process.chdir(cwd)
		await fs.rm(dir, { recursive: true, force: true })
	}
}

async function records(name, value) {
	await fs.writeFile(name, typeof value === 'string' ? value : JSON.stringify(value))
	return name
}

async function readLedger() {
	const text = await fs.readFile('docs/backlog.yml', 'utf8')
	return { text, data: parse(text) }
}

const ISSUE_MAP = [
	'--map',
	'id=upstream-issue-{number}',
	'--map',
	'source=acme/renderer#{number}',
	'--map',
	'summary={title}',
]

const AS_ISSUES = ['--type', 'issue', '--status', 'needs-triage', ...ISSUE_MAP]
const UPSTREAM = ['--repo', 'acme/renderer', '--filter', 'updated:>2023-08-08', '--total-open', '100']

// ------------------------------------------------------------------------ record reading

test('records arrive as a JSON array or one object per line, and a lone object is refused', () => {
	const array = parseRecords('[{"a": 1}, {"a": 2}]')
	const lines = parseRecords('{"a": 1}\n\n{"a": 2}\n')
	assert.deepEqual(array, lines)
	assert.throws(() => parseRecords('{"a": 1, "b": 2}'), /expected an array of records/)
})

test('line terminators are stripped once, at the parse boundary', () => {
	// §4 makes this a MUST and names the place. `gh` on Windows hands back titles ending in
	// `\r`, and §3 makes such a summary illegal precisely so the strip has one home.
	assert.equal(normalizeText('Crash on empty input\r'), 'Crash on empty input')
	assert.equal(normalizeText('Add a\r\n  CommonJS build'), 'Add a CommonJS build')
	assert.equal(normalizeText('  padded  '), 'padded')

	// And it reaches nested values, not only the one that becomes `summary`.
	const [record] = parseRecords('[{"labels": [{"name": "bug\\r"}]}]')
	assert.equal(record.labels[0].name, 'bug')
})

test('a path reads a key, reads through a mapping, and fans out over an array', () => {
	const record = { number: 412, author: { login: 'ada' }, labels: [{ name: 'bug' }, { name: 'css' }] }
	assert.equal(resolvePath(record, 'number'), 412)
	assert.equal(resolvePath(record, 'author.login'), 'ada')
	assert.deepEqual(resolvePath(record, 'labels[].name'), ['bug', 'css'])
	assert.equal(resolvePath(record, 'nope.deeper'), undefined)

	// A template that is exactly one placeholder keeps the value's type; mixing it with
	// literal text is how an id gets the prefix §3 asks for.
	assert.deepEqual(expandTemplate('{labels[].name}', record).value, ['bug', 'css'])
	assert.equal(expandTemplate('upstream-issue-{number}', record).value, 'upstream-issue-412')
	assert.equal(expandTemplate('local', record).value, 'local')
})

// ------------------------------------------------------------------------------ seeding

test('a seed writes the entries and the upstream block that makes them legal', async () => {
	await inSeededDir(async () => {
		const { io } = capture()
		await records('issues.json', [
			{ number: 412, title: 'Unsupported color function "oklch"' },
			{ number: 998, title: 'Add a\r\n  CommonJS build' },
		])
		assert.equal(await run(['import', 'issues.json', ...AS_ISSUES, ...UPSTREAM], io), 0)

		const { text, data } = await readLedger()
		assert.equal(validateLedgerText(text).report.ok, true)
		assert.deepEqual(
			data.items.map((item) => item.id),
			['upstream-issue-412', 'upstream-issue-998']
		)
		// The summary survived a CRLF in the middle of the title, and is one line.
		assert.equal(data.items[1].summary, 'Add a CommonJS build')

		// §3: `filter` is the exact predicate, and the counts are what the retirement summary
		// is written from — so `skipped` has to be the pile this seed did not take.
		assert.equal(data.upstream.repo, 'acme/renderer')
		assert.equal(data.upstream.filter, 'updated:>2023-08-08')
		assert.equal(data.upstream.matched, 2)
		assert.equal(data.upstream.skipped, 98)
		assert.equal(data.upstream.total_open, 100)
	})
})

test('a local pile needs no upstream at all — that is the whole difference between the two modes', async () => {
	await inSeededDir(async () => {
		const { io, out } = capture()
		await records('todo.jsonl', '{"q": 1, "text": "Do we support two consumers?"}\n{"q": 2, "text": "Where does this live?"}\n')
		const code = await run(
			['import', 'todo.jsonl', '--type', 'todo', '--status', 'needs-triage',
				'--map', 'id=q{q}', '--map', 'source=TODO.md', '--map', 'summary={text}'],
			io
		)

		assert.equal(code, 0)
		const { text, data } = await readLedger()
		assert.equal(validateLedgerText(text).report.ok, true)
		assert.equal(data.items.length, 2)
		// Nothing carries external provenance, so §3 asks for no block and none is invented.
		assert.equal(data.upstream, undefined)
		assert.equal(out.join('\n').includes('upstream'), false)
	})
})

test('re-running skips ids already present and does not touch an entry whose status has moved', async () => {
	// §4 states both halves as MUSTs, and they are what makes "seed once, never reconcile"
	// survivable across a rate limit or a closed laptop.
	await inSeededDir(async () => {
		await records('issues.json', [{ number: 412, title: 'First' }, { number: 998, title: 'Second' }])
		await run(['import', 'issues.json', ...AS_ISSUES, ...UPSTREAM], capture().io)
		await run(['set-status', 'upstream-issue-412', 'dropped', '--reason', 'no-repro'], capture().io)

		// The same export, plus one that arrived later. The upstream flags are omitted, which
		// is the resume: the block already describes this import.
		await records('issues.json', [
			{ number: 412, title: 'First, retitled upstream since' },
			{ number: 998, title: 'Second' },
			{ number: 1004, title: 'Third' },
		])
		const { io, out } = capture()
		assert.equal(await run(['import', 'issues.json', ...AS_ISSUES], io), 0)

		const { data } = await readLedger()
		assert.equal(data.items.length, 3)
		const decided = data.items.find((item) => item.id === 'upstream-issue-412')
		assert.equal(decided.status, 'dropped')
		assert.equal(decided.summary, 'First', 'a triaged entry must not be rewritten by a re-run')
		assert.match(out.join('\n'), /Skipped 2 already in the ledger/)
	})
})

test('re-running the whole command, flags and all, still works once nothing is new', async () => {
	// The natural resume is the same command again. Deciding whether this import concerns
	// external entries from what is *left* would make the upstream flags an error at exactly
	// the moment the seed finished.
	await inSeededDir(async () => {
		await records('issues.json', [{ number: 412, title: 'First' }])
		const command = ['import', 'issues.json', ...AS_ISSUES, ...UPSTREAM]
		await run(command, capture().io)

		const { io, out } = capture()
		assert.equal(await run(command, io), 0)
		assert.match(out.join('\n'), /Skipped 1 already in the ledger/)
		const { data } = await readLedger()
		assert.equal(data.upstream.matched, 1)
		assert.equal(data.items.length, 1)
	})
})

test('upstream flags on a local pile are refused rather than accepted and ignored', async () => {
	await inSeededDir(async () => {
		await records('todo.json', [{ q: 1, text: 'A question' }])
		await assert.rejects(
			() =>
				run(
					['import', 'todo.json', '--type', 'todo', '--status', 'needs-triage',
						'--map', 'id=q{q}', '--map', 'source=TODO.md', '--map', 'summary={text}', ...UPSTREAM],
					capture().io
				),
			/this is a local pile/
		)
	})
})

test('a second import against a different filter has nowhere true to be recorded, so it is refused', async () => {
	// §3: the block describes one import. §4: seed once, never reconcile.
	await inSeededDir(async () => {
		await records('issues.json', [{ number: 412, title: 'First' }])
		await run(['import', 'issues.json', ...AS_ISSUES, ...UPSTREAM], capture().io)

		await records('more.json', [{ number: 500, title: 'Later' }])
		await assert.rejects(
			() => run(['import', 'more.json', ...AS_ISSUES, '--repo', 'acme/renderer', '--filter', 'none'], capture().io),
			/describes one import/
		)
	})
})

test('a filtered seed must say how much it left behind', async () => {
	await inSeededDir(async () => {
		await records('issues.json', [{ number: 412, title: 'First' }])
		await assert.rejects(
			() => run(['import', 'issues.json', ...AS_ISSUES, '--repo', 'acme/renderer', '--filter', 'is:open'], capture().io),
			/--total-open/
		)
		// Taking the whole pile is the explicit choice §4 asks for, and the only case where
		// the counts follow from what the tool can see.
		assert.equal(
			await run(['import', 'issues.json', ...AS_ISSUES, '--repo', 'acme/renderer', '--filter', 'none'], capture().io),
			0
		)
		const { data } = await readLedger()
		assert.equal(data.upstream.skipped, 0)
		assert.equal(data.upstream.total_open, 1)
	})
})

// ------------------------------------------------------------------- vocabulary closure

test('values carried across are refused undeclared, and --declare writes them in the same write', async () => {
	await inSeededDir(async () => {
		await records('issues.json', [
			{ number: 412, title: 'First', labels: [{ name: 'bug' }, { name: 'css' }] },
			{ number: 998, title: 'Second', labels: [] },
		])
		const withTags = ['import', 'issues.json', ...AS_ISSUES, '--map', 'tags[]={labels[].name}', ...UPSTREAM]

		await assert.rejects(() => run(withTags, capture().io), /would land in vocabulary-constrained fields undeclared/)
		// Refused means refused: nothing reached the file.
		assert.equal((await readLedger()).data.items.length, 0)

		const { io, out } = capture()
		assert.equal(await run([...withTags, '--declare'], io), 0)

		const { text, data } = await readLedger()
		assert.equal(validateLedgerText(text).report.ok, true)
		const tags = data.vocabulary.fields.find((field) => field.field === 'tags')
		assert.deepEqual(tags.values, ['bug', 'css'])
		assert.deepEqual(data.items[0].tags, ['bug', 'css'])

		// §3's omission rule: an issue with no labels gets no `tags`, not an empty one — and
		// §4's "print what was skipped" means it is said rather than left to be noticed.
		assert.equal('tags' in data.items[1], false)
		assert.match(out.join('\n'), /No `tags` on 1 of them/)

		// Comments in the vocabulary are load-bearing, and a declaration is a write into it.
		assert.match(text, /# This comment sits above the one constrained field/)
		assert.match(text, /Declared by `import`/)
	})
})

test('a type or a status is never declared for you — an import seeds into a vocabulary, not over it', async () => {
	await inSeededDir(async () => {
		await records('issues.json', [{ number: 412, title: 'First' }])
		await assert.rejects(
			() => run(['import', 'issues.json', '--type', 'issue', '--status', 'invented', ...ISSUE_MAP, ...UPSTREAM], capture().io),
			/invented/
		)
		assert.equal((await readLedger()).data.items.length, 0)
	})
})

// ------------------------------------------------------------------------ refusing early

test('a required field that does not resolve stops the whole batch, not just its record', async () => {
	await inSeededDir(async () => {
		await records('issues.json', [{ number: 412, title: 'First' }, { title: 'No number at all' }])
		await assert.rejects(
			() => run(['import', 'issues.json', ...AS_ISSUES, ...UPSTREAM], capture().io),
			/record 2: id ← \{number\}/
		)
		// A mapping wrong for one record is suspect for the ones it happened to resolve, so
		// nothing is written — the half-seeded ledger is the state with no good way out.
		assert.equal((await readLedger()).data.items.length, 0)
	})
})

test('two records producing one id is a mapping mistake, and it is named as one', async () => {
	await inSeededDir(async () => {
		await records('issues.json', [{ number: 412, title: 'First' }, { number: 412, title: 'Same number' }])
		await assert.rejects(
			() => run(['import', 'issues.json', ...AS_ISSUES, ...UPSTREAM], capture().io),
			/two records in this batch produce the same id: upstream-issue-412/
		)
	})
})

test('a field nothing supplies is refused before four hundred entries are built', async () => {
	await inSeededDir(async () => {
		await records('issues.json', [{ number: 412, title: 'First' }])
		await assert.rejects(
			() => run(['import', 'issues.json', '--type', 'issue', '--map', 'id=upstream-issue-{number}'], capture().io),
			/nothing supplies source, summary, status/
		)
	})
})

test('--dry-run writes nothing and still says what it would have done', async () => {
	await inSeededDir(async () => {
		await records('issues.json', [{ number: 412, title: 'First' }])
		const { io, out } = capture()
		assert.equal(await run(['import', 'issues.json', ...AS_ISSUES, ...UPSTREAM, '--dry-run'], io), 0)
		assert.match(out.join('\n'), /Would import 1 entry/)
		assert.equal((await readLedger()).data.items.length, 0)
	})
})
