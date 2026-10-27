import test from 'node:test';
import assert from 'node:assert/strict';
import { PERSONA, assessmentPrompt, zeroDims, contextLine } from '../lib/emotion.js';
import { createLinkedMood } from '../lib/linked.js';
import fs from 'node:fs';

test('model-facing code and settings do not carry a fixed character name',()=>{
  for(const name of ['memory','qq','mood']) {
    const root=new URL(`../../dsh-nia-${name}/`,import.meta.url);
    for(const file of ['client.js',...fs.readdirSync(new URL('lib/',root)).filter(n=>n.endsWith('.js')).map(n=>'lib/'+n)])
      assert.doesNotMatch(fs.readFileSync(new URL(file,root),'utf8'),/妮娅/,`${name}/${file}`);
  }
});

test('fresh emotion defaults do not invent a name, gender or a fixed personality',()=>{
  assert.doesNotMatch(PERSONA,/妮娅|骄傲|女性 Agent/);
  const prompt=assessmentPrompt({});assert.match(prompt,/评估当前角色/);assert.doesNotMatch(prompt,/妮娅|不代替她/);
  assert.match(assessmentPrompt({self:'星澄',personaContext:'外向健谈，直说感受。'}),/外向健谈/);
  const text=contextLine({dims:zeroDims(),mood:65,updatedAt:Date.now(),lastReason:'新事件',lastConfidence:90},'event');
  assert.match(text,/你的情绪参考/);assert.doesNotMatch(text,/妮娅/);
});
test('QQ evaluation follows the binding name; desktop falls back to saved settings without rewriting persona background',async()=>{
  const requests=[];
  const ctx={get(){},llm:{async *stream(options){requests.push(options);yield {type:'text-delta',text:JSON.stringify({overall:{moodDelta:0,dims:zeroDims(),reason:'',confidence:90},targets:[]})};}}};
  const cfg={selfName:'桌面角色',ownerName:'朋友',selfAliases:'阿澄',personaContext:'外向健谈，直说感受。',relationshipContext:'长期朋友'};
  const service=createLinkedMood(ctx,()=>cfg);const agent={options:{provider:'test',model:'fake'}};
  try {
    await service.evaluate(agent,{binding:{personaId:'nia',characterName:'星澄'}},cfg);
    assert.match(requests.at(-1).system,/评估星澄这一轮/);assert.match(requests.at(-1).system,/用户称呼：朋友；角色昵称：阿澄/);
    assert.match(requests.at(-1).system,/外向健谈，直说感受/);assert.doesNotMatch(requests.at(-1).system,/妮娅/);
    await service.evaluate(agent,{binding:{personaId:'nia',characterName:'沈舟'}},cfg);
    assert.match(requests.at(-1).system,/评估沈舟这一轮/);
    await service.evaluate(agent,{binding:{personaId:'nia',transport:'local'}},cfg);
    assert.match(requests.at(-1).system,/评估桌面角色这一轮/);
    assert.equal(cfg.personaContext,'外向健谈，直说感受。');assert.equal(cfg.selfName,'桌面角色');
  } finally {service.close();}
});
