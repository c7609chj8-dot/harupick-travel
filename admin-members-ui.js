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
  const defaults = () => ({query:'',status:'all',from:'',until:'',sort:'created_desc'});
  let applied = defaults(), page = 1, pages = 1, selectedId = null, focusDetail = false, lastUserId = null, detailContext = null;
  const readDraft = () => ({query:$('members-query').value.trim(),status:$('members-status').value,from:$('members-from').value,until:$('members-until').value,sort:$('members-sort').value});
  const filtered = () => Boolean(applied.query || applied.status !== 'all' || applied.from || applied.until);
  const sortLabel = () => applied.sort === 'created_asc' ? '가입일 오래된 순' : '가입일 최신순';
  const updateDraft = () => {
    const draft = readDraft();
    $('members-draft-message').hidden = Object.keys(applied).every(key=>applied[key] === draft[key]);
  };
  const clearValidation = () => {
    $('members-until').setCustomValidity('');
    $('members-filter-error').textContent = '';
    $('members-filter-error').hidden = true;
  };
  const resetFilters = () => {
    applied = defaults(); page = 1; $('members-search').reset(); clearValidation(); updateDraft();
  };
  const showApplied = () => {
    const terms = ['상태: '+(applied.status === 'all' ? '전체' : statusLabel(applied.status))];
    if (applied.query) terms.unshift('검색어: '+applied.query);
    terms.push('가입일: '+(applied.from || '시작 제한 없음')+' ~ '+(applied.until || '종료 제한 없음'),sortLabel());
    $('members-applied').textContent = '적용한 조건 · '+terms.join(' · ');
    $('members-applied').hidden = false;
  };
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
      $('members-created-heading').removeAttribute('aria-sort');
      $('members-table-caption').textContent = '하루픽 회원 목록 · 한국 시간';
      if (result.state === 'idle') {
        $('members-message').textContent = '';
        $('members-applied').textContent = ''; $('members-applied').hidden = true;
        return;
      }
      showApplied();
      if (result.state === 'loading') { $('members-message').textContent = '회원 목록을 불러오고 있습니다.'; return; }
      if (result.state === 'error') { $('members-message').textContent = '회원 목록을 불러오지 못했습니다. 다시 시도해 주세요.'; return; }
      const data = result.data;
      page = data.page; pages = data.pages;
      const first = (page-1)*data.page_size+1;
      $('members-range').textContent = data.members.length ? first.toLocaleString('ko-KR')+'–'+(first+data.members.length-1).toLocaleString('ko-KR')+'번째 회원 표시' : '';
      $('members-count').textContent = (filtered() ? '검색 결과 ' : '전체 ') + data.total.toLocaleString('ko-KR') + '명';
      $('members-message').textContent = data.total ? sortLabel()+' · 한 페이지 20명 · 시각은 한국 시간 기준' : filtered() ? '조건에 맞는 회원이 없습니다. 검색어나 상태·가입 기간을 변경해 주세요.' : '아직 하루픽에 등록된 회원이 없습니다.';
      $('members-created-heading').setAttribute('aria-sort',applied.sort === 'created_asc' ? 'ascending' : 'descending');
      $('members-table-caption').textContent = '하루픽 회원 목록 · '+sortLabel()+' · 한 페이지 20명 · 한국 시간';
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
        button.setAttribute('aria-controls','member-detail'); button.setAttribute('aria-expanded','false');
        button.setAttribute('aria-label', member.nickname + ' 회원 상세 보기');
        action.append(button); row.append(action); $('member-rows').append(row);
      }
    },
    onDetail(result) {
      selectedId = result.id || null;
      const idle = result.state === 'idle';
      $('member-detail').hidden = idle;
      $('member-detail-fields').replaceChildren(); $('member-detail-dates').replaceChildren();
      $('member-detail-content').hidden = result.state !== 'ready';
      $('member-detail-name').textContent = '';
      $('member-detail-context').textContent = '';
      $('member-detail-retry').hidden = result.state !== 'error';
      $('member-detail').setAttribute('aria-busy', String(result.state === 'loading'));
      for (const button of $('member-rows').querySelectorAll('button[data-member-id]')) {
        const selected = !idle && button.dataset.memberId === selectedId;
        button.setAttribute('aria-expanded',String(selected));
        button.closest('tr').classList.toggle('member-row-selected',selected);
      }
      if (idle) { detailContext = null; focusDetail = false; }
      else if (detailContext) {
        $('member-detail-name').textContent = detailContext.nickname;
        $('member-detail-context').textContent = detailContext.page+' / '+detailContext.pages+' 페이지에서 선택';
      }
      const messages = { idle: '', loading: '회원 정보를 불러오고 있습니다.', missing: '이 회원은 삭제되었거나 하루픽에 등록되어 있지 않습니다.', error: '회원 정보를 불러오지 못했습니다. 다시 시도해 주세요.', ready: '조회 전용 정보입니다.' };
      $('member-detail-message').textContent = messages[result.state];
      if (result.state === 'ready') {
        const member = result.data;
        $('member-detail-name').textContent = member.nickname;
        const fields = [['닉네임',member.nickname],['이메일',member.email || '이메일 없음'],['회원 ID',member.id],['계정 상태',statusLabel(member.status)]];
        for (const [label,value] of fields) {
          const valueNode = textNode('dd',value);
          if (label === '회원 ID') valueNode.className = 'member-id-value';
          if (label === '계정 상태') {
            const badge = textNode('span',value,'member-status');
            badge.dataset.status = Object.hasOwn(statusLabels,member.status) ? member.status : 'unknown';
            valueNode.replaceChildren(badge);
          }
          $('member-detail-fields').append(textNode('dt',label),valueNode);
        }
        for (const [label,value,fallback] of [
          ['하루픽 가입 시각',member.created_at,'기록 없음'],['프로필 수정 시각',member.updated_at,'기록 없음'],
          ['이메일 인증 시각',member.email_confirmed_at,'미인증'],['최근 계정 로그인',member.last_sign_in_at,'기록 없음']
        ]) {
          const valueNode = textNode('dd',fallback);
          if (typeof value === 'string' && Number.isFinite(Date.parse(value))) {
            const time = textNode('time',date(value)); time.dateTime = value; valueNode.replaceChildren(time);
          }
          $('member-detail-dates').append(textNode('dt',label),valueNode);
        }
      }
      const title = $('member-detail-title');
      if (focusDetail && !idle) {
        title.focus({preventScroll:true}); title.scrollIntoView({behavior:'instant',block:'start',inline:'nearest'}); focusDetail = false;
      } else if (!idle && result.state !== 'loading' && document.activeElement === title) {
        title.scrollIntoView({behavior:'instant',block:'start',inline:'nearest'});
      }
    }
  });
  const load = () => controller.loadList({ ...applied, page });
  $('members-search').addEventListener('submit', event => {
    event.preventDefault(); clearValidation();
    const draft = readDraft();
    const invalidRange = draft.from && draft.until && draft.from > draft.until;
    $('members-until').setCustomValidity(invalidRange ? '가입 종료일은 시작일과 같거나 이후여야 합니다.' : '');
    if (!$('members-search').reportValidity()) {
      $('members-filter-error').textContent = invalidRange ? '가입 종료일은 시작일과 같거나 이후여야 합니다.' : '검색어와 날짜 입력을 확인해 주세요.';
      $('members-filter-error').hidden = false; return;
    }
    applied = draft; page = 1; updateDraft(); load();
  });
  $('members-search').addEventListener('input', () => { clearValidation(); updateDraft(); });
  $('members-search').addEventListener('change', () => { clearValidation(); updateDraft(); });
  $('members-reset').addEventListener('click', () => {
    $('members-search').reset(); clearValidation(); applied = defaults(); page = 1; updateDraft(); load();
  });
  $('members-retry').addEventListener('click', load);
  $('members-refresh').addEventListener('click', load);
  $('members-prev').addEventListener('click', () => { if (page > 1) { page--; load(); } });
  $('members-next').addEventListener('click', () => { if (page < pages) { page++; load(); } });
  $('member-rows').addEventListener('click', event => {
    const button = event.target.closest('button[data-member-id]');
    if (button) {
      detailContext = {trigger:button,nickname:button.closest('tr').querySelector('th').textContent,page,pages};
      focusDetail = true; controller.loadDetail(button.dataset.memberId);
    }
  });
  $('member-detail-retry').addEventListener('click', () => {
    if (selectedId) { focusDetail = true; controller.loadDetail(selectedId); }
  });
  const closeDetail = () => {
    const trigger = detailContext?.trigger;
    const button = trigger?.isConnected ? trigger : [...$('member-rows').querySelectorAll('button')].find(item=>item.dataset.memberId === selectedId);
    controller.closeDetail();
    const target = button || $('members-query');
    target.focus({preventScroll:true}); target.scrollIntoView({behavior:'instant',block:'center',inline:'nearest'});
  };
  $('member-detail-close').addEventListener('click',closeDetail);
  $('member-detail-back').addEventListener('click',closeDetail);
  $('member-detail').addEventListener('keydown',event=>{
    if (event.key === 'Escape') { event.preventDefault(); closeDetail(); }
  });
  return {
    activate(userId) {
      if (lastUserId && lastUserId !== userId) resetFilters();
      lastUserId = userId;
      controller.activate(); load();
    },
    deactivate({ clearSearch = false } = {}) {
      controller.deactivate(); selectedId = null;
      if (clearSearch) {
        resetFilters(); lastUserId = null;
      }
    }
  };
}

