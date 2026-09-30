import { openDB } from 'idb';

export const STAGES = ['未投递', '已投递', '简历通过', '笔试通过', 'AI面试', '一面', '二面', 'HR面', 'Offer', '已拒', '无回复'] as const;
export type Stage = typeof STAGES[number];
export const TYPES = ['面试', '笔试', '投递截止', '跟进', '其他'] as const;
export type EventType = typeof TYPES[number];
export interface StatusChange { id: string; stage: Stage; date: string }
export interface Application {
  id: string; company: string; position: string; stage: Stage; channel: string;
  url: string; appliedAt: string; notes: string; createdAt: string;
  jobType?: string; department?: string; resumeVersion?: string;
  statusHistory?: StatusChange[]; statusEntryId?: string;
}
export interface PlanEvent {
  id: string; title: string; type: EventType; applicationId: string;
  start: string; end: string; allDay: boolean; completed: boolean; notes: string;
}
export interface ResumeRecord {
  id: string; name: string; notes: string; filename: string; mimeType: string;
  size: number; updatedAt: string; blob?: Blob;
}
export interface ResumeBackup extends Omit<ResumeRecord, 'blob'> { data: string }
export const INTERVIEW_ROUNDS = ['AI面试', '一面', '二面', 'HR面', '其他'] as const;
export const INTERVIEW_RESULTS = ['待定', '通过', '未通过', '取消'] as const;
export type InterviewRound = typeof INTERVIEW_ROUNDS[number];
export type InterviewResult = typeof INTERVIEW_RESULTS[number];
export interface InterviewQuestion { id: string; question: string; answer: string }
export interface InterviewRecord {
  id: string; applicationId: string; company: string; position: string;
  round: InterviewRound; date: string; interviewer: string; location: string;
  result: InterviewResult; process: string; questions: InterviewQuestion[];
  specialQuestions: string; reminders: string; reflection: string;
  createdAt: string; updatedAt: string; eventId?: string;
}
export interface Backup { version: 1 | 2 | 3; exportedAt: string; applications: Application[]; events: PlanEvent[]; resumes?: ResumeBackup[]; interviews?: InterviewRecord[] }
export const MAX_RESUME_SIZE = 10 * 1024 * 1024;

const dbPromise = openDB('jobflow-planner', 3, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('applications')) db.createObjectStore('applications', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('resumes')) db.createObjectStore('resumes', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('interviews')) db.createObjectStore('interviews', { keyPath: 'id' });
  },
});
export async function loadData() {
  const db = await dbPromise;
  const [applications, events, resumes, interviews] = await Promise.all([
    db.getAll('applications') as Promise<Application[]>, db.getAll('events') as Promise<PlanEvent[]>,
    db.getAll('resumes') as Promise<ResumeRecord[]>, db.getAll('interviews') as Promise<InterviewRecord[]>,
  ]);
  return { applications, events, resumes, interviews };
}
export async function saveApplication(value: Application) { await (await dbPromise).put('applications', value); }
export async function saveEvent(value: PlanEvent) { await (await dbPromise).put('events', value); }
export async function removeApplication(id: string) {
  const db = await dbPromise;
  const tx = db.transaction(['applications', 'events', 'interviews'], 'readwrite');
  await tx.objectStore('applications').delete(id);
  const events = await tx.objectStore('events').getAll() as PlanEvent[];
  for (const event of events) if (event.applicationId === id) await tx.objectStore('events').put({ ...event, applicationId: '' });
  const interviews = await tx.objectStore('interviews').getAll() as InterviewRecord[];
  for (const interview of interviews) if (interview.applicationId === id) await tx.objectStore('interviews').put({ ...interview, applicationId: '' });
  await tx.done;
}
export async function removeEvent(id: string) {
  const db = await dbPromise;
  const tx = db.transaction(['events', 'interviews'], 'readwrite');
  await tx.objectStore('events').delete(id);
  const interviews = await tx.objectStore('interviews').getAll() as InterviewRecord[];
  for (const interview of interviews) if (interview.eventId === id) await tx.objectStore('interviews').put({ ...interview, eventId: '' });
  await tx.done;
}
export async function saveInterview(value: InterviewRecord) { await (await dbPromise).put('interviews', value); }
export async function removeInterview(id: string) { await (await dbPromise).delete('interviews', id); }
export async function saveResume(value: ResumeRecord, oldName?: string) {
  const db = await dbPromise;
  const tx = db.transaction(['resumes', 'applications'], 'readwrite');
  await tx.objectStore('resumes').put(value);
  if (oldName && oldName !== value.name) {
    const apps = await tx.objectStore('applications').getAll() as Application[];
    for (const app of apps) if (app.resumeVersion === oldName) await tx.objectStore('applications').put({ ...app, resumeVersion: value.name });
  }
  await tx.done;
}
export async function removeResume(id: string) { await (await dbPromise).delete('resumes', id); }

function isRecord(x: unknown): x is Record<string, unknown> { return !!x && typeof x === 'object' && !Array.isArray(x); }
function string(x: unknown): x is string { return typeof x === 'string'; }
export function parseBackup(raw: unknown): Backup {
  if (!isRecord(raw) || ![1,2,3].includes(raw.version as number) || !Array.isArray(raw.applications) || !Array.isArray(raw.events) || ((raw.version === 2 || raw.version === 3) && !Array.isArray(raw.resumes)) || (raw.version === 3 && !Array.isArray(raw.interviews))) throw new Error('不是有效的 JobFlow 备份文件');
  const applications = raw.applications;
  const events = raw.events;
  const resumes = raw.version === 2 || raw.version === 3 ? raw.resumes as unknown[] : [];
  const interviews = raw.version === 3 ? raw.interviews as unknown[] : [];
  if (applications.length > 10000 || events.length > 20000 || resumes.length > 500 || interviews.length > 10000) throw new Error('备份文件过大');
  const appIds = new Set<string>();
  const eventIds = new Set<string>();
  const resumeIds = new Set<string>();
  const resumeNames = new Set<string>();
  const interviewIds = new Set<string>();
  for (const a of applications) {
    if (!isRecord(a) || !['id','company','position','channel','url','appliedAt','notes','createdAt'].every(k => string(a[k])) || !STAGES.includes(a.stage as Stage) || !a.id || !a.company || !a.position || appIds.has(a.id as string)) throw new Error('备份中的岗位数据不完整或重复');
    if (['jobType','department','resumeVersion'].some(k => a[k] !== undefined && !string(a[k]))) throw new Error('备份中的岗位扩展字段格式不正确');
    if (a.statusHistory !== undefined) {
      if (!Array.isArray(a.statusHistory) || a.statusHistory.length > 1000) throw new Error('岗位状态历史格式不正确');
      const ids = new Set<string>();
      for (const item of a.statusHistory) {
        if (!isRecord(item) || !string(item.id) || !item.id || !STAGES.includes(item.stage as Stage) || !string(item.date) || (item.date && (!/^\d{4}-\d{2}-\d{2}$/.test(item.date) || !Number.isFinite(Date.parse(item.date)))) || ids.has(item.id)) throw new Error('岗位状态节点格式不正确');
        ids.add(item.id);
      }
      if (a.statusEntryId !== undefined && (!string(a.statusEntryId) || !a.statusHistory.some((h: unknown) => isRecord(h) && h.id === a.statusEntryId && h.stage === a.stage))) throw new Error('当前状态与历史节点不匹配');
    } else if (a.statusEntryId !== undefined) throw new Error('当前状态缺少历史节点');
    appIds.add(a.id as string);
  }
  for (const e of events) {
    if (!isRecord(e) || !['id','title','applicationId','start','end','notes'].every(k => string(e[k])) || !TYPES.includes(e.type as EventType) || typeof e.allDay !== 'boolean' || typeof e.completed !== 'boolean' || !e.id || !e.title || !Number.isFinite(Date.parse(e.start as string)) || (e.end && !Number.isFinite(Date.parse(e.end as string))) || (e.applicationId && !appIds.has(e.applicationId as string)) || eventIds.has(e.id as string)) throw new Error('备份中的日程数据不完整或关联岗位不存在');
    eventIds.add(e.id as string);
  }
  for (const i of interviews) {
    if (!isRecord(i) || !['id','applicationId','company','position','round','date','interviewer','location','result','process','specialQuestions','reminders','reflection','createdAt','updatedAt'].every(k => string(i[k])) || !i.id || !i.company || !i.position || !/^\d{4}-\d{2}-\d{2}$/.test(i.date as string) || !Number.isFinite(Date.parse(i.date as string)) || !INTERVIEW_ROUNDS.includes(i.round as InterviewRound) || !INTERVIEW_RESULTS.includes(i.result as InterviewResult) || !Array.isArray(i.questions) || i.questions.length > 200 || (i.applicationId && !appIds.has(i.applicationId as string)) || (i.eventId !== undefined && (!string(i.eventId) || (i.eventId && !eventIds.has(i.eventId as string)))) || interviewIds.has(i.id as string)) throw new Error('备份中的面试记录不完整或关联岗位/日程不存在');
    const questionIds = new Set<string>();
    for (const q of i.questions) {
      if (!isRecord(q) || !string(q.id) || !string(q.question) || !string(q.answer) || !q.id || questionIds.has(q.id as string)) throw new Error('备份中的面试问答格式不正确');
      questionIds.add(q.id as string);
    }
    interviewIds.add(i.id as string);
  }
  for (const r of resumes) {
    if (!isRecord(r) || !['id','name','notes','filename','mimeType','updatedAt','data'].every(k => string(r[k])) || !r.id || !r.name || !Number.isInteger(r.size) || (r.size as number) < 0 || (r.size as number) > MAX_RESUME_SIZE || (r.data as string).length > Math.ceil(MAX_RESUME_SIZE / 3) * 4 + 16 || (r.data && !/^[A-Za-z0-9+/]*={0,2}$/.test(r.data as string)) || (r.size === 0 && r.data) || ((r.size as number) > 0 && !r.data) || resumeIds.has(r.id as string) || resumeNames.has(r.name as string)) throw new Error('备份中的简历信息格式不正确或重复');
    resumeIds.add(r.id as string); resumeNames.add(r.name as string);
  }
  return raw as unknown as Backup;
}
function decodeResume(r: ResumeBackup): ResumeRecord {
  const bytes = Uint8Array.from(atob(r.data), c => c.charCodeAt(0));
  if (bytes.byteLength !== r.size) throw new Error(`简历「${r.name}」附件大小不匹配`);
  const { data: _data, ...metadata } = r;
  return { ...metadata, blob: bytes.byteLength ? new Blob([bytes], { type: r.mimeType || 'application/octet-stream' }) : undefined };
}
export async function mergeData(backup: Backup) {
  // Decode and validate all attachments before opening an IndexedDB transaction.
  const decoded = (backup.resumes || []).map(decodeResume);
  const db = await dbPromise;
  const tx = db.transaction(['applications', 'events', 'resumes', 'interviews'], 'readwrite');
  const appStore = tx.objectStore('applications');
  const eventStore = tx.objectStore('events');
  const resumeStore = tx.objectStore('resumes');
  const interviewStore = tx.objectStore('interviews');
  let importedApps = 0, importedEvents = 0, importedResumes = 0, importedInterviews = 0;
  for (const app of backup.applications) if (!await appStore.get(app.id)) { await appStore.put(app); importedApps++; }
  for (const event of backup.events) if (!await eventStore.get(event.id)) { await eventStore.put(event); importedEvents++; }
  for (const interview of backup.interviews || []) if (!await interviewStore.get(interview.id)) { await interviewStore.put(interview); importedInterviews++; }
  const existing = await resumeStore.getAll() as ResumeRecord[];
  const names = new Set(existing.map(r => r.name));
  for (const resume of decoded) {
    if (!await resumeStore.get(resume.id) && !names.has(resume.name)) {
      await resumeStore.put(resume); names.add(resume.name); importedResumes++;
    }
  }
  await tx.done;
  return { importedApps, importedEvents, importedResumes, importedInterviews };
}
function blobBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
export async function makeBackup(): Promise<Backup> {
  const { applications, events, resumes, interviews } = await loadData();
  return { version: 3, exportedAt: new Date().toISOString(), applications, events, interviews,
    resumes: await Promise.all(resumes.map(async ({ blob, ...metadata }) => ({ ...metadata, data: blob ? await blobBase64(blob) : '' }))) };
}
export function localDate(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
