import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { EventEmitter } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { runInNewContext } from 'node:vm'

const work = resolve(process.env.NIA_TEST_ROOT || '../../work')
mkdirSync(work, { recursive: true })
process.env.DSH_HOME = mkdtempSync(join(work, 'nia-test-'))
const plugin = await import('../lib/index.js')
const t = plugin.__测试
const dir = join(process.env.DSH_HOME, 'nia-mood')
mkdirSync(dir, { recursive: true })
const cfgPath = join(dir, 'config.json'), statePath = join(dir, 'state.json')
const disposers = []
const event = (role, text, id, source = 'user') => ({ type: role + '/message', payload: {
  id, source: { kind: source }, message: { id, content: [{ type: 'text', text }] } } })
const sample = () => ({ moodDelta: -3, dims: { anger: 5, hurt: 2 }, reason: '用户轻视了妮娅的努力，她当时不愿继续解释。', confidence: 90 })
const settle = async () => { await delay(15) }

beforeEach(() => {
  writeFileSync(cfgPath, JSON.stringify({ ...t.默认配置(), slots: [
    { id: 'nia', label: '妮娅', sessions: ['session-a', 'session-b'] },
    { id: 'other', label: '其他', sessions: ['session-c'] },
  ] }))
  writeFileSync(statePath, JSON.stringify({ version: 2, moods: {}, lastActive: '' }))
})
afterEach(() => { while (disposers.length) disposers.pop()() })

function harness(streamFn) {
  const routes = new Map(), inputs = [], agents = []
  for (const id of ['session-a', 'session-b', 'session-c']) {
    const bus = new EventEmitter(), events = [], contexts = []
    const agent = { events, contexts, bus, session: { id, snapshotEvents: () => events,
      requestHeader: () => ({ config: { provider: 'fake', model: 'fake' } }) },
      ctx: { on: (name, fn) => { bus.on(name, fn); return () => bus.off(name, fn) },
        systemPrompt: { context: spec => { contexts.push(spec); return () => contexts.splice(contexts.indexOf(spec), 1) } } } }
    agent.turn = (text, reply, source = 'user') => {
      agent.events.push(event('user', text, 'u-' + agent.events.length, source))
      agent.events.push(event('assistant', reply, 'a-' + agent.events.length))
      bus.emit('agent/turn-stopping')
    }
    agents.push(agent)
  }
  const ctx = { agents: { list: () => agents, roots: () => agents },
    effect(fn) { const off = fn(); if (typeof off === 'function') disposers.push(off) },
    interval() { return () => {} }, on() {},
    webServer: { register(route) { routes.set(route.path, route.handler); return () => routes.delete(route.path) } },
    llm: { listProviders: () => [], async *stream(options) {
      inputs.push(options)
      const value = streamFn ? await streamFn(options) : sample()
      if (value instanceof Error) throw value
      yield { type: 'text-delta', text: typeof value === 'string' ? value : JSON.stringify(value) }
    } } }
  plugin.apply(ctx)
  async function request(path, method = 'GET', body, headers = {}) {
    const req = new EventEmitter()
    Object.assign(req, { url: '/dsh-nia-mood' + path, method, headers: { host: 'localhost:1234',
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}), ...headers } })
    let code, out, responseHeaders
    const res = { writeHead(c,h) { code=c; responseHeaders=h }, end(s) { out=s } }
    const route = routes.get(req.url.split('?')[0]); assert.ok(route, req.url)
    const promise = route(req, res)
    queueMicrotask(() => { if (body !== undefined) req.emit('data', JSON.stringify(body)); req.emit('end') })
    await promise
    return { code, headers: responseHeaders, body: responseHeaders?.['content-type']?.includes('application/json') ? JSON.parse(out) : out }
  }
  return { ctx, agents, routes, inputs, request }
}

test('host registration, independent storage, new dimensions without widget routes', async () => {
  const h = harness()
  const r = await h.request('/state')
  assert.equal(r.code, 200); assert.equal(r.body.name, '当前角色'); assert.equal(r.body.dims.length, 12)
  assert.equal(r.body.injectPreview.state, 'empty')
  assert.ok(![...h.routes.keys()].some(k => k.includes('feiyu') || k.endsWith('/update')))
  assert.ok(!existsSync(join(process.env.DSH_HOME, 'feiyu-mood')))
  assert.ok(![...h.routes.keys()].some(k => /widget|\.svg$/.test(k)))
  for (const path of ['/sessions', '/workspaces', '/models']) assert.equal((await h.request(path)).code, 200)
})

test('upgrading keeps manually saved persona and role names, and renaming does not rewrite the persona',async()=>{
  const raw=JSON.parse(readFileSync(cfgPath,'utf8'));
  raw.selfName='妮娅';raw.personaContext='保留用户已经填写的性格背景。';writeFileSync(cfgPath,JSON.stringify(raw));
  const h=harness();const before=(await h.request('/config')).body.config;
  assert.equal(before.selfName,'妮娅');assert.equal(before.personaContext,raw.personaContext);
  assert.equal((await h.request('/config','POST',{selfName:'星澄'})).code,200);
  const after=JSON.parse(readFileSync(cfgPath,'utf8'));assert.equal(after.selfName,'星澄');assert.equal(after.personaContext,raw.personaContext);
});

test('bound sessions share state, distinct slot stays independent, event injects once', async () => {
  const h = harness(); h.agents[0].turn('你做的东西不怎么样', '那你自己来。'); await settle()
  const r = await h.request('/state?key=nia')
  assert.equal(r.body.mood, 69); assert.equal(r.body.timeline.length, 1)
  assert.equal((await h.request('/state?key=other')).body.timeline.length, 0)
  const prompt = h.agents[1].contexts[0].text()
  assert.match(prompt, /内部记录/); assert.equal(h.agents[1].contexts[0].text(), '')
  assert.equal((await h.request('/state?key=nia')).body.lastInjectedText, prompt)
})

test('duplicate stop and remount do not double count an existing turn', async () => {
  const h = harness(); h.agents[0].turn('别忙了', '先放着吧。'); await settle()
  h.agents[0].bus.emit('agent/turn-stopping'); await settle()
  assert.equal(h.inputs.length, 1)
  while (disposers.length) disposers.pop()()
  const next = harness(); next.agents[0].events.push(...h.agents[0].events)
  next.agents[0].bus.emit('agent/turn-stopping'); await settle()
  assert.equal(next.inputs.length, 0)
})

test('zero, low-confidence and malformed assessments never poison state', async () => {
  const replies = [{ ...sample(), moodDelta: 0, dims: {}, reason: '' }, { ...sample(), confidence: 10 }, 'bad json']
  const h = harness(() => replies.shift())
  for (let i=0; i<3; i++) { h.agents[0].turn('消息' + i, '嗯。'); await settle() }
  const r = await h.request('/state?key=nia')
  assert.equal(r.body.timeline.length, 0); assert.equal(r.body.mood, 70)
})

test('machine turns use own activity and never replay an earlier human input', async () => {
  const h = harness()
  h.agents[0].turn('先试试看', '好。'); await settle()
  h.agents[0].turn('scheduled scan', '这个解谜机制有点意思。', 'schedule'); await settle()
  const input = JSON.parse(h.inputs[1].messages[0].content[0].text)
  assert.equal(input.trigger, 'work'); assert.equal(input.currentInput, 'scheduled scan')
  h.agents[0].turn('wake', '刚才那个游戏，你要不要看看。', 'speak-up'); await settle()
  assert.equal(JSON.parse(h.inputs[2].messages[0].content[0].text).trigger, 'talk')
})

test('hidden reasoning and stale replies are excluded from evidence', () => {
  assert.equal(t.fullTextOf({ content: [{ type: 'reasoning', text: 'secret' }] }), '')
  assert.equal(t.fullTextOf({ type: 'reasoning', text: 'secret' }), '')
  const events = [event('user','old','1'),event('assistant','old reply','2'),event('user','new','3')]
  const session = { snapshotEvents: () => events }
  assert.equal(t.lastAssistantTextOf(session, plugin.lastUserTurnOf(session)), '')
  events.push(event('assistant','new reply','4'))
  assert.equal(t.lastAssistantTextOf(session, plugin.lastUserTurnOf(session)), 'new reply')
})

test('reset invalidates a delayed assessment and requires same-origin POST', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const h = harness(async () => { await gate; return sample() })
  h.agents[0].turn('input', 'reply'); await settle()
  assert.equal((await h.request('/reset?key=nia')).code, 405)
  assert.equal((await h.request('/reset', 'POST', { key: 'nia' }, { origin: 'https://other.example' })).code, 403)
  assert.equal((await h.request('/reset', 'POST', { key: 'nia' })).code, 200)
  release(); await settle()
  assert.equal((await h.request('/state?key=nia')).body.timeline.length, 1)
  assert.equal((await h.request('/state?key=nia')).body.timeline[0].kind, 'reset')
})

test('management previews do not consume injection; clear-history requires explicit phrase and preserves current mood',async()=>{
  const h=harness();h.agents[0].turn('发生新事件','回应');await settle();
  const before=(await h.request('/state?key=nia')).body;
  const preview=(await h.request('/manage','POST',{action:'preview',mode:'legacy',key:'nia'})).body;
  assert.ok(preview.preview);assert.equal((await h.request('/state?key=nia')).body.lastInjectedAt,before.lastInjectedAt);
  assert.equal((await h.request('/manage','POST',{action:'clear-history',mode:'legacy',key:'nia'})).code,400);
  assert.equal((await h.request('/manage','POST',{action:'history',mode:'legacy',key:'nia'},{origin:'https://other.example'})).code,403);
  assert.equal((await h.request('/manage','POST',{action:'clear-history',mode:'legacy',key:'nia',confirm:'清空历史'})).code,200);
  const after=(await h.request('/state?key=nia')).body;assert.equal(after.timeline.length,0);assert.equal(after.mood,before.mood);
})

test('unbinding stops new evaluation and invalidates in-flight results', async () => {
  let release; const gate = new Promise(resolve => { release = resolve })
  const h = harness(async () => { await gate; return sample() })
  h.agents[0].turn('input', 'reply'); await settle()
  assert.equal((await h.request('/config','POST',{ slots: [] })).code, 200)
  release(); await settle()
  assert.equal(t.读一份('nia').timeline.length, 0)
  h.agents[0].turn('input2','reply2'); await settle(); assert.equal(h.inputs.length, 1)
})

test('serial turns preserve changes from two sessions sharing a slot', async () => {
  const h = harness(); h.agents[0].turn('one', 'a'); h.agents[1].turn('two','b'); await settle()
  const r = await h.request('/state?key=nia')
  assert.equal(r.body.timeline.length, 2); assert.equal(r.body.mood, 68)
  assert.equal(r.body.dims.find(d=>d.key==='anger').value, 10)
})

test('zero mood and fractional state survive disk persistence; corrupt data is preserved', () => {
  const s = t.blankState(); s.mood=0; s.dims.anger=1.234
  t.存一份('nia', s)
  assert.equal(t.读一份('nia').mood, 0); assert.equal(t.读一份('nia').dims.anger, 1.234)
  writeFileSync(statePath, '{broken')
  assert.throws(() => t.存一份('nia',s))
  assert.equal(readFileSync(statePath,'utf8'), '{broken')
})

test('workspace mode binds root sessions only and preserves independent workspaces', async () => {
  const ws = plugin.工作区目录名('E:\\nia-test')
  mkdirSync(join(process.env.DSH_HOME,'sessions',ws,'session-a'), {recursive:true})
  mkdirSync(join(process.env.DSH_HOME,'sessions',ws,'session-b'), {recursive:true})
  plugin.扫会话目录(true)
  const h = harness()
  await h.request('/config','POST',{ 模式:'workspace', slots:[{id:'workspace-nia',工作区:ws,sessions:[]}] })
  h.agents[0].turn('a','b'); h.agents[2].turn('not bound','c'); await settle()
  assert.equal(h.inputs.length,1)
  assert.equal((await h.request('/state?key=workspace-nia')).body.timeline.length,1)
  assert.equal(h.agents[1].contexts.length,1)
})

test('injection budget and off switch hold without stopping state recording', async () => {
  const h=harness()
  await h.request('/config','POST',{injectPerDay:1})
  h.agents[0].turn('a','b'); await settle()
  assert.match(h.agents[0].contexts[0].text(),/内部记录/)
  h.agents[0].turn('c','d'); await settle()
  assert.equal(h.agents[0].contexts[0].text(),'')
  assert.equal((await h.request('/state?key=nia')).body.saidToday,1)
  await h.request('/config','POST',{injectMode:'off'})
  h.agents[0].turn('e','f'); await settle()
  assert.equal(h.agents[0].contexts[0].text(),'')
  assert.equal((await h.request('/state?key=nia')).body.timeline.length,3)
})

test('moderate-confidence changes record but do not inject', async () => {
  const h=harness(()=>({...sample(),confidence:57}))
  h.agents[0].turn('a','b'); await settle()
  assert.equal(h.agents[0].contexts[0].text(),'')
  const r=await h.request('/state?key=nia')
  assert.equal(r.body.timeline.length,1)
  assert.equal(r.body.injectPreview.state,'uncertain')
})

test('new slot honors configured baseline and state inspection does not change active slot', async () => {
  const h=harness()
  await h.request('/config','POST',{moodBase:55})
  h.agents[0].turn('a','b'); await settle()
  assert.equal((await h.request('/state?key=nia')).body.mood,54)
  assert.equal((await h.request('/state?key=other')).body.mood,55)
  assert.equal((await h.request('/state')).body.key,'nia')
})

test('settings panel registers independently and all three tabs render with host responses', async () => {
  const host = harness(), values=[], effects=[], intervals=[]; let cursor=0, first=true, descriptor, Panel
  const React = { createElement: (type,props,...children) => ({type,props:props||{},children:children.flat(Infinity)}),
    useState(init) { const i=cursor++; if (!(i in values)) values[i]=init; return [values[i], v=>{values[i]=typeof v==='function'?v(values[i]):v}] },
    useRef(init) { const i=cursor++; if (!(i in values)) values[i]={current:init}; return values[i] },
    useCallback(fn) { return fn }, useEffect(fn) { if(first) effects.push(fn) } }
  const window = { __ModuleLoader__: { load(d) { descriptor=d } }, confirm:()=>true }
  runInNewContext(readFileSync(new URL('../client.js',import.meta.url),'utf8'), {
    window, document:{createElement:()=>({setAttribute(){},remove(){}}),head:{appendChild(){}}},
    setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length;},clearInterval(){},setTimeout:()=>0, console,
    fetch: async (url,options={}) => {
      const r = await host.request(url.replace('/dsh-nia-mood',''),options.method||'GET',options.body?JSON.parse(options.body):undefined)
      return {ok:r.code===200,status:r.code,json:async()=>r.body}
    } })
  assert.equal(descriptor.id,'dsh-nia-mood')
  const client=descriptor.factory(id=>{assert.equal(id,'react');return React})
  const slots={inject(name,fn){fn()},register(spec,fn){assert.equal(spec.id,'nia-mood');Panel=fn().type}}
  client.apply({slots,effect:fn=>fn()})
  const render=()=>{cursor=0; const tree=Panel(); first=false; return tree}
  render(); for(const fn of effects)fn(); await settle()
  const flat=node=>node&&typeof node==='object'?[node,...node.children.flatMap(flat)]:[]
  assert.match(JSON.stringify(render()),/整体心情/);
  assert.match(JSON.stringify(render()),/暂无法读取联动状态/);
  values[3]={available:true,enabled:true,moods:{},bindings:[],people:[]};
  assert.match(JSON.stringify(render()),/初始参考 · 已保存的基线/);
  assert.match(JSON.stringify(render()),/当前还没有聊天接入/);
  assert.ok(flat(render()).some(n=>n.props.className==='nia-number'&&n.children.includes(70)));
  for(const label of ['联动心情','独立模式（兼容）','判断设置']) {
    const button=flat(render()).find(n=>n.type==='button'&&n.children.includes(label))
    assert.ok(button,label); button.props.onClick(); assert.ok(render())
  }
  const baseline=flat(render()).find(n=>n.props['aria-label']==='基线心情');
  baseline.props.onChange({target:{value:'83'}});
  flat(render()).find(n=>n.type==='button'&&n.children.includes('联动心情')).props.onClick();
  assert.ok(flat(render()).some(n=>n.props.className==='nia-number'&&n.children.includes(70)), 'unsaved baseline must not change initial reference');
  flat(render()).find(n=>n.type==='button'&&n.children.includes('判断设置')).props.onClick();
  assert.equal((await host.request('/config')).body.config.moodBase,70);
  assert.match(JSON.stringify(render()),/有未保存的修改/);
  await flat(render()).find(n=>n.type==='button'&&n.children.includes('保存设置')).props.onClick();
  assert.equal((await host.request('/config')).body.config.moodBase,83);
  assert.equal(t.读配置().moodBase,83);
  assert.match(JSON.stringify(render()),/设置已保存/);
  flat(render()).find(n=>n.props['aria-label']==='基线心情').props.onChange({target:{value:''}});
  await flat(render()).find(n=>n.type==='button'&&n.children.includes('保存设置')).props.onClick();
  assert.match(JSON.stringify(render()),/保存失败/); assert.equal(t.读配置().moodBase,83);
  host.ctx.niaMemory={db:{closed:false,data:{enabled:true,bindings:{},people:{},moods:{'nia:live':{
    version:1,overall:{mood:90,dims:{},lastDecayAt:Date.now()-12*3600000,updatedAt:1,lastReason:'测试事件'},targets:{}
  }}}}};
  const timer=intervals.find(x=>x.ms===5000);assert.ok(timer,'refresh without user action');await timer.fn();
  assert.equal(values[0].moodBase,'','poll must not overwrite the unsaved settings draft');
  flat(render()).find(n=>n.type==='button'&&n.children.includes('联动心情')).props.onClick();
  assert.match(JSON.stringify(render()),/当前心情/);
  assert.match(JSON.stringify(render()),/已计入时间衰减/);
  assert.ok(flat(render()).some(n=>n.props.className==='nia-number'&&n.children.includes(86.5)));
})

test('linked display calculates elapsed mood and dimensions without mutating stored history', async()=>{
  const h=harness(), now=Date.now();
  const s={mood:90,dims:{anger:64,hurt:64,happy:64},lastDecayAt:now-12*3600000,updatedAt:now-12*3600000,lastReason:'原事件',timeline:[{mood:90}]};
  const data={enabled:true,bindings:{},people:{},moods:{'nia:live':{version:3,overall:s,targets:{alice:structuredClone(s)},processed:{event:now}}}};
  h.ctx.niaMemory={db:{closed:false,data}};
  const original=JSON.stringify(data);
  for(let i=0;i<2;i++){
    const r=await h.request('/linked');assert.equal(r.code,200);
    assert.ok(r.body.calculatedAt>=now);assert.equal(r.body.baseline,70);
    const projected=r.body.moods['nia:live'];
    assert.ok(Math.abs(projected.overall.mood-80)<0.001);
    assert.ok(Math.abs(projected.overall.dims.anger-16)<0.001);
    assert.ok(Math.abs(projected.targets.alice.dims.hurt-32)<0.001);
    assert.ok(Math.abs(projected.overall.dims.happy-8)<0.001);
    assert.equal(projected.overall.updatedAt,s.updatedAt);
    assert.equal(JSON.stringify(data),original);
  }
});

test('catalog includes persisted UUID sessions and active sessions with workspace paths', async()=>{
  const h=harness();
  const id='2e2d5a11-52cd-4e82-b910-e77dc557bd12';
  h.ctx.sessionPersistence={list:async()=>[{header:{id,cwd:'C:/example/nia'}}]};
  const list=(await h.request('/sessions')).body.sessions;
  assert.ok(list.some(x=>x.id===id)); assert.ok(list.some(x=>x.id==='session-a'&&x.live));
  const ws=(await h.request('/workspaces')).body.workspaces; assert.ok(ws.some(x=>x.path==='C:/example/nia'));
  h.ctx.sessionPersistence.list=async()=>{throw Error('catalog unavailable');};
  assert.equal((await h.request('/sessions')).code,500);
});
