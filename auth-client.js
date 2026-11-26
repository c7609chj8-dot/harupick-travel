import { supabase as sdk } from './assets/supabase-2.119.2.js';
import { supabaseUrl, supabasePublishableKey, appOrigin } from './auth-config.js';

const callbackPage = /\/(email-confirmed|reset-password)\.html$/.test(location.pathname);
const callbackQuery = new URLSearchParams(location.search), callbackHash = new URLSearchParams(location.hash.slice(1));
export const hasAuthCallback = callbackPage && ['code','access_token','error','error_code','error_description'].some(key => callbackQuery.has(key) || callbackHash.has(key));
export const authClient = sdk.createClient(supabaseUrl, supabasePublishableKey, {
  auth: { storageKey: 'harupick-auth-v1', persistSession: true, autoRefreshToken: true, detectSessionInUrl: callbackPage, flowType: 'pkce' }
});
const recoveryContextKey = 'harupick-recovery-user';
let recoveryUser = null;
try { recoveryUser = sessionStorage.getItem(recoveryContextKey); } catch { /* Storage can be unavailable. */ }
export function clearRecoverySession() {
  recoveryUser = null;
  try { sessionStorage.removeItem(recoveryContextKey); } catch { /* Keep the in-memory state cleared. */ }
}
authClient.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY' && session?.user?.id) {
    recoveryUser = session.user.id;
    try { sessionStorage.setItem(recoveryContextKey, recoveryUser); } catch { /* This tab can still finish without reload. */ }
  }
  if (event === 'SIGNED_OUT' || (session?.user?.id && recoveryUser && session.user.id !== recoveryUser)) clearRecoverySession();
});
export const isRecoverySession = userId => Boolean(recoveryUser && (userId === undefined || recoveryUser === userId));
export async function updateRecoveredPassword(password) {
  const { data: { user }, error } = await authClient.auth.getUser();
  if (error) throw error;
  if (!user || !isRecoverySession(user.id)) throw { code: 'recovery_session_required' };
  const result = await authClient.auth.updateUser({ password });
  if (result.error) throw result.error;
  clearRecoverySession();
  return result;
}
export const authReady = authClient.auth.getSession();
export const confirmationUrl = appOrigin + '/email-confirmed.html';
export const recoveryUrl = appOrigin + '/reset-password.html';

export function authError(error) {
  const messages = {
    invalid_credentials: '이메일 또는 비밀번호를 확인해 주세요.',
    email_not_confirmed: '이메일 인증을 먼저 완료해 주세요. 받은 메일함과 스팸함을 확인해 주세요.',
    user_already_exists: '이미 등록된 이메일일 수 있어요. 로그인하거나 비밀번호를 재설정해 주세요.',
    email_exists: '이미 등록된 이메일일 수 있어요. 로그인하거나 비밀번호를 재설정해 주세요.',
    weak_password: '더 안전한 비밀번호로 다시 입력해 주세요.',
    over_email_send_rate_limit: '메일 발송이 일시적으로 제한됐어요. 잠시 후 다시 시도해 주세요.',
    over_request_rate_limit: '요청이 많아요. 잠시 후 다시 시도해 주세요.',
    email_address_invalid: '이메일 주소를 확인해 주세요.',
    email_address_not_authorized: '현재 메일 발송 설정에서 허용되지 않는 이메일입니다. 운영자에게 문의해 주세요.',
    signup_disabled: '현재 회원가입을 사용할 수 없어요. 잠시 후 다시 시도해 주세요.',
    otp_expired: '인증 링크가 만료됐어요. 가입 메일을 다시 요청하거나 로그인해 주세요.',
    same_password: '기존 비밀번호와 다른 비밀번호를 입력해 주세요.',
    recovery_session_required: '재설정 인증을 다시 확인해 주세요. 메일 링크를 요청한 브라우저에서 최신 링크를 열어 주세요.'
  };
  if (messages[error?.code]) return messages[error.code];
  if (error?.name === 'TypeError' || error?.name === 'AuthRetryableFetchError') return '서버에 연결할 수 없어요. 인터넷 연결을 확인하고 다시 시도해 주세요.';
  return '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
}

export async function getCurrentMember() {
  const { data: { user }, error } = await authClient.auth.getUser();
  if (error) {
    if (error.name === 'AuthSessionMissingError' || error.code === 'session_not_found') return null;
    throw error;
  }
  if (!user) return null;
  const { data: profile, error: profileError } = await authClient.from('harupick_members').select('id,nickname,created_at,updated_at').eq('id', user.id).maybeSingle();
  if (profileError) throw profileError;
  return { user, profile };
}

export async function createMember(nickname) {
  const name = nickname.trim();
  if (name.length < 2 || name.length > 30) throw new Error('Invalid nickname');
  const current = await getCurrentMember();
  if (!current?.user?.email_confirmed_at) throw new Error('Verified account required');
  if (current.profile) return current.profile;
  const { data, error } = await authClient.from('harupick_members').insert({ id: current.user.id, nickname: name }).select('id,nickname,created_at,updated_at').single();
  if (error?.code === '23505') return (await getCurrentMember())?.profile;
  if (error) throw error;
  return data;
}

export async function registerMember({ nickname, email, password }) {
  const { data, error } = await authClient.auth.signUp({
    email, password,
    options: { emailRedirectTo: confirmationUrl, data: { harupick_app: 'harupick', harupick_nickname: nickname } }
  });
  if (error) throw error;
  if (data.session) {
    const current = await getCurrentMember();
    if (!current?.profile) await createMember(nickname);
  }
  return { signedIn: Boolean(data.session) };
}

export function clearAuthCallback() {
  if (callbackPage) history.replaceState(null, '', location.pathname);
}
