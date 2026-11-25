import { authClient } from './auth-client.js';

export function accessFailure(error) {
  if (error?.code === '42501') return 'denied';
  if (error?.code === 'PGRST301' || error?.code === 'PGRST303' || error?.status === 401) return 'signed-out';
  return null;
}
export async function listMembers({ query = '', page = 1, pageSize = 20 } = {}) {
  if (typeof query !== 'string' || [...query.trim()].length > 100 || !Number.isInteger(page) || page < 1 || page > 1000000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) throw new Error('Invalid directory parameters');
  const { data, error } = await authClient.rpc('harupick_admin_members', { p_query: query.trim(), p_page: page, p_page_size: pageSize });
  if (error) throw error;
  if (!data || !Array.isArray(data.members) || !Number.isSafeInteger(data.total) || data.total < 0 || !Number.isInteger(data.page) || !Number.isInteger(data.pages) || data.page < 1 || data.page > data.pages || data.page_size !== pageSize || data.members.length > pageSize) throw new Error('Invalid directory response');
  return data;
}
export async function getMember(id) {
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Invalid member ID');
  const { data, error } = await authClient.rpc('harupick_admin_member', { p_member_id: id });
  if (error) throw error;
  if (data !== null && data?.id !== id) throw new Error('Invalid member response');
  return data;
}

