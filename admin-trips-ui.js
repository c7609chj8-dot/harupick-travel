import { tripRequest, tripError } from './trip-cloud-client.js';
import { createMembersController } from './admin-members-controller.js';
import { accessFailure } from './admin-members-client.js';
import { findTrip } from './trip-records.js';
import { itineraryStopText } from './itinerary.js';
const $ = id => document.getElementById(id);
const node = (tag, text) => { const item = document.createElement(tag); item.textContent = text ?? ''; return item; };
export function setupAdminTrips(onAccessFailure) {
  let page = 1, pages = 1, selected = null, epoch = 0;
  const params = () => ({ page, query: $('trips-query').value.trim(), status: $('trips-filter').value });
  const controller = createMembersController({
    list: args => tripRequest('admin_list', args),
    detail: id => tripRequest('admin_get', { id }), onAccessFailure,
    onList(result) {
      $('admin-trip-rows').replaceChildren(); $('trips-pages').hidden = true;
      $('trips-retry').hidden = result.state !== 'error';
      const messages = { idle: '', loading: '서버 일정을 불러오고 있습니다.', error: '일정 목록을 불러오지 못했습니다. 다시 시도해 주세요.' };
      if (result.state !== 'ready') { $('trips-message').textContent = result.state === 'loading' ? '서버 일정을 불러오고 있습니다.' : messages[result.state]; return; }
      const data = result.data; page = data.page; pages = data.pages;
      $('trips-message').textContent = data.total ? '검색 결과 ' + data.total + '개 · 수정일 최신순 · 한 페이지 20개' : '조건에 맞는 서버 일정이 없습니다.';
      $('trips-pages').hidden = !data.total; $('trips-page').textContent = page + ' / ' + pages;
      $('trips-prev').disabled = page <= 1; $('trips-next').disabled = page >= pages;
      for (const trip of data.trips) {
        const row = node('tr', '');
        for (const value of [trip.title, trip.nickname, trip.email || '이메일 없음', trip.travel_date || '날짜 미정', trip.status === 'archived' ? '보관됨' : '이용 중']) row.append(node('td', value));
        const action = node('td', ''); const button = node('button', '조회·관리');
        button.type = 'button'; button.dataset.tripId = trip.id;
        button.setAttribute('aria-label', trip.title + ' 조회 및 관리'); action.append(button); row.append(action); $('admin-trip-rows').append(row);
      }
    },
    onDetail(result) {
      epoch++; selected = null;
      $('admin-trip-detail').hidden = result.state === 'idle';
      $('admin-trip-fields').replaceChildren(); $('admin-trip-stops').replaceChildren();
      $('trip-update-title').value = ''; $('trip-update-date').value = ''; $('trip-update-status').value = 'active';
      $('trip-update-form').hidden = true; $('trip-update-message').textContent = '';
      $('trips-detail-retry').hidden = result.state !== 'error';
      const messages = { idle: '', loading: '일정 상세를 불러오고 있습니다.', error: '상세를 불러오지 못했습니다. 다시 조회해 주세요.', missing: '해당 일정을 찾을 수 없습니다.', ready: '제목·여행 날짜·보관 상태를 수정할 수 있습니다.' };
      $('trip-detail-message').textContent = messages[result.state];
      $('admin-trip-detail').dataset.id = result.id || '';
      if (result.state !== 'ready') return;
      selected = result.data;
      const trip = selected;
      for (const [label, value] of [['회원', trip.nickname], ['이메일', trip.email || '이메일 없음'], ['일정 ID', trip.id], ['수정 버전', String(trip.revision)]]) $('admin-trip-fields').append(node('dt', label), node('dd', value));
      const course = findTrip(trip.local_id);
      for (const stop of (trip.snapshot?.itinerary?.stops || []).filter(stop => stop && typeof stop === 'object')) {
        const item = node('li', course ? itineraryStopText(course, stop) : stop.place || String(stop.index));
        if (stop.note) item.append(node('p', stop.note)); $('admin-trip-stops').append(item);
      }
      $('trip-update-title').value = trip.title; $('trip-update-date').value = trip.travel_date || ''; $('trip-update-status').value = trip.status;
      $('trip-update-form').hidden = false; $('trip-update-submit').disabled = false;
    }
  });
  const load = () => controller.loadList(params());
  $('trips-search').addEventListener('submit', event => { event.preventDefault(); page = 1; load(); });
  $('trips-refresh').addEventListener('click', load); $('trips-retry').addEventListener('click', load);
  $('trips-prev').addEventListener('click', () => { if (page > 1) { page--; load(); } });
  $('trips-next').addEventListener('click', () => { if (page < pages) { page++; load(); } });
  $('admin-trip-rows').addEventListener('click', event => {
    const button = event.target.closest('button[data-trip-id]');
    if (button) { controller.loadDetail(button.dataset.tripId); $('admin-trip-detail-title').focus(); }
  });
  $('trips-detail-retry').addEventListener('click', () => controller.loadDetail($('admin-trip-detail').dataset.id));
  $('trips-detail-close').addEventListener('click', () => { controller.closeDetail(); $('trips-query').focus(); });
  $('trip-update-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!selected) return;
    const version = epoch, trip = selected;
    $('trip-update-submit').disabled = true;
    $('trip-update-message').textContent = '변경 내용을 저장하고 있습니다.';
    try {
      await tripRequest('admin_update', { id: trip.id, revision: trip.revision, title: $('trip-update-title').value.trim(), date: $('trip-update-date').value, status: $('trip-update-status').value });
      if (version !== epoch) return;
      document.dispatchEvent(new Event('harupick-trip-changed'));
      await load(); $('trips-feedback').textContent = '일정 변경을 저장했습니다. 목록에서 다시 조회할 수 있습니다.';
    } catch (error) {
      if (version !== epoch) return;
      const failure = accessFailure(error);
      if (failure) { controller.deactivate(); onAccessFailure(failure); }
      else $('trip-update-message').textContent = tripError(error);
    } finally { if (version === epoch) $('trip-update-submit').disabled = false; }
  });
  return {
    activate() { controller.activate(); load(); },
    deactivate({ clearSearch = false } = {}) {
      controller.deactivate(); $('trips-feedback').textContent = '';
      if (clearSearch) { $('trips-query').value = ''; $('trips-filter').value = 'all'; page = 1; }
    }
  };
}

