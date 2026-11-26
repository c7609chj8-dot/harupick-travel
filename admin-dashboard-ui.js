import { getDashboard } from './admin-dashboard-client.js';
import { createDashboardController } from './admin-dashboard-controller.js';
import { auditEvents } from './admin-audit-client.js';
const $ = id => document.getElementById(id);
const node = (tag, text) => { const element = document.createElement(tag); element.textContent = text ?? ''; return element; };
const timestamp = value => new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'medium'}).format(new Date(value));
const date = value => new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric'}).format(new Date(value+'T00:00:00+09:00'));
export function setupDashboard({ onAccessFailure, openTrip, openAudit }) {
  const metrics = [
    ['dashboard-members','registered_members','명'], ['dashboard-trips','total_trips','개'],
    ['dashboard-upcoming','upcoming_trips_30d','개'], ['dashboard-changes','changes_7d','건']
  ];
  const copy = {
    idle: ['대기','관리자 권한 확인 후 통계를 조회합니다.',''],
    loading: ['집계 중','통계를 불러오고 있습니다.','서버의 집계 결과를 확인하고 있습니다.'],
    error: ['조회 오류','통계를 불러오지 못했습니다.','연결 상태를 확인한 뒤 다시 시도해 주세요.'],
    ready: ['조회 완료','서버 통계를 불러왔습니다.','한국 시간 기준의 집계입니다. 최신 내용은 통계 새로고침으로 확인할 수 있습니다.']
  };
  const controller = createDashboardController({
    load: getDashboard, onAccessFailure,
    onState(result) {
      const state = result.state;
      $('admin-dashboard').dataset.state = state;
      $('admin-dashboard').setAttribute('aria-busy',String(state === 'loading'));
      $('dashboard-stage').textContent = copy[state][0];
      $('dashboard-status-title').textContent = copy[state][1];
      $('dashboard-status-message').textContent = copy[state][2];
      $('dashboard-refresh').disabled = state === 'idle' || state === 'loading';
      $('dashboard-retry').hidden = state !== 'error';
      $('dashboard-asof-line').hidden = true;
      $('dashboard-asof').textContent = '';
      $('dashboard-asof').removeAttribute('datetime');
      for (const [id] of metrics) $(id).textContent = '—';
      $('dashboard-trip-breakdown').textContent = '';
      for (const id of ['dashboard-upcoming-list','dashboard-recent-list']) { $(id).replaceChildren(); $(id).hidden = true; }
      const message = state === 'error' ? '목록을 불러오지 못했습니다.' : state === 'loading' ? '목록을 불러오고 있습니다.' : '';
      $('dashboard-upcoming-empty').textContent = message;
      $('dashboard-recent-empty').textContent = message;
      $('dashboard-upcoming-empty').hidden = false;
      $('dashboard-recent-empty').hidden = false;
      if (state !== 'ready') return;
      const data = result.data;
      for (const [id,key,unit] of metrics) $(id).textContent = data.metrics[key].toLocaleString('ko-KR')+unit;
      $('dashboard-trip-breakdown').textContent = '이용 중 '+data.metrics.active_trips.toLocaleString('ko-KR')+'개 · 보관 '+data.metrics.archived_trips.toLocaleString('ko-KR')+'개';
      $('dashboard-asof').dateTime = data.as_of;
      $('dashboard-asof').textContent = timestamp(data.as_of)+' · 한국 시간';
      $('dashboard-asof-line').hidden = false;
      $('dashboard-upcoming-empty').textContent = '오늘부터 30일 내의 이용 중 여행이 없습니다.';
      $('dashboard-recent-empty').textContent = '아직 기록된 변경 이력이 없습니다.';
      $('dashboard-upcoming-empty').hidden = Boolean(data.upcoming_trips.length);
      $('dashboard-recent-empty').hidden = Boolean(data.recent_changes.length);
      $('dashboard-upcoming-list').hidden = !data.upcoming_trips.length;
      $('dashboard-recent-list').hidden = !data.recent_changes.length;
      for (const trip of data.upcoming_trips) {
        const item = node('li',''), info = node('div','');
        info.append(node('strong',trip.title),node('p',date(trip.travel_date)+' · '+trip.nickname));
        const button = node('button','일정 상세'); button.type = 'button';
        button.setAttribute('aria-label',trip.title+' 일정 상세 보기');
        button.addEventListener('click',()=>openTrip(trip.id));
        item.append(info,button); $('dashboard-upcoming-list').append(item);
      }
      for (const entry of data.recent_changes) {
        const item = node('li',''), info = node('div',''), label = node('span',auditEvents[entry.event]);
        label.className = 'dashboard-event-label';
        info.append(label,node('strong',entry.target_label),node('p',entry.actor_label+' · '+timestamp(entry.occurred_at)));
        const button = node('button','변경 전후'); button.type = 'button';
        button.setAttribute('aria-label',entry.target_label+' 변경 전후 보기');
        button.addEventListener('click',()=>openAudit(entry.id));
        item.append(info,button); $('dashboard-recent-list').append(item);
      }
    }
  });
  $('dashboard-refresh').addEventListener('click',()=>controller.refresh());
  $('dashboard-retry').addEventListener('click',()=>controller.refresh());
  document.addEventListener('harupick-trip-changed',()=>controller.refresh());
  return {
    activate() { controller.activate(); controller.refresh(); },
    deactivate() { controller.deactivate(); }
  };
}

