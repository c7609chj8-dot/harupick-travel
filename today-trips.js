import { checklistRemaining } from './trip-checklist.js';
import { compareTripTime, firstScheduledTime, organizeTrips } from './trip-order.js';
import { savedTrips } from './trip-records.js';
import { readItinerary } from './itinerary.js';

const koreanDate = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

export function todayInKorea(now = new Date()) {
  const parts = Object.fromEntries(koreanDate.formatToParts(now).map(part => [part.type, part.value]));
  return [parts.year, parts.month, parts.day].join('-');
}

export function sortTodayTrips(trips, today) {
  return trips.filter(({schedule}) => schedule.date === today).map(({course, schedule}) => ({
    course,
    firstTime: firstScheduledTime(schedule)
  })).sort(compareTripTime);
}

export function dayModeLink(course, text) {
  const link = document.createElement('a');
  link.href = './trip-day.html?' + new URLSearchParams({ course: course.id });
  link.className = 'primary';
  link.textContent = text;
  link.setAttribute('aria-label', course.title + ' ' + text);
  return link;
}

export function daysUntil(date, today) {
  return (Date.parse(date) - Date.parse(today)) / 86400000;
}

export function tripCardId(courseId) {
  return 'saved-trip-' + encodeURIComponent(courseId);
}

export function renderTodayTrips() {
  const panel = document.getElementById('today-trips');
  const list = document.getElementById('today-trip-list');
  const schedules = savedTrips()
    .map(course => ({ course, schedule: readItinerary(course) }));
  const today = todayInKorea();
  const entries = sortTodayTrips(schedules, today);
  const [upcoming] = organizeTrips(schedules, today).get('upcoming');
  renderUpcomingTrip(upcoming, today);
  panel.hidden = !entries.length;
  list.replaceChildren();
  for (const {course, firstTime} of entries) {
    const item = document.createElement('li');
    const title = document.createElement('h3');
    title.textContent = course.title;
    const time = document.createElement('p');
    time.textContent = firstTime ? '첫 예정 시간 · ' + firstTime : '방문 시간 미정';
    item.append(title, time, dayModeLink(course, '당일 모드 시작'));
    list.append(item);
  }
}

function renderUpcomingTrip(trip, today) {
  const panel = document.getElementById('upcoming-trip');
  panel.hidden = !trip;
  if (!trip) return;

  const { course, schedule, firstTime } = trip;
  const remaining = checklistRemaining(course.id);
  document.getElementById('upcoming-trip-title').textContent = course.title;
  document.getElementById('upcoming-trip-date').textContent = 'D-' + daysUntil(schedule.date, today) + ' · ' + schedule.date;
  document.getElementById('upcoming-trip-status').textContent =
    (firstTime ? '첫 방문 ' + firstTime : '방문 시간 미정') + ' · ' +
    (remaining ? '출발 확인 ' + remaining + '개 남음' : '출발 확인 완료');
  document.getElementById('upcoming-trip-link').href = '#' + encodeURIComponent(tripCardId(course.id));
}
