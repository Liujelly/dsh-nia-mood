import test from 'node:test';
import assert from 'node:assert/strict';
import { resetCurrent, historyPage } from '../lib/management.js';
import { LinkedMood } from '../lib/linked.js';
import { zeroDims } from '../lib/emotion.js';
const state=()=>({mood:40,dims:{...zeroDims(),anger:30},lastReason:'旧事件',lastConfidence:90,lastDecayAt:Date.now(),updatedAt:1,timeline:Array.from({length:105},(_,at)=>({at,mood:40,reason:'事件'}))});
test('reset retains history and records administrative cause; pagination accesses records beyond 100',()=>{
  const original=state(),next=resetCurrent(original,65);assert.equal(next.mood,65);assert.equal(next.dims.anger,0);assert.equal(next.timeline.length,106);assert.equal(original.timeline.length,105);
  assert.equal(next.timeline.at(-1).kind,'reset');assert.equal(historyPage(next,100).rows.length,6);
  assert.equal(resetCurrent(original,65,{clearHistory:true}).timeline.length,0);assert.throws(()=>historyPage(next,-1));
});
test('linked updates retain older history; preview is read-only and host reads are recorded separately',async()=>{
  let stored={version:0,overall:state(),targets:{},processed:{},events:{}};let context;
  const binding={sessionId:'s',actorIds:['alice']};const memory={binding:()=>binding,mood:()=>structuredClone(stored),moodKey:()=> 'nia:live',events:()=>[{id:'e1',actorId:'alice',text:'新事件'}],contacts:()=>[],recall:()=>[],commitMood:(_sid,version,next)=>{assert.equal(version,stored.version);stored={...next,version:version+1};return stored;}};
  const mood=new LinkedMood(async()=>({overall:{moodDelta:3,dims:zeroDims(),reason:'新变化',confidence:90},targets:[]}),()=>({moodBase:65,injectMode:'event'}));
  mood.attach(memory,{ctx:{systemPrompt:{context:x=>{context=x;return ()=>{};}}}},binding);
  await mood.assess(memory,{},'s',['e1']);assert.equal(stored.overall.timeline.length,106);
  const before=JSON.stringify(stored);assert.match(mood.preview(memory,'s'),/新变化/);assert.equal(mood.lastReads.size,0);context.text();assert.equal(mood.lastReads.size,1);assert.equal(JSON.stringify(stored),before);mood.close();
});
