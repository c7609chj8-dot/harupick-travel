import { listMembers, getMember } from './admin-members-client.js';
import { createMembersController } from './admin-members-controller.js';
const $ = id => document.getElementById(id);
const statusLabels = { active: '이용 가능', unconfirmed: '이메일 미인증', suspended: '이용 제한', deleted: '삭제된 계정' };
const statusLabel = value => Object.hasOwn(statusLabels,value) ? statusLabels[value] : '확인 필요';
function date(value) {
  if (!value) return '기록 없음';
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? '기록 없음' : new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(time);
}
function textNode(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text ?? '기록 없음';
  if (className) node.className = className;
  return node;
}
export function setupMemberDirectory(onAccessFailure) {
  let query = '', page = 1, pages = 1, selectedId = null, focusDetail = false;
  const controller = createMembersController({
    list: listMembers, detail: getMember, onAccessFailure,
    onList(result) {
      $('member-rows').replaceChildren();
      $('member-table-wrap').hidden = true;
      $('members-retry').hidden = result.state !== 'error';
      $('members-prev').disabled = true;
      $('members-next').disabled = true;
      $('members-pagination').hidden = true;
      $('members-count').textContent = '';
      $('members-range').textContent = '';
      $('members-region').setAttribute('aria-busy', String(result.state === 'loading'));
      if (result.state === 'idle') { $('members-message').textContent = ''; return; }
      if (result.state === 'loading') { $('members-message').textContent = '회원 목록을 불러오고 있습니다.'; return; }
      if (result.state === 'error') { $('members-message').textContent = '회원 목록을 불러오지 못했습니다. 다시 시도해 주세요.'; return; }
      const data = result.data;
      page = data.page; pages = data.pages;
      const first = (page-1)*data.page_size+1;
      $('members-range').textContent = data.members.length ? first.toLocaleString('ko-KR')+'–'+(first+data.members.length-1).toLocaleString('ko-KR')+'번째 회원 표시' : '';
      $('members-count').textContent = (query ? '검색 결과 ' : '전체 ') + data.total.toLocaleString('ko-KR') + '명';
      $('members-message').textContent = data.total ? '가입일 최신순 · 한 페이지 20명 · 시각은 한국 시간 기준' : query ? '검색 결과가 없습니다. 다른 닉네임이나 이메일로 검색해 주세요.' : '아직 하루픽에 등록된 회원이 없습니다.';
      $('members-page').textContent = page + ' / ' + pages + ' 페이지';
      $('members-prev').disabled = page <= 1;
      $('members-next').disabled = page >= pages;
      $('members-pagination').hidden = !data.total;
      $('member-table-wrap').hidden = !data.members.length;
      for (const member of data.members) {
        const row = document.createElement('tr');
        const nickname = textNode('th', member.nickname); nickname.scope = 'row';
        row.append(nickname, textNode('td', member.email || '이메일 없음', 'member-email-cell'), textNode('td', date(member.created_at)));
        const stateCell = document.createElement('td');
        const badge = textNode('span', statusLabel(member.status), 'member-status');
        badge.dataset.status = Object.hasOwn(statusLabels,member.status) ? member.status : 'unknown';
        stateCell.append(badge);
        row.append(stateCell);
        const action = document.createElement('td');
        const button = textNode('button', '상세 보기');
        button.type = 'button'; button.dataset.memberId = member.id;
        button.setAttribute('aria-label', member.nickname + ' 회원 상세 보기');
        action.append(button); row.append(action); $('member-rows').append(row);
      }
    },
    onDetail(result) {
      selectedId = result.id || null;
      $('member-detail').hidden = result.state === 'idle';
      $('member-detail-fields').replaceChildren();
      $('member-detail-retry').hidden = result.state !== 'error';
      $('member-detail').setAttribute('aria-busy', String(result.state === 'loading'));
      const messages = { idle: '', loading: '회원 정보를 불러오고 있습니다.', missing: '이 회원은 삭제되었거나 하루픽에 등록되어 있지 않습니다.', error: '회원 정보를 불러오지 못했습니다. 다시 시도해 주세요.', ready: '조회 전용 정보입니다.' };
      $('member-detail-message').textContent = messages[result.state];
      if (result.state === 'ready') {
        const member = result.data;
        const fields = [
          ['닉네임', member.nickname], ['이메일', member.email || '이메일 없음'],
          ['회원 ID', member.id], ['계정 상태', statusLabel(member.status)],
          ['하루픽 가입 시각', date(member.created_at)], ['프로필 수정 시각', date(member.updated_at)],
          ['이메일 인증 시각', member.email_confirmed_at ? date(member.email_confirmed_at) : '미인증'],
          ['최근 계정 로그인', date(member.last_sign_in_at)]
        ];
        for (const [label, value] of fields) $('member-detail-fields').append(textNode('dt', label), textNode('dd', value));
      }
      if (focusDetail && result.state !== 'idle') { $('member-detail-title').focus(); focusDetail = false; }
    }
  });
  const load = () => controller.loadList({ query, page });
  $('members-search').addEventListener('submit', event => {
    event.preventDefault(); query = $('members-query').value.trim(); page = 1; load();
  });
  $('members-reset').addEventListener('click', () => { $('members-query').value = ''; query = ''; page = 1; load(); });
  $('members-retry').addEventListener('click', load);
  $('members-refresh').addEventListener('click', load);
  $('members-prev').addEventListener('click', () => { if (page > 1) { page--; load(); } });
  $('members-next').addEventListener('click', () => { if (page < pages) { page++; load(); } });
  $('member-rows').addEventListener('click', event => {
    const button = event.target.closest('button[data-member-id]');
    if (button) { focusDetail = true; controller.loadDetail(button.dataset.memberId); }
  });
  $('member-detail-retry').addEventListener('click', () => { if (selectedId) controller.loadDetail(selectedId); });
  $('member-detail-close').addEventListener('click', () => {
    const button = [...$('member-rows').querySelectorAll('button')].find(item => item.dataset.memberId === selectedId);
    controller.closeDetail(); (button || $('members-query')).focus();
  });
  return {
    activate() { controller.activate(); load(); },
    deactivate({ clearSearch = false } = {}) {
      controller.deactivate(); selectedId = null;
      if (clearSearch) { query = ''; page = 1; $('members-query').value = ''; }
    }
  };
}

