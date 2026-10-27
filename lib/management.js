import { zeroDims } from './emotion.js';
export function resetCurrent(state,base,{clearHistory=false,now=Date.now()}={}){
  const s=structuredClone(state),previous=s.mood;
  s.mood=base;s.dims=zeroDims();s.lastReason='';s.lastConfidence=0;s.updatedAt=now;s.lastDecayAt=now;s.lastNotedMood=base;s.evidenceIds=[];
  s.injectedFor=now;s.lastInjectedText='';s.lastInjectedAt=0;
  s.timeline=clearHistory?[]:[...(s.timeline||[]),{at:now,mood:base,delta:base-previous,reason:'管理操作：重置当前状态；不代表已原谅或事件已解决',kind:'reset',dims:zeroDims(),conf:null}];
  return s;
}
export function historyPage(state,offset=0,limit=30){
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw Error('历史分页参数无效');
  const rows=state?.timeline||[];return {total:rows.length,offset,rows:rows.slice().reverse().slice(offset,offset+limit)};
}
