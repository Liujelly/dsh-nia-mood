import test from 'node:test'
import assert from 'node:assert/strict'
import { DIMS, zeroDims, parseAssessment, relax, changeState, contextLine } from '../lib/emotion.js'

const state = () => ({ mood: 70, dims: zeroDims(), lastDecayAt: 0, updatedAt: 0,
  lastReason: '', lastConfidence: 0, lastNotedMood: 70, timeline: [] })
const result = (overrides = {}) => ({ moodDelta: -3, dims: { anger: 5, hurt: 2 },
  confidence: 85, reason: '用户否定了妮娅的努力，她当时收回了热情。', ...overrides })

test('valid anger and hurt are accepted, with all dimensions present', () => {
  const d = parseAssessment(JSON.stringify(result()))
  assert.equal(Object.keys(d.dims).length, 12)
  assert.equal(d.dims.anger, 5)
  const s = changeState(state(), d, 0, false, 100)
  assert.equal(s.mood, 69)
  assert.equal(s.dims.hurt, 2)
})

test('reject malformed, missing confidence, nonfinite, boolean and incomplete data', () => {
  for (const s of ['not json', '{}', '[]', '{"moodDelta":1e309}',
    JSON.stringify(result({ confidence: null })), JSON.stringify(result({ moodDelta: '3' })),
    JSON.stringify(result({ dims: { anger: true } })), JSON.stringify(result({ reason: '' }))]) {
    assert.equal(parseAssessment(s), null, s)
  }
})

test('accept fenced JSON, clamp outliers, ignore unknown dimension names', () => {
  const d = parseAssessment('```json\n' + JSON.stringify(result({ moodDelta: -500, dims: { anger: 500, fake: 10 }, confidence: 300 })) + '\n```')
  assert.equal(d.moodDelta, -10)
  assert.equal(d.dims.anger, 10)
  assert.equal(d.confidence, 100)
  assert.equal(d.dims.fake, undefined)
})

test('neutral replies and repair can return zero or negative emotion deltas', () => {
  assert.equal(parseAssessment(JSON.stringify(result({ moodDelta: 0, dims: {}, reason: '' }))).moodDelta, 0)
  const s = state(); s.dims.anger = 8
  changeState(s, parseAssessment(JSON.stringify(result({ moodDelta: 3, dims: { anger: -5, calm: 3 } }))), 0, false, 100)
  assert.equal(s.dims.anger, 3)
  assert.equal(s.dims.calm, 3)
})

test('small positive and negative changes accumulate symmetrically', () => {
  const positive = state(), negative = state()
  for (let i = 1; i <= 3; i++) {
    changeState(positive, result({ moodDelta: 1, dims: zeroDims() }), 0, true, i)
    changeState(negative, result({ moodDelta: -1, dims: zeroDims() }), 0, true, i)
  }
  assert.ok(Math.abs(positive.mood - 71) < 1e-10)
  assert.ok(Math.abs(negative.mood - 69) < 1e-10)
})

test('frequent polling yields the same decay as one elapsed-time calculation', () => {
  const a = state(); a.mood = 30; a.dims.anger = 40; a.dims.hurt = 40
  a.lastReason = '此前发生分歧'; a.lastConfidence = 90
  const b = structuredClone(a)
  for (let time = 20000; time <= 12 * 3600000; time += 20000) relax(a, 70, time, 12)
  relax(b, 70, 12 * 3600000, 12)
  assert.ok(Math.abs(a.mood - b.mood) < 1e-8)
  assert.ok(Math.abs(a.dims.hurt - 20) < 1e-8)
  assert.ok(Math.abs(a.dims.anger - 10) < 1e-8)
  assert.equal(a.lastReason, '此前发生分歧')
  assert.equal(a.timeline.length, 0)
})

test('injection is internal, does not claim repair, and does not invent a relationship', () => {
  const s = changeState(state(), parseAssessment(JSON.stringify(result())), 0, false, 100)
  const text = contextLine(s, 'event')
  assert.match(text, /内部记录/)
  assert.match(text, /无需念出/)
  assert.match(text, /不代表已经原谅/)
  assert.equal(contextLine(s, 'off'), '')
  assert.ok(!contextLine(s, 'label').includes(s.lastReason))
  assert.equal(contextLine(state(), 'event'), '')
})

test('bounds hold for all dimensions and event timestamps stay unique', () => {
  const s = state(); s.mood = 0
  const d = result({ moodDelta: -10, dims: Object.fromEntries(DIMS.map(([k]) => [k, -10])) })
  changeState(s, d, 0, false, 100); changeState(s, d, 0, false, 100)
  assert.equal(s.mood, 0)
  assert.equal(s.updatedAt, 101)
  for (const v of Object.values(s.dims)) assert.equal(v, 0)
})
