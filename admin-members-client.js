import { authClient } from './auth-client.js';

export function accessFailure(error) {
  if (error?.code === '42501') return 'denied';
  if (error?.code === 'PGRST301' || error?.code === 'PGRST303' || error?.status === 401) return 'signed-out';
  return null;
}
const states = ['all','active','unconfirmed','suspended','deleted'];
const sorts = ['created_desc','created_asc'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const exactKeys = (value,expected) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === expected.length && expected.every(key=>Object.hasOwn(value,key));
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
  const parsed = new Date(value+'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
}
function validTimestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && validDate(value.slice(0,10)) && Number.isFinite(Date.parse(value));
}
function timeValue(value) {
  const fraction = value.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/i)?.[1] || '';
  return BigInt(Date.parse(value))*1000n + BigInt(fraction.padEnd(6,'0').slice(3,6));
}
export async function listMembers({ query = '', page = 1, pageSize = 20, status = 'all', from = '', until = '', sort = 'created_desc' } = {}) {
  if (typeof query !== 'string' || [...query.trim()].length > 100 || !Number.isInteger(page) || page < 1 || page > 1000000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50 || !states.includes(status) || !sorts.includes(sort) ||
      (from !== '' && from !== null && !validDate(from)) || (until !== '' && until !== null && !validDate(until)) || (from && until && from > until)) throw new Error('Invalid directory parameters');
  const { data, error } = await authClient.rpc('harupick_admin_members_filtered', {
    p_query: query.trim(), p_page: page, p_page_size: pageSize, p_status: status,
    p_from: from || null, p_until: until || null, p_sort: sort
  });
  if (error) throw error;
  if (!exactKeys(data,['members','total','page','page_size','pages']) || !Array.isArray(data.members) || !Number.isSafeInteger(data.total) || data.total < 0 ||
      data.pages !== Math.max(1,Math.ceil(data.total/pageSize)) || data.page !== Math.min(page,data.pages) || data.page_size !== pageSize ||
      data.members.length !== Math.min(pageSize,Math.max(0,data.total-(data.page-1)*pageSize))) throw new Error('Invalid directory response');
  // Use the named time zone, including its historical daylight-saving offsets.
  const koreanDate = new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',calendar:'iso8601',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit'});
  const ids = new Set();
  for (const [index,member] of data.members.entries()) {
    if (!exactKeys(member,['id','nickname','email','created_at','email_confirmed','status']) || typeof member.id !== 'string' || !uuid.test(member.id) || ids.has(member.id.toLowerCase()) ||
        typeof member.nickname !== 'string' || !(member.email === null || typeof member.email === 'string') || !validTimestamp(member.created_at) ||
        typeof member.email_confirmed !== 'boolean' || !states.slice(1).includes(member.status) || (status !== 'all' && member.status !== status) ||
        (member.status === 'active' && !member.email_confirmed) || (member.status === 'unconfirmed' && member.email_confirmed)) throw new Error('Invalid directory member');
    if (from || until) {
      const parts = Object.fromEntries(koreanDate.formatToParts(new Date(member.created_at)).map(part=>[part.type,part.value]));
      const day = parts.year.padStart(4,'0')+'-'+parts.month+'-'+parts.day;
      if ((from && day < from) || (until && day > until)) throw new Error('Invalid directory date range');
    }
    ids.add(member.id.toLowerCase());
    if (index) {
      const previous = data.members[index-1], before = timeValue(previous.created_at), current = timeValue(member.created_at);
      const ordered = sort === 'created_desc' ? before > current || (before === current && previous.id.toLowerCase() > member.id.toLowerCase()) : before < current || (before === current && previous.id.toLowerCase() < member.id.toLowerCase());
      if (!ordered) throw new Error('Invalid directory ordering');
    }
  }
  return data;
}
export async function getMember(id) {
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Invalid member ID');
  const { data, error } = await authClient.rpc('harupick_admin_member', { p_member_id: id });
  if (error) throw error;
  if (data !== null && data?.id !== id) throw new Error('Invalid member response');
  return data;
}

