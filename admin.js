import { setupAuditHistory } from './admin-audit-ui.js';
import { setupAdminTrips } from './admin-trips-ui.js';
import { setupMemberDirectory } from './admin-members-ui.js';
import { authClient } from './auth-client.js';
import { checkAdminAccess } from './admin-access.js';
import { createAdminGuard } from './admin-guard.js';
const $ = id => document.getElementById(id);
const gate = $('admin-gate');
let allowedUserId = null;
const panel = $('admin-console');
const copy = {
  checking: ['접근 권한을 확인하고 있습니다', '잠시만 기다려 주세요.'],
  'signed-out': ['관리자 로그인이 필요합니다', '관리자 권한이 부여된 계정으로 로그인해 주세요.'],
  denied: ['관리자 권한이 없습니다', '현재 계정으로는 관리자 화면에 접근할 수 없습니다.'],
  error: ['권한을 확인하지 못했습니다', '연결 상태를 확인하고 다시 시도해 주세요.']
};
const directory = setupMemberDirectory(state => guard.invalidate(state));
const trips = setupAdminTrips(state => guard.invalidate(state));
const audit = setupAuditHistory(state => guard.invalidate(state));
const guard = createAdminGuard({ check: checkAdminAccess, onState(result) {
  if (result.state === 'allowed' && allowedUserId === result.user.id && !panel.hidden) {
    $('admin-checked-at').textContent = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date());
    return;
  }
  allowedUserId = null;
  panel.hidden = true;
  directory.deactivate({ clearSearch: !['checking', 'allowed'].includes(result.state) });
  trips.deactivate({ clearSearch: !['checking', 'allowed'].includes(result.state) });
  audit.deactivate({ clearSearch: !['checking', 'allowed'].includes(result.state) });
  $('admin-email').textContent = '';
  gate.hidden = false;
  if (result.state === 'allowed') {
    allowedUserId = result.user.id;
    $('admin-email').textContent = result.user.email;
    $('admin-checked-at').textContent = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date());
    gate.hidden = true;
    panel.hidden = false;
    directory.activate();
    trips.activate();
    audit.activate();
    return;
  }
  const state = copy[result.state] ? result.state : 'error';
  gate.dataset.state = state;
  $('gate-title').textContent = copy[state][0];
  $('gate-message').textContent = copy[state][1];
  $('admin-login').hidden = !['signed-out', 'denied'].includes(state);
  $('admin-retry').hidden = state === 'checking';
}});
$('admin-retry').addEventListener('click', () => guard.refresh());
$('admin-logout').addEventListener('click', async () => {
  guard.invalidate();
  try {
    const { error } = await authClient.auth.signOut({ scope: 'local' });
    guard.invalidate(error ? 'error' : 'signed-out');
  } catch { guard.invalidate('error'); }
});
authClient.auth.onAuthStateChange(event => {
  if (event === 'INITIAL_SESSION') return;
  guard.invalidate(event === 'SIGNED_OUT' ? 'signed-out' : 'checking');
  if (event !== 'SIGNED_OUT') setTimeout(() => guard.refresh(), 0);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) guard.invalidate(); else guard.refresh();
});
window.addEventListener('pagehide', () => guard.invalidate());
window.addEventListener('pageshow', () => guard.refresh());
setInterval(() => { if (!document.hidden) guard.refresh({ background: true }); }, 60000);
guard.refresh();
