import { tripRequest, tripError } from './trip-cloud-client.js';
import { createTripBackup } from './trip-backup.js';
import { copyCloudTrip } from './trip-cloud-copy.js';
const $ = id => document.getElementById(id);
let owner = null, epoch = 0, sequence = 0, page = 1, pages = 1, onRestore = () => {};
let revisions = new Map();
const node = (tag, text) => { const item = document.createElement(tag); item.textContent = text; return item; };
function clearList() { $('cloud-trip-list')?.replaceChildren(); }
function controls() {
  document.querySelectorAll('[data-cloud-save]').forEach(button => { button.disabled = !owner || button.dataset.busy === 'true'; });
}
function clearMessages() { document.querySelectorAll('.cloud-save-message').forEach(item => { item.textContent = ''; }); }
export function setCloudAccount(id) {
  if (owner === id) return;
  owner = id; epoch++; sequence++; revisions = new Map(); page = 1;
  clearList(); clearMessages(); controls();
  $('cloud-trip-status').textContent = id ? '계정에 저장한 일정을 불러옵니다.' : '로그인하고 하루픽 닉네임을 등록하면 계정에 일정을 저장할 수 있어요.';
  $('cloud-trip-refresh').disabled = !id;
  $('cloud-trip-pages').hidden = true;
  if (id) loadCloudTrips();
}
async function loadCloudTrips() {
  if (!owner) return;
  const currentOwner = owner, currentEpoch = epoch, request = ++sequence;
  clearList(); $('cloud-trip-status').textContent = '서버 일정을 불러오고 있어요.';
  $('cloud-trip-pages').hidden = true;
  try {
    const data = await tripRequest('list', { owner_id: currentOwner, page, status: 'all' });
    if (currentEpoch !== epoch || request !== sequence) return;
    page = data.page; pages = data.pages;
    $('cloud-trip-status').textContent = data.total ? '계정에 저장된 일정 ' + data.total + '개 · 서버의 최신 내용은 브라우저로 복사해서 편집할 수 있어요.' : '계정에 저장한 일정이 없어요. 아래 브라우저 일정에서 ‘계정에 저장’을 눌러 주세요.';
    $('cloud-trip-pages').hidden = !data.total;
    $('cloud-trip-page').textContent = page + ' / ' + pages;
    $('cloud-trip-prev').disabled = page <= 1; $('cloud-trip-next').disabled = page >= pages;
    for (const trip of data.trips) {
      revisions.set(trip.local_id, trip.revision);
      const row = node('li', '');
      row.append(node('strong', trip.title), node('span', (trip.travel_date || '날짜 미정') + ' · ' + (trip.status === 'archived' ? '보관됨' : '이용 중')));
      const button = node('button', '브라우저로 복사');
      button.type = 'button'; button.setAttribute('aria-label', trip.title + ' 브라우저로 복사');
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const record = await tripRequest('get', { owner_id: currentOwner, id: trip.id });
          if (epoch !== currentEpoch) return;
          if (!record) { $('cloud-trip-status').textContent = '일정을 찾을 수 없어요. 목록을 새로 불러와 주세요.'; return; }
          copyCloudTrip(record); onRestore();
          $('cloud-trip-status').textContent = '서버 일정을 새 브라우저 일정으로 복사했어요. 기존 일정은 유지됩니다.';
        } catch (error) { if (epoch === currentEpoch) $('cloud-trip-status').textContent = tripError(error); }
        finally { if (epoch === currentEpoch) button.disabled = false; }
      });
      row.append(button); $('cloud-trip-list').append(row);
    }
  } catch (error) { if (epoch === currentEpoch && request === sequence) $('cloud-trip-status').textContent = tripError(error); }
}
export function cloudSaveActions(course) {
  const wrap = node('div', ''); wrap.className = 'cloud-save-actions';
  const button = node('button', '계정에 저장'); button.type = 'button';
  button.dataset.cloudSave = course.id; button.disabled = !owner;
  const message = node('p', ''); message.className = 'cloud-save-message'; message.setAttribute('role', 'status');
  button.addEventListener('click', async () => {
    if (!owner) return;
    const currentOwner = owner, currentEpoch = epoch;
    const snapshot = createTripBackup(course.id).trips[0];
    if (!snapshot) { message.textContent = '먼저 브라우저 일정을 저장해 주세요.'; return; }
    button.dataset.busy = 'true'; button.disabled = true;
    message.textContent = '현재 계정에 저장하고 있어요.';
    try {
      const result = await tripRequest('save', { owner_id: currentOwner, local_id: course.id, title: snapshot.itinerary.title || course.templateTitle || course.title, snapshot, revision: revisions.get(course.id) ?? null });
      if (epoch !== currentEpoch) return;
      revisions.set(course.id, result.revision);
      message.textContent = '계정에 저장했어요. 이후 편집한 내용은 이 버튼을 다시 눌러 저장해 주세요.';
      loadCloudTrips();
    } catch (error) { if (epoch === currentEpoch) message.textContent = tripError(error); }
    finally { delete button.dataset.busy; controls(); }
  });
  wrap.append(button, message); return wrap;
}
export function setupTripCloud(restore) {
  onRestore = restore;
  $('cloud-trip-refresh').addEventListener('click', loadCloudTrips);
  $('cloud-trip-prev').addEventListener('click', () => { if (page > 1) { page--; loadCloudTrips(); } });
  $('cloud-trip-next').addEventListener('click', () => { if (page < pages) { page++; loadCloudTrips(); } });
}

