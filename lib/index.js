import { sessionCatalog } from './catalog.js'
// Derived from dsh-feiyu-mood 0.7.3 (MIT, Yuuyuko-uu). See NOTICE.txt.

import { readFileSync, writeFileSync, mkdirSync, renameSync, readdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { createLinkedMood, projectLinkedMoods } from './linked.js'
import { resetCurrent, historyPage } from './management.js'
import { DIMS, PERSONA, zeroDims, finite, assessmentPrompt, parseAssessment, relax, changeState, contextLine } from './emotion.js'

export const name = 'nia-mood'
export const inject = ['systemPrompt', 'agents', 'webServer', 'llm', 'timer']

const CFG_DIR = process.env.DSH_HOME || join(homedir(), '.dsh')
const STORE_DIR = join(CFG_DIR, 'nia-mood')
const STATE_PATH = join(STORE_DIR, 'state.json')
const CONFIG_PATH = join(STORE_DIR, 'config.json')
const DIAG = join(STORE_DIR, 'diag.log')
function diag(msg) {
  try {
    mkdirSync(STORE_DIR, { recursive: true })
    writeFileSync(DIAG, new Date().toISOString() + '  ' + msg + '\n', { flag: 'a' })
  } catch (e) { /* 诊断失败不影响主流程 */ }
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n))
}

function sessionIdOf(session) {
  if (!session) return ''
  for (const k of ['id', 'sessionId', 'key', 'sessionKey', 'sid']) {
    try {
      const v = session[k]
      if (typeof v === 'string' && v) return v
    } catch (e) { /* ignore */ }
  }
  return ''
}

function fullTextOf(p, 深度) {
  const 层 = 深度 || 0
  if (!p || 层 > 6) return ''
  if (typeof p === 'string') return p
  if (p.type === 'reasoning' || p.type === 'reasoning-delta') return ''
  if (typeof p.text === 'string' && Array.isArray(p.content) === false && !p.message) return p.text
  if (typeof p.content === 'string') return p.content
  if (p.message && typeof p.message === 'object') {
    const inner = fullTextOf(p.message, 层 + 1)
    if (inner) return inner
  }
  if (Array.isArray(p.content)) {
    const 正文 = []
    const 思考 = []
    for (const b of p.content) {
      if (typeof b === 'string') { 正文.push(b); continue }
      if (!b) continue
      if (b.type === 'text' && typeof b.text === 'string') 正文.push(b.text)
      else if (b.type === 'reasoning' && typeof b.text === 'string') 思考.push(b.text)
      else if (typeof b.text === 'string' && b.type === undefined) 正文.push(b.text)
    }
    if (正文.length) return 正文.join(' ')
    // Hidden reasoning is never used as dialogue evidence.
  }
  if (typeof p.text === 'string') return p.text
  return ''
}

function textOfMessage(p) {
  return fullTextOf(p).slice(0, 2000)
}

function stripBridgePrefix(s) {
  const t = String(s || '')
  const 标记 = ['【主人私信】', '【私信】', '【评论】', '【弹幕】', '【@'] 
  let 最后 = -1
  let 长度 = 0
  for (const m of 标记) {
    const i = t.lastIndexOf(m)
    if (i > 最后) { 最后 = i; 长度 = m.length }
  }
  if (最后 < 0) return t
  let 后 = t.slice(最后 + 长度).replace(/^[）)\]】\s]*/, '')
  const 冒号 = 后.slice(0, 80).search(/[：:]/)
  if (冒号 > 0 && /mid\s*\d+|私信|消息/i.test(后.slice(0, 冒号))) 后 = 后.slice(冒号 + 1)
  return 后.trim() || t
}

const DEFAULT_SESSION = ''

const DEFAULTS = {
  targetSession: DEFAULT_SESSION,
  模式: 'session',
  slots: [],   // ⭐ 多份心情：{ id, label, selfName, ownerName, 工作区, sessions: [...] } 的清单（空 = 只有 targetSession 那一份）
  selfName: '当前角色',
  ownerName: '用户',
  selfAliases: '',   // TA 平时怎么叫你（逗号分隔）：判断时这些词是「在叫你」，不是名词的一部分
  judgeProvider: '', // 判断心情用哪个 provider（留空 = 跟着当前会话的模型走）
  judgeModel: '',    // 判断心情用哪个 model（留空 = 跟着当前会话）
  moodBase: 70,
  moodFloor: 0,
  decayHalfHours: 12,
  injectMode: 'event',
  injectConfidence: 60,
  sigMood: 3,   // 心情涨跌够这个数（原始值；心情实际只吃 1/3）
  sigDim: 5,    // 或者某一根情绪涨跌够这个数（心疼+5、担心+5 这种"突然一下"才触发）
  injectPerDay: 6,
  autoJudge: true,
  judgeConfidence: 55,
  personaContext: PERSONA,
  relationshipContext: '关系由实际相处决定，未明确时不预设恋爱或伴侣。',
}

const INJECT_MODES = ['off', 'label', 'event']

function loadConfig() {
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
    const slots = 规整份数(raw.slots, String(raw.targetSession || DEFAULT_SESSION).trim())
    const 第一个会话 = (slots.find((p) => p.sessions.length) || { sessions: [] }).sessions[0] || DEFAULT_SESSION
    return {
      slots,
      模式: 规整模式(raw.模式 ?? raw.mode),
      targetSession: 第一个会话,
      selfName: String(raw.selfName || DEFAULTS.selfName).trim().slice(0, 60) || DEFAULTS.selfName,
      ownerName: String(raw.ownerName || DEFAULTS.ownerName).trim().slice(0, 16) || DEFAULTS.ownerName,
      selfAliases: String(raw.selfAliases || '').trim().slice(0, 60),
      judgeProvider: String(raw.judgeProvider || '').trim().slice(0, 60),
      judgeModel: String(raw.judgeModel || '').trim().slice(0, 80),
      moodBase: clamp(Math.round(Number(raw.moodBase) || DEFAULTS.moodBase), 30, 100),
      moodFloor: clamp(Math.round(Number(raw.moodFloor) || 0), 0, 100),
      injectMode: INJECT_MODES.includes(String(raw.injectMode || ''))
        ? String(raw.injectMode)
        : (raw.injectMood === false ? 'off' : DEFAULTS.injectMode),
      injectConfidence: clamp(Math.round(Number(raw.injectConfidence ?? DEFAULTS.injectConfidence) || 0), 0, 100),
      decayHalfHours: clamp(Math.round(Number(raw.decayHalfHours ?? DEFAULTS.decayHalfHours) || 0), 1, 168),
      sigMood: clamp(Math.round(Number(raw.sigMood ?? DEFAULTS.sigMood) || 0), 1, 30),
      sigDim: clamp(Math.round(Number(raw.sigDim ?? DEFAULTS.sigDim) || 0), 1, 100),
      injectPerDay: clamp(Math.round(Number(raw.injectPerDay ?? DEFAULTS.injectPerDay) || 0), 0, 50),
      autoJudge: raw.autoJudge !== false,
      judgeConfidence: clamp(finite(raw.judgeConfidence, 55), 0, 100),
      personaContext: String(raw.personaContext || PERSONA).slice(0, 3000),
      relationshipContext: String(raw.relationshipContext || DEFAULTS.relationshipContext).slice(0, 1500),
    }
  } catch (e) {
    return { ...DEFAULTS, slots: 规整份数([], DEFAULTS.targetSession), 模式: DEFAULTS.模式 }
  }
}

function saveConfig(next) {
  try {
    mkdirSync(STORE_DIR, { recursive: true })
    const tmp = CONFIG_PATH + '.tmp'
    writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8')
    renameSync(tmp, CONFIG_PATH)
  } catch (e) { diag('保存配置失败：' + (e && e.message)); throw e }
}

function patchConfig(cfg, patch) {
  const next = { ...cfg }
  if (patch?.模式 != null) next.模式 = 规整模式(patch.模式)
  if (patch?.mode != null) next.模式 = 规整模式(patch.mode)
  if (Array.isArray(patch?.slots)) {
    const 上一版 = 规整份数(next.slots, '')
    next.slots = 规整份数(patch.slots, '', 上一版)
      .map((p) => (p.id ? p : { ...p, id: 新份键() }))
    next.targetSession = (next.slots.find((p) => p.sessions.length) || { sessions: [] }).sessions[0] || ''
  } else if (typeof patch?.targetSession === 'string') {
    const 新会话 = patch.targetSession.trim()
    const 现有 = 规整份数(next.slots, next.targetSession)
    const 第一份 = 现有[0] || { id: 兜底键, label: '', selfName: '', ownerName: '', sessions: [] }
    现有[0] = {
      ...第一份,
      id: 第一份.id || 会话键(新会话) || 兜底键,
      sessions: 新会话 ? [新会话] : [],
    }
    next.slots = 规整份数(现有, '')
    next.targetSession = 新会话
  }
  if (typeof patch?.selfName === 'string' && patch.selfName.trim()) next.selfName = patch.selfName.trim().slice(0, 60)
  if (typeof patch?.ownerName === 'string' && patch.ownerName.trim()) next.ownerName = patch.ownerName.trim().slice(0, 16)
  if (typeof patch?.selfAliases === 'string') next.selfAliases = patch.selfAliases.trim().slice(0, 60)
  if (typeof patch?.judgeProvider === 'string') next.judgeProvider = patch.judgeProvider.trim().slice(0, 60)
  if (typeof patch?.judgeModel === 'string') next.judgeModel = patch.judgeModel.trim().slice(0, 80)
  if (patch?.moodBase != null) next.moodBase = clamp(Math.round(Number(patch.moodBase) || DEFAULTS.moodBase), 30, 100)
  if (patch?.moodFloor != null) next.moodFloor = clamp(Math.round(Number(patch.moodFloor) || 0), 0, 100)
  if (typeof patch?.injectMode === 'string' && INJECT_MODES.includes(patch.injectMode)) next.injectMode = patch.injectMode
  if (patch?.injectConfidence != null) next.injectConfidence = clamp(Math.round(Number(patch.injectConfidence) || 0), 0, 100)
  if (patch?.decayHalfHours != null) next.decayHalfHours = clamp(Math.round(Number(patch.decayHalfHours) || 0), 1, 168)
  if (patch?.sigMood != null) next.sigMood = clamp(Math.round(Number(patch.sigMood) || 0), 1, 30)
  if (patch?.sigDim != null) next.sigDim = clamp(Math.round(Number(patch.sigDim) || 0), 1, 100)
  if (patch?.injectPerDay != null) next.injectPerDay = clamp(Math.round(Number(patch.injectPerDay) || 0), 0, 50)
  if (typeof patch?.autoJudge === 'boolean') next.autoJudge = patch.autoJudge
  if (typeof patch?.personaContext === 'string') next.personaContext = patch.personaContext.trim().slice(0, 3000) || PERSONA
  if (typeof patch?.relationshipContext === 'string') next.relationshipContext = patch.relationshipContext.trim().slice(0, 1500) || DEFAULTS.relationshipContext
  if (typeof patch?.judgeConfidence === 'number') next.judgeConfidence = clamp(finite(patch.judgeConfidence, 55), 0, 100)
  saveConfig(next)
  for (const k of Object.keys(next)) cfg[k] = next[k]
  return cfg
}

function blankState() {
  return {
    mood: 70,
    dims: zeroDims(),
    lastReason: '',
    lastConfidence: 0,   // 上次判断的可信度（0-100）
    injectedFor: 0,      // 已经跟角色说过的那个 updatedAt —— 同一次变化只说一次
    lastInjectedText: '', // ⭐ 真正说出去的那句原文（设置页要照原样显示，不能重新拼）
    lastInjectedAt: 0,
    saidAt: [],           // ⭐ 每次"告诉角色"的时间戳（只留今天够用；用来算日上限）
    lastNotedMood: 70,   // 上次"记过一条"时的心情 —— 用来判断自然平复走够了没有
    minor: false,        // 这次变化是不是小波动（小波动只记账、不告诉角色）
    kind: '',            // '' = 判断出来的变化 / 'decay' = 自己平复的
    updatedAt: Date.now(),
    lastDecayAt: Date.now(),
    processedTurns: {},
    timeline: [], // [{ at, mood, reason, dims }]
  }
}

function normReason(s) { return typeof s === 'string' ? s : '' }

function normState(raw) {
  const d = blankState()
  if (raw && typeof raw === 'object') {
    d.mood = clamp(finite(raw.mood, 70), 0, 100)
    d.lastReason = normReason(raw.lastReason).slice(0, 200)
    d.lastConfidence = clamp(Math.round(Number(raw.lastConfidence) || 0), 0, 100)
    d.injectedFor = Number(raw.injectedFor) || 0
    d.lastNotedMood = Number.isFinite(Number(raw.lastNotedMood)) ? clamp(Math.round(Number(raw.lastNotedMood)), 0, 100) : d.mood
    d.minor = raw.minor === true
    d.kind = String(raw.kind || '')
    d.lastInjectedText = String(raw.lastInjectedText || '').slice(0, 3000)
    d.processedTurns = Object.fromEntries(Object.entries(raw.processedTurns || {}).filter(([k,v]) => typeof v === 'string').slice(-100))
    d.lastInjectedAt = Number(raw.lastInjectedAt) || 0
    d.saidAt = Array.isArray(raw.saidAt) ? raw.saidAt.map(Number).filter((x) => x > 0).slice(-200) : []
    d.updatedAt = Number(raw.updatedAt) || Date.now()
    d.lastDecayAt = Number(raw.lastDecayAt) || d.updatedAt
    if (raw.dims && typeof raw.dims === 'object') {
      for (const [k] of DIMS) d.dims[k] = clamp(finite(raw.dims[k]), 0, 100)
    }
    d.timeline = Array.isArray(raw.timeline) ? raw.timeline.map((t) => ({ ...t, reason: normReason(t.reason) })) : []
  }
  return d
}

const STATE_VERSION = 2
const 兜底键 = '__default__'
let 第一份键 = 兜底键          // 老数据搬家时落到谁头上（apply 里按配置重新算）

export const 会话键 = (v) => {
  const s = String(v == null ? '' : v).trim()
  return s.startsWith('session-') ? s.slice('session-'.length) : s
}

export function 规整份数(rawSlots, targetSession, 旧份 = null) {
  const 收拾会话 = (v) => {
    if (Array.isArray(v)) return v.map((x) => String(x == null ? '' : x).trim()).filter(Boolean)
    if (typeof v === 'string' && v.trim()) return [v.trim()]
    return []
  }
  const src = Array.isArray(rawSlots) ? rawSlots.slice(0, 6) : []
  const 表 = src.length
    ? src.map((s) => {
      const raw = s && typeof s === 'object' ? s : {}
      let sessions = 收拾会话(raw.sessions)
      if (!sessions.length) sessions = 收拾会话(raw.session)
      return {
        id: String(raw.id == null ? '' : raw.id).trim(),
        工作区: 规整工作区(raw.工作区 != null ? raw.工作区 : raw.workspace),
        label: String(raw.label || '').trim().slice(0, 24),
        selfName: String(raw.selfName || '').trim().slice(0, 16),
        ownerName: String(raw.ownerName || '').trim().slice(0, 16),
        sessions,
      }
    })
    : [{
      id: 会话键(targetSession) || 兜底键,
      工作区: '',
      label: '', selfName: '', ownerName: '',
      sessions: 收拾会话(targetSession),
    }]
  const 旧表 = Array.isArray(旧份) ? 旧份 : []
  const 占用 = new Set()
  const 用过id = new Set()
  return 表.map((p, i) => {
    const sessions = []
    for (const s of p.sessions) {
      const k = 会话键(s)
      if (!k || 占用.has(k)) continue
      占用.add(k)
      sessions.push(s)
    }
    let id = p.id
    if (!id) {
      const 旧id = String((旧表[i] && 旧表[i].id) || '')
      if (旧id && !用过id.has(旧id)) id = 旧id
    }
    if (!id && sessions.length) id = 会话键(sessions[0])
    if (!id) id = i === 0 ? 兜底键 : ''
    if (id && 用过id.has(id)) id = ''
    if (id) 用过id.add(id)
    return { id, 工作区: p.工作区, label: p.label, selfName: p.selfName, ownerName: p.ownerName, sessions }
  })
}

export function 新份键() {
  return 'slot-' + randomUUID().replace(/-/g, '').slice(0, 8)
}

export function 规整模式(v) {
  return String(v == null ? '' : v).trim() === 'workspace' ? 'workspace' : 'session'
}

export function 工作区目录名(p) {
  let s = String(p == null ? '' : p).trim()
  if (!s) return ''
  if (/^--.*--$/.test(s)) return s          // 给的本来就是目录名
  s = s.replace(/[\\/]+/g, '-')
  const 编码 = s
    .replace(/[^\x21-\x7e]/g, (c) => '~' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'))
    .replace(/[^A-Za-z0-9._~-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return 编码 ? '--' + 编码 + '--' : ''
}

export function 规整工作区(v) {
  const s = String(v == null ? '' : v).trim()
  if (!s) return ''
  if (/^--.*--$/.test(s)) return s.slice(0, 200)
  if (/[\\/]/.test(s)) return 工作区目录名(s).slice(0, 200)
  return s.slice(0, 200)
}

export function 份键(slot, i = 0) {
  const s = slot && typeof slot === 'object' ? slot : {}
  const id = String(s.id == null ? '' : s.id).trim()
  if (id) return id
  const 会话们 = Array.isArray(s.sessions) ? s.sessions : (s.session ? [s.session] : [])
  for (const v of 会话们) {
    const k = 会话键(v)
    if (k) return k
  }
  return i === 0 ? 兜底键 : ''
}

const 工作区缓存 = { at: 0, 数据: null }

function 目录们(p) {
  try {
    return readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
  } catch { return [] }
}

export function 扫会话目录(强制 = false) {
  const 现在 = Date.now()
  if (!强制 && 工作区缓存.数据 && 现在 - 工作区缓存.at < 5000) return 工作区缓存.数据
  const 根 = join(CFG_DIR, 'sessions')
  const bySession = new Map()    // 会话键 -> 工作区目录名
  const byWorkspace = new Map()  // 工作区目录名 -> [会话 id（目录名的原样写法）]
  for (const ws of 目录们(根)) {
    const 会话们 = []
    for (const sid of 目录们(join(根, ws))) {
      const k = 会话键(sid)
      if (!k) continue
      会话们.push(sid)
      if (!bySession.has(k)) bySession.set(k, ws)
    }
    byWorkspace.set(ws, 会话们)
  }
  const 数据 = { bySession, byWorkspace, at: 现在 }
  工作区缓存.数据 = 数据
  工作区缓存.at = 现在
  return 数据
}

export function 工作区清单() {
  const 扫描 = 扫会话目录(true)
  const 可读 = new Map()
  try {
    const w = JSON.parse(readFileSync(join(CFG_DIR, 'storages', 'workspace.json'), 'utf8'))
    for (const v of Object.values((w && w.tables && w.tables.workspaces) || {})) {
      const p = String((v && v.path) || '').trim()
      if (!p) continue
      const 目录 = 工作区目录名(p)
      if (!目录) continue
      const 旧的 = 可读.get(目录)
      if (!旧的 || (!旧的.path && p)) 可读.set(目录, { path: p, title: String((v && v.title) || '') })
    }
  } catch { /* 没有 workspace.json 就只显示目录名 */ }
  const out = []
  const 见过 = new Set()
  for (const [name, 会话们] of 扫描.byWorkspace) {
    const 已知 = 可读.get(name) || {}
    const path = String(已知.path || '')
    out.push({ name, path, title: String(已知.title || ''), sessions: 会话们.length, label: path || name })
    见过.add(name)
  }
  for (const [name, 已知] of 可读) {
    if (见过.has(name)) continue
    out.push({ name, path: 已知.path, title: 已知.title, sessions: 0, label: 已知.path || name })
  }
  out.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
  return out
}

function 会话归属表(slots) {
  const out = new Map()
  for (const p of Array.isArray(slots) ? slots : []) {
    const id = String((p && p.id) || '')
    if (!id) continue
    for (const s of (p && p.sessions) || []) {
      const k = 会话键(s)
      if (k && !out.has(k)) out.set(k, p)
    }
  }
  return out
}

function 工作区归属表(slots, 扫描) {
  const out = new Map()
  const 按工作区 = new Map()
  for (const p of Array.isArray(slots) ? slots : []) {
    const w = String((p && p.工作区) || '')
    if (!w || !p.id || 按工作区.has(w)) continue   // 同一个工作区只能归一份，先到先得
    按工作区.set(w, p)
  }
  const 表 = 扫描 || 扫会话目录()
  for (const [sid键, ws] of 表.bySession) {
    const p = 按工作区.get(ws)
    if (p && !out.has(sid键)) out.set(sid键, p)
  }
  return out
}

function 取归属表(slots, 模式) {
  return 规整模式(模式) === 'workspace' ? 工作区归属表(slots) : 会话归属表(slots)
}

export function 展开份会话(slots, 模式) {
  const 表 = Array.isArray(slots) ? slots : []
  if (规整模式(模式) !== 'workspace') return 表.map((p) => ({ ...p, sessions: (p.sessions || []).slice() }))
  const 扫描 = 扫会话目录()
  return 表.map((p) => ({
    ...p,
    sessions: p.工作区 ? (扫描.byWorkspace.get(p.工作区) || []).slice() : [],
  }))
}

function readStore() {
  let raw = null
  try { raw = JSON.parse(readFileSync(STATE_PATH, 'utf8')) } catch (e) {
    if (e.code !== 'ENOENT') { diag('状态文件读取失败，保留原文件：' + e.message); throw e }
  }
  const store = { version: STATE_VERSION, moods: {}, lastActive: '' }
  if (!raw || typeof raw !== 'object') return store
  if (raw.moods && typeof raw.moods === 'object') {
    for (const [k, v] of Object.entries(raw.moods)) {
      if (v && typeof v === 'object') store.moods[String(k)] = normState(v)
    }
    store.lastActive = String(raw.lastActive || '')
    return store
  }
  try { writeFileSync(STATE_PATH + '.v1.bak', JSON.stringify(raw, null, 2), 'utf8') } catch (e) { /* 备份失败不拦着 */ }
  const k = 第一份键 || 兜底键
  store.moods[k] = normState(raw)
  store.lastActive = k
  diag('老心情（单份）已搬进「' + k + '」，原文件另存为 state.json.v1.bak')
  return store
}

function writeStore(store) {
  try {
    mkdirSync(STORE_DIR, { recursive: true })
    const tmp = STATE_PATH + '.tmp'
    writeFileSync(tmp, JSON.stringify({ version: STATE_VERSION, moods: store.moods, lastActive: store.lastActive || '' }, null, 2), 'utf8')
    renameSync(tmp, STATE_PATH)
  } catch (e) { diag('状态保存失败：' + e.message); throw e }
}

function loadState(key, base = 70) {
  const store = readStore()
  if (store.moods[key]) return store.moods[key]
  const s = blankState(); s.mood = base; s.lastNotedMood = base; return s
}

function saveState(key, s, markActive = true) {
  const store = readStore()
  store.moods[key] = s
  if (markActive || !store.lastActive) store.lastActive = key
  writeStore(store)
}

function decay(s, base, now, halfHours) { return relax(s, base, now, halfHours) }

function getState(key, base, { persist = true, halfHours = 12 } = {}) {
  const s = loadState(key, base)
  decay(s, base, Date.now(), halfHours)
  if (persist) saveState(key, s, false)
  return s
}

function moodLabel(v) {
  if (v >= 80) return '欢喜'
  if (v >= 62) return '开心'
  if (v >= 42) return '一般'
  if (v >= 25) return '低落'
  return '难过'
}

function moodEmoji(v) {
  if (v >= 80) return '😊'
  if (v >= 62) return '🙂'
  if (v >= 42) return '😌'
  if (v >= 25) return '🥺'
  return '😢'
}

function moodLine(s, mode) { return contextLine(s, mode) }

const 注入上下文 = new Set(['runtime-context', 'time-context', 'system-reminder', 'system', 'time-sampled'])
const 外部触发 = new Set(['bili-duty-scan'])
const 自主搭话 = new Set(['speak-up'])
const 机器来源 = new Set([
  'schedule', 'goal', 'goal-round', 'subagent', 'subagent-notice',
  'tool-registry', 'cordis-host-runner', 'agent-instructions',
  'system-prompt', 'model', 'plugin',
])
const 机器来源前缀 = ['subagent', 'goal', 'tool-', 'system-', 'schedule']

const 是机器来源 = (src) => {
  if (!src) return false
  if (机器来源.has(src)) return true
  const 低 = src.toLowerCase()
  return 机器来源前缀.some((p) => 低.startsWith(p))
}

export function lastUserTurnOf(session) {
  try {
    const ev = session?.snapshotEvents?.() || []
    for (let i = ev.length - 1; i >= 0; i--) {
      const e = ev[i]
      if ((e?.type || e?.kind) !== 'user/message') continue
      const p = e.payload ?? e.data
      const sourceKind = String(p?.source?.kind || 'user')
      if (注入上下文.has(sourceKind)) continue
      const text = stripBridgePrefix(fullTextOf(p)).slice(0, 2400)
      if (!text) return null
      const id = String(p?.message?.id || p?.id || e.id || i)
      return { text, sourceKind, index: i, id,
        fingerprint: createHash('sha256').update(id + ':' + sourceKind + ':' + text).digest('hex') }
    }
  } catch { /* no usable snapshot */ }
  return null
}

function lastAssistantTextOf(session, info) {
  const events = session?.snapshotEvents?.() || []
  const start = info ? info.index + 1 : events.length
  return events.slice(start).filter(e => (e?.type || e?.kind) === 'assistant/message')
    .map(e => fullTextOf(e.payload ?? e.data)).filter(Boolean).join('\n').slice(-3000)
}

function recentDialogue(session, info) {
  const events = session?.snapshotEvents?.() || []
  return events.slice(0, info.index).filter(e => ['user/message', 'assistant/message'].includes(e?.type || e?.kind))
    .filter(e => !注入上下文.has(String((e.payload ?? e.data)?.source?.kind || '')))
    .slice(-6).map(e => ({ role: (e.type || e.kind).split('/')[0],
      text: fullTextOf(e.payload ?? e.data).slice(0, 700) }))
}

function 取模型(agent) {
  try {
    const h = agent && agent.session && agent.session.requestHeader ? agent.session.requestHeader() : null
    const cfg = h && h.config
    if (cfg && cfg.provider && cfg.model) return { provider: cfg.provider, model: cfg.model }
  } catch (e) { /* ignore */ }
  try {
    const o = agent && agent.options
    if (o && o.provider && o.model) return { provider: o.provider, model: o.model }
  } catch (e) { /* ignore */ }
  return null
}

async function judge(ctx, agent, userText, reply, mode, o, state, history) {
  const picked = o.judgeProvider && o.judgeModel ? { provider: o.judgeProvider, model: o.judgeModel } : 取模型(agent)
  if (!picked) { diag('判断跳过：没有可用模型'); return null }
  const input = { trigger: mode || 'conversation',
    triggerNote: mode === 'talk' ? '主动唤醒本身不是想念、冷落或情绪事件。用户可能尚未看到消息。'
      : mode === 'work' ? '机器通知或任务唤醒，不是用户说的话；只依据实际活动和反应判断。'
      : '可能经桥接转入；区分群聊参与者，不把所有人的话归给用户。',
    previousState: { mood: state.mood, dims: state.dims, previousEvent: state.lastReason },
    recentDialogue: history, currentInput: userText, currentReply: reply }
  const controller = new AbortController()
  let timer
  const collect = async () => {
    let out = ''
    for await (const chunk of ctx.llm.stream({ ...picked, system: assessmentPrompt(o),
      messages: [{ role: 'user', id: randomUUID(), content: [{ type: 'text', text: JSON.stringify(input) }],
        source: { kind: 'plugin', plugin: 'dsh-nia-mood' } }],
      maxTokens: 1200, temperature: 0.2, signal: controller.signal })) {
      if (controller.signal.aborted) return null
      if (chunk?.type === 'text-delta') out += chunk.text || ''
      if (out.length > 16000) throw new Error('评估输出过长')
      if (chunk?.type === 'finish' && chunk.reason?.kind === 'error') throw new Error('模型返回错误')
    }
    return parseAssessment(out)
  }
  try {
    return await Promise.race([collect(), new Promise((resolve) => {
      timer = setTimeout(() => { controller.abort(); diag('判断超时，未更新状态'); resolve(null) }, 45000)
    })])
  } catch (e) { diag('判断失败：' + e.message); return null }
  finally { clearTimeout(timer) }
}

function applyDelta(s, d, floor, minor) { return changeState(s, d, floor, minor) }

export function apply(ctx) {
  const cfg = loadConfig()
  const linked = createLinkedMood(ctx, () => cfg, data => {
    mkdirSync(STORE_DIR, { recursive:true })
    const target=join(STORE_DIR,'linked-diagnostics.json'), temp=target+'.tmp'
    writeFileSync(temp,JSON.stringify(data,null,2),'utf8');renameSync(temp,target)
  })
  try { linked.diagnostics=JSON.parse(readFileSync(join(STORE_DIR,'linked-diagnostics.json'),'utf8')) } catch {}
  const provide = ctx.provide?.bind(ctx) || ctx.reflect?.provide?.bind(ctx.reflect)
  if (provide) provide('niaMood', linked)
  ctx.effect(() => () => linked.close())

  const 当前份列表 = () => {
    const out = []
    const seen = new Set()
    for (const p of 规整份数(cfg.slots, cfg.targetSession)) {
      if (!p.id || seen.has(p.id)) continue
      seen.add(p.id)
      out.push({
        id: p.id,
        label: String(p.label || ''),
        selfName: String(p.selfName || ''),
        ownerName: String(p.ownerName || ''),
        工作区: String(p.工作区 || ''),
        sessions: p.sessions.slice(),
      })
    }
    if (!out.length) out.push({ id: 兜底键, label: '', selfName: '', ownerName: '', 工作区: '', sessions: [] })
    return out
  }
  第一份键 = (当前份列表()[0] || {}).id || 兜底键

  const 归一请求键 = (v) => {
    const k = String(v == null ? '' : v).trim()
    if (!k) return ''
    const list = 当前份列表()
    if (list.some((p) => p.id === k)) return k
    const 归属 = 取归属表(list, cfg.模式).get(会话键(k))
    return 归属 ? 归属.id : ''
  }

  let generation = 0
  let disposed = false
  let queued = 0

  const mounted = new Map() // sid -> { sid, off }
  let judgeChain = Promise.resolve() // 判断串行，避免多轮堆积互相覆盖

  function mountFor(agent, sid, slot) {
    const sid键 = 会话键(sid)
    const 我的份 = () => {
      const list = 当前份列表()
      if (规整模式(cfg.模式) === 'workspace') {
        const 命中 = 取归属表(list, cfg.模式).get(sid键)
        if (命中) return 命中
      } else {
        const 按会话 = list.find((x) => x.sessions.some((s) => 会话键(s) === sid键))
        if (按会话) return 按会话
      }
      return list.find((x) => x.id === (slot && slot.id))
        || { id: (slot && slot.id) || 兜底键, label: '', selfName: '', ownerName: '', 工作区: '', sessions: [] }
    }
    const 当前键 = () => String(我的份().id || 兜底键)
    const 本人名 = () => String(我的份().selfName || cfg.selfName || '')
    const 对方名 = () => String(我的份().ownerName || cfg.ownerName || '')
    const offs = []
    let active = true
    let lastQueued = ''
    try {
      offs.push(agent.ctx.on('agent/turn-stopping', () => {
        if (linked.owns(agent) || !cfg.autoJudge || disposed || !active || queued >= 20) return
        const info = lastUserTurnOf(agent.session)
        if (!info) return
        const reply = lastAssistantTextOf(agent.session, info)
        if (!reply) return
        const key = 当前键()
        if (lastQueued === info.fingerprint || loadState(key).processedTurns[sid键] === info.fingerprint) return
        lastQueued = info.fingerprint
        const epoch = generation
        const history = recentDialogue(agent.session, info)
        const kind = info.sourceKind
        const mode = 自主搭话.has(kind) ? 'talk' : 外部触发.has(kind) || 是机器来源(kind) ? 'work' : ''
        const options = { self: 本人名(), owner: 对方名(), aliases: cfg.selfAliases,
          judgeProvider: cfg.judgeProvider, judgeModel: cfg.judgeModel,
          personaContext: cfg.personaContext, relationshipContext: cfg.relationshipContext }
        queued++
        judgeChain = judgeChain.then(async () => {
          if (disposed || !active || epoch !== generation || !cfg.autoJudge || 当前键() !== key) return
          const before = getState(key, cfg.moodBase, { persist: false, halfHours: cfg.decayHalfHours })
          const delta = await judge(ctx, agent, info.text, reply, mode, options, before, history)
          if (disposed || !active || epoch !== generation || !cfg.autoJudge || 当前键() !== key) return
          const s = getState(key, cfg.moodBase, { persist: false, halfHours: cfg.decayHalfHours })
          s.processedTurns[sid键] = info.fingerprint
          if (delta && delta.confidence >= cfg.judgeConfidence &&
              (delta.moodDelta !== 0 || DIMS.some(([k]) => delta.dims[k] !== 0))) {
            const significant = Math.abs(delta.moodDelta) >= cfg.sigMood || DIMS.some(([k]) => Math.abs(delta.dims[k]) >= cfg.sigDim)
            applyDelta(s, delta, cfg.moodFloor, !significant)
            diag('心情更新：mood=' + s.mood.toFixed(2) + ' confidence=' + delta.confidence)
          } else { diag(delta ? '无新增变化或证据不足，不累加情绪' : '评估失败，未改变情绪') }
          saveState(key, s)
        }).catch(e => diag('判断异常：' + e.message)).finally(() => { queued-- })
      }))
    } catch (e) { diag('监听 turn-stopping 失败：' + e.message) }

    try {
      offs.push(agent.ctx.systemPrompt.context({
        name: 'nia-mood',
        order: 900,
        text: () => {
          try {
            if (linked.owns(agent)) return ''
            const mode = cfg.injectMode
            if (!mode || mode === 'off') return ''
            const s = getState(当前键(), cfg.moodBase, { persist: false, halfHours: cfg.decayHalfHours })
            if (s.injectedFor === s.updatedAt) return ''
            if (s.minor) return ''   // 小波动只记账，不打扰角色
            if (Number(s.lastConfidence) < cfg.injectConfidence) {
              diag('可信度 ' + s.lastConfidence + ' 低于门槛 ' + cfg.injectConfidence + '，这次不告诉角色')
              s.injectedFor = s.updatedAt
              saveState(当前键(), s)
              return ''
            }
            const 今天0点 = new Date()
            今天0点.setHours(0, 0, 0, 0)
            const 今天说过 = (s.saidAt || []).filter((t) => Number(t) >= 今天0点.getTime()).length
            const 上限 = Math.max(0, Number(cfg.injectPerDay ?? 6))
            if (今天说过 >= 上限) {
              diag('今天的额度用完了（' + 今天说过 + '/' + 上限 + '），这次只记账、不告诉角色')
              s.injectedFor = s.updatedAt     // 标成处理过，别每轮重复记日志
              saveState(当前键(), s)
              return ''
            }
            const line = moodLine(s, mode, undefined, 对方名())
            if (!line) return ''
            s.injectedFor = s.updatedAt
            s.lastInjectedText = line          // 存原文：设置页照这个显示
            s.lastInjectedAt = Date.now()
            s.saidAt = [...(s.saidAt || []), Date.now()].slice(-200)   // 记账：今天多了一次
            saveState(当前键(), s)
            diag('告诉角色心情（' + mode + '）：' + line.replace(/\n/g, ' ').slice(0, 100))
            return line
          } catch (e) { diag('注入失败：' + (e && e.message)); return '' }
        },
      }))
    } catch (e) { diag('挂注入失败：' + (e && e.message)) }

    return function off() {
      active = false
      for (const d of offs) {
        try { if (typeof d === 'function') d() } catch (e) { /* ignore */ }
      }
    }
  }

  const 可挂会话 = () => {
    try {
      if (规整模式(cfg.模式) === 'workspace' && typeof ctx.agents.roots === 'function') {
        return ctx.agents.roots() || []
      }
    } catch (e) { /* 拿不到就退回全部 */ }
    try { return ctx.agents.list() || [] } catch (e) { return [] }
  }

  function tick() {
    try {
      const list = 可挂会话()
      const 份表 = 取归属表(当前份列表(), cfg.模式)
      for (const agent of list) {
        const sid = sessionIdOf(agent.session)
        const sid键 = 会话键(sid)
        if (!sid键) continue
        const slot = 份表.get(sid键)
        if (!slot) continue
        const 现挂 = mounted.get(sid)
        if (现挂 && 现挂.id !== slot.id) {
          try { 现挂.off() } catch (e) { /* ignore */ }
          mounted.delete(sid)
        } else if (现挂) continue
        try {
          const off = mountFor(agent, sid, slot)
          mounted.set(sid, { sid, id: slot.id, off })
          diag('已挂心情到 ' + sid + '（' + (slot.label || slot.id) + '）')
        } catch (e) { diag('挂 ' + sid + ' 失败：' + (e && e.message)) }
      }
      for (const [sid, v] of mounted) {
        const gone = !list.some((a) => sessionIdOf(a.session) === sid)
        if (gone || !份表.has(会话键(sid))) {
          try { v.off() } catch (e) { /* ignore */ }
          mounted.delete(sid)
        }
      }
    } catch (e) { /* ignore */ }
  }

  tick()
  try {
    ctx.effect(() => ctx.interval(tick, 3000))
  } catch (e) { console.error('[心情] 定时器不可用（不影响对话）：' + (e && e.message)) }

  ctx.effect(() => () => {
    disposed = true; generation++
    for (const v of mounted.values()) {
      try { v.off() } catch (e) { /* ignore */ }
    }
    mounted.clear()
  })

  try {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-nia-mood/state',
      handler: async (req, res) => {
        try {
          const 份列表 = 展开份会话(当前份列表(), cfg.模式)
          const 请求键 = (() => { try { return new URL(req.url, 'http://x').searchParams.get('key') || '' } catch { return '' } })()
          const 最近 = readStore().lastActive
          const 这份 = 归一请求键(请求键)
            || 归一请求键(最近)
            || (份列表[0] && 份列表[0].id)
            || 兜底键
          const 这份份 = 份列表.find((x) => x.id === 这份) || {}
          const 对方名 = String(这份份.ownerName || cfg.ownerName || '')
          const s = getState(这份, cfg.moodBase, { persist: true, halfHours: cfg.decayHalfHours })
          const 今天0点 = new Date()
          今天0点.setHours(0, 0, 0, 0)
          const 今天说过 = (s.saidAt || []).filter((t) => Number(t) >= 今天0点.getTime()).length
          const 每天上限 = Math.max(0, Number(cfg.injectPerDay ?? 6))
          const 还剩 = Math.max(0, 每天上限 - 今天说过)
          const out = {
            ok: true,
            key: 这份,
            mode: cfg.模式,
            slots: 份列表,
            multi: 份列表.length > 1,
            label: String(这份份.label || ''),
            name: String(这份份.selfName || cfg.selfName),
            ownerName: 对方名,
            mood: Math.round(s.mood),
            moodLabel: moodLabel(s.mood),
            emoji: moodEmoji(s.mood),
            dims: DIMS.map(([k, label]) => ({ key: k, label, value: Math.round(s.dims[k]) })),
            lastReason: s.lastReason,
            lastConfidence: s.lastConfidence,
            updatedAt: s.updatedAt,
            injectMode: cfg.injectMode,
            injectConfidence: cfg.injectConfidence,
            injectPerDay: cfg.injectPerDay,
            saidToday: 今天说过,
            injectQuota: { said: 今天说过, cap: 每天上限, left: 还剩 },
            decayHalfHours: cfg.decayHalfHours,
            sigMood: cfg.sigMood,
            sigDim: cfg.sigDim,
            minor: Boolean(s.minor),
            kind: String(s.kind || ''),
            injectable: Boolean(s.lastReason) && cfg.injectMode !== 'off'
              && s.injectedFor !== s.updatedAt
              && !s.minor
              && 还剩 > 0
              && Number(s.lastConfidence) >= cfg.injectConfidence,
            lastInjectedText: s.lastInjectedText,
            lastInjectedAt: s.lastInjectedAt,
            injectPreview: (() => {
              if (cfg.injectMode === 'off') return { state: 'off', text: '' }
              if (!s.lastReason) return { state: 'empty', text: '' }
              if (Number(s.lastConfidence) < cfg.injectConfidence) return { state: 'uncertain', text: '' }
              if (s.minor && s.injectedFor !== s.updatedAt) return { state: 'minor', text: '' }
              const pending = s.injectedFor !== s.updatedAt
                && Number(s.lastConfidence) >= cfg.injectConfidence
              if (pending) {
                if (还剩 <= 0) return { state: 'blocked', text: '', said: 今天说过, cap: 每天上限 }
                return { state: 'pending', text: moodLine(s, cfg.injectMode, 0, 对方名) }
              }
              return { state: s.lastInjectedText ? 'said' : 'empty', text: s.lastInjectedText || '' }
            })(),
            timeline: s.timeline.map(t => ({ ...t, mood: Math.round(t.mood), delta: Math.round(t.delta * 100) / 100 })),
          }
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify(out))
        } catch (e) {
          res.writeHead(500, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: String(e && e.message) }))
        }
      },
    }))
  } catch (e) { diag('路由注册失败：' + (e && e.message)) }

  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/dsh-nia-mood/linked', handler: async (req, res) => {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'GET required' })
    try {
      const memory = ctx.get?.('niaMemory') ?? ctx.niaMemory
      const calculatedAt = Date.now()
      return sendJson(res, 200, { ok: true, available: !!memory && !memory.db.closed, enabled: !!memory?.db.data.enabled,
        calculatedAt, baseline: cfg.moodBase, diagnostics: linked.diagnostics,
        bindings: memory ? Object.values(memory.db.data.bindings) : [], moods: projectLinkedMoods(memory?.db.data.moods, cfg, calculatedAt), people: memory ? Object.values(memory.db.data.people) : [] })
    } catch(e) { return sendJson(res, 500, {ok:false,error:e.message}) }
  } }))

  const validMutation = (req) => {
    if (!String(req.headers?.['content-type'] || '').toLowerCase().includes('application/json')) return false
    if (!req.headers?.origin) return true
    try { return new URL(req.headers.origin).host === req.headers.host } catch { return false }
  }
  const readBody = (req) => new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => { raw += c; if (raw.length > 65536) raw = raw.slice(0, 65536) })
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')) } catch { resolve({}) } })
    req.on('error', () => resolve({}))
  })
  const sendJson = (res, code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(obj))
  }

  ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/dsh-nia-mood/manage',handler:async(req,res)=>{
    if(req.method!=='POST'||!validMutation(req))return sendJson(res,403,{ok:false,error:'需要同源 JSON 请求'});
    try{
      const input=await readBody(req),action=input.action;
      if(!['history','preview','reset','clear-history'].includes(action))throw Error('管理操作无效');
      const clearing=action==='clear-history';if(clearing&&input.confirm!=='清空历史')throw Error('请填写“清空历史”确认；该操作不改变当前心情');
      if(input.mode==='linked'){
        const memory=ctx.get?.('niaMemory')??ctx.niaMemory;if(!memory)throw Error('记忆服务不可用');
        const sid=String(input.sessionId||'');memory.binding(sid);let state=memory.mood(sid);
        if(action==='preview')return sendJson(res,200,{ok:true,preview:linked.preview(memory,sid),lastRead:linked.lastReads.get(sid)||null});
        const actor=String(input.actorId||'overall');const current=actor==='overall'?state?.overall:state?.targets?.[actor];
        if(action==='history')return sendJson(res,200,{ok:true,...historyPage(current,Number(input.offset||0))});
        if(!state||!current)throw Error('该对象还没有情绪记录');
        const replacement=clearing?{...current,timeline:[]}:resetCurrent(current,cfg.moodBase);
        if(actor==='overall')state.overall=replacement;else state.targets[actor]=replacement;
        memory.commitMood(sid,state.version,state);linked.lastReads.delete(sid);
        return sendJson(res,200,{ok:true,...historyPage(replacement)});
      }
      const key=String(input.key||'');if(!当前份列表().some(s=>s.id===key))throw Error('独立心情分组不存在');
      const state=getState(key,cfg.moodBase,{persist:false,halfHours:cfg.decayHalfHours});
      if(action==='history')return sendJson(res,200,{ok:true,...historyPage(state,Number(input.offset||0))});
      if(action==='preview'){
        const midnight=new Date();midnight.setHours(0,0,0,0);
        const available=cfg.injectMode!=='off'&&!state.minor&&state.injectedFor!==state.updatedAt&&state.lastConfidence>=cfg.injectConfidence&&(state.saidAt||[]).filter(t=>t>=midnight.getTime()).length<cfg.injectPerDay;
        const slot=当前份列表().find(s=>s.id===key);
        return sendJson(res,200,{ok:true,preview:available?moodLine(state,cfg.injectMode,0,slot?.ownerName||cfg.ownerName):'',lastRead:state.lastInjectedAt?{at:state.lastInjectedAt,text:state.lastInjectedText}:null});
      }
      const replacement=clearing?{...state,timeline:[]}:resetCurrent(state,cfg.moodBase);saveState(key,replacement);generation++;
      return sendJson(res,200,{ok:true,...historyPage(replacement)});
    }catch(e){return sendJson(res,400,{ok:false,error:String(e.message).slice(0,250)});}
  }}));

  try {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-nia-mood/config',
      handler: async (req, res) => {
        try {
          if (!['GET', 'POST'].includes(req.method)) return sendJson(res, 405, { ok: false, error: 'Method not allowed' })
          if (req.method === 'POST') {
            if (!validMutation(req)) return sendJson(res, 403, { ok: false, error: 'Expected same-origin JSON request' })
            const patch = await readBody(req)
            patchConfig(cfg, patch)
            generation++
            tick()
            diag('设置已改：' + JSON.stringify(patch).slice(0, 200))
          }
          return sendJson(res, 200, { ok: true, config: { ...cfg } })
        } catch (e) { return sendJson(res, 500, { ok: false, error: String(e && e.message) }) }
      },
    }))
  } catch (e) { diag('配置路由失败：' + (e && e.message)) }

  try {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-nia-mood/models',
      handler: async (req, res) => {
        const providers = []
        try {
          for (const p of (await ctx.llm?.listProviders?.() || [])) {
            const item = { id: p.id, name: p.name || p.id, models: [] }
            try {
              for (const m of (await ctx.llm.listModels?.(p.id)) || []) item.models.push({ id: m.id, name: m.name || m.id })
            } catch (e) { /* 某个 provider 拉不出来就算了，别整单失败 */ }
            providers.push(item)
          }
        } catch (e) { diag('列模型失败：' + (e && e.message)); return sendJson(res, 500, { ok: false, error: '无法读取模型提供方列表，请稍后刷新。' }) }
        return sendJson(res, 200, { ok: true, providers })
      },
    }))
  } catch (e) { diag('模型路由失败：' + (e && e.message)) }

  try {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-nia-mood/reset',
      handler: async (req, res) => {
        try {
          if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST required' })
          if (!validMutation(req)) return sendJson(res, 403, { ok: false, error: 'Expected same-origin JSON request' })
          const 份列表 = 当前份列表()
          let 键 = ''
          try { 键 = new URL(req.url, 'http://x').searchParams.get('key') || '' } catch { 键 = '' }
          if (!键) { const body = await readBody(req); 键 = String((body && body.key) || '') }
          if (键) 键 = 归一请求键(键) || 键
          if (!键) 键 = 归一请求键(readStore().lastActive) || (份列表[0] && 份列表[0].id) || 兜底键
          const s = resetCurrent(getState(键,cfg.moodBase,{persist:false,halfHours:cfg.decayHalfHours}),cfg.moodBase)
          saveState(键, s)
          generation++
          diag('心情已重置到基线 ' + cfg.moodBase + '（' + 键 + '）')
          return sendJson(res, 200, { ok: true, mood: s.mood, key: 键 })
        } catch (e) { return sendJson(res, 500, { ok: false, error: String(e && e.message) }) }
      },
    }))
  } catch (e) { diag('重置路由失败：' + (e && e.message)) }

  try {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-nia-mood/sessions',
      handler: async (req, res) => {
        try { return sendJson(res, 200, { ok: true, sessions: await sessionCatalog(ctx), current: cfg.targetSession }) }
        catch (e) { return sendJson(res, 500, { ok: false, error: '会话列表读取失败：' + e.message }) }
      },
    }))
  } catch (e) { diag('会话路由失败：' + (e && e.message)) }

  try {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-nia-mood/workspaces',
      handler: async (req, res) => {
        try {
          const 工作区们 = 工作区清单()
          const catalog = await sessionCatalog(ctx)
          for (const row of catalog) if (row.cwd) {
            const name = 工作区目录名(row.cwd)
            let w = 工作区们.find(x => x.name === name)
            if (!w) { w = { name, path: row.cwd, title: '', sessions: 0, label: row.cwd }; 工作区们.push(w) }
            w.path = row.cwd; w.label = row.cwd
            w.sessions = Math.max(w.sessions, catalog.filter(x => x.cwd === row.cwd).length)
          }
          return sendJson(res, 200, { ok: true, mode: cfg.模式, workspaces: 工作区们 })
        } catch (e) { return sendJson(res, 200, { ok: false, workspaces: [], error: String(e && e.message) }) }
      },
    }))
  } catch (e) { diag('工作区路由失败：' + (e && e.message)) }


}
export const __测试 = {
  blankState, normState, decay, applyDelta, moodLine, fullTextOf, lastAssistantTextOf, recentDialogue, judge,
  DIMS,
  normReason,
  兜底键,
  归属表: (slots) => Object.fromEntries(
    [...会话归属表(规整份数(slots, ''))].map(([sid, p]) => [sid, p.id]),
  ),
  默认配置: () => ({ ...DEFAULTS }),
  读配置: () => loadConfig(),
  合并配置: (cfg, patch) => patchConfig(cfg, patch),
  规整模式,
  规整工作区,
  工作区目录名,
  工作区清单,
  扫会话目录,
  工作区归属表: (slots) => Object.fromEntries(
    [...工作区归属表(规整份数(slots, ''), 扫会话目录(true))].map(([sid, p]) => [sid, p.id]),
  ),
  展开份会话,
  读库: () => readStore(),
  存库: (store) => writeStore(store),
  设第一份键: (k) => { 第一份键 = k || 兜底键 },
  读一份: (k) => loadState(k),
  存一份: (k, s) => saveState(k, s),
  库路径: () => STATE_PATH,
}
