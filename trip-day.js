import { setupDayDelay } from './day-delay.js';
import { courseStopPlaces, routeLink } from './course-transport.js';
import { savedCourseIds } from './demo-storage.js';
import { itineraryStopName, readItinerary } from './itinerary.js';
import { rainAlternative } from './rain-alternatives.js';
import { findTrip } from './trip-records.js';

const get = id => document.getElementById(id);
const courseId = new URLSearchParams(location.search).get('course');
const course = savedCourseIds().includes(courseId) ? findTrip(courseId) : undefined;

if (course) {
  start(course);
} else {
  get('day-stop-title').textContent = '당일 모드로 열 수 있는 일정이 없어요.';
  get('day-note').textContent = '내 여행에서 저장한 일정의 여행 당일 모드를 열어 주세요.';
}

function start(course) {
  let schedule = readItinerary(course);
  const key = 'harupick-day:' + course.id + ':' + schedule.date;
  const stopKey = stop => stop.index + ':' + Number(stop.indoor) + (stop.place ? ':' + stop.place : '');
  const validKeys = new Set(schedule.stops.map(stopKey));
  let completed = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (Array.isArray(saved)) completed = new Set(saved.filter(id => validKeys.has(id)));
  } catch {
    get('day-storage').textContent = '이 브라우저에서는 방문 상태가 저장되지 않을 수 있어요.';
  }

  const next = get('day-next');
  const undo = get('day-undo');
  const heading = get('day-stop-title');
  const maps = get('day-maps');
  const bar = get('day-progress-bar');

  get('day-course').textContent = [course.title, schedule.date].filter(Boolean).join(' · ');
  bar.hidden = false;
  bar.max = schedule.stops.length;

  const isPending = stop => !completed.has(stopKey(stop));
  const updateDelay = setupDayDelay(course, {
    getSchedule: () => schedule,
    isPending,
    onApply(updated) {
      schedule = updated;
      render(false);
    }
  });

  function render(refreshDelay = true) {
    const stop = schedule.stops.find(isPending);
    if (refreshDelay) updateDelay();
    bar.value = completed.size;
    get('day-progress').textContent = '방문 완료 ' + completed.size + ' / ' + schedule.stops.length;
    next.hidden = !stop;
    undo.hidden = !completed.size;
    maps.replaceChildren();
    get('day-time').textContent = stop ? (stop.time || '시간 미정') : '';
    get('day-note').textContent = stop?.note ?? '';

    if (!stop) {
      heading.textContent = '모든 장소 방문을 마쳤어요.';
      return;
    }
    const mapPlace = stop.place || (stop.indoor && rainAlternative(course, stop.index));
    heading.textContent = itineraryStopName(course, stop);
    for (const place of mapPlace ? [mapPlace] : courseStopPlaces(course, stop.index)) {
      const link = document.createElement('a');
      link.href = routeLink(course.city, null, place);
      link.textContent = place + ' 길찾기';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      maps.append(link);
    }
    next.textContent = completed.size + 1 === schedule.stops.length ? '마지막 장소 방문 완료' : '방문 완료 · 다음 장소';
  }

  function update() {
    try {
      localStorage.setItem(key, JSON.stringify([...completed]));
      get('day-storage').textContent = '';
    } catch {
      get('day-storage').textContent = '방문 상태를 저장하지 못했어요. 이 화면에서는 계속 진행할 수 있습니다.';
    }
    render();
    heading.focus();
  }

  next.addEventListener('click', () => {
    const stop = schedule.stops.find(isPending);
    if (!stop) return;
    completed.add(stopKey(stop));
    update();
  });
  undo.addEventListener('click', () => {
    const last = [...completed].pop();
    if (last === undefined) return;
    completed.delete(last);
    update();
  });
  render();
}
