import type { Application, Stage, StatusChange } from './storage';

/** Legacy data knows when it was submitted, but not when later stages happened. */
export function getStatusHistory(app: Application): StatusChange[] {
  if (app.statusHistory) return app.statusHistory;
  if (app.stage === '未投递') return [];
  const submitted: StatusChange[] = app.appliedAt
    ? [{ id: `legacy-submitted-${app.id}`, stage: '已投递', date: app.appliedAt }]
    : [];
  if (app.stage === '已投递') return submitted.length ? submitted : [{ id: `legacy-current-${app.id}`, stage:'已投递', date:'' }];
  return [...submitted, { id: `legacy-current-${app.id}`, stage: app.stage, date: '' }];
}

export function currentStatusEntry(app: Application): StatusChange | undefined {
  const history = getStatusHistory(app);
  if (app.statusEntryId) {
    const selected = history.find(entry => entry.id === app.statusEntryId);
    if (selected) return selected;
  }
  return [...history].reverse().find(entry => entry.stage === app.stage);
}

export function changeStage(app: Application, stage: Stage, today: string): Application {
  if (stage === app.stage) return app;
  const history = [...getStatusHistory(app)];
  if (!history.length && stage !== '未投递' && stage !== '已投递' && app.appliedAt) {
    history.push({ id: crypto.randomUUID(), stage:'已投递', date:app.appliedAt });
  }
  // A new submission uses the separately recorded application date; later updates use today as an editable suggestion.
  const entry: StatusChange = { id:crypto.randomUUID(), stage, date:stage === '已投递' ? (app.appliedAt || today) : today };
  return { ...app, stage, statusHistory:[...history, entry], statusEntryId:entry.id };
}

export function changeAppliedAt(app: Application, appliedAt: string): Application {
  const history = getStatusHistory(app).map(entry =>
    entry.stage === '已投递' && entry.date === app.appliedAt ? { ...entry, date: appliedAt } : entry);
  return { ...app, appliedAt, statusHistory: history };
}
