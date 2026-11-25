import { findTrip, savedTrips } from './trip-records.js';
import { savedCourseIds, savedKey } from './demo-storage.js';
import { itineraryKey, normalizeItinerary, readItinerary } from './itinerary.js';
import { budgetKey, normalizeBudget, readTripBudget } from './trip-budget.js';
import { checklistKey, normalizeChecklist, readChecklist } from './trip-checklist.js';

const format = 'harupick-trip-backup';
const version = 1;

export function createTripBackup(tripId) {
  const trips = savedTrips().filter(course => tripId === undefined || course.id === tripId).map(course => ({
    id: course.id,
    itinerary: readItinerary(course),
    budget: readTripBudget(course.id),
    checklist: [...readChecklist(course.id)]
  }));
  return { format, version, trips };
}

export function restoreTripBackup(backup) {
  if (backup?.format !== format || backup.version !== version || !Array.isArray(backup.trips)) {
    throw new TypeError('여행 하루픽에서 내보낸 백업 파일을 선택해 주세요.');
  }
  const ids = new Set(savedCourseIds());
  const imported = new Set();
  const changes = new Map();
  let skipped = 0;

  for (const trip of backup.trips) {
    const course = findTrip(trip?.id);
    const budget = normalizeBudget(trip?.budget);
    if (!course || imported.has(trip.id) || !Array.isArray(trip.itinerary?.stops) ||
        !Array.isArray(trip.checklist) || (trip.budget !== null && !budget)) {
      throw new TypeError('백업 파일에 손상되었거나 지원되지 않는 일정이 있어요.');
    }
    imported.add(trip.id);
    const itinerary = normalizeItinerary(course, trip.itinerary);
    const checklist = normalizeChecklist(trip.checklist);
    if (itinerary.stops.length !== trip.itinerary.stops.length ||
        checklist.length !== trip.checklist.length) {
      throw new TypeError('백업 파일에서 일부 장소나 확인 항목을 읽을 수 없어요.');
    }
    if (ids.has(trip.id)) {
      skipped++;
      continue;
    }
    changes.set(itineraryKey(trip.id), JSON.stringify(itinerary));
    changes.set(budgetKey(trip.id), budget ? JSON.stringify(budget) : null);
    changes.set(checklistKey(trip.id), JSON.stringify(checklist));
    ids.add(trip.id);
  }

  const restored = imported.size - skipped;
  if (!restored) return { restored, skipped };
  changes.set(savedKey, JSON.stringify([...ids]));

  const previous = new Map();
  try {
    for (const [key, value] of changes) {
      previous.set(key, localStorage.getItem(key));
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
  } catch {
    for (const [key, value] of previous) {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch {
        // Continue restoring other keys if the browser still rejects this write.
      }
    }
    throw new Error('브라우저 저장 공간을 확인한 뒤 다시 가져와 주세요.');
  }
  return { restored, skipped };
}

function downloadBackup(backup, fileName) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function downloadTripBackup(tripId) {
  const backup = createTripBackup(tripId);
  if (!backup.trips.length) return false;
  downloadBackup(backup, 'harupick-trip.json');
  return true;
}

export function setupTripBackup(onRestore) {
  const download = document.getElementById('backup-download');
  const input = document.getElementById('backup-file');
  const feedback = document.getElementById('backup-feedback');

  download.addEventListener('click', () => {
    const backup = createTripBackup();
    if (!backup.trips.length) {
      feedback.textContent = '백업할 일정이 없어요. 추천 코스를 먼저 저장해 주세요.';
      return;
    }
    downloadBackup(backup, 'harupick-trips-backup.json');
    feedback.textContent = '일정 ' + backup.trips.length + '개의 백업 파일을 만들었어요.';
  });

  input.addEventListener('change', async () => {
    const [file] = input.files;
    if (!file) return;
    input.disabled = true;
    try {
      const { restored, skipped } = restoreTripBackup(JSON.parse(await file.text()));
      if (restored) onRestore();
      feedback.textContent = '가져온 일정 ' + restored + '개' +
        (skipped ? ' · 이미 있는 일정 ' + skipped + '개 건너뜀' : '') + '.';
    } catch (error) {
      feedback.textContent = error instanceof SyntaxError
        ? '백업 파일을 읽을 수 없어요. 여행 하루픽에서 받은 JSON 파일을 선택해 주세요.'
        : error.message;
    } finally {
      input.value = '';
      input.disabled = false;
    }
  });
}
