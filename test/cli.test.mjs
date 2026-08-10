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

		// `--first-seen` is explicit here, and it has to be: the review below is backdated to
		// February, and an entry seeded today cannot have been reviewed then (§3).
		await ok([
			'add', '--id', 'todo-2', '--source', 'local', '--type', 'todo',
			'--status', 'needs-triage', '--summary', 'second', '--first-seen', '2026-01-02',
		])
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

test('add names every flag it is missing, not the first one', async () => {
	// The validator reports everything it finds in one pass; argument checking reported one
	// thing per run, so a bare `add` cost four round trips to learn four things the tool
	// already knew. Two ways of reporting the same class of mistake is a real cost — people
	// learn the habit of whichever they met first.
	await inTempDir(async () => {
		const { io } = capture()
		await run(['init'], io)
		await assert.rejects(() => run(['add', '--source', 'local'], io), /add requires --id, --type, --status/)
	})
})

test('remove hands back the grep, with the ids in it', async () => {
	// It used to print the same three lines whether or not there was anything to find, which
	// is a warning that carries no information — and the tool holds the one literal string
	// the reader would have to grep for. `.git` is excluded because the history keeps these
	// ids forever and is meant to: without it the check can never come back clean.
	await inTempDir(async () => {
		const { io, err } = capture()
		await run(['init'], io)
		await run(['add', '--id', 'todo-1', '--source', 'local', '--type', 'todo', '--status', 'needs-triage', '--summary', 'a'], io)
		await run(['remove', 'todo-1'], io)
		const text = err.join('\n')
		assert.match(text, /grep -rnF -e "todo-1" \. --exclude-dir=\.git/)
	})
})

test('show renders lists as lists, because --json is the other command', async () => {
	await inTempDir(async () => {
		const { io, out } = capture()
		await run(['init'], io)
		await run(
			['add', '--id', 'todo-1', '--source', 'local', '--type', 'todo', '--status', 'needs-triage', '--summary', 'a'],
			io
		)
		await run(
			['set-status', 'todo-1', 'implemented', '--evidence', 'source-read', '--local-file', 'src/a.ts', '--next-action', 'none'],
			io
		)
		out.length = 0
		await run(['show', 'todo-1'], io)
		const text = out.join('\n')
		assert.doesNotMatch(text, /[{[]"/, 'a structured field was printed as JSON in the human-readable command')
		assert.match(text, /^summary: a$/m)
		assert.match(text, /^evidence:\n {2}kinds: source-read\n {2}local_files: src\/a\.ts$/m)
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

test('the phase probe names no phase for a ledger that does not validate', async () => {
	// The same argument `retire --check` makes, one command earlier and with more riding on
	// it: this is the first command an agent runs and the only one its routing reads. One
	// mistyped `class` makes every entry terminal, and the phase computed from that is a
	// confident `retire` over a file the validator rejects outright.
	await inTempDir(async () => {
		await seedForkLedger()
		const text = await fs.readFile('docs/backlog.yml', 'utf8')
		await fs.writeFile(
			'docs/backlog.yml',
			text.replace(/- status: needs-triage(\r?\n\s+)class: untriaged/, '- status: needs-triage$1class: dismissed')
		)

		const { io, out } = capture()
		assert.equal(await run(['status'], io), 1)
		assert.doesNotMatch(out.join('\n'), /phase: retire/)
		// The errors themselves, because the commonest one — a merge conflict — carries its
		// own marker lines and is worth nothing behind a second command.
		assert.match(out.join('\n'), /No phase: this ledger does not validate/)
		assert.match(out.join('\n'), /requires `last_reviewed`/)

		const asJson = capture()
		assert.equal(await run(['status', '--json'], asJson.io), 1)
		const payload = JSON.parse(asJson.out.join('\n'))
		assert.equal(payload.phase, null)
		assert.equal(payload.valid, false)
	})
})

test('an empty ledger that records an import is retiring, not seeding', async () => {
	// Three roads reach zero entries and the file distinguishes only one of them. Never
	// seeded is `seed`; drained-and-pruned and emptied-without-deciding are both past
	// seeding, and routing them to the seed reference sends them to "import a pile" three
	// paragraphs above that document's own "seed once, never reconcile".
	await inTempDir(async () => {
		await seedForkLedger()
		await run(['set-status', 'upstream-issue-1', 'non-target', '--reason', 'stale-no-repro'], capture().io)
		await run(['set-status', 'upstream-pr-2', 'non-target', '--reason', 'out-of-project-scope'], capture().io)
		await run(['remove', '--class', 'dismissed'], capture().io)

		const probe = async () => {
			const { io, out } = capture()
			await run(['status', '--json'], io)
			return JSON.parse(out.join('\n'))
		}
		const drained = await probe()
		assert.equal(drained.total, 0)
		assert.equal(drained.phase, 'retire')
		assert.equal(drained.priorSeed, 2)

		// And the limit, stated rather than papered over: strip the one record of the import
		// and nothing left in the file can tell. `hasUpstream` does not answer this — it is
		// about the vocabulary, and is still true here.
		const text = await fs.readFile('docs/backlog.yml', 'utf8')
		await fs.writeFile('docs/backlog.yml', text.replace(/^upstream:\r?\n(?: .*\r?\n)+/m, ''))
		const traceless = await probe()
		assert.equal(traceless.phase, 'seed')
		assert.equal(traceless.priorSeed, null)
		assert.equal(traceless.hasUpstream, true)
	})
})

test('an empty queue names the outstanding work instead of pointing back at the probe', async () => {
	// `next` answered "run `status`", `status` answered `drain`, and the drain reference
	// opens by telling its reader to run `next`. A ledger sits in that loop for as long as
	// its accepted work takes to do, which is most of the time anyone is holding one.
	await inTempDir(async () => {
		await seedForkLedger()
		await run(['set-status', 'upstream-issue-1', 'non-target', '--reason', 'stale-no-repro'], capture().io)
		await run(
			['set-status', 'upstream-pr-2', 'accepted', '--evidence', 'source-read', '--local-file', 'src/a.ts',
				'--next-action', 'port the patch onto the current base'],
			capture().io
		)

		const { io, out } = capture()
		await run(['next'], io)
		assert.doesNotMatch(out.join('\n'), /triage-ledger status/)
		assert.match(out.join('\n'), /work rather than a decision/)
		assert.match(out.join('\n'), /upstream-pr-2\s+\[accepted\]/)

		// And the probe says the same thing rather than reporting a drain with nothing to
		// drain, so neither end of the loop asserts the other one has work.
		const probe = capture()
		await run(['status'], probe.io)
		assert.match(probe.out.join('\n'), /0 undecided/)
		assert.match(probe.out.join('\n'), /outstanding is work, not decisions/)
	})
})

test('the queue serves never-opened entries before ones somebody already read', async () => {
	// `last_reviewed` on an entry that is still undecided is the file's only record that
	// somebody looked and did not decide. A queue in file order hands the next session
	// exactly what the last one read and put down.
	await inTempDir(async () => {
		await seedForkLedger()
		const order = async () => {
			const { io, out } = capture()
			await run(['next', '--json'], io)
			return JSON.parse(out.join('\n')).items.map((item) => item.id)
		}
		assert.deepEqual(await order(), ['upstream-issue-1', 'upstream-pr-2'], 'file order until something is stamped')

		// Re-asserting the status an entry already has is what stamps it, and it is the only
		// move that records "read, not decided" without claiming a decision.
		await run(['set-status', 'upstream-issue-1', 'needs-triage'], capture().io)
		assert.deepEqual(await order(), ['upstream-pr-2', 'upstream-issue-1'])
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

/** A fork-triage ledger with one entry of each type, seeded and undecided. */
async function seedForkLedger() {
	await run(['init', '--profile', 'fork-triage'], capture().io)
	const text = await fs.readFile('docs/backlog.yml', 'utf8')
	await fs.writeFile(
		'docs/backlog.yml',
		text.replace(
			/^vocabulary:/m,
			`upstream:
  repo: acme/renderer
  imported_at: 2026-01-01
  filter: 'updated_at >= 2023-01-01'
  matched: 2
  skipped: 8
  total_open: 10

vocabulary:`
		)
	)
	for (const [id, source, type] of [
		['upstream-issue-1', 'acme/renderer#1', 'issue'],
		['upstream-pr-2', 'acme/renderer#2', 'pull-request'],
	]) {
		await run(
			['add', '--id', id, '--source', source, '--type', type, '--status', 'needs-triage',
				'--summary', 'a thing', '--first-seen', '2026-01-01', ...(type === 'pull-request' ? ['--set', 'upstream_patch=not-assessed'] : [])],
			capture().io
		)
	}
}

test('the shipped reproduction reasons are not usable on a pull request', async () => {
	// The cheapest reason in the shipped vocabulary costs nothing — no destination, no
	// evidence — so it is the one a whole backlog goes into if it goes anywhere at once.
	// "No reproduction was ever provided" is *vacuously* true of a pull request, and a
	// reviewer reading that diff sees a legal reason on a legal entry.
	await inTempDir(async () => {
		await seedForkLedger()
		const { io, out } = capture()
		await assert.rejects(
			run(['set-status', 'upstream-pr-2', 'non-target', '--reason', 'stale-no-repro'], io),
			/declared only for types issue, not `pull-request`/,
			out.join('\n')
		)
		// And the same reason on the entry type it *is* about goes through untouched.
		assert.equal(await run(['set-status', 'upstream-issue-1', 'non-target', '--reason', 'stale-no-repro'], capture().io), 0)
	})
})

test('the gate refuses to answer for a ledger that does not validate', async () => {
	// One word of project data — a status classed `dismissed` instead of `untriaged` —
	// makes every entry terminal and every entry invalid at the same time, and only one of
	// those two facts used to reach the reader. `retire --check` is what a project puts in
	// front of teardown, so "ready" is the one answer it must not give here.
	await inTempDir(async () => {
		await seedForkLedger()
		const text = await fs.readFile('docs/backlog.yml', 'utf8')
		await fs.writeFile(
			'docs/backlog.yml',
			text.replace(/- status: needs-triage(\r?\n\s+)class: untriaged/, '- status: needs-triage$1class: dismissed')
		)

		const { io, out } = capture()
		assert.equal(await run(['retire', '--check'], io), 1)
		assert.match(out.join('\n'), /does not validate \(4 error\(s\)\)/)
		assert.doesNotMatch(out.join('\n'), /Ready to retire/)

		// The other two modes still answer, because a broken ledger is exactly when you want
		// to look at it — but they say what they are reading from.
		const distil = capture()
		assert.equal(await run(['retire', '--distil'], distil.io), 0)
		assert.match(distil.err.join('\n'), /does not validate/)
	})
})

test('the gate says a path check is not a content check', async () => {
	// `retire_to` is verified by resolving a path, and it cannot be verified further here:
	// this gate runs *before* `--distil` produces the sentences. A reason pointed at a file
	// that never got its paragraph passes, so the words have to stop claiming otherwise.
	await inTempDir(async () => {
		await seedForkLedger()
		await run(['set-status', 'upstream-issue-1', 'non-target', '--reason', 'stale-no-repro'], capture().io)
		await run(['set-status', 'upstream-pr-2', 'non-target', '--reason', 'out-of-project-scope'], capture().io)
		// Every declared destination, not only the ones this ledger used — completeness is
		// checked against the vocabulary. Both files exist and neither mentions a decision.
		await fs.writeFile('docs/project-target.md', '# Nothing about any of this\n')
		await fs.writeFile('docs/architecture.md', '# Also nothing\n')

		const { io, out } = capture()
		assert.equal(await run(['retire', '--check'], io), 0)
		const text = out.join('\n')
		assert.match(text, /every declared `retire_to` path resolves/)
		assert.match(text, /path check and not a content check/)
	})
})

test('removing an entry nobody decided says so', async () => {
	// Pruning and deleting the question are the same command. §6 sanctions removing a
	// terminal entry — the decision is in the commit and the file is meant to shrink — and
	// removing anything else leaves a ledger that validates, owes nothing, and is ready to
	// retire having decided nothing. A warning rather than a refusal: removing something
	// that should never have been seeded is legitimate, and refusing sends that edit to a
	// text editor where it is done less carefully.
	await inTempDir(async () => {
		await seedForkLedger()
		await run(['set-status', 'upstream-issue-1', 'non-target', '--reason', 'stale-no-repro'], capture().io)

		const decided = capture()
		assert.equal(await run(['remove', 'upstream-issue-1'], decided.io), 0)
		assert.doesNotMatch(decided.err.join('\n'), /deletes the question/)

		const undecided = capture()
		assert.equal(await run(['remove', 'upstream-pr-2'], undecided.io), 0)
		const warning = undecided.err.join('\n')
		assert.match(warning, /never decided, so removing it deletes the question/)
		assert.match(warning, /upstream-pr-2 {2}\[needs-triage\]/)
	})
})

test('nothing to distil is said out loud, because that is how a gamed ledger ends', async () => {
	// Every thorough way of emptying this file without deciding anything arrives here:
	// delete the entries and there is nothing to group, mistype a class and every entry is
	// terminal and none is dismissed. Printing the preamble and stopping reads as "done",
	// and hands the writer a blank page to draft the record from.
	await inTempDir(async () => {
		await seedForkLedger()
		await run(['remove', '--class', 'untriaged'], capture().io)

		const { io, out } = capture()
		assert.equal(await run(['retire', '--distil'], io), 0)
		const text = out.join('\n')
		assert.match(text, /Nothing to distil: no entry in this ledger carries a dismissal reason/)
		assert.match(text, /entries were removed rather than decided/)
		assert.match(text, /git log -- docs\/backlog\.yml/)
	})
})

test('the retirement summary counts what was pruned, because the upstream block knows', async () => {
	// The kept count is drawn from entries still in the file, and §6 tells you to prune each
	// entry as it closes — so following both rules in the obvious order reports the opposite
	// of what happened. Warning about that in prose was the old fix; `upstream.matched` is
	// the number that was imported and it is in the same sentence.
	await inTempDir(async () => {
		await seedForkLedger()
		await run(
			['set-status', 'upstream-issue-1', 'implemented', '--next-action', 'none',
				'--evidence', 'source-read', '--local-file', 'src/a.ts', '--date', '2026-02-02'],
			capture().io
		)
		// A scope reason, not a reproduction one — the shipped reproduction reasons now decline
		// to be applied to a pull request, which is the point of the rule two tests up.
		await run(['set-status', 'upstream-pr-2', 'non-target', '--reason', 'out-of-project-scope', '--date', '2026-02-02'], capture().io)

		const before = capture()
		await run(['retire', '--summary'], before.io)
		assert.match(before.out.join('\n'), /Kept 1, dropped 1\./)
		assert.doesNotMatch(before.out.join('\n'), /already been pruned/)

		await run(['remove', 'upstream-issue-1'], capture().io)
		const after = capture()
		await run(['retire', '--summary'], after.io)
		const text = after.out.join('\n')
		// The count still reads 0, and it has to — the entry is gone. What is new is that the
		// draft says so, in the sentence somebody is about to paste into their own docs.
		assert.match(text, /Kept 0, dropped 1\./)
		assert.match(text, /A further 1 entry has already been pruned from this ledger/)
		assert.match(text, /git log -- docs\/backlog\.yml/)

		const { io, out } = capture()
		await run(['retire', '--summary', '--json'], io)
		const payload = JSON.parse(out.join('\n'))
		assert.equal(payload.pruned, 1)
		assert.equal(payload.imported, 2)
		assert.equal(payload.stillPresent, 1)
	})
})

test('the retirement summary attributes to the upstream only what came from it', async () => {
	// `upstream:` describes one import (§3) and a kind with no `source_pattern` was never in
	// it. Counting every type into the "inherited from `repo`" clause credits somebody else's
	// issue tracker with a `todo` you wrote down and with whatever a local scan produced —
	// in the sentence §6 calls the one artifact that outlives everything.
	await inTempDir(async () => {
		await seedForkLedger()
		const text = await fs.readFile('docs/backlog.yml', 'utf8')
		await fs.writeFile(
			'docs/backlog.yml',
			text.replace(/^ {2}- type: todo$/m, "  - type: advisory\n    source_pattern: '^GHSA-'\n  - type: todo")
		)
		for (const [id, source, type] of [
			['local-1', 'local', 'todo'],
			['adv-1', 'GHSA-aaaa-bbbb-cccc', 'advisory'],
			['adv-2', 'GHSA-dddd-eeee-ffff', 'advisory'],
		]) {
			await run(
				['add', '--id', id, '--source', source, '--type', type, '--status', 'needs-triage',
					'--summary', 'a thing', '--first-seen', '2026-01-01'],
				capture().io
			)
		}

		const { io, out } = capture()
		await run(['retire', '--summary'], io)
		const draft = out.join('\n')
		assert.match(draft, /2 advisories inherited from `acme\/renderer`/)
		assert.match(draft, /, and 1 todo raised in this project\. Kept /)
		assert.doesNotMatch(draft, /todos? inherited/)
		// The type name is the project's, so the plural has to be computed. `advisorys` was
		// what appending `s` produced, and it was in the artifact somebody pastes into docs.
		assert.doesNotMatch(draft, /advisorys/)
	})
})
