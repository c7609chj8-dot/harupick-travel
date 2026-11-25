import { authClient } from './auth-client.js';
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function tripError(error) {
  if (error?.code === '40001') return '다른 곳에서 수정된 일정입니다. 서버 목록과 상세를 새로 불러온 뒤 내용을 확인해 주세요.';
  if (error?.code === '42501' || error?.status === 401) return '로그인 계정과 접근 권한을 다시 확인해 주세요.';
  if (error?.code === 'P0002') return '일정을 찾을 수 없습니다. 목록을 새로 불러와 주세요.';
  if (['22023','22007','22008','23514'].includes(error?.code)) return '일정 제목·날짜·데이터 크기를 확인해 주세요. 장소는 최대 60개입니다.';
  return '서버 요청을 처리하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.';
}
export async function tripRequest(action, args) {
  const { data, error } = await authClient.rpc('harupick_trip_action', { p_action: action, p_args: args });
  if (error) throw error;
  if (action.endsWith('list') || action === 'list') {
    if (!data || !Array.isArray(data.trips) || data.trips.length > 20 || !Number.isSafeInteger(data.total) || data.total < 0 || !Number.isInteger(data.page) || !Number.isInteger(data.pages) || data.page < 1 || data.page > data.pages) throw Error('Invalid trip list');
  } else if (data !== null && (!uuidPattern.test(data.id) || !Number.isInteger(data.revision) || data.revision < 1)) throw Error('Invalid trip response');
  if ((action === 'get' || action === 'admin_get' || action === 'admin_update') && data && data.id !== args.id) throw Error('Unexpected trip');
  return data;
}

