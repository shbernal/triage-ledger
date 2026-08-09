import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { parseDocument } from 'yaml'

import { parseArgs, run } from '../src/cli.mjs'
import { validateLedgerText } from '../src/validate.mjs'
import { HOSTILE_SUMMARY } from './fixtures.mjs'

function capture() {
	const out = []
	const err = []
	return { out, err, io: { stdout: (m) => out.push(m), stderr: (m) => err.push(m) } }
}

async function inTempDir(body) {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'triage-ledger-'))
	const cwd = process.cwd()
	process.chdir(dir)
	try {
		return await body(dir)
	} finally {
		process.chdir(cwd)
		await fs.rm(dir, { recursive: true, force: true })
	}
}

test('--summary is the field on add and the mode on retire', () => {
	// This collision silently dropped the summary and still validated, because an empty
	// string is a string. A flag that means two things has to be read per command.
	const added = parseArgs(['add', '--summary', 'a real title'])
	assert.equal(added.fields.summary, 'a real title')
	assert.equal(added.retireMode, null)

	const retired = parseArgs(['retire', '--summary'])
	assert.equal(retired.retireMode, 'summary')
})

test('--reason sets on set-status and filters everywhere else', () => {
	const setting = parseArgs(['set-status', '--to', 'dropped', '--reason', 'no-repro'])
	assert.deepEqual(setting.reasons, ['no-repro'])
	assert.equal(setting.filters.reason, undefined)

	const filtering = parseArgs(['list', '--reason', 'no-repro'])
	assert.deepEqual(filtering.filters.reason, ['no-repro'])
})

test('a value beginning with a dash is reachable through the = form', () => {
	assert.throws(() => parseArgs(['add', '--summary', '--fix the thing']), /use --summary=value/)
	assert.equal(parseArgs(['add', '--summary=--fix the thing']).fields.summary, '--fix the thing')
})

test('an unknown command or option fails loudly', () => {
	assert.throws(() => parseArgs(['frobnicate']), /unknown command/)
	assert.throws(() => parseArgs(['list', '--nope']), /unknown option/)
})

test('init writes a template that validates, and refuses to overwrite', async () => {
	await inTempDir(async () => {
		for (const argv of [['init'], ['init', '--profile', 'fork-triage', '--ledger', 'docs/fork.yml']]) {
			const { io } = capture()
			assert.equal(await run(argv, io), 0)
		}
		for (const file of ['docs/backlog.yml', 'docs/fork.yml']) {
			const text = await fs.readFile(file, 'utf8')
			const { report } = validateLedgerText(text)
			assert.deepEqual(report.errors, [], file + ':\n' + report.errors.join('\n'))
		}
		await assert.rejects(run(['init'], capture().io), /refusing to overwrite/)
	})
})

test('the core template still validates with every profile-specific line gone', async () => {
	// The core-conformance claim, made testable: a conformant core ledger is one that
	// validates with everything a profile added deleted.
	await inTempDir(async () => {
		await run(['init'], capture().io)
		const text = await fs.readFile('docs/backlog.yml', 'utf8')
		const { data, report } = validateLedgerText(text)
		assert.deepEqual(report.errors, [])
		// Checked against the parsed data, not the raw text: the template *explains*
		// source_pattern in a comment, and it should.
		assert.equal(data.upstream, undefined, 'the core template must not presume an upstream')
		assert.ok(
			data.source_kinds.every((kind) => kind.source_pattern === undefined),
			'the core template must not presume an external source'
		)
	})
})

test('a full lifecycle runs without the file being hand-edited once', async () => {
	await inTempDir(async () => {
		const ok = async (argv) => {
			const { io, out } = capture()
			const code = await run(argv, io)
			assert.equal(code, 0, argv.join(' ') + ' exited ' + code + '\n' + out.join('\n'))
			return out.join('\n')
		}

		await ok(['init'])
		await ok([
			'add', '--id', 'todo-1', '--source', 'local', '--type', 'todo',
			'--status', 'needs-triage', '--summary', HOSTILE_SUMMARY, '--first-seen', '2026-01-01',
		])

		// Dismissal needs a vocabulary the template deliberately ships empty, so declaring
		// one is a real edit to the vocabulary block — by hand, which is the supported path.
		const text = await fs.readFile('docs/backlog.yml', 'utf8')
		await fs.writeFile(
			'docs/backlog.yml',
			text.replace(
				'  non_target_reasons: []',
				`  non_target_reasons:
    - reason: out-of-scope
      describes: Not something this project does.
      about: project-policy
      retire_to: docs/target.md`
			)
		)

		await ok(['add', '--id', 'todo-2', '--source', 'local', '--type', 'todo', '--status', 'needs-triage', '--summary', 'second'])
		assert.match(await ok(['next', '2']), /todo-1/)
		await ok(['set-status', 'todo-2', 'non-target', '--reason', 'out-of-scope', '--date', '2026-02-02'])
		await ok([
			'set-status', 'todo-1', 'implemented', '--evidence', 'source-read',
			'--local-file', 'src/a.ts', '--next-action', 'none', '--date', '2026-02-02',
		])

		const final = await fs.readFile('docs/backlog.yml', 'utf8')
		assert.deepEqual(validateLedgerText(final).report.errors, [])
		// The hostile summary survived every mutation in between.
		assert.equal(validateLedgerText(final).data.items[0].summary, HOSTILE_SUMMARY)

		await fs.mkdir('docs', { recursive: true })
		await fs.writeFile('docs/target.md', '# Target\n')
		assert.match(await ok(['retire', '--check']), /Ready to retire/)
		assert.match(await ok(['retire', '--distil']), /out-of-scope \(1\) → docs\/target\.md/)

		await ok(['remove', 'todo-1'])
		await ok(['remove', 'todo-2'])
		const empty = await fs.readFile('docs/backlog.yml', 'utf8')
		assert.match(empty, /^items: \[\]/m)
		assert.deepEqual(validateLedgerText(empty).report.errors, [])
	})
})

test('--set reaches the file on add, not only on set-status', async () => {
	// It was parsed, stored and never read by `add`: the entry was written without the
	// field and validated cleanly. Silent, plausible, invisible to validation — the same
	// family as the `--summary` collision above, and only findable by running the thing.
	await inTempDir(async () => {
		await run(['init'], capture().io)
		const text = await fs.readFile('docs/backlog.yml', 'utf8')
		await fs.writeFile(
			'docs/backlog.yml',
			text.replace(
				'  evidence_kinds:',
				`  fields:
    - field: priority
      describes: How much it would cost us to be wrong about this.
      values: [p0, p1]
  evidence_kinds:`
			)
		)

		await run(
			['add', '--id', 'todo-1', '--source', 'local', '--type', 'todo', '--status', 'needs-triage', '--summary', 'a thing', '--set', 'priority=p1'],
			capture().io
		)
		const written = await fs.readFile('docs/backlog.yml', 'utf8')
		const { data, report } = validateLedgerText(written)
		assert.deepEqual(report.errors, [])
		assert.equal(data.items[0].priority, 'p1')

		// And an undeclared value still fails loudly rather than being written.
		await assert.rejects(
			run(
				['add', '--id', 'todo-2', '--source', 'local', '--type', 'todo', '--status', 'needs-triage', '--summary', 'x', '--set', 'priority=p9'],
				capture().io
			),
			/undeclared value for `priority`/
		)
	})
})

test('the phase probe routes a seeded-but-unvocabularied ledger to setup, not drain', async () => {
	// The skill routes on this. Sending it to drain.md with no dismissal reasons declared
	// tells it to pick the closest existing reason from an empty list.
	await inTempDir(async () => {
		await run(['init'], capture().io)
		const probe = async () => {
			const { io, out } = capture()
			await run(['status', '--json'], io)
			return JSON.parse(out.join('\n')).phase
		}
		assert.equal(await probe(), 'setup', 'empty ledger, no reasons')

		await run(
			['add', '--id', 'todo-1', '--source', 'local', '--type', 'todo', '--status', 'needs-triage', '--summary', 'a thing'],
			capture().io
		)
		assert.equal(await probe(), 'setup', 'entries to decide, but nothing to dismiss them with')

		const text = await fs.readFile('docs/backlog.yml', 'utf8')
		await fs.writeFile(
			'docs/backlog.yml',
			text.replace(
				'  non_target_reasons: []',
				`  non_target_reasons:
    - reason: out-of-scope
      describes: Not something this project does.
      about: project-policy
      retire_to: docs/target.md`
			)
		)
		assert.equal(await probe(), 'drain')
	})
})

test('--dry-run writes nothing', async () => {
	await inTempDir(async () => {
		await run(['init'], capture().io)
		const before = await fs.readFile('docs/backlog.yml', 'utf8')
		await run(
			['add', '--id', 'todo-1', '--source', 'local', '--type', 'todo', '--status', 'needs-triage', '--summary', 'x', '--dry-run'],
			capture().io
		)
		assert.equal(await fs.readFile('docs/backlog.yml', 'utf8'), before)
	})
})

test('bulk set-status without a filter is refused', async () => {
	await inTempDir(async () => {
		await run(['init'], capture().io)
		await assert.rejects(run(['set-status', '--to', 'needs-triage'], capture().io), /requires a filter/)
	})
})

test('validate warns when the installed skill targets a different schema', async () => {
	// The skill is installed as a *copy*, so it drifts as the spec moves. A stale skill
	// teaching schema 1 against a schema 2 ledger poisons agent work silently: the agent
	// follows confident, wrong instructions and nothing else looks unusual.
	await inTempDir(async () => {
		await run(['init'], capture().io)
		await fs.mkdir('.claude/skills/triage-ledger', { recursive: true })
		await fs.writeFile('.claude/skills/triage-ledger/SKILL.md', '---\nname: triage-ledger\nschema: 7\n---\n')
		const { io, out } = capture()
		assert.equal(await run(['validate'], io), 0)
		assert.match(out.join('\n'), /skill targets schema 7 but this ledger declares schema 1/)
	})
})

test('the shipped skill declares the schema this implementation speaks', async () => {
	const here = path.dirname(fileURLToPath(import.meta.url))
	const skill = await fs.readFile(path.join(here, '..', 'skills', 'triage-ledger', 'SKILL.md'), 'utf8')
	assert.match(skill, /^schema: 1$/m)
})

test('the shipped skill frontmatter parses as YAML, or nothing can install it', async () => {
	// `npx skills add` parses this block and skips any skill whose block does not parse —
	// and it exits 0 while doing it, so a broken skill is a silent no-install rather than a
	// failure. The description names `schema: 1`, and an unquoted colon inside a plain
	// scalar is a YAML error rather than text, which is precisely what happened.
	//
	// This is the ledger's own `summary` rule turned on the tool's own artifact: quote
	// unconditionally, because a rule with branches gets got wrong. The only check that
	// would have caught it is one that reads the shipped file with a real YAML parser,
	// because every other thing we run reads this frontmatter with a regex.
	const here = path.dirname(fileURLToPath(import.meta.url))
	const text = await fs.readFile(path.join(here, '..', 'skills', 'triage-ledger', 'SKILL.md'), 'utf8')
	const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
	assert.ok(frontmatter, 'no frontmatter block')

	const doc = parseDocument(frontmatter[1], { prettyErrors: false })
	assert.deepEqual(doc.errors.map((error) => error.message), [])
	const data = doc.toJS()
	assert.equal(data.name, 'triage-ledger', 'the name must match the directory the installer copies')
	assert.equal(typeof data.description, 'string')
	assert.ok(data.description.length > 0 && data.description.length <= 1024)
})

test('validate exits non-zero on errors and zero with only warnings', async () => {
	await inTempDir(async () => {
		await run(['init'], capture().io)
		assert.equal(await run(['validate'], capture().io), 0)

		const text = await fs.readFile('docs/backlog.yml', 'utf8')
		await fs.writeFile('docs/backlog.yml', text.replace('schema: 1', 'schema: 2'))
		assert.equal(await run(['validate'], capture().io), 1)
	})
})
