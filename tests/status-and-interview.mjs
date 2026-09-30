import test from 'node:test';
import assert from 'node:assert/strict';
import { getStatusHistory, currentStatusEntry, changeStage, changeAppliedAt } from '../src/lib/status-history.ts';
import { getUnrecordedInterviewEvents } from '../src/lib/interview-reminders.ts';

const app = (id, stage, company = id) => ({id, stage, company, position:'工程师', appliedAt:'2026-09-20'});
const event = (id, applicationId, start, completed = false) => ({id, applicationId, start, type:'面试', completed});

test('old advanced applications keep the application date without guessing the current stage date', () => {
  const original = app('a','简历通过');
  assert.deepEqual(getStatusHistory(original).map(h => [h.stage,h.date]), [['已投递','2026-09-20'],['简历通过','']]);
  assert.equal(currentStatusEntry(original).date, '');
  assert.equal(currentStatusEntry(app('b','已投递')).date, '2026-09-20');
});

test('a new submitted application uses applied date, later stage uses selected date', () => {
  const initial = changeStage({...app('a','未投递'),statusHistory:[]},'已投递','2026-10-01');
  assert.equal(currentStatusEntry(initial).date,'2026-09-20');
  const later = changeStage(initial,'笔试通过','2026-10-03');
  assert.equal(later.appliedAt,'2026-09-20');
  assert.equal(currentStatusEntry(later).date,'2026-10-03');
  assert.equal(later.statusHistory.length,2);
  assert.equal(changeAppliedAt(later,'2026-09-21').statusHistory[0].date,'2026-09-21');
});

test('a backfilled milestone does not replace the current status entry', () => {
  const updated = changeStage({...app('a','已投递'),statusHistory:[]},'一面','2026-10-03');
  updated.statusHistory.splice(0,0,{id:'backfill',stage:'笔试通过',date:'2026-09-28'});
  assert.equal(currentStatusEntry(updated).stage,'一面');
  assert.equal(currentStatusEntry(updated).date,'2026-10-03');
});

test('planned/future events and non-interview stages do not request interview notes', () => {
  const apps=[app('h','简历通过','甲公司'),app('k','简历通过','乙公司')];
  const events=[event('h1','h','2026-10-26T09:00'),event('h2','h','2026-10-26T09:00'),event('k1','k','2026-10-08T09:00')];
  assert.deepEqual(getUnrecordedInterviewEvents(apps,events,[],'2026-09-30'),[]);
});

test('existing interview notes suppress prompts even when calendar date differs; duplicate events count once', () => {
  const apps=[app('u','一面','丙公司')];
  const events=[event('u1','u','2026-09-29T09:00'),event('u2','u','2026-09-29T09:00')];
  assert.equal(getUnrecordedInterviewEvents(apps,events,[],'2026-09-30').length,1);
  assert.deepEqual(getUnrecordedInterviewEvents(apps,events,[{applicationId:'u'}],'2026-09-30'),[]);
});
