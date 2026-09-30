import type { Application, InterviewRecord, PlanEvent } from './storage';
const interviewStages = new Set(['AI面试', '一面', '二面', 'HR面']);

/** Calendar planning is not evidence that an interview has happened. */
export function getUnrecordedInterviewEvents(apps: Application[], events: PlanEvent[], interviews: InterviewRecord[], today: string): PlanEvent[] {
  const byApplication = new Map<string, PlanEvent>();
  for (const event of [...events].sort((a,b) => b.start.localeCompare(a.start))) {
    const app = apps.find(item => item.id === event.applicationId);
    if (event.type !== '面试' || !app || !interviewStages.has(app.stage)) continue;
    if (!event.completed && event.start.slice(0,10) >= today) continue;
    if (interviews.some(record => record.applicationId === app.id || (!record.applicationId && record.company === app.company && record.position === app.position))) continue;
    if (!byApplication.has(app.id)) byApplication.set(app.id,event);
  }
  return [...byApplication.values()];
}
