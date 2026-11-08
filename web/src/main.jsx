import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { parseExpected, parseAttributes } from './validation.mjs';
import { updateFlagInPlace } from './flag-state.mjs';
import './styles.css';

const ENV = ['development','staging','production'];
const envLabels = {development:'开发环境',staging:'预发布环境',production:'生产环境'};
const actions = {'flag.created':'创建 Flag','flag.updated':'修改信息','flag.enabled':'启用 Flag','flag.disabled':'停用 Flag','rule.created':'添加规则','rule.updated':'修改规则','rule.deleted':'删除规则'};
const date = s => new Date(s).toLocaleString('zh-CN',{hour12:false});
async function api(path, options={}) {
  const res = await fetch('/api'+path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
  let data; try { data=await res.json(); } catch { throw new Error('服务未返回 JSON，请检查 Go API 是否启动。'); }
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
  return data;
}
function Icon({name,size=20}) {
  const shapes={flag:<><path d="M5 21V3h14l-3 5 3 5H5"/></>,grid:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,play:<path d="m8 4 12 8-12 8Z"/>,plus:<path d="M12 5v14M5 12h14"/>,search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,arrow:<path d="m9 5 7 7-7 7"/>,back:<path d="m14 5-7 7 7 7"/>,check:<path d="m5 12 4 4L19 6"/>,bolt:<path d="m14 2-9 12h7l-2 8 9-12h-7Z"/>,clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,code:<><path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16"/></>,close:<path d="m6 6 12 12M6 18 18 6"/>};
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]||shapes.flag}</svg>;
}
function Badge({environment}) {return <span className={'badge env '+environment}><i/>{environment}</span>}
function Bool({value}) {return <code className={'bool '+(value?'yes':'no')}>{String(value)}</code>}
function Toggle({value,onChange,disabled,label}) {return <button className={'toggle '+(value?'on':'')} type="button" role="switch" aria-checked={value} aria-label={label} disabled={disabled} onClick={()=>onChange(!value)}><span/></button>}
function Empty({title,children}) {return <div className="empty"><span className="empty-icon"><Icon name="flag" size={28}/></span><h3>{title}</h3><p>{children}</p></div>}
function Modal({title,children,onClose,busy}) {
  const ref=useRef(null);
  useEffect(()=>{ref.current.showModal();return()=>ref.current?.close()},[]);
  return <dialog ref={ref} onCancel={e=>{e.preventDefault();if(!busy)onClose()}} onClick={e=>{if(e.target===ref.current&&!busy)onClose()}}><div className="modal-head"><h2>{title}</h2><button className="icon-button" aria-label="关闭弹窗" disabled={busy} onClick={onClose}><Icon name="close"/></button></div>{children}</dialog>;
}
function FlagForm({value,onSave,onClose,busy}) {
  const [f,setF]=useState(value||{name:'',key:'',environment:'development',enabled:true,default_value:false});
  const set=(k,v)=>setF(x=>({...x,[k]:v}));
  return <form onSubmit={e=>{e.preventDefault();onSave({name:f.name.trim(),key:f.key,environment:f.environment,enabled:f.enabled,default_value:f.default_value})}}>
    <label>Flag 名称<input autoFocus required maxLength={100} placeholder="例如：新版结算流程" value={f.name} onChange={e=>set('name',e.target.value)}/></label>
    <label>唯一 Key<input required pattern="[a-z][a-z0-9_\-]{0,63}" maxLength={64} placeholder="checkout_v2" value={f.key} onChange={e=>set('key',e.target.value)}/><small>小写字母开头，可包含数字、下划线和短横线；同一环境内唯一。</small></label>
    <label>部署环境<select value={f.environment} onChange={e=>set('environment',e.target.value)}>{ENV.map(x=><option key={x} value={x}>{envLabels[x]} · {x}</option>)}</select></label>
    <div className="form-split"><label>默认返回值<select value={String(f.default_value)} onChange={e=>set('default_value',e.target.value==='true')}><option value="false">false · 关闭</option><option value="true">true · 开启</option></select></label><div className="switch-field"><span>启用此 Flag</span><Toggle value={f.enabled} onChange={v=>set('enabled',v)} label="启用此 Flag"/></div></div>
    <div className="hint">停用时始终返回 false；启用后才会评估规则和默认值。</div>
    <div className="modal-footer"><button type="button" className="button" disabled={busy} onClick={onClose}>取消</button><button className="button primary" disabled={busy}>{busy?'保存中…':value?'保存修改':'创建 Flag'}</button></div>
  </form>;
}
function RuleForm({value,rules,onSave,onClose,busy}) {
  const [f,setF]=useState(value?{...value,expected:JSON.stringify(value.expected)}:{attribute:'country',operator:'equals',expected:'"CN"',result:true,priority:rules.length?Math.min(1000000,Math.max(...rules.map(r=>r.priority))+10):10});
  const [error,setError]=useState('');const set=(k,v)=>{setF(x=>({...x,[k]:v}));setError('')};
  return <form onSubmit={e=>{e.preventDefault();try{const expected=parseExpected(f.operator,f.expected);const priority=Number(f.priority);if(rules.some(r=>r.id!==value?.id&&r.priority===priority))throw new Error('该优先级已被使用，请选择另一个数字。');onSave({attribute:f.attribute,operator:f.operator,expected,result:f.result,priority})}catch(err){setError(err.message)}}}>
    <div className="hint">按优先级从小到大判断。首条命中即返回，后续规则不再计算。</div>
    <div className="form-split"><label>用户属性名<input autoFocus required maxLength={64} pattern="[A-Za-z_][A-Za-z0-9_.\-]{0,63}" value={f.attribute} onChange={e=>set('attribute',e.target.value)}/></label><label>操作符<select value={f.operator} onChange={e=>set('operator',e.target.value)}><option value="equals">equals · 等于</option><option value="in">in · 属于集合</option></select></label></div>
    <label>期望值 · JSON<textarea className="code-input" required rows={3} value={f.expected} onChange={e=>set('expected',e.target.value)}/><small>{f.operator==='equals'?'例如："CN"、42、true。不同类型不会自动转换。':'例如：["CN", "SG"]。支持 1～100 项字符串、数字或布尔值。'}</small></label>
    <div className="form-split"><label>优先级<input type="number" required min={0} max={1000000} step={1} value={f.priority} onChange={e=>set('priority',e.target.value)}/><small>数字越小越先匹配，不能重复。</small></label><label>命中返回值<select value={String(f.result)} onChange={e=>set('result',e.target.value==='true')}><option value="true">true · 开启</option><option value="false">false · 关闭</option></select></label></div>
    {error&&<div className="error" role="alert">{error}</div>}
    <div className="modal-footer"><button className="button" type="button" disabled={busy} onClick={onClose}>取消</button><button className="button primary" disabled={busy}>{busy?'保存中…':'保存规则'}</button></div>
  </form>;
}
function Evaluate({initial}) {
  const [key,setKey]=useState(initial?.key||'checkout_v2');const [environment,setEnv]=useState(initial?.environment||'production');
  const [attrs,setAttrs]=useState('{\n  "country": "CN",\n  "plan": "enterprise",\n  "user_id": "user_1024"\n}');
  const [result,setResult]=useState(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const reset=()=>{setResult(null);setError('')};
  async function submit(e){e.preventDefault();reset();try{const attributes=parseAttributes(attrs);setBusy(true);setResult(await api('/evaluate',{method:'POST',body:JSON.stringify({key,environment,attributes})}))}catch(err){setError(err.message)}finally{setBusy(false)}}
  return <><div className="page-heading"><div><p className="eyebrow">PLAYGROUND</p><h1>在线评估控制台</h1><p className="subtitle">用真实用户属性，验证每一次功能决策。</p></div><span className="badge neutral"><Icon name="code" size={15}/> Go API 实时评估</span></div>
    <div className="evaluation-grid"><section className="panel"><div className="section-heading"><h2>评估输入</h2><span className="muted">POST /api/evaluate</span></div><form onSubmit={submit}><fieldset disabled={busy}>
      <label>Flag Key<input required value={key} onChange={e=>{setKey(e.target.value);reset()}} placeholder="checkout_v2"/></label>
      <label>环境<select value={environment} onChange={e=>{setEnv(e.target.value);reset()}}>{ENV.map(x=><option key={x} value={x}>{envLabels[x]} · {x}</option>)}</select></label>
      <label>用户属性 · JSON 对象<textarea className="code-input editor" spellCheck="false" rows={10} value={attrs} onChange={e=>{setAttrs(e.target.value);reset()}}/></label>
      <div className="example-row"><span>快速示例</span><button type="button" className="text-button" onClick={()=>{setAttrs('{"plan":"enterprise"}');reset()}}>企业用户</button><button type="button" className="text-button" onClick={()=>{setAttrs('{"country":"US", "plan":"free"}');reset()}}>未命中用户</button></div>
      {error&&<div className="error" role="alert">{error}</div>}
      <button className="button primary wide" disabled={busy}><Icon name="play" size={16}/>{busy?'评估中…':'运行评估'}</button>
    </fieldset></form></section><section className="panel result-panel" aria-live="polite"><div className="section-heading"><h2>评估结果</h2><span className="badge neutral">只读 · 不修改配置</span></div>
      {!result?<Empty title={busy?'正在计算规则…':'等待一次评估'}>填写属性后点击运行，查看返回值和匹配路径。</Empty>:<><div className={'result-value '+(result.value?'positive':'negative')}><span>最终返回值</span><strong>{String(result.value)}</strong><span>{result.matched?'规则命中':result.reason==='disabled'?'Flag 已停用':'默认值回退'}</span></div><p className="result-explanation">{result.explanation}</p><h3>匹配路径</h3><div className="trace">{result.steps.map(s=><div key={s.rule_id} className={s.matched?'hit':''}><span className="trace-dot"/><span>规则 #{s.rule_id} <small>优先级 {s.priority}</small></span><b>{s.matched?'命中':'未命中'}</b></div>)}{result.reason!=='rule'&&<div><span className="trace-dot"/><span>{result.reason==='disabled'?'停用短路：不计算任何规则':'所有规则未命中：返回默认值'}</span><Bool value={result.value}/></div>}</div>{result.matched_rule&&<pre className="json-box">{JSON.stringify(result.matched_rule,null,2)}</pre>}</>}
    </section></div><div className="footnote"><Icon name="bolt" size={16}/> 首条命中即停止 · 严格类型匹配 · 数字越小优先级越高</div></>;
}
function App() {
  const [page,setPage]=useState('flags');const [flags,setFlags]=useState([]);const [loading,setLoading]=useState(true);const [loadError,setLoadError]=useState('');const [reload,setReload]=useState(0);
  const [search,setSearch]=useState('');const [environment,setEnvironment]=useState('');const [status,setStatus]=useState('');
  const [selected,setSelected]=useState(null);const [detail,setDetail]=useState(null);const [detailError,setDetailError]=useState('');const [detailTab,setDetailTab]=useState('rules');
  const [modal,setModal]=useState(null);const [busy,setBusy]=useState(false);const [actionError,setActionError]=useState('');const [toast,setToast]=useState('');const [evalInitial,setEvalInitial]=useState(null);
  useEffect(()=>{let active=true;setLoading(true);setLoadError('');api('/flags').then(d=>{if(active)setFlags(d)}).catch(e=>{if(active)setLoadError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[reload]);
  useEffect(()=>{if(!selected){setDetail(null);return}let active=true;setDetail(null);setDetailError('');api('/flags/'+selected).then(d=>{if(active)setDetail(d)}).catch(e=>{if(active)setDetailError(e.message)});return()=>{active=false}},[selected,reload]);
  useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(id)},[toast]);
  const openModal=m=>{setActionError('');setModal(m)};
  const closeModal=()=>{setModal(null);setActionError('')};
  const navigate=p=>{setPage(p);setSelected(null);setActionError('');if(p==='evaluate')setEvalInitial(null)};
  async function mutate(path,method,body,message){setBusy(true);setActionError('');try{const d=await api(path,{method,body:body===undefined?undefined:JSON.stringify(body)});setReload(x=>x+1);setToast(message);setModal(null);return d}catch(e){setActionError(e.message);return null}finally{setBusy(false)}}
  async function toggleFlag(id, enabled) {
    if (busy) return;
    setBusy(true);setActionError('');
    try {
      const updated = await api(`/flags/${id}/enabled`, {method:'PATCH',body:JSON.stringify({enabled})});
      // Do not trigger the full-list loading branch: unmounting the table shrinks
      // the document and clamps scrollTop; refetching also reorders updated rows.
      setFlags(current => updateFlagInPlace(current, updated));
      setDetail(current => current?.flag.id === id ? {...current,flag:updated} : current);
      setToast(updated.enabled ? 'Flag 已启用' : 'Flag 已停用');
      if (selected === id) {
        // Refresh audit history in place, without replacing the detail with a loader.
        try {
          const fresh = await api(`/flags/${id}`);
          setDetail(current => current?.flag.id === id ? fresh : current);
        } catch (error) {
          setActionError('状态已保存，但操作历史刷新失败：'+error.message);
        }
      }
    } catch (error) {setActionError(error.message)}
    finally {setBusy(false)}
  }
  const shown=flags.filter(f=>(!environment||f.environment===environment)&&(!status||String(f.enabled)===status)&&(!search||`${f.name} ${f.key}`.toLowerCase().includes(search.toLowerCase())));
  const goEval=f=>{setEvalInitial(f);setPage('evaluate');setSelected(null);setActionError('')};
  return <div className="shell"><aside className="sidebar"><a className="brand" href="#" onClick={e=>{e.preventDefault();navigate('flags')}}><span className="brand-symbol"><Icon name="flag" size={23}/></span><span>Flag Studio<small>FEATURE MANAGEMENT</small></span></a><div className="workspace"><span className="workspace-avatar">D</span><span>Demo Workspace<small>本地开发工作区</small></span><span className="workspace-dot"/></div><p className="nav-label">工作台</p><nav><button className={page==='flags'?'active':''} onClick={()=>navigate('flags')}><Icon name="grid"/>Feature Flags<span className="nav-count">{flags.length}</span></button><button className={page==='evaluate'?'active':''} onClick={()=>navigate('evaluate')}><Icon name="code"/>评估控制台</button></nav><div className="sidebar-note"><Icon name="bolt"/><strong>小范围验证，稳步发布。</strong><p>用有序规则控制功能开放，让每一次变更都有迹可循。</p><span>React + Go + PostgreSQL</span></div><div className="profile"><span className="avatar">D</span><span>Demo Admin<small>固定演示操作者</small></span><span className="profile-dot"/></div></aside>
    <div className="main-shell"><header className="topbar"><div><span className="muted">工作区</span><span className="crumb">/</span><span>{page==='flags'?'Feature Flags':'评估控制台'}</span>{selected&&<><span className="crumb">/</span><span>配置详情</span></>}</div><span className="demo-label"><i/> DEMO MODE</span></header><main>
      {actionError&&!modal&&<div className="error" role="alert">{actionError}<button className="text-button" onClick={()=>setActionError('')}>关闭</button></div>}
      {page==='evaluate'?<Evaluate key={evalInitial?`${evalInitial.key}-${evalInitial.environment}`:'generic'} initial={evalInitial}/>:selected?<>
        <button className="back-link" onClick={()=>{setSelected(null);setActionError('')}}><Icon name="back" size={15}/>返回 Flag 列表</button>
        {detailError?<div className="error" role="alert">{detailError}<button className="button" onClick={()=>setReload(x=>x+1)}>重试</button></div>:!detail?<div className="loading" role="status">正在加载配置与历史…</div>:<>
          <div className="page-heading detail-heading"><div><p className="eyebrow">FLAG CONFIGURATION</p><h1>{detail.flag.name}</h1><div className="detail-meta"><code>{detail.flag.key}</code><Badge environment={detail.flag.environment}/><span className={'state '+(detail.flag.enabled?'live':'')}>{detail.flag.enabled?'已启用':'已停用'}</span></div></div><div className="button-row"><button className="button" disabled={busy} onClick={()=>openModal({type:'flag',value:detail.flag})}>编辑信息</button><button className="button primary" onClick={()=>goEval(detail.flag)}><Icon name="play" size={15}/>测试评估</button></div></div>
          <div className="config-strip"><div><span>Flag 开关</span><Toggle value={detail.flag.enabled} disabled={busy} label="切换当前 Flag 状态" onChange={v=>toggleFlag(selected,v)}/></div><div><span>默认返回值</span><Bool value={detail.flag.default_value}/></div><div><span>匹配规则</span><strong>{detail.rules.length} 条</strong></div><div><span>最近更新</span><small>{date(detail.flag.updated_at)}</small></div></div>
          {!detail.flag.enabled&&<div className="hint amber">此 Flag 已停用。所有评估固定返回 false，规则和默认值暂不生效。</div>}
          <div className="tabs"><button className={detailTab==='rules'?'active':''} onClick={()=>setDetailTab('rules')}>匹配规则 <span>{detail.rules.length}</span></button><button className={detailTab==='history'?'active':''} onClick={()=>setDetailTab('history')}>操作历史 <span>{detail.history.length}</span></button></div>
          {detailTab==='rules'?<section className="panel"><div className="section-heading"><div><h2>有序匹配规则</h2><p>数字越小越先匹配 · 首条命中即返回 · 不允许重复优先级</p></div><button className="button primary" disabled={busy} onClick={()=>openModal({type:'rule'})}><Icon name="plus" size={17}/>添加规则</button></div>{!detail.rules.length?<Empty title="还没有匹配规则">添加第一条规则，或直接使用默认返回值。</Empty>:<div className="rule-list">{detail.rules.map((r,i)=><div className="rule-card" key={r.id}><span className="rule-order">{String(i+1).padStart(2,'0')}</span><div className="rule-expression"><div><code>{r.attribute}</code><span className="operator">{r.operator}</span><code className="expected">{JSON.stringify(r.expected)}</code></div><small>优先级 {r.priority} <span>·</span> 规则 #{r.id}</small></div><div className="rule-return"><span>返回</span><Bool value={r.result}/></div><div className="rule-actions"><button className="text-button" disabled={busy} onClick={()=>openModal({type:'rule',value:r})}>编辑</button><button className="text-button danger" disabled={busy} onClick={()=>openModal({type:'delete',value:r})}>删除</button></div></div>)}</div>}<div className="default-rule"><span className="default-icon">↳</span><div><strong>默认回退</strong><p>没有规则命中时，返回 Flag 默认值。</p></div><Bool value={detail.flag.default_value}/></div></section>:<section className="panel"><div className="section-heading"><div><h2>操作历史</h2><p>业务变更与历史原子写入 · 最新操作在前</p></div><Icon name="clock"/></div><div className="history-list">{detail.history.map(h=><article key={h.id}><span className="history-icon"><Icon name={h.action.startsWith('rule')?'code':'flag'} size={16}/></span><div><div className="history-heading"><strong>{actions[h.action]||h.action}</strong><time>{date(h.created_at)}</time></div><p>{h.summary}</p><small>{h.actor} · #{h.id}</small><details><summary>查看变更数据</summary><pre className="json-box">{JSON.stringify(h.changes,null,2)}</pre></details></div></article>)}</div></section>}
          <p className="footnote">创建于 {date(detail.flag.created_at)} · 时间按浏览器所在时区显示</p>
        </>}
      </>:<>
        <div className="page-heading"><div><p className="eyebrow">RELEASE WITH CONFIDENCE</p><h1>Feature Flags<span className="heading-dot"/></h1><p className="subtitle">掌控功能开放节奏，让每次发布更从容。</p></div><button className="button primary" onClick={()=>openModal({type:'flag'})}><Icon name="plus" size={18}/>新建 Flag</button></div>
        <div className="stats"><div><span className="stat-icon purple"><Icon name="flag"/></span><div><span>全部 Flags</span><strong>{loading?'—':flags.length}<small>个功能配置</small></strong></div></div><div><span className="stat-icon green"><Icon name="bolt"/></span><div><span>已启用</span><strong>{loading?'—':flags.filter(f=>f.enabled).length}<small>正在提供评估</small></strong></div></div><div><span className="stat-icon blue"><Icon name="grid"/></span><div><span>部署环境</span><strong>3<small>开发 / 预发布 / 生产</small></strong></div></div></div>
        <section className="flag-table-panel"><div className="filterbar"><div className="search-input"><Icon name="search" size={18}/><input aria-label="搜索 Flag 名称或 Key" placeholder="搜索名称或 Key…" value={search} onChange={e=>setSearch(e.target.value)}/></div><select aria-label="筛选环境" value={environment} onChange={e=>setEnvironment(e.target.value)}><option value="">全部环境</option>{ENV.map(x=><option key={x} value={x}>{envLabels[x]}</option>)}</select><select aria-label="筛选启用状态" value={status} onChange={e=>setStatus(e.target.value)}><option value="">全部状态</option><option value="true">已启用</option><option value="false">已停用</option></select><button className="text-button" disabled={loading} onClick={()=>setReload(x=>x+1)}>刷新</button></div>
        {loadError?<div className="error" role="alert">{loadError}<button className="button" onClick={()=>setReload(x=>x+1)}>重试</button></div>:loading?<div className="loading" role="status">正在从 PostgreSQL 加载配置…</div>:!shown.length?<Empty title={flags.length?'没有找到匹配的 Flag':'创建你的第一个 Flag'}>{flags.length?'试试其他关键词，或清除筛选条件。':'点击右上方「新建 Flag」，开始配置你的功能开关。'}</Empty>:<div className="table-scroll"><table><thead><tr><th>功能名称 / KEY</th><th>环境</th><th>启用状态</th><th>默认值</th><th>更新时间</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{shown.map(f=><tr key={f.id}><td><button className="flag-name" onClick={()=>{setSelected(f.id);setDetailTab('rules');setActionError('')}}><span className="flag-mini"><Icon name="flag" size={18}/></span><span><strong>{f.name}</strong><code>{f.key}</code></span></button></td><td><Badge environment={f.environment}/></td><td><div className="inline-state"><Toggle value={f.enabled} disabled={busy} label={`${f.name} ${f.environment} 启用状态`} onChange={v=>toggleFlag(f.id,v)}/><span>{f.enabled?'已启用':'已停用'}</span></div></td><td><Bool value={f.default_value}/></td><td className="table-date">{date(f.updated_at)}</td><td><button className="icon-button" aria-label={`查看 ${f.name} 详情`} onClick={()=>{setSelected(f.id);setDetailTab('rules')}}><Icon name="arrow" size={17}/></button></td></tr>)}</tbody></table></div>}
        <div className="table-footer"><span>显示 {shown.length} 个配置，共 {flags.length} 个</span><span>同一 Key 可用于不同环境</span></div></section>
        <div className="bottom-callout"><span className="callout-icon"><Icon name="code" size={24}/></span><div><strong>上线之前，先验证一次。</strong><p>输入用户属性，实时查看规则命中过程与最终返回值。</p></div><button className="text-button" onClick={()=>navigate('evaluate')}>打开评估控制台 <Icon name="arrow" size={15}/></button></div>
        <div className="footnote"><Icon name="check" size={15}/> 配置持久化至 PostgreSQL <span>·</span> 每一次业务变更均保留历史</div>
      </>}
    </main></div>
    {toast&&<div className="toast" role="status"><Icon name="check" size={18}/>{toast}</div>}
    {modal&&<Modal title={modal.type==='flag'?(modal.value?'编辑 Flag':'新建 Feature Flag'):modal.type==='rule'?(modal.value?'编辑规则':'添加匹配规则'):'删除匹配规则'} onClose={closeModal} busy={busy}>{actionError&&<div className="error" role="alert">{actionError}</div>}{modal.type==='flag'?<FlagForm value={modal.value} busy={busy} onClose={closeModal} onSave={async body=>{const d=await mutate(modal.value?`/flags/${modal.value.id}`:'/flags',modal.value?'PUT':'POST',body,modal.value?'配置已保存':'Flag 已创建');if(d){setSelected(d.id);setDetailTab('rules');setPage('flags')}}}/>:modal.type==='rule'?<RuleForm value={modal.value} rules={detail?.rules||[]} busy={busy} onClose={closeModal} onSave={body=>mutate(`/flags/${selected}/rules${modal.value?'/'+modal.value.id:''}`,modal.value?'PUT':'POST',body,'规则已保存')}/>:<><p>确定删除规则 #{modal.value.id}（优先级 {modal.value.priority}）？删除后将立即影响评估结果，操作会记录在历史中。</p><div className="modal-footer"><button className="button" disabled={busy} onClick={closeModal}>取消</button><button className="button destructive" disabled={busy} onClick={()=>mutate(`/flags/${selected}/rules/${modal.value.id}`,'DELETE',undefined,'规则已删除')}>{busy?'删除中…':'确认删除'}</button></div></>}</Modal>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
