import { authClient, authReady, hasAuthCallback, isRecoverySession, clearRecoverySession, updateRecoveredPassword, clearAuthCallback, authError, getCurrentMember, createMember, recoveryUrl } from './auth-client.js';

const $ = id => document.getElementById(id);
function message(id, text, failed = false) {
  const node = $(id);
  node.textContent = text;
  node.dataset.error = String(failed);
}
function busy(form, fieldset, enabled) {
  form.setAttribute('aria-busy', String(enabled));
  fieldset.disabled = enabled;
}
function nextPage() {
  const next = new URLSearchParams(location.search).get('next');
  const destination = next === 'admin' ? './admin.html' : next === 'courses' ? './index.html?view=courses#results' : './my-trip.html';
  location.assign(destination);
}
function showMemberSetup() {
  $('member-setup').hidden = false;
  $('member-nickname').focus();
}

if ($('member-form')) {
  $('member-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (form.getAttribute('aria-busy') === 'true') return;
    const nickname = $('member-nickname').value.trim();
    if (nickname.length < 2 || nickname.length > 30) {
      message('member-feedback', '닉네임은 2~30자로 입력해 주세요.', true);
      return;
    }
    form.setAttribute('aria-busy', 'true');
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      await createMember(nickname);
      nextPage();
    } catch (error) {
      message('member-feedback', authError(error), true);
    } finally {
      form.removeAttribute('aria-busy');
      button.disabled = false;
    }
  });
}

if ($('login-form')) {
  const form = $('login-form');
  const fields = $('login-fields');
  fields.disabled = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (fields.disabled) return;
    busy(form, fields, true);
    message('login-status', '로그인 정보를 확인하고 있습니다.');
    try {
      const { error } = await authClient.auth.signInWithPassword({ email: $('login-email').value.trim(), password: $('login-password').value });
      $('login-password').value = '';
      if (error) throw error;
      const current = await getCurrentMember();
      if (!current?.user?.email_confirmed_at) throw { code: 'email_not_confirmed' };
      if (!current.profile) {
        form.hidden = true;
        message('login-status', '로그인했어요. 하루픽 닉네임을 등록하면 가입이 완료됩니다.');
        showMemberSetup();
      } else nextPage();
    } catch (error) {
      message('login-status', authError(error), true);
    } finally {
      busy(form, fields, false);
    }
  });
}

if ($('confirmation-status')) {
  try {
    const ready = await authReady;
    if (ready.error) throw ready.error;
    const current = await getCurrentMember();
    if (!current?.user?.email_confirmed_at) {
      message('confirmation-status', '인증 정보를 확인할 수 없어요. 메일의 인증 링크를 다시 열어 주세요. 이미 인증했다면 로그인해 주세요.', true);
    } else if (!current.profile) {
      message('confirmation-status', '이메일 인증이 확인됐어요. 닉네임 등록을 마무리해 주세요.');
      showMemberSetup();
    } else {
      message('confirmation-status', '이메일 인증과 회원 등록이 완료됐어요. 로그인한 상태로 하루픽을 이용할 수 있습니다.');
      $('confirmed-trip').hidden = false;
    }
  } catch {
    message('confirmation-status', '인증 링크를 확인하지 못했어요. 가입할 때 사용한 브라우저에서 링크를 열어 주세요. 이미 인증했다면 이메일과 비밀번호로 로그인해 주세요.', true);
  } finally { clearAuthCallback(); }
}

if ($('reset-request-form')) {
  const requestForm = $('reset-request-form');
  const requestFields = $('reset-request-fields');
  const passwordForm = $('new-password-form');
  const passwordFields = $('new-password-fields');
  const canonicalRecoveryOrigin = new URL(recoveryUrl).origin;
  const correctOrigin = location.origin === canonicalRecoveryOrigin;
  requestFields.disabled = !correctOrigin;
  if (!correctOrigin) {
    $('reset-origin-help').hidden = false;
    $('reset-origin-link').href = recoveryUrl;
    message('reset-status', '이 주소에서는 재설정을 요청할 수 없습니다. 아래 공식 주소에서 메일을 요청하고 같은 브라우저에서 링크를 열어 주세요.', true);
  }
  if (hasAuthCallback || isRecoverySession()) {
    requestFields.disabled = true;
    message('reset-status', '재설정 링크를 확인하고 있습니다.');
    try {
      const ready = await authReady;
      if (ready.error) throw ready.error;
      const { data: { user }, error } = await authClient.auth.getUser();
      if (error || !user || !isRecoverySession(user.id)) throw error || new Error('Recovery session required');
      requestForm.hidden = true;
      passwordForm.hidden = false;
      passwordFields.disabled = false;
      message('reset-status', '새 비밀번호를 입력해 주세요.');
    } catch {
      clearRecoverySession();
      message('reset-status', '재설정 인증을 확인하지 못했습니다. 메일을 요청한 브라우저에서 최신 링크를 열어 주세요. 메일 앱이 다른 브라우저를 열었다면 링크 주소를 복사해 요청한 브라우저의 주소창에 붙여 넣으세요. 링크가 만료됐다면 잠시 후 새 링크를 요청해 주세요.', true);
      requestFields.disabled = !correctOrigin;
    } finally { clearAuthCallback(); }
  }
  requestForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (requestFields.disabled) return;
    busy(requestForm, requestFields, true);
    try {
      const { error } = await authClient.auth.resetPasswordForEmail($('reset-email').value.trim(), { redirectTo: recoveryUrl });
      if (error) throw error;
      message('reset-status', '등록된 이메일이라면 재설정 안내가 발송됩니다. 이 브라우저에서 최신 메일 링크를 열어 주세요. 메일함과 스팸함을 확인하고, 메일이 오는 동안 다시 요청하지 마세요.');
    } catch (error) { message('reset-status', authError(error), true); }
    finally { busy(requestForm, requestFields, false); }
  });
  passwordForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (passwordFields.disabled) return;
    const password = $('new-password').value;
    if (password.length < 8 || password.length > 72 || !password.trim()) {
      message('reset-status', '새 비밀번호는 8~72자로 입력해 주세요.', true);
      return;
    }
    if (password !== $('new-password-confirm').value) {
      message('reset-status', '비밀번호가 일치하지 않아요.', true);
      return;
    }
    busy(passwordForm, passwordFields, true);
    try {
      await updateRecoveredPassword(password);
      passwordForm.reset();
      passwordForm.hidden = true;
      const { error: signOutError } = await authClient.auth.signOut({ scope: 'local' });
      message('reset-status', signOutError ? '비밀번호를 변경했습니다. 로그인 상태를 다시 확인해 주세요.' : '비밀번호를 변경했습니다. 새 비밀번호로 로그인해 주세요.');
    } catch (error) {
      message('reset-status', authError(error), true);
      passwordFields.disabled = false;
    } finally { passwordForm.removeAttribute('aria-busy'); }
  });
}
