const form = document.getElementById('signup-form');
const fields = document.getElementById('signup-fields');
const status = document.getElementById('account-status');
const nickname = document.getElementById('nickname');
const email = document.getElementById('email');
const password = document.getElementById('password');
const confirmation = document.getElementById('confirmation');

function validate() {
  nickname.setCustomValidity(nickname.value.trim().length < 2 ? '닉네임은 2자 이상 입력하세요.' : '');
  password.setCustomValidity(new TextEncoder().encode(password.value).length > 72 ? '비밀번호를 조금 짧게 입력하세요.' : '');
  confirmation.setCustomValidity(password.value === confirmation.value ? '' : '비밀번호가 서로 달라요.');
}

form.addEventListener('input', () => {
  validate();
  status.textContent = '회원가입 체험 화면입니다. 입력한 정보는 전송하거나 저장하지 않아요.';
});
form.addEventListener('submit', event => {
  event.preventDefault();
  validate();
  if (!form.reportValidity()) return;

  form.reset();
  confirmation.setCustomValidity('');
  nickname.setCustomValidity('');
  password.setCustomValidity('');
  status.textContent = '가입 화면 체험을 완료했어요. 실제 계정은 생성되지 않았습니다.';
});

fields.disabled = false;
