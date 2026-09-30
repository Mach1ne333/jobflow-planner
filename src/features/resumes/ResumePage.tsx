import { useRef, useState } from 'react';
import { Download, FileText, Link2, Paperclip, Pencil, Plus, Search, Trash2, UploadCloud, X } from 'lucide-react';
import { MAX_RESUME_SIZE, removeResume, saveResume } from '../../lib/storage';
import type { Application, ResumeRecord } from '../../lib/storage';
import './resumes.css';

interface Props {
  apps: Application[];
  resumes: ResumeRecord[];
  refresh: () => Promise<void>;
  setError: (error: string) => void;
}
const accepted = '.pdf,.doc,.docx';
function checkFile(file: File) {
  if (!/\.(pdf|doc|docx)$/i.test(file.name)) throw new Error('仅支持 PDF、DOC 和 DOCX 文件');
  if (file.size > MAX_RESUME_SIZE) throw new Error('单份简历不能超过 10 MB');
  if (!file.size) throw new Error('不能上传空文件');
}
export default function ResumePage({ apps, resumes, refresh, setError }: Props) {
  const importedNames = Array.from(new Set(apps.map(a => a.resumeVersion?.trim()).filter((v): v is string => !!v)));
  const placeholders = importedNames.filter(name => !resumes.some(r => r.name === name));
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<ResumeRecord | 'new' | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const entries = [...resumes.map(r => ({ name:r.name, record:r })), ...placeholders.map(name => ({ name, record:null }))].filter(r => r.name.toLowerCase().includes(query.toLowerCase())).sort((a,b) => a.name.localeCompare(b.name, 'zh-CN'));
  const countUsage = (name: string) => apps.filter(a => a.resumeVersion === name).length;
  function open(record: ResumeRecord | 'new' = 'new', name = '') {
    setModal(record); setDraftName(record === 'new' ? name : record.name);
    setDraftNotes(record === 'new' ? '' : record.notes); setFile(null); setError('');
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const name = draftName.trim();
    if (!name) return;
    if (resumes.some(r => r.name === name && (modal === 'new' || r.id !== modal?.id))) { setError('简历版本名称已存在'); return; }
    try {
      if (file) checkFile(file);
      setPending(true); setError('');
      const previous = modal === 'new' ? undefined : modal || undefined;
      await saveResume({ id:previous?.id || crypto.randomUUID(), name, notes:draftNotes.trim(),
        filename:file?.name || previous?.filename || '', mimeType:file?.type || previous?.mimeType || '',
        size:file?.size || previous?.size || 0, updatedAt:new Date().toISOString(),
        blob:file || previous?.blob }, previous?.name);
      await refresh(); setModal(null);
    } catch (err) { setError(err instanceof Error ? err.message : '保存简历失败'); }
    finally { setPending(false); }
  }
  async function remove(record: ResumeRecord) {
    if (!window.confirm(`删除「${record.name}」及其本地附件？已关联岗位仍保留版本名称，但无法再下载附件。`)) return;
    try { await removeResume(record.id); await refresh(); } catch (err) { setError(err instanceof Error ? err.message : '删除失败'); }
  }
  function download(record: ResumeRecord) {
    if (!record.blob) return;
    const url = URL.createObjectURL(record.blob);
    const link = document.createElement('a'); link.href = url; link.download = record.filename || record.name;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function browse() { uploadRef.current?.click(); }
  return <>
    <div className="page-head"><div><div className="eyebrow">YOUR WORKSPACE / RESUMES</div><h1>简历管理</h1><p>集中管理每个版本，并追踪它用在哪些岗位上。</p></div><button className="primary" onClick={() => open()}><Plus size={17}/> 添加简历</button></div>
    <div className="resume-stats"><div><strong>{resumes.length + placeholders.length}</strong><span>简历版本</span></div><div><strong>{resumes.filter(r => r.blob).length}</strong><span>已存附件</span></div><div><strong>{placeholders.length}</strong><span>仅有版本名称</span></div></div>
    <div className="resume-hint"><UploadCloud size={19}/><span>附件仅保存在当前浏览器；请定期通过右上角「导出 JSON 备份」备份文件。OfferFlow 迁移的版本名称不包含原始附件，可在下方补传。</span></div>
    <div className="resume-toolbar"><div className="search-box"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索简历版本…"/></div><span>共 {entries.length} 个版本</span></div>
    {entries.length ? <div className="resume-grid">{entries.map(({ name, record }) => <article className="resume-card" key={record?.id || name}><div className="resume-card-head"><div className={`resume-icon ${record?.blob ? 'stored' : ''}`}><FileText size={21}/></div><span className={`resume-status ${record?.blob ? 'stored' : 'missing'}`}>{record?.blob ? '已存附件' : '待上传附件'}</span></div><h3 title={name}>{name}</h3><p>{record?.filename || '目前仅保存版本名称，未保存简历文件'}</p>{record?.notes && <div className="resume-notes">{record.notes}</div>}<div className="resume-meta"><Link2 size={14}/> 关联 {countUsage(name)} 个岗位 {record?.blob && <span> · {(record.size / 1024).toFixed(0)} KB</span>}</div><div className="resume-actions">{record?.blob && <button onClick={() => download(record)}><Download size={15}/> 下载</button>}<button onClick={() => open(record || 'new', name)}><Pencil size={15}/> {record ? '编辑' : '补充文件'}</button>{record && <button className="resume-delete" title="删除简历" aria-label={`删除 ${name}`} onClick={() => void remove(record)}><Trash2 size={15}/></button>}</div></article>)}</div> : <div className="panel empty-panel"><FileText size={26}/><strong>{query ? '没有匹配的简历' : '还没有简历版本'}</strong><p>添加新版本，或从已迁移岗位的版本名称补传附件。</p><button className="outline" onClick={() => open()}>添加简历</button></div>}
    {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="resume-title"><div className="modal-head"><div><small>RESUME VERSION</small><h2 id="resume-title">{modal === 'new' ? '添加简历' : '编辑简历'}</h2></div><button className="icon-button" aria-label="关闭" onClick={() => setModal(null)}><X size={20}/></button></div><form onSubmit={e => void save(e)}><div className="form-grid"><label className="field"><span>版本名称 *</span><input required maxLength={150} value={draftName} onChange={e => setDraftName(e.target.value)} placeholder="例如：算法工程师简历 v2"/></label><label className="field"><span>文件（PDF、DOC、DOCX；不超过 10 MB）</span><input ref={uploadRef} type="file" accept={accepted} hidden onChange={e => { const next = e.target.files?.[0] || null; if (next) { try { checkFile(next); setFile(next); if (!draftName) setDraftName(next.name.replace(/\.(pdf|doc|docx)$/i,'')); setError(''); } catch (err) { setError(err instanceof Error ? err.message : '文件无效'); e.target.value = ''; } } }}/><button type="button" className="resume-upload" onClick={browse}><Paperclip size={17}/><span>{file?.name || (modal !== 'new' && modal.filename) || '点击选择本地简历文件'}</span></button></label><label className="field"><span>版本备注</span><textarea rows={3} maxLength={2000} value={draftNotes} onChange={e => setDraftNotes(e.target.value)} placeholder="适用岗位、修改重点或投递记录…"/></label></div><div className="modal-foot"><span className="resume-modal-tip">不选文件时可仅保存版本名称。</span><div className="foot-spacer"/><button type="button" className="outline" onClick={() => setModal(null)}>取消</button><button className="primary" disabled={pending} type="submit">{pending ? '保存中…' : '保存简历'}</button></div></form></div></div>}
  </>;
}
