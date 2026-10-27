import test from 'node:test';
import assert from 'node:assert/strict';
import { LinkedMood, createLinkedMood } from '../lib/linked.js';
import { agentModel } from '../lib/model.js';
import { zeroDims } from '../lib/emotion.js';

const assessment=()=>({overall:{moodDelta:3,dims:{happy:2},reason:'收到一句问候',confidence:90},targets:[]});
function memoryFixture(){
  let state=null;
  return {moodKey:()=> 'nia:live',binding:()=>({sessionId:'s',actorIds:['person']}),mood:()=>structuredClone(state),
    events:()=>[{id:'e',actorId:'person',text:'你好',chatId:'chat',occurredAt:1}],contacts:()=>[],recall:()=>[],
    commitMood:(_id,version,next)=>{state={...next,version:version+1};return structuredClone(state);}};
}
test('DSH NEXT agents without agent.model evaluate through options and persisted request headers',async()=>{
  const requests=[],ctx={llm:{async *stream(opts){requests.push(opts);yield {type:'text-delta',text:JSON.stringify(assessment())};}}};
  const service=createLinkedMood(ctx,()=>({moodBase:65})),memory=memoryFixture();
  const agent={options:{provider:'p',model:'fresh'},session:{requestHeader:()=>undefined}};
  assert.equal((await service.assess(memory,agent,'s',['e'])).status,'updated');
  assert.equal(requests[0].model,'fresh');assert.equal(memory.mood().overall.mood,66);
  assert.equal(service.diagnostics['nia:live'].status,'updated');
  agent.session.requestHeader=()=>({config:{provider:'p',model:'logged'}});
  assert.equal(agentModel(ctx,agent).model,'logged');
  ctx.sessionProjections={stateOf:()=>({pending:{provider:'p',model:'selected-next'}})};
  assert.equal(agentModel(ctx,agent).model,'selected-next');
  service.close();
});
test('judge prepares supported low-cost controls and emits one unambiguous multi-person JSON schema',async()=>{
  let request,selected;
  const ctx={llm:{stream(){throw Error('must use prepared handle');},async prepareCall(config,signal,choose){
    selected={...choose({maxTokens:config.maxTokens,temperature:config.temperature},{reasoning:{efforts:[{id:'off'},{id:'high'}]}}),provider:config.provider,model:config.model};
    return {config:selected,stream:async function*(options){request=options;yield {type:'text-delta',text:JSON.stringify(assessment())};}};
  }}};
  const service=createLinkedMood(ctx,()=>({judgeProvider:'judge',judgeModel:'judge-model'}));
  assert.equal((await service.assess(memoryFixture(),{},'s',['e'])).status,'updated');
  assert.equal(selected.reasoningEffort,'off');assert.equal(request.model,'judge-model');
  assert.match(request.system,/"overall"/);assert.equal(request.system.includes('覆盖上面的输出格式'),false);
  service.close();
});
test('failed judge output is diagnosed without inventing mood or exposing raw provider text',async()=>{
  for(const [chunks,code] of [
    [[{type:'reasoning-delta',text:'do not log reasoning'}],'REASONING_ONLY'],
    [[{type:'text-delta',text:'not json'}],'INVALID_JSON'],
    [[{type:'text-delta',text:'{"moodDelta":3}'}],'INVALID_SCHEMA'],
    [[{type:'finish',reason:{kind:'error',failure:{message:'secret should not appear'}}}],'MODEL_ERROR']
  ]){
    const ctx={llm:{async *stream(){yield* chunks;}}},service=createLinkedMood(ctx,()=>({judgeProvider:'p',judgeModel:'m'})),memory=memoryFixture();
    const result=await service.assess(memory,{},'s',['e']);assert.equal(result.code,code);
    assert.equal(memory.mood(),null);assert.equal(service.diagnostics['nia:live'].status,'unavailable');
    assert.equal(JSON.stringify(service.diagnostics).includes('secret'),false);service.close();
  }
});

test('linked prompt honors label/off settings and hides inaccessible reasons', () => {
  let mode = 'label', accessible = true, prompt;
  const mood = { mood: 74, dims: zeroDims(), lastReason: '测试原因', evidenceIds: ['event-test'], lastDecayAt: Date.now() };
  const binding = { sessionId: 'test', actorIds: ['person'] };
  const memory = {
    binding: () => binding,
    mood: () => ({ version: 1, overall: mood, targets: { person: mood } }),
    events: () => { if (!accessible) throw new Error('private'); return []; },
  };
  const agent = { ctx: { systemPrompt: { context: p => { prompt = p; return () => {}; } } } };
  const service = new LinkedMood(async () => null, () => ({ injectMode: mode }));
  service.attach(memory, agent, binding);
  const state = () => JSON.parse(prompt.text().split('\n')[1]);
  assert.equal(state().overall.reason, '');
  assert.deepEqual(state().towardCurrentPeople.person.evidenceIds, []);
  mode = 'full';
  assert.equal(state().overall.reason, '测试原因');
  assert.deepEqual(state().overall.evidenceIds, ['event-test']);
  accessible = false;
  assert.equal(state().overall.reason, '');
  mode = 'off';
  assert.equal(prompt.text(), '');
  service.close();
});
