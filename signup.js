const form = document.getElementById('signup-form');
const fields = document.getElementById('signup-fields');
const feedback = document.getElementById('form-feedback');
const success = document.getElementById('signup-success');
const inputs = ['nickname', 'email', 'password', 'confirmation'].map(id => document.getElementById(id));
const [nickname, email, password, confirmation] = inputs;
const touched = new Set();
let submitted = false;

function errorFor(input) {
  const value = input.value;
  if (input === nickname) {
    if (!value.trim()) return '닉네임을 입력해 주세요.';
    if (value.trim().length < 2 || value.trim().length > 30) return '닉네임은 2~30자로 입력해 주세요.';
  }
  if (input === email) {
    if (!value.trim()) return '이메일을 입력해 주세요.';
    if (input.validity.typeMismatch || value.trim().length > 254) return '이메일 형식을 확인해 주세요. 예: traveler@example.com';
  }
  if (input === password) {
    if (!value) return '비밀번호를 입력해 주세요.';
    if (value.length < 8 || value.length > 72) return '비밀번호는 8~72자로 입력해 주세요.';
    if (!value.trim()) return '공백만으로 된 비밀번호는 사용할 수 없어요.';
  }
  if (input === confirmation) {
    if (!value) return '비밀번호를 한 번 더 입력해 주세요.';
    if (value !== password.value) return '비밀번호가 일치하지 않아요.';
  }
  return '';
}

function showError(input) {
  const message = errorFor(input);
  const error = document.getElementById(input.id + '-error');
  error.textContent = message;
  error.hidden = !message;
  input.setAttribute('aria-invalid', String(Boolean(message)));
  return !message;
}

function updateMatch() {
  document.getElementById('confirmation-match').hidden = !(confirmation.value && password.value.length >= 8 && !errorFor(password) && !errorFor(confirmation));
}

for (const input of inputs) {
  input.addEventListener('blur', () => {
    touched.add(input);
    showError(input);
    updateMatch();
  });
  input.addEventListener('input', () => {
    if (submitted || touched.has(input)) showError(input);
    if (input === password && (submitted || touched.has(confirmation))) showError(confirmation);
    updateMatch();
    feedback.textContent = '';
  });
}

function resetVisibility() {
  for (const button of document.querySelectorAll('.password-toggle')) {
    document.getElementById(button.dataset.target).type = 'password';
    button.textContent = '보기';
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', button.dataset.target === 'password' ? '비밀번호 표시' : '비밀번호 확인 표시');
  }
}
for (const button of document.querySelectorAll('.password-toggle')) {
  button.addEventListener('click', () => {
    const target = document.getElementById(button.dataset.target);
    const showing = target.type === 'password';
    target.type = showing ? 'text' : 'password';
    button.textContent = showing ? '숨기기' : '보기';
    button.setAttribute('aria-pressed', String(showing));
    const label = button.dataset.target === 'password' ? '비밀번호' : '비밀번호 확인';
    button.setAttribute('aria-label', label + (showing ? ' 숨기기' : ' 표시'));
  });
}

form.addEventListener('submit', event => {
  event.preventDefault();
  submitted = true;
  nickname.value = nickname.value.trim();
  email.value = email.value.trim();
  const valid = inputs.map(showError);
  updateMatch();
  if (valid.includes(false)) {
    feedback.textContent = '입력 내용을 확인해 주세요. 표시된 항목을 수정하면 계속할 수 있어요.';
    inputs[valid.indexOf(false)].focus();
    return;
  }
  // This is a UI-only demo: do not send, persist, or log personal information.
  form.reset();
  resetVisibility();
  form.hidden = true;
  document.getElementById('signup-intro').hidden = true;
  success.hidden = false;
  feedback.textContent = '';
  document.getElementById('success-title').focus();
});

document.getElementById('signup-again').addEventListener('click', () => {
  form.reset();
  submitted = false;
  touched.clear();
  for (const input of inputs) {
    input.removeAttribute('aria-invalid');
    const error = document.getElementById(input.id + '-error');
    error.textContent = '';
    error.hidden = true;
  }
  resetVisibility();
  updateMatch();
  success.hidden = true;
  document.getElementById('signup-intro').hidden = false;
  form.hidden = false;
  nickname.focus();
});
fields.disabled = false;
