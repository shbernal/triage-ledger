/**
 * Property-based fuzzing of the line surgery.
 *
 * The example-based tests next door each pin one behaviour against one fixture. What they
 * cannot cover is the interaction: a mutation is correct in isolation and wrong as the
 * ninth in a sequence, on a file whose entry it is aimed at happens to be the last one, in
 * a ledger whose comment sits where the block boundary is computed. Line surgery is
 * arithmetic on line indices, and arithmetic on line indices fails at the edges.
 *
 * So: generate a ledger, apply a random legal sequence of mutations, and after every step
 * assert the things surgery exists to promise. The generator is random where randomness
 * finds bugs — names, summaries, comment placement, entry count, line endings, the order
 * of operations — and fixed in shape, because a randomly-shaped ledger is mostly an
 * invalid one and the mutations refuse to touch those by design.
 *
 * Every run is seeded and the seed is printed on failure, so a failure is reproducible
 * rather than a story about a build that went red once. `FUZZ_RUNS` and `FUZZ_SEED`
 * override the defaults for a longer soak.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { parseLedgerText } from '../src/ledger.mjs'
import { validateLedgerText } from '../src/validate.mjs'
import {
	addLedgerItemText,
	findItemBlocks,
	removeLedgerItemText,
	setLedgerItemStatusText,
	updateLedgerItemText,
} from '../src/surgery.mjs'
import { HOSTILE_SUMMARY } from './fixtures.mjs'

const RUNS = Number(process.env.FUZZ_RUNS || 150)
const FIRST_SEED = Number(process.env.FUZZ_SEED || 1)

// ------------------------------------------------------------------------------ random

function mulberry32(seed) {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

const int = (rng, n) => Math.floor(rng() * n)
const pick = (rng, list) => list[int(rng, list.length)]
const chance = (rng, p) => rng() < p

function shuffled(rng, list) {
	const copy = [...list]
	for (let i = copy.length - 1; i > 0; i -= 1) {
		const j = int(rng, i + 1)
		;[copy[i], copy[j]] = [copy[j], copy[i]]
	}
	return copy
}

/**
 * Nonsense vocabulary, on purpose.
 *
 * Same reasoning as `NONSENSE_LEDGER`: if any of these words could change the outcome,
 * a project's vocabulary has leaked into the tool. Here it also buys the ordinary fuzzing
 * benefit, since the names end up in ids, in `retire_to` paths and in list values.
 */
const WORDS = [
	'blorp', 'zonk', 'quux', 'frob', 'snee', 'wibble', 'glark', 'plugh',
	'xyzzy', 'thud', 'bazola', 'fnord', 'grault', 'garply', 'waldo', 'corge',
]

/**
 * Summaries chosen to break quoting, not to read well.
 *
 * No line terminator appears here, and that is a rule rather than an oversight: §3 makes a
 * line break in a summary illegal, so a generated one would only ever exercise the
 * validator's refusal — which `surgery.test.mjs` asserts directly — while costing this
 * fuzzer every sequence that happened to pick it.
 */
const SUMMARIES = [
	HOSTILE_SUMMARY,
	'plain',
	'a & b',
	'  leading and trailing  ',
	'ends in a tab\t',
	'a "quoted" word',
	'key: value',
	'#starts with a hash',
	'- starts with a dash',
	'null',
	'true',
	'123',
	'emoji 🎉 and non-ascii ü',
	'backtick `cmd` and $HOME',
	'{a: b} [1, 2] | > *anchor',
	'a\\backslash\\path',
]

const DATES = ['2026-01-01', '2026-01-17', '2025-12-31', '2024-02-29', '2026-03-08']

// --------------------------------------------------------------------------- generator

/**
 * A valid ledger, plus the facts a mutation needs to stay legal.
 *
 * Shape is fixed and content is random. The alternative — generating the document
 * structure too — spends the whole budget producing files the mutations correctly refuse
 * to touch, which tests the guard and nothing behind it.
 */
function generateLedger(rng) {
	const eol = chance(rng, 0.5) ? '\r\n' : '\n'
	const words = shuffled(rng, WORDS)
	const vocab = {
		type: words[0],
		untriaged: words[1],
		parked: words[2],
		dismissed: words[3],
		accepted: words[4],
		done: words[5],
		policyReason: words[6],
		stateReason: words[7],
		kindA: words[8],
		kindB: words[9],
	}

	const lines = []
	const comments = []
	// A comment is only load-bearing where someone would actually write one, so they are
	// offered at the anchors the format invites and taken at random.
	const maybeComment = (where) => {
		if (!chance(rng, 0.6)) return
		const text = '# ' + where + ' — ' + pick(rng, WORDS) + ' ' + int(rng, 1000)
		comments.push(text)
		lines.push(text)
	}

	lines.push('schema: 1')
	lines.push('purpose: >')
	lines.push('  A generated fixture. This folded scalar must survive every mutation, and so')
	lines.push('  must its second line, which is the part a dumper reflows.')
	lines.push('')
	maybeComment('above source_kinds')
	lines.push('source_kinds:')
	lines.push('  - type: ' + vocab.type)
	lines.push('')
	lines.push('vocabulary:')
	lines.push('  statuses:')
	for (const [name, cls] of [
		[vocab.untriaged, 'untriaged'],
		[vocab.parked, 'parked'],
		[vocab.dismissed, 'dismissed'],
		[vocab.accepted, 'accepted'],
		[vocab.done, 'done'],
	]) {
		lines.push('    - status: ' + name)
		lines.push('      class: ' + cls)
	}
	lines.push('')
	maybeComment('inside the vocabulary block')
	lines.push('  non_target_reasons:')
	lines.push('    - reason: ' + vocab.policyReason)
	lines.push('      describes: >')
	lines.push('        A folded scalar inside a list inside a mapping, which is the shape')
	lines.push('        that a round trip through a parser mangles first.')
	lines.push('      about: project-policy')
	lines.push('      retire_to: docs/' + vocab.policyReason + '.md')
	lines.push('    - reason: ' + vocab.stateReason)
	lines.push('      describes: Nobody could reproduce it.')
	lines.push('      about: item-state')
	lines.push('      retire_to: null')
	lines.push('      requires_evidence: [' + vocab.kindA + ']')
	lines.push('')
	lines.push('  evidence_kinds:')
	lines.push('    - kind: ' + vocab.kindA)
	lines.push('      describes: Actually ran it.')
	lines.push('    - kind: ' + vocab.kindB)
	lines.push('      describes: Read the source and cited files.')
	lines.push('')
	maybeComment('directly above items')

	const count = int(rng, 6)
	lines.push(count === 0 ? 'items: []' : 'items:')
	for (let i = 0; i < count; i += 1) {
		lines.push('  - id: e' + (i + 1))
		lines.push('    source: local')
		lines.push('    type: ' + vocab.type)
		lines.push('    summary: ' + JSON.stringify(pick(rng, SUMMARIES)))
		lines.push('    status: ' + vocab.untriaged)
		lines.push('    first_seen: ' + pick(rng, DATES))
		maybeComment('trailing entry e' + (i + 1))
	}

	return { text: lines.map((line) => line + eol).join(''), eol, vocab, nextId: count + 1 }
}

// -------------------------------------------------------------------------- inspection

const commentsIn = (text) => text.split(/\r?\n/).filter((line) => /^\s*#/.test(line))

/** Everything above the `items:` line: the header, the block scalars and the vocabulary. */
const headerOf = (text) => text.slice(0, text.search(/^items:/m))

const itemsOf = (text) => parseLedgerText(text).data?.items ?? []

function blockTextById(text) {
	const map = new Map()
	for (const block of findItemBlocks(text).blocks) map.set(block.item?.id, block.text)
	return map
}

// -------------------------------------------------------------------------- operations

/**
 * The next legal move for one entry, or null.
 *
 * Only forward: an entry moves out of `untriaged` once and out of `accepted` once, and a
 * terminal entry stops. Backwards transitions are not modelled because they are not what
 * the lifecycle does, and generating them would test the validator's opinion about
 * leftover fields rather than the surgery.
 */
function statusMove(rng, vocab, item) {
	if (item.status === vocab.untriaged) {
		const target = pick(rng, ['parked', 'dismissed', 'accepted'])
		if (target === 'parked') return { status: vocab.parked, fields: {} }
		if (target === 'accepted') {
			return { status: vocab.accepted, fields: { next_action: pick(rng, SUMMARIES), evidence: { kinds: [vocab.kindA] } } }
		}
		// Both reasons, because one of them demands evidence of a named kind and the other
		// does not — the two-sided cost is only exercised if both sides get taken.
		return chance(rng, 0.5)
			? { status: vocab.dismissed, fields: { non_target_reasons: [vocab.policyReason] } }
			: {
					status: vocab.dismissed,
					fields: { non_target_reasons: [vocab.stateReason], evidence: { kinds: [vocab.kindA] } },
				}
	}
	if (item.status === vocab.accepted) {
		// `done` costs more than `accepted`: `next_action` must say there is none, and the
		// evidence must name files. The block is replaced whole, so it is resupplied whole.
		return {
			status: vocab.done,
			fields: {
				next_action: 'none',
				evidence: { kinds: [vocab.kindA], local_files: ['src/' + pick(rng, WORDS) + '.mjs'] },
			},
		}
	}
	return null
}

// ------------------------------------------------------------------------------- tests

test('every generated ledger is valid before anything touches it', () => {
	// A generator bug must be reported as a generator bug. Without this, a malformed
	// document shows up below as `mutation would leave an invalid ledger` and reads like a
	// defect in the code under test.
	for (let seed = FIRST_SEED; seed < FIRST_SEED + RUNS; seed += 1) {
		const { text } = generateLedger(mulberry32(seed))
		assert.deepEqual(validateLedgerText(text).report.errors, [], 'generated ledger invalid at seed ' + seed)
	}
})

test('a random mutation sequence disturbs nothing it was not aimed at', () => {
	for (let seed = FIRST_SEED; seed < FIRST_SEED + RUNS; seed += 1) {
		const rng = mulberry32(seed)
		const state = generateLedger(rng)
		const log = []

		try {
			const steps = 3 + int(rng, 8)
			for (let step = 0; step < steps; step += 1) {
				const before = state.text
				const items = itemsOf(before)
				const blocksBefore = blockTextById(before)

				// Choose an operation that is legal right now, so a throw is a real failure
				// rather than the test asking for something the spec forbids.
				const choices = ['add']
				if (items.length > 0) choices.push('update', 'remove', 'status')
				const op = pick(rng, choices)

				let after
				let expected
				let touched

				if (op === 'add') {
					const item = {
						id: 'e' + state.nextId,
						source: 'local',
						type: state.vocab.type,
						status: state.vocab.untriaged,
						summary: pick(rng, SUMMARIES),
						first_seen: pick(rng, DATES),
					}
					state.nextId += 1
					log.push('add ' + item.id + ' ' + JSON.stringify(item.summary))
					after = addLedgerItemText(before, item, item.first_seen)
					expected = [...items, item]
					touched = item.id
				} else {
					const target = pick(rng, items)
					touched = target.id

					if (op === 'update') {
						const summary = pick(rng, SUMMARIES)
						log.push('update ' + target.id + ' summary=' + JSON.stringify(summary))
						after = updateLedgerItemText(before, target.id, { summary })
						expected = items.map((item) => (item.id === target.id ? { ...item, summary } : item))
					} else if (op === 'remove') {
						log.push('remove ' + target.id)
						after = removeLedgerItemText(before, target.id)
						expected = items.filter((item) => item.id !== target.id)
					} else {
						const move = statusMove(rng, state.vocab, target)
						if (!move) continue
						const reviewDate = pick(rng, DATES)
						log.push('status ' + target.id + ' -> ' + move.status)
						after = setLedgerItemStatusText(before, target.id, move.status, { reviewDate, fields: move.fields })
						const patch = { status: move.status, last_reviewed: reviewDate, ...move.fields }
						expected = items.map((item) => (item.id === target.id ? { ...item, ...patch } : item))
					}
				}

				// 1. The ledger is still valid. The mutations assert this themselves; it is
				//    repeated because a mutation that stopped asserting it would otherwise
				//    fail silently here.
				assert.deepEqual(validateLedgerText(after).report.errors, [], 'mutation left errors behind')

				// 2. The parsed model changed by exactly the intended edit, and in order.
				assert.deepEqual(itemsOf(after), expected, 'the parsed ledger is not what the mutation asked for')

				// 3. Everything above `items:` is byte-identical — the purpose block scalar,
				//    the vocabulary, its folded `describes`, its comments and its key order.
				//    This is the whole reason line surgery exists instead of parse-and-dump.
				assert.equal(headerOf(after), headerOf(before), 'the document above `items:` was rewritten')

				// 4. Untouched entries are byte-identical. Not merely equal when parsed:
				//    a re-emitted neighbour is a diff nobody asked for, and at 337 entries
				//    it is a diff nobody can review.
				const blocksAfter = blockTextById(after)
				for (const [id, text] of blocksBefore) {
					if (id === touched) continue
					assert.equal(blocksAfter.get(id), text, 'entry ' + id + ' was rewritten by a mutation aimed at ' + touched)
				}

				// 5. Comments survive, except any that lived inside a removed entry — those
				//    are the entry's own and go with it.
				const lost = op === 'remove' ? commentsIn(blocksBefore.get(touched) ?? '') : []
				const expectedComments = commentsIn(before).filter((line) => !lost.includes(line))
				assert.deepEqual(commentsIn(after), expectedComments, 'a comment was eaten')

				// 6. Line endings stay uniform. A mixed-ending file is a whole-file diff on
				//    the next commit, which hides the one line that actually changed.
				if (state.eol === '\r\n') assert.ok(!/(?<!\r)\n/.test(after), 'a bare LF was introduced into a CRLF file')
				else assert.ok(!after.includes('\r'), 'a CR was introduced into an LF file')

				state.text = after
			}
		} catch (error) {
			error.message =
				error.message +
				'\n\nseed ' + seed + ', reproduce with FUZZ_SEED=' + seed + ' FUZZ_RUNS=1' +
				'\noperations:\n' + log.map((line) => '  ' + line).join('\n') +
				'\nledger:\n' + state.text
			throw error
		}
	}
})
