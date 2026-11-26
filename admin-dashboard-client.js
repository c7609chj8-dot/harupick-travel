import { authClient } from './auth-client.js';
import { auditEvents } from './admin-audit-client.js';

const metricKeys = ['registered_members','total_trips','active_trips','archived_trips','upcoming_trips_30d','changes_7d'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const integer = value => Number.isSafeInteger(value) && value >= 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function keys(value, expected) {
  return object(value) && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value,key));
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
}
function addDays(value, days) {
  const parsed = new Date(value + 'T00:00:00Z');
  parsed.setUTCDate(parsed.getUTCDate()+days);
  return parsed.toISOString().slice(0,10);
}
function validTimestamp(value) {
  return typeof value === 'string' && /T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value));
}
// PostgreSQL timestamps have microsecond precision; Date.parse alone loses the ordering.
function timeValue(value) {
  const fraction = value.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/i)?.[1] || '';
  return BigInt(Date.parse(value))*1000n + BigInt(fraction.padEnd(6,'0').slice(3,6));
}
function validTrend(rows, first, days, total) {
  return Array.isArray(rows) && rows.length === days &&
    rows.every((row,index) => keys(row,['date','count']) && row.date === addDays(first,index) && integer(row.count)) &&
    rows.reduce((sum,row) => sum+row.count,0) <= total;
}
function validDashboard(data, days) {
  if (!keys(data,['as_of','timezone','trend_days','trend_from','trend_until','metrics','upcoming_trips','recent_changes','trends']) ||
      data.timezone !== 'Asia/Seoul' || data.trend_days !== days ||
      !validTimestamp(data.as_of) ||
      !validDate(data.trend_from) || !validDate(data.trend_until) ||
      addDays(data.trend_from,days-1) !== data.trend_until ||
      !keys(data.metrics,metricKeys) || !metricKeys.every(key => integer(data.metrics[key]))) return false;
  const today = Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(data.as_of)).map(part => [part.type,part.value]));
  if (data.trend_until !== today.year+'-'+today.month+'-'+today.day) return false;
  const metrics = data.metrics;
  if (metrics.total_trips !== metrics.active_trips+metrics.archived_trips || metrics.upcoming_trips_30d > metrics.active_trips) return false;
  if (!keys(data.trends,['member_registrations','trip_creations']) ||
      !validTrend(data.trends.member_registrations,data.trend_from,days,metrics.registered_members) ||
      !validTrend(data.trends.trip_creations,data.trend_from,days,metrics.total_trips)) return false;
  if (!Array.isArray(data.upcoming_trips) || data.upcoming_trips.length !== Math.min(5,metrics.upcoming_trips_30d) ||
      !data.upcoming_trips.every((trip,index,rows) =>
        keys(trip,['id','title','travel_date','nickname']) && uuid.test(trip.id) &&
        typeof trip.title === 'string' && typeof trip.nickname === 'string' && validDate(trip.travel_date) &&
        trip.travel_date >= data.trend_until && trip.travel_date < addDays(data.trend_until,30) &&
        (!index || rows[index-1].travel_date < trip.travel_date || (rows[index-1].travel_date === trip.travel_date && rows[index-1].id < trip.id)))) return false;
  if (!Array.isArray(data.recent_changes) || data.recent_changes.length > 5 ||
      !data.recent_changes.every((entry,index,rows) => {
        if (!keys(entry,['id','event','occurred_at','actor_label','actor_type','target_label']) ||
            !uuid.test(entry.id) || !Object.hasOwn(auditEvents,entry.event) ||
            typeof entry.actor_label !== 'string' || typeof entry.target_label !== 'string' ||
            !['admin','member','system'].includes(entry.actor_type) ||
            !validTimestamp(entry.occurred_at) ||
            timeValue(entry.occurred_at) > timeValue(data.as_of)) return false;
        return !index || timeValue(rows[index-1].occurred_at) > timeValue(entry.occurred_at) ||
          (timeValue(rows[index-1].occurred_at) === timeValue(entry.occurred_at) && rows[index-1].id > entry.id);
      })) return false;
  return true;
}

// Consumers must handle errors separately from genuine zero-count responses.
export async function getDashboard(days = 7) {
  if (![7,30].includes(days)) throw new TypeError('Dashboard days must be 7 or 30');
  const { data, error } = await authClient.rpc('harupick_admin_dashboard',{p_days:days});
  if (error) throw error;
  if (!validDashboard(data,days)) throw new Error('Invalid dashboard response');
  return data;
}

