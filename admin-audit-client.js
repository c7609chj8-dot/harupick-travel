import { authClient } from './auth-client.js';
export const auditEvents = {
  'trip.created': '일정 생성', 'trip.updated': '일정 수정', 'trip.archived': '일정 보관',
  'trip.restored': '일정 복원', 'trip.deleted': '일정 삭제', 'admin.granted': '관리자 권한 부여',
  'admin.revoked': '관리자 권한 회수', 'admin.removed': '관리자 권한 삭제'
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function date(value) {
  if (value === '' || value == null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('Invalid date');
  const parsed = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== value) throw Error('Invalid date');
  return value;
}
function validEvent(event) {
  return event && uuid.test(event.id) && Object.hasOwn(auditEvents,event.event) && typeof event.actor_label === 'string' &&
    typeof event.target_label === 'string' && ['admin','member','system'].includes(event.actor_type) &&
    Array.isArray(event.changed_fields) && event.changed_fields.every(field => typeof field === 'string') &&
    typeof event.occurred_at === 'string' && Number.isFinite(Date.parse(event.occurred_at));
}
export async function listAudit({ query = '', event = 'all', page = 1, from = '', until = '' } = {}) {
  if (typeof query !== 'string' || [...query.trim()].length > 100 || (event !== 'all' && !Object.hasOwn(auditEvents,event)) || !Number.isInteger(page) || page < 1 || page > 1000000) throw Error('Invalid audit filters');
  const start = date(from), end = date(until);
  if (start && end && start > end) throw Error('Invalid date range');
  const { data, error } = await authClient.rpc('harupick_admin_audit', { p_query: query.trim(), p_event: event, p_page: page, p_from: start, p_until: end });
  if (error) throw error;
  if (!data || !Array.isArray(data.events) || data.events.length > 20 || !data.events.every(validEvent) || !Number.isSafeInteger(data.total) || data.total < 0 || !Number.isInteger(data.page) || !Number.isInteger(data.pages) || data.page < 1 || data.page > data.pages) throw Error('Invalid audit response');
  return data;
}
export async function getAudit(id) {
  if (typeof id !== 'string' || !uuid.test(id)) throw Error('Invalid audit ID');
  const { data, error } = await authClient.rpc('harupick_admin_audit', { p_id: id });
  if (error) throw error;
  if (data !== null && (!validEvent(data) || data.id !== id || !['before_data','after_data'].every(key => data[key] === null || (typeof data[key] === 'object' && !Array.isArray(data[key]) && data[key] !== null)))) throw Error('Invalid audit detail');
  return data;
}

