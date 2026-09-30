import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Search, Trash2, X } from 'lucide-react';
import { INTERVIEW_RESULTS, INTERVIEW_ROUNDS, localDate, removeInterview, saveInterview } from '../../lib/storage';
import { getUnrecordedInterviewEvents } from '../../lib/interview-reminders';
import type { Application, InterviewRecord, InterviewResult, InterviewRound, PlanEvent } from '../../lib/storage';
import './interviews.css';

type Draft = Omit<InterviewRecord, 'id' | 'createdAt' | 'updatedAt'>;
type Props = { apps: Application[]; interviews: InterviewRecord[]; events: PlanEvent[]; refresh: () => Promise<void>; setError: (error: string) => void };
const emptyDraft = (app?: Application, event?: PlanEvent): Draft => ({
  applicationId: app?.id || '', company: app?.company || '', position: app?.position || '',
  round: app && INTERVIEW_ROUNDS.includes(app.stage as InterviewRound) ? app.stage as InterviewRound : '一面',
  date: event?.start.slice(0,10) || localDate(), interviewer: '', location: '', result: '待定',
  process: '', questions: [], specialQuestions: '', reminders: '', reflection: '', eventId: event?.id || '',
});
const dateText = (date: string) => date || '未填写日期';

export default function InterviewPage({ apps, interviews, events, refresh, setError }: Props) {
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<InterviewRecord | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const groups = useMemo(() => {
    const filtered = interviews.filter(i => `${apps.find(a => a.id === i.applicationId)?.company || i.company} ${apps.find(a => a.id === i.applicationId)?.position || i.position} ${i.round} ${i.questions.map(q => q.question).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));
    const map = new Map<string, InterviewRecord[]>();
    for (const item of filtered) {
      const key = item.applicationId || `${item.company}\u0000${item.position}`;
      map.set(key, [...(map.get(key) || []), item]);
    }
    return [...map.entries()].map(([key, rows]) => ({ key, company:apps.find(a => a.id === rows[0].applicationId)?.company || rows[0].company, position:apps.find(a => a.id === rows[0].applicationId)?.position || rows[0].position, rows: rows.sort((a,b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)) })).sort((a,b) => b.rows[b.rows.length-1].date.localeCompare(a.rows[a.rows.length-1].date));
  }, [apps, interviews, query]);
  const unrecorded = getUnrecordedInterviewEvents(apps, events, interviews, localDate());
  const linkedEvents = events.filter(e => e.type === '面试' && e.applicationId === draft.applicationId);
  function open(record: InterviewRecord | 'new' = 'new', app?: Application, event?: PlanEvent) {
    setModal(record);
    setDraft(record === 'new' ? emptyDraft(app, event) : {
      applicationId:record.applicationId, company:record.company, position:record.position,
      round:record.round, date:record.date, interviewer:record.interviewer, location:record.location,
      result:record.result, process:record.process, questions:record.questions.map(q => ({...q})),
      specialQuestions:record.specialQuestions, reminders:record.reminders, reflection:record.reflection,
      eventId:record.eventId || '',
    });
    setError('');
  }
  function selectApp(id: string) {
    const app = apps.find(a => a.id === id);
    setDraft(d => ({ ...d, applicationId:id, company:app?.company || d.company, position:app?.position || d.position, eventId:'' }));
  }
  function selectEvent(id: string) {
    const event = events.find(e => e.id === id);
    setDraft(d => ({ ...d, eventId:id, date:event?.start.slice(0,10) || d.date }));
  }
  function updateQuestion(id: string, key: 'question' | 'answer', value: string) {
    setDraft(d => ({...d, questions:d.questions.map(q => q.id === id ? {...q, [key]:value} : q)}));
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const app = apps.find(a => a.id === draft.applicationId);
    if (!app && modal === 'new') { setError('请选择关联岗位'); return; }
    if (!draft.date) { setError('请填写面试日期'); return; }
    const questions = draft.questions.map(q => ({...q, question:q.question.trim(), answer:q.answer.trim()})).filter(q => q.question || q.answer);
    if (questions.some(q => !q.question)) { setError('填写了回答的问答条目需要补上问题'); return; }
    try {
      setSaving(true); setError('');
      const now = new Date().toISOString();
      await saveInterview({ ...draft, company:app?.company || draft.company, position:app?.position || draft.position,
        questions, interviewer:draft.interviewer.trim(), location:draft.location.trim(),
        id:modal === 'new' ? crypto.randomUUID() : modal!.id,
        createdAt:modal === 'new' ? now : modal!.createdAt, updatedAt:now });
      await refresh(); setModal(null);
    } catch (err) { setError(err instanceof Error ? err.message : '面试记录保存失败'); }
    finally { setSaving(false); }
  }
  async function remove(record: InterviewRecord) {
    if (!window.confirm(`删除「${record.company} · ${record.round}」这条面试记录？关联日程不会删除。`)) return;
    try { await removeInterview(record.id); await refresh(); setError(''); } catch (err) { setError(err instanceof Error ? err.message : '删除失败'); }
  }
  return <>
    <div className="page-head"><div><div className="eyebrow">YOUR WORKSPACE / INTERVIEWS</div><h1>面试记录</h1><p>按岗位保存每一轮面试的问题、回答和复盘，不覆盖之前的记录。</p></div><button className="primary" onClick={() => open()}><Plus size={17}/> 添加面试记录</button></div>
    <div className="interview-summary"><strong>{groups.length}</strong> 家公司 / 岗位 · <strong>{interviews.length}</strong> 条面试记录</div>
    {unrecorded.length > 0 && <section className="interview-unrecorded"><strong>有 {unrecorded.length} 个面试阶段的岗位可补写复盘</strong><div>{unrecorded.slice(0,4).map(event => { const app = apps.find(a => a.id === event.applicationId)!; return <button key={event.id} onClick={() => open('new',app,event)}>{app.company} · {event.start.slice(0,10)} <span>补写复盘 →</span></button>; })}</div></section>}
    <div className="interview-toolbar"><div className="search-box"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索公司、岗位、轮次或面试问题…"/></div></div>
    {groups.length ? <div className="interview-groups">{groups.map(group => <section className="panel interview-group" key={group.key}><div className="interview-group-head"><div><strong>{group.company}</strong><span>{group.position}</span></div><span>{group.rows.length} 次面试</span></div><div className="interview-rounds">{group.rows.map(row => { const isOpen = expanded.has(row.id); return <article className="interview-round" key={row.id}><button className="interview-round-top" onClick={() => setExpanded(old => { const next = new Set(old); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; })} aria-expanded={isOpen}><span className="interview-round-name">{row.round}</span><span className="interview-round-date">{dateText(row.date)}</span><span className={`interview-result ${row.result === '通过' ? 'passed' : row.result === '未通过' ? 'failed' : ''}`}>{row.result}</span>{isOpen ? <ChevronDown size={17}/> : <ChevronRight size={17}/>}</button>{isOpen && <div className="interview-details"><div className="interview-facts">{row.interviewer && <span><b>面试官</b>{row.interviewer}</span>}{row.location && <span><b>地点 / 方式</b>{row.location}</span>}{!row.interviewer && !row.location && <span>尚未记录面试官和地点</span>}</div>{row.process && <div className="interview-section"><h3>面试流程</h3><p>{row.process}</p></div>}{row.questions.length > 0 && <div className="interview-section"><h3>问题与回答</h3>{row.questions.map((q,index) => <div className="qa-display" key={q.id}><strong>Q{index+1} · {q.question}</strong><p>{q.answer || '尚未记录回答'}</p></div>)}</div>}{row.specialQuestions && <div className="interview-section"><h3>面试官的特殊提问</h3><p>{row.specialQuestions}</p></div>}{row.reminders && <div className="interview-section"><h3>提醒与后续准备</h3><p>{row.reminders}</p></div>}{row.reflection && <div className="interview-section"><h3>面试复盘</h3><p>{row.reflection}</p></div>}{!row.process && !row.questions.length && !row.specialQuestions && !row.reminders && !row.reflection && <p className="interview-empty-detail">这轮面试还没有填写复盘，点击编辑补充。</p>}<div className="interview-round-actions"><button className="outline" onClick={() => open(row)}>编辑记录</button><button className="danger-text" onClick={() => void remove(row)}><Trash2 size={15}/> 删除</button></div></div>}</article>; })}<button className="interview-add-round" onClick={() => open('new', apps.find(a => a.id === group.rows[0].applicationId))}><Plus size={15}/> 添加下一轮（保留已有记录）</button></div></section>)}</div> : <div className="panel empty-panel"><strong>{query ? '没有匹配的面试记录' : '还没有面试记录'}</strong><p>选择一个已跟踪的岗位，开始记录面试流程和问答。</p><button className="outline" onClick={() => open()}>添加面试记录</button></div>}
    {modal && <div className="modal-backdrop interview-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}><div className="modal interview-modal" role="dialog" aria-modal="true" aria-labelledby="interview-title"><div className="modal-head"><div><small>INTERVIEW NOTES</small><h2 id="interview-title">{modal === 'new' ? '添加面试记录' : '编辑面试记录'}</h2></div><button className="icon-button" aria-label="关闭" onClick={() => setModal(null)}><X size={20}/></button></div><form onSubmit={e => void save(e)}><div className="interview-form-body"><label className="field"><span>关联岗位 *</span><select required={modal === 'new'} value={draft.applicationId} onChange={e => selectApp(e.target.value)}><option value="">{modal === 'new' ? '请选择岗位' : '原岗位已删除（保留记录）'}</option>{apps.map(app => <option key={app.id} value={app.id}>{app.company} · {app.position}</option>)}</select></label>{!draft.applicationId && modal !== 'new' && <p className="interview-legacy-note">原岗位已删除，此记录仍会保留，可重新关联其他岗位。</p>}<div className="two-fields"><label className="field"><span>面试轮次 *</span><select value={draft.round} onChange={e => setDraft({...draft, round:e.target.value as InterviewRound})}>{INTERVIEW_ROUNDS.map(r => <option key={r}>{r}</option>)}</select></label><label className="field"><span>面试日期 *</span><input required type="date" value={draft.date} onChange={e => setDraft({...draft, date:e.target.value})}/></label></div>{linkedEvents.length > 0 && <label className="field"><span>关联面试日程（可选）</span><select value={draft.eventId || ''} onChange={e => selectEvent(e.target.value)}><option value="">不关联日程</option>{linkedEvents.map(event => <option key={event.id} value={event.id}>{event.start.slice(0,16).replace('T',' ')} · {event.title}</option>)}</select></label>}<div className="two-fields"><label className="field"><span>面试官</span><input maxLength={150} value={draft.interviewer} onChange={e => setDraft({...draft,interviewer:e.target.value})} placeholder="姓名或部门"/></label><label className="field"><span>地点 / 形式</span><input maxLength={200} value={draft.location} onChange={e => setDraft({...draft,location:e.target.value})} placeholder="线上 / 线下地点"/></label></div><label className="field"><span>面试结果</span><select value={draft.result} onChange={e => setDraft({...draft,result:e.target.value as InterviewResult})}>{INTERVIEW_RESULTS.map(r => <option key={r}>{r}</option>)}</select></label><label className="field"><span>面试流程</span><textarea rows={3} maxLength={5000} value={draft.process} onChange={e => setDraft({...draft,process:e.target.value})} placeholder="如：自我介绍 → 项目追问 → 技术问答 → 反问环节"/></label><div className="interview-qa-header"><strong>问题与回答</strong><button type="button" onClick={() => setDraft(d => ({...d,questions:[...d.questions,{id:crypto.randomUUID(),question:'',answer:''}]}))}><Plus size={15}/> 添加问题</button></div>{draft.questions.map((q,index) => <div className="interview-qa-edit" key={q.id}><div><strong>问题 {index+1}</strong><button type="button" aria-label={`删除问题 ${index+1}`} onClick={() => setDraft(d => ({...d, questions:d.questions.filter(item => item.id !== q.id)}))}><X size={16}/></button></div><label className="field"><span>问题</span><textarea rows={2} maxLength={2000} value={q.question} onChange={e => updateQuestion(q.id,'question',e.target.value)} placeholder="面试官问了什么？"/></label><label className="field"><span>你的回答 / 更好的回答</span><textarea rows={3} maxLength={5000} value={q.answer} onChange={e => updateQuestion(q.id,'answer',e.target.value)} placeholder="记录回答要点，后续可以继续修改"/></label></div>)}<label className="field"><span>面试官特殊提问</span><textarea rows={3} maxLength={5000} value={draft.specialQuestions} onChange={e => setDraft({...draft,specialQuestions:e.target.value})} placeholder="值得特别记录的追问、情景题等"/></label><label className="field"><span>提醒与后续准备</span><textarea rows={3} maxLength={5000} value={draft.reminders} onChange={e => setDraft({...draft,reminders:e.target.value})} placeholder="后续跟进、资料补充、下次要注意的事"/></label><label className="field"><span>面试复盘</span><textarea rows={4} maxLength={8000} value={draft.reflection} onChange={e => setDraft({...draft,reflection:e.target.value})} placeholder="表现亮点、可以改进的地方、下一轮准备"/></label></div><div className="modal-foot"><div className="foot-spacer"/><button type="button" className="outline" onClick={() => setModal(null)}>取消</button><button type="submit" disabled={saving} className="primary">{saving ? '保存中…' : '保存面试记录'}</button></div></form></div></div>}
  </>;
}
