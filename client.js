window.__ModuleLoader__.load({ id: 'dsh-nia-mood', factory: require=>{
 const React=require('react');
  const CSS = `
  [data-nia-panel]{--n-bg:var(--dsw-alias-bg-layer-1,#fafaf9);--n-line:var(--dsw-alias-border-l2,#8885);--n-muted:var(--dsw-alias-label-tertiary,#888);--n-accent:var(--dsw-alias-state-business-primary,#168575);font:inherit;font-size:13px;line-height:1.65;color:inherit;max-width:920px;padding:8px 4px 28px;box-sizing:border-box}
  [data-nia-panel] *{box-sizing:border-box}[data-nia-panel] h2{font-size:21px;margin:0;font-weight:650}[data-nia-panel] h3{font-size:14px;margin:0 0 12px}[data-nia-panel] p{margin:6px 0}
  [data-nia-panel] .nia-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px}[data-nia-panel] .nia-muted{color:var(--n-muted);font-size:12px}[data-nia-panel] .nia-card{border:1px solid var(--n-line);border-radius:10px;background:var(--n-bg);padding:16px;margin:12px 0}
  [data-nia-panel] button,[data-nia-panel] input,[data-nia-panel] textarea{font:inherit;color:inherit;border:1px solid var(--n-line);border-radius:6px;background:var(--n-bg);padding:7px 10px;min-height:34px;max-width:100%}[data-nia-panel] button{cursor:pointer}[data-nia-panel] button:hover{background:color-mix(in srgb,var(--n-accent) 8%,var(--n-bg))}[data-nia-panel] :focus-visible{outline:2px solid var(--n-accent);outline-offset:2px}[data-nia-panel] button:disabled{opacity:.5;cursor:default}
  [data-nia-panel] input:not([type=checkbox]),[data-nia-panel] textarea{width:100%}[data-nia-panel] input[type=checkbox]{min-height:auto;accent-color:var(--n-accent);margin:0 8px 0 0}[data-nia-panel] .nia-field{display:grid;grid-template-columns:minmax(140px, .8fr) minmax(200px,1.5fr);gap:18px;align-items:start;padding:10px 0;border-bottom:1px solid color-mix(in srgb,var(--n-line) 45%,transparent)}
  [data-nia-panel] .nia-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}[data-nia-panel] .nia-stack{display:grid;gap:8px}[data-nia-panel] .nia-tabs{display:flex;gap:4px;border-bottom:1px solid var(--n-line);padding-bottom:8px;flex-wrap:wrap}[data-nia-panel] .nia-tabs button{border-color:transparent;background:transparent}[data-nia-panel] .nia-tabs button[aria-selected=true]{background:color-mix(in srgb,var(--n-accent) 10%,transparent);color:inherit;font-weight:600;border-color:var(--n-line)}
  [data-nia-panel] .nia-save{position:sticky;bottom:0;border:1px solid var(--n-line);border-radius:8px;background:var(--n-bg);padding:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;z-index:3;box-shadow:0 -3px 12px #00000008}[data-nia-panel] .nia-primary{background:var(--n-accent);color:white;border-color:var(--n-accent)}[data-nia-panel] .nia-primary:hover{filter:brightness(.95)}
  [data-nia-panel] .nia-message{padding:9px 12px;border-left:3px solid var(--n-accent);background:color-mix(in srgb,var(--n-accent) 6%,transparent);white-space:pre-wrap;overflow-wrap:anywhere;margin:12px 0}[data-nia-panel] [role=alert]{border-color:#c45b4e;color:#bb5147}[data-nia-panel] .nia-empty{padding:18px 0;color:var(--n-muted)}
  [data-nia-panel] .nia-picker{min-width:0}[data-nia-panel] .nia-picker>button{width:100%;text-align:left;display:flex;justify-content:space-between;gap:8px}[data-nia-panel] .nia-picker-list{border:1px solid var(--n-line);padding:8px;margin-top:5px;border-radius:8px;max-height:260px;overflow:auto;background:var(--n-bg)}[data-nia-panel] [role=option]{width:100%;display:block;text-align:left;border:0;white-space:normal;overflow-wrap:anywhere;margin-top:3px}[data-nia-panel] [role=option][aria-selected=true]{background:color-mix(in srgb,var(--n-accent) 12%,transparent)}
  [data-nia-panel] .nia-chip{font-size:11px;border:1px solid var(--n-line);padding:2px 7px;border-radius:5px;white-space:nowrap}[data-nia-panel] .nia-record{padding:12px 0;border-bottom:1px solid var(--n-line)}[data-nia-panel] pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;background:color-mix(in srgb,var(--n-line) 12%,transparent);padding:10px;border-radius:6px;max-height:320px;overflow:auto}[data-nia-panel] summary{cursor:pointer;padding:5px 0}[data-nia-panel] .nia-number{font-size:34px;font-weight:600;line-height:1.2}[data-nia-panel] .nia-metrics{display:flex;gap:24px;flex-wrap:wrap;margin:12px 0}
  @media(max-width:620px){[data-nia-panel] .nia-field{grid-template-columns:1fr;gap:6px}[data-nia-panel] .nia-card{padding:12px}}`;
  const h = React.createElement;
  const card = (title, ...children) => h('section', {className:'nia-card'}, h('h3',null,title), ...children);
  const note = text => h('p',{className:'nia-muted'},text);
  const empty = text => h('div',{className:'nia-empty'},text);
  const fmt = at => at ? new Date(at).toLocaleString() : '未记录';
  const details = (title,value) => h('details',null,h('summary',null,title),h('pre',null,JSON.stringify(value,null,2)));
  function Picker({label, value, options, onChange, placeholder='请选择', emptyText='暂无可选项，请刷新后重试', disabled=false}) {
    const [open,setOpen] = React.useState(false), [query,setQuery] = React.useState('');
    const selected = options.find(o=>o.value===value);
    return h('div',{className:'nia-picker',onKeyDown:e=>{if(e.key==='Escape')setOpen(false);}},
      h('button',{type:'button','aria-label':label,'aria-expanded':open,'aria-haspopup':'listbox',disabled,onClick:()=>setOpen(!open)},h('span',null,selected?.label || value || placeholder),h('span',{'aria-hidden':true},open?'▴':'▾')),
      open?h('div',{className:'nia-picker-list'},h('input',{'aria-label':'搜索'+label,placeholder:'搜索…',value:query,onChange:e=>setQuery(e.target.value)}),
        h('div',{role:'listbox','aria-label':label},...options.filter(o=>(o.label+' '+o.value).toLowerCase().includes(query.toLowerCase())).map(o=>h('button',{type:'button',role:'option',key:o.value,'aria-selected':o.value===value,onClick:()=>{onChange(o.value);setOpen(false);setQuery('');}},o.label))),
        !options.length?empty(emptyText):null):null);
  }
  const field=(label,control,hint)=>h('div',{className:'nia-field'},h('div',null,h('strong',null,label),hint?note(hint):null),control);
  const tabs=(items,current,set)=>h('div',{className:'nia-tabs',role:'tablist'},...items.map(([id,label])=>h('button',{key:id,role:'tab','aria-selected':current===id,onClick:()=>set(id)},label)));
  const message=(text,error=false)=>text?h('div',{className:'nia-message',role:error?'alert':'status'},text):null;
  const root=(name,...children)=>h('div',{'data-nia-panel':name},h('style',null,CSS),...children);
  const header=(title,subtitle,action)=>h('div',{className:'nia-head'},h('div',null,h('h2',null,title),note(subtitle)),action);
  async function request(base,path,body) {
    const response=await fetch(base+'/'+path,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'content-type':'application/json',['x-nia-'+base.split('-').at(-1)]:'1'},body:JSON.stringify(body)});
    let data; try {data=await response.json();} catch {throw Error('服务未返回有效数据（HTTP '+response.status+'），请检查插件是否启用。');}
    if(!response.ok || data.ok===false)throw Error(data.error || '请求失败（HTTP '+response.status+'）'); return data;
  }
  const api=(p,b)=>request('/dsh-nia-mood',p,b);
  const dimensionNames={happy:'开心',calm:'安心',sweet:'亲近',heartache:'心疼',worry:'担心',sad:'难过',jealous:'吃醋',anger:'生气',hurt:'受伤',curious:'好奇',bored:'无聊',proud:'得意'};
  function Panel(){
    const [cfg,setCfg]=React.useState(null),[saved,setSaved]=React.useState(null),[state,setState]=React.useState(null),[linked,setLinked]=React.useState(null);
    const [sessions,setSessions]=React.useState([]),[workspaces,setWorkspaces]=React.useState([]),[models,setModels]=React.useState([]);
    const [tab,setTab]=React.useState('linked'),[busy,setBusy]=React.useState(false),[notice,setNotice]=React.useState(''),[error,setError]=React.useState('');
    const [selection,setSelection]=React.useState(''),[legacyKey,setLegacyKey]=React.useState('');
    const [liveError,setLiveError]=React.useState('');
    const [manageMode,setManageMode]=React.useState('linked'),[historySid,setHistorySid]=React.useState(''),[historyActor,setHistoryActor]=React.useState('overall'),[history,setHistory]=React.useState(null),[previewText,setPreviewText]=React.useState(null),[clearPhrase,setClearPhrase]=React.useState('');
    const refresh=async(initial=false)=>{
      setError('');
      const results=await Promise.allSettled([api('config'),api('state'),api('sessions'),api('workspaces'),api('models'),api('linked')]);
      const setters=[v=>{setSaved(v.config);if(initial)setCfg(v.config);},setState,v=>setSessions(v.sessions||[]),v=>setWorkspaces(v.workspaces||[]),v=>setModels(v.providers||[]),setLinked];
      const failures=[];results.forEach((r,i)=>{if(r.status==='fulfilled')setters[i](r.value);else failures.push(r.reason.message);});
      if(failures.length)setError(failures.join('\n'));
    };
    React.useEffect(()=>{void refresh(true);},[]);
    React.useEffect(()=>{
      if(tab!=='linked')return;
      let stopped=false,pending=false;
      const timer=setInterval(async()=>{
        if(pending)return;pending=true;
        try{const next=await api('linked');if(!stopped){setLinked(next);setLiveError('');}}
        catch(e){if(!stopped)setLiveError('自动刷新失败，当前显示上次读取的值：'+e.message);}
        finally{pending=false;}
      },5000);
      return()=>{stopped=true;clearInterval(timer);};
    },[tab]);
    const edit=(key,value)=>{setCfg(c=>({...c,[key]:value}));setNotice('');};
    const dirty=!!cfg&&JSON.stringify(cfg)!==JSON.stringify(saved);
    const save=async()=>{
      setBusy(true);setError('');setNotice('');
      try{
        const next={...cfg};
        const limits={moodBase:[30,100],moodFloor:[0,100],decayHalfHours:[1,168],judgeConfidence:[0,100],injectConfidence:[0,100],sigMood:[1,30],sigDim:[1,100],injectPerDay:[0,50]};
        for(const [key,[min,max]]of Object.entries(limits)){
          if(String(next[key]).trim()===''||!Number.isFinite(Number(next[key]))||Number(next[key])<min||Number(next[key])>max)throw Error(key+' 应填写 '+min+'–'+max+' 之间的数值');
          next[key]=Number(next[key]);
        }
        if(!!next.judgeProvider!==!!next.judgeModel)throw Error('请同时选择判断提供方和模型，或都留空以跟随会话。');
        const r=await api('config',next);setCfg(r.config);setSaved(r.config);setNotice('设置已保存。基线用于后续恢复趋势，不会立刻改写当前心情。');
      }catch(e){setError('保存失败：'+e.message);}finally{setBusy(false);}
    };
    const input=(key,label)=>h('input',{'aria-label':label,value:cfg[key]??'',disabled:busy,onChange:e=>edit(key,e.target.value)});
    const number=(key,label,hint,min,max)=>field(label,h('input',{'aria-label':label,type:'number',min,max,value:cfg[key]??'',disabled:busy,onChange:e=>edit(key,e.target.value)}),hint);
    const select=(label,value,options,change,placeholder)=>h(Picker,{label,value,options,onChange:change,placeholder,disabled:busy});
    if(!cfg)return root('mood',header('角色情绪','0.4.0'),message(error,true),empty('读取设置中…'),h('button',{onClick:()=>refresh(true)},'重新读取'));
    const choices=Object.keys(linked?.moods||{}),key=choices.includes(selection)?selection:choices.find(x=>x.endsWith(':live'))||choices[0];
    const current=linked?.moods?.[key],personName=id=>linked?.people?.find(p=>p.id===id)?.alias||linked?.people?.find(p=>p.id===id)?.name||id;
    const moodNumber=n=>Number(Number(n).toFixed(1));
    const stateCard=(title,s)=>card(title,h('div',{className:'nia-metrics'},h('div',null,h('div',{className:'nia-number'},moodNumber(s.mood)),note('已计入时间衰减 · 每 5 秒刷新')),
      h('div',null,...Object.entries(s.dims||{}).filter(([,n])=>n>=1).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,n])=>h('span',{key:k,className:'nia-chip',style:{marginRight:6}},(dimensionNames[k]||k)+' '+Math.round(n))))),
      h('p',null,s.lastReason?'上次变化：'+s.lastReason:'还没有具体事件'),note('上次事件 '+fmt(s.updatedAt)),note('计算至 '+fmt(linked?.calculatedAt)));
    const linkedPage=h('div',null,
      card('同一个角色，跨聊天延续',h('p',null,'QQ 联动会自动接入，不需要选择工作区或逐个绑定会话。'),note('总体心情共享，对不同人的态度分别记录。当前值包含时间衰减；查看页面不会改写记录或调用模型。')),
      message(liveError,true),
      card('情绪评估状态',...(Object.entries(linked?.diagnostics||{}).map(([id,d])=>h('div',{key:id,className:'nia-record'},
        h('strong',null,id.replace(':live',' · 正式').replace(':preview',' · 预演')+' · '+({running:'评估中',updated:'已更新',unchanged:'没有新事件',off:'已关闭',cancelled:'已取消',unavailable:'评估失败',failed:'状态异常'}[d.status]||d.status)),
        d.message?h('p',null,d.message):null,note('最近评估 '+fmt(d.at)+(d.lastSuccessAt?' · 最近成功 '+fmt(d.lastSuccessAt):' · 尚无成功记录'))))),
        !Object.keys(linked?.diagnostics||{}).length?note('尚无评估记录。接入聊天并收到新消息后，会显示成功或具体失败原因。'):null),
      !linked?.available?message('尚未连接角色记忆服务。请启用记忆插件，再在 QQ 设置中打开联动。'):null,
      linked?.available&&!linked.enabled?message('记忆服务已暂停，联动不会继续更新。'):null,
      choices.length?select('查看联动状态',key,choices.map(v=>({value:v,label:v.replace(':live',' · 正式').replace(':preview',' · 预演')})),setSelection):null,
      current?stateCard('当前心情',current.overall):card('整体心情',
        h('div',{className:'nia-metrics'},h('div',null,h('div',{className:'nia-number'},linked?.available?Math.round(linked.baseline??saved?.moodBase??70):'—'),note(linked?.available?'初始参考 · 已保存的基线':'暂无法读取联动状态'))),
        h('p',null,linked?.available?'尚未产生联动情绪记录；此数值是基线参考，不是已评估的当前心情。':'连接记忆服务后才能确认是否已有情绪记录。'),
        note(linked?.available?((linked.bindings||[]).length?'已有聊天接入，等待首次有效情绪评估。':'当前还没有聊天接入。QQ 请在“角色 · QQ”开启联动；桌面会话请在“角色记忆 → 会话接入”绑定。'):'请确认记忆插件已启用，再点击“刷新列表和状态”。')),
      current?card('对具体人物的感受',...Object.entries(current.targets||{}).map(([id,s])=>h('div',{key:id,className:'nia-record'},h('strong',null,personName(id)),note(id),h('p',null,'当前心情 '+moodNumber(s.mood)),h('p',null,s.lastReason?'上次变化：'+s.lastReason:'没有明显变化'),note(Object.entries(s.dims||{}).filter(([,v])=>v>=1).map(([k,v])=>(dimensionNames[k]||k)+' '+Math.round(v)).join(' · '))))):null,
      card('已自动接入的聊天',...(linked?.bindings||[]).map(b=>h('div',{key:b.sessionId,className:'nia-record'},h('span',{className:'nia-chip'},b.preview?'预演':'正式'),' ',b.type==='group'?'群聊':'私聊',note(b.chatId))),!linked?.bindings?.length?empty('暂无绑定。'):null));
    const settingsPage=h('div',null,
      card('角色称呼',field('桌面角色名',input('selfName','桌面角色名'),'QQ 联动优先读取 QQ 设置中的角色名；桌面联动和独立模式使用这里的称呼。'),field('对方称呼',input('ownerName','对方称呼')),field('角色昵称',input('selfAliases','角色昵称'))),
      card('基本设置',field('自动判断情绪',h('label',null,h('input',{type:'checkbox',checked:cfg.autoJudge,disabled:busy,onChange:e=>edit('autoJudge',e.target.checked)}),'启用'), '关闭后停止新的模型评估；已有情绪仍可随时间减弱。'),
        number('moodBase','基线心情','平静时逐渐趋近的数值，不是“立即把当前心情设为这个值”。',30,100),number('moodFloor','心情下限','允许心情降到的最低值。',0,100),number('decayHalfHours','整体心情半衰期（小时）','数值越大，情绪对整体心情的影响持续越久。',1,168),
        number('judgeConfidence','判断可信度门槛','低于门槛的评估不累加状态。',0,100),
        field('情绪背景',select('情绪背景',cfg.injectMode,[{value:'off',label:'关闭，仅记录'},{value:'label',label:'只提供情绪'},{value:'event',label:'提供情绪及事件缘由'}],v=>edit('injectMode',v)))),
      card('判断模型',field('提供方',select('判断提供方',cfg.judgeProvider,[{value:'',label:'跟随当前会话'},...models.map(p=>({value:p.id,label:p.name||p.id}))],v=>{edit('judgeProvider',v);edit('judgeModel','');})),
        field('模型',select('判断模型',cfg.judgeModel,[{value:'',label:'跟随当前会话（同时清空提供方）'},...(models.find(p=>p.id===cfg.judgeProvider)?.models||[]).map(m=>({value:m.id,label:m.name||m.id}))],v=>edit('judgeModel',v)))),
      card('评估用的人格背景',field('人格摘要',h('textarea',{'aria-label':'人格摘要',rows:5,value:cfg.personaContext||'',onChange:e=>edit('personaContext',e.target.value),disabled:busy})),
        field('关系背景',h('textarea',{'aria-label':'关系背景',rows:3,value:cfg.relationshipContext||'',onChange:e=>edit('relationshipContext',e.target.value),disabled:busy})),note('这里只供情绪评估器参考。更换角色时请同步更新摘要；完整角色卡仍由角色会话管理。')),
      h('details',null,h('summary',null,'独立模式专用参数'),card('仅影响旧独立模式',
        number('injectConfidence','注入可信度门槛','联动状态不使用旧的一次性注入机制。',0,100),number('sigMood','显著心情变化门槛','独立模式参数。',1,30),number('sigDim','显著维度变化门槛','独立模式参数。',1,100),number('injectPerDay','每日注入次数上限','独立模式参数。',0,50))));
    const slots=cfg.slots||[];
    const changeSlot=(i,p)=>edit('slots',slots.map((s,j)=>i===j?{...s,...p}:s));
    const legacyPage=h('div',null,
      message('这是保留给未接入联动的会话使用的兼容设置。QQ 联动不需要在这里选会话或工作区。'),
      card('绑定方式',select('独立模式绑定方式',cfg.模式,[{value:'session',label:'按会话选择'},{value:'workspace',label:'按工作区选择'}],v=>edit('模式',v))),
      ...slots.map((s,i)=>card(s.label||'独立心情 '+(i+1),field('名称',h('input',{'aria-label':'独立心情名称 '+(i+1),value:s.label||'',disabled:busy,onChange:e=>changeSlot(i,{label:e.target.value})})),
        cfg.模式==='workspace'?field('工作区',select('工作区 '+(i+1),s.工作区||'',workspaces.map(w=>({value:w.name,label:(w.path||w.name)+' · '+w.sessions+' 个会话'})),v=>changeSlot(i,{工作区:v}), '选择工作区')):
        h('div',null,...(s.sessions||[]).map(id=>h('div',{key:id,className:'nia-row'},h('span',null,sessions.find(x=>x.id===id)?.title||id),h('button',{disabled:busy,onClick:()=>changeSlot(i,{sessions:s.sessions.filter(x=>x!==id)})},'取消绑定'))),select('添加会话 '+(i+1),'',sessions.filter(x=>!slots.some(s=>(s.sessions||[]).includes(x.id))).map(x=>({value:x.id,label:x.title+(x.live?' · 已打开':'')})),v=>changeSlot(i,{sessions:[...(s.sessions||[]),v]}),'选择要添加的会话')),
        h('button',{disabled:busy,onClick:()=>edit('slots',slots.filter((_,j)=>j!==i))},'移除此独立分组'))),
      h('button',{disabled:busy||slots.length>=6,onClick:()=>edit('slots',[...slots,{id:'',label:'',sessions:[],工作区:''}])},'添加独立分组'),
      card('独立模式当前记录',select('查看独立心情',legacyKey||state?.key||'',(state?.slots||[]).map(s=>({value:s.id,label:s.label||s.id})),async v=>{setLegacyKey(v);try{setState(await api('state?key='+encodeURIComponent(v)));}catch(e){setError(e.message);}}),state?h('p',null,'心情 '+state.mood+' · '+(state.lastReason||'暂无事件')):null));
    const selectedSid=historySid||(linked?.bindings||[])[0]?.sessionId||'';
    const historyBinding=(linked?.bindings||[]).find(b=>b.sessionId===selectedSid);
    const historyKey=historyBinding?historyBinding.personaId+(historyBinding.preview?':preview':':live'):'';
    const historyTargets=Object.keys(linked?.moods?.[historyKey]?.targets||{});
    const manage=async(action,offset=0)=>{setBusy(true);setError('');try{
      const result=await api('manage',{action,mode:manageMode,sessionId:selectedSid,key:legacyKey||state?.key||'',actorId:historyActor,offset,confirm:clearPhrase});
      if(action==='preview')setPreviewText(result);else setHistory(result);
      if(action==='reset'||action==='clear-history'){setPreviewText(null);setNotice(action==='reset'?'当前状态已回到基线，历史保留':'历史已清空，当前状态未改变');setClearPhrase('');await refresh(false);}
    }catch(e){setError(e.message);}finally{setBusy(false);}};
    const historyPage=h('div',null,card('查看范围',field('情绪模式',select('历史情绪模式',manageMode,[{value:'linked',label:'联动模式'},{value:'legacy',label:'独立模式'}],v=>{setManageMode(v);setHistory(null);setPreviewText(null);})),
      manageMode==='linked'?h('div',null,field('会话',select('情绪历史会话',selectedSid,(linked?.bindings||[]).map(b=>({value:b.sessionId,label:b.chatId+(b.preview?' · 预演':' · 正式')})),v=>{setHistorySid(v);setHistoryActor('overall');setHistory(null);setPreviewText(null);})),
        field('情绪对象',select('历史情绪对象',historyActor,[{value:'overall',label:'整体心情'},...historyTargets.map(id=>({value:id,label:personName(id)}))],v=>{setHistoryActor(v);setHistory(null);}))) : field('独立分组',select('历史独立分组',legacyKey||state?.key||'',(state?.slots||[]).map(s=>({value:s.id,label:s.label||s.id})),v=>{setLegacyKey(v);setHistory(null);setPreviewText(null);})),
      h('div',{className:'nia-row'},h('button',{disabled:busy,onClick:()=>manage('history')},'读取情绪时间线'),h('button',{disabled:busy,onClick:()=>manage('preview')},'查看注入内容'))),
      history?card('情绪时间线',note('共 '+history.total+' 条 · 从最近变化往前查看'),...history.rows.map((r,i)=>h('div',{key:i,className:'nia-record'},h('strong',null,fmt(r.at)+' · 心情 '+Number(r.mood).toFixed(1)),h('p',null,r.reason||'没有文字原因'),note('变化 '+Number(r.delta||0).toFixed(2)+(r.kind==='reset'?' · 管理重置':'')),details('维度与来源',{dims:r.dims,changes:r.dimsDelta,evidenceIds:r.evidenceIds,confidence:r.conf}))),
        h('div',{className:'nia-row'},h('button',{disabled:busy||history.offset===0,onClick:()=>manage('history',Math.max(0,history.offset-30))},'较新的记录'),h('button',{disabled:busy||history.offset+30>=history.total,onClick:()=>manage('history',history.offset+30)},'更早的记录')),note('新版不再裁掉第 100 条之前的联动记录；旧版已经丢弃的历史无法重建。')):null,
      previewText?card('注入诊断',note('预览不会消耗次数或修改情绪。“上次读取”表示宿主装配上下文时读取过，不等于 QQ 已发送。'),h('strong',null,'当前预览'),h('pre',{style:{whiteSpace:'pre-wrap',maxHeight:300,overflow:'auto'}},previewText.preview||'当前没有可注入的情绪内容'),h('strong',null,'上次宿主读取'),note(fmt(previewText.lastRead?.at)),h('pre',{style:{whiteSpace:'pre-wrap',maxHeight:300,overflow:'auto'}},previewText.lastRead?.text||'本次运行尚无读取记录')):null,
      card('状态管理',note('只作用于上方选择的整体或人物情绪。重置不代表原谅，不重复处理过去事件。'),h('button',{disabled:busy,onClick:()=>manage('reset')},'重置当前状态，保留历史'),
        h('details',null,h('summary',null,'单独清空历史'),note('只清空所选对象的时间线，不改变当前情绪。请先导出或备份；填写“清空历史”后才能执行。'),field('清空确认',h('input',{'aria-label':'清空历史确认',value:clearPhrase,onChange:e=>setClearPhrase(e.target.value)})),h('button',{disabled:busy||clearPhrase!=='清空历史',onClick:()=>manage('clear-history')},'确认清空所选历史'))));
    return root('mood',header('角色情绪','0.4.0 · 联动状态与判断设置',h('button',{disabled:busy,onClick:()=>refresh(false)},'刷新列表和状态')),
      tabs([['linked','联动心情'],['settings','判断设置'],['legacy','独立模式（兼容）'],['history','历史与诊断']],tab,setTab),message(error,true),message(notice),
      tab==='linked'?linkedPage:tab==='settings'?settingsPage:tab==='history'?historyPage:legacyPage,
      h('div',{className:'nia-save'},h('span',{style:{flex:1},role:'status'},busy?'正在保存…':dirty?'有未保存的修改':'设置已同步'),h('button',{disabled:busy||!dirty,onClick:()=>{setCfg(saved);setNotice('已撤销未保存修改');}},'撤销修改'),h('button',{className:'nia-primary',disabled:busy||!dirty,onClick:save},'保存设置')));
  }

 return {inject:['slots'],apply(ctx){const slots=ctx.get?.('slots')||ctx.slots;slots.inject('settings.section',()=>slots.register({name:'settings.section',id:'nia-mood',order:41,label:'角色情绪'},()=>h(Panel)));}};
}});
