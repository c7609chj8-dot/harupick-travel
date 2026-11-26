import { listAudit, getAudit, auditEvents } from './admin-audit-client.js';
import { createMembersController } from './admin-members-controller.js';
const $ = id => document.getElementById(id);
const node = (tag, text) => { const element = document.createElement(tag); element.textContent = text ?? ''; return element; };
const fieldLabels = { title: '일정 제목', travel_date: '여행 날짜', status: '보관 상태', revision: '수정 버전', snapshot: '일정·예산·체크리스트 내용', is_active: '관리자 권한 활성', granted_at: '권한 부여 시각' };
const actorLabels = { admin: '관리자', member: '회원', system: '운영 도구' };
function timestamp(value) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value));
}
function fieldValue(key, value) {
  if (value === null || value === undefined) return '없음';
  if (key === 'status') return value === 'archived' ? '보관됨' : value === 'active' ? '이용 중' : String(value);
  if (key === 'is_active') return value ? '활성' : '비활성';
  if (key === 'granted_at' && Number.isFinite(Date.parse(value))) return timestamp(value);
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
export function setupAuditHistory(onAccessFailure) {
  let page = 1, pages = 1, selectedId = null, focusDetail = false;
  const params = () => ({ page, query: $('audit-query').value.trim(), event: $('audit-event').value, from: $('audit-from').value, until: $('audit-until').value });
  const controller = createMembersController({
    list: listAudit, detail: getAudit, onAccessFailure,
    onList(result) {
      $('audit-rows').replaceChildren(); $('audit-table-wrap').hidden = true;
      $('audit-pages').hidden = true; $('audit-retry').hidden = result.state !== 'error';
      $('audit-region').setAttribute('aria-busy', String(result.state === 'loading'));
      const messages = { idle: '', loading: '변경 이력을 불러오고 있습니다.', error: '이력을 불러오지 못했습니다. 검색 기간과 연결 상태를 확인한 뒤 다시 시도해 주세요.' };
      if (result.state !== 'ready') { $('audit-message').textContent = messages[result.state]; return; }
      const data = result.data; page = data.page; pages = data.pages;
      $('audit-message').textContent = data.total ? '변경 이력 ' + data.total + '건 · 최신순 · 한 페이지 20건 · 한국 시간 기준' : '조건에 맞는 변경 이력이 없습니다. 기록 기능 적용 이후의 변경부터 표시됩니다.';
      $('audit-pages').hidden = !data.total; $('audit-table-wrap').hidden = !data.events.length;
      $('audit-page').textContent = page + ' / ' + pages;
      $('audit-prev').disabled = page <= 1; $('audit-next').disabled = page >= pages;
      for (const entry of data.events) {
        const row = node('tr','');
        for (const value of [timestamp(entry.occurred_at), auditEvents[entry.event], entry.actor_label + ' · ' + actorLabels[entry.actor_type], entry.target_label]) row.append(node('td',value));
        const cell = node('td',''); const button = node('button','변경 전후');
        button.type = 'button'; button.dataset.auditId = entry.id;
        button.setAttribute('aria-label', entry.target_label + ' ' + auditEvents[entry.event] + ' 변경 전후 보기');
        cell.append(button); row.append(cell); $('audit-rows').append(row);
      }
    },
    onDetail(result) {
      selectedId = result.id || null;
      $('audit-detail').hidden = result.state === 'idle';
      $('audit-detail-fields').replaceChildren(); $('audit-diff-rows').replaceChildren();
      $('audit-diff-wrap').hidden = true; $('audit-detail-retry').hidden = result.state !== 'error';
      $('audit-detail').setAttribute('aria-busy', String(result.state === 'loading'));
      const messages = { idle: '', loading: '변경 내용을 불러오고 있습니다.', error: '변경 내용을 불러오지 못했습니다. 다시 시도해 주세요.', missing: '해당 변경 이력을 찾을 수 없습니다.', ready: '서버가 자동으로 남긴 기록이며 이 화면에서는 수정하거나 삭제할 수 없습니다.' };
      $('audit-detail-message').textContent = messages[result.state];
      if (result.state === 'ready') {
        const entry = result.data;
        const fields = [['기록 ID',entry.id],['변경 시각',timestamp(entry.occurred_at)],['작업',auditEvents[entry.event]],['수행자',entry.actor_label + ' · ' + actorLabels[entry.actor_type]],['수행자 ID',entry.actor_id || '운영 도구'],['대상',entry.target_label],['대상 ID',entry.target_id],['변경 항목',entry.changed_fields.map(key => fieldLabels[key] || key).join(', ') || '없음']];
        for (const [label,value] of fields) $('audit-detail-fields').append(node('dt',label),node('dd',value));
        for (const key of Object.keys(fieldLabels).filter(key => key !== 'snapshot' && (Object.hasOwn(entry.before_data || {},key) || Object.hasOwn(entry.after_data || {},key)))) {
          const row = node('tr','');
          row.append(node('th',fieldLabels[key]),node('td',fieldValue(key,entry.before_data?.[key])),node('td',fieldValue(key,entry.after_data?.[key])));
          row.firstChild.scope = 'row'; $('audit-diff-rows').append(row);
        }
        $('audit-diff-wrap').hidden = false;
      }
      if (focusDetail && result.state !== 'idle') { $('audit-detail-title').focus(); focusDetail = false; }
    }
  });
  const load = () => controller.loadList(params());
  $('audit-search').addEventListener('submit', event => {
    event.preventDefault();
    $('audit-until').setCustomValidity($('audit-from').value && $('audit-until').value && $('audit-from').value > $('audit-until').value ? '종료일은 시작일 이후로 선택해 주세요.' : '');
    if (!$('audit-search').reportValidity()) return;
    page = 1; load();
  });
  for (const id of ['audit-from','audit-until']) $(id).addEventListener('input', () => $('audit-until').setCustomValidity(''));
  $('audit-reset').addEventListener('click', () => { $('audit-search').reset(); $('audit-until').setCustomValidity(''); page = 1; load(); });
  $('audit-refresh').addEventListener('click',load); $('audit-retry').addEventListener('click',load);
  $('audit-prev').addEventListener('click', () => { if (page > 1) { page--; load(); } });
  $('audit-next').addEventListener('click', () => { if (page < pages) { page++; load(); } });
  $('audit-rows').addEventListener('click',event => {
    const button = event.target.closest('button[data-audit-id]');
    if (button) { focusDetail = true; controller.loadDetail(button.dataset.auditId); }
  });
  $('audit-detail-retry').addEventListener('click', () => { if (selectedId) controller.loadDetail(selectedId); });
  $('audit-detail-close').addEventListener('click', () => {
    const button = [...$('audit-rows').querySelectorAll('button')].find(button => button.dataset.auditId === selectedId);
    controller.closeDetail(); (button || $('audit-query')).focus();
  });
  document.addEventListener('harupick-trip-changed',load);
  return {
    open(id) { focusDetail = true; return controller.loadDetail(id); },
    activate() { controller.activate(); load(); },
    deactivate({ clearSearch = false } = {}) {
      controller.deactivate();
      if (clearSearch) { $('audit-search').reset(); $('audit-until').setCustomValidity(''); page = 1; }
    }
  };
}

