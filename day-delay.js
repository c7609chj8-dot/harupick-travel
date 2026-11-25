import { itineraryKey, itineraryStopName, readItinerary } from './itinerary.js';
import { savedCourseIds } from './demo-storage.js';

export function planDelay(stops, from, minutes, isPending = () => true) {
  if (![15, 30].includes(minutes) || !Number.isInteger(from) || from < 0 || from >= stops.length) return [];
  return stops.flatMap((stop, index) => {
    if (index < from || !stop.time || !isPending(stop)) return [];
    const [hours, mins] = stop.time.split(':').map(Number);
    const next = hours * 60 + mins + minutes;
    const after = [Math.floor(next / 60) % 24, next % 60].map(value => String(value).padStart(2, '0')).join(':');
    return [{ index, before: stop.time, after, nextDay: next >= 1440 }];
  });
}

export function setupDayDelay(course, { getSchedule, isPending, onApply }) {
  const panel = document.getElementById('day-delay');
  const start = document.getElementById('delay-start');
  const minutes = document.getElementById('delay-minutes');
  const list = document.getElementById('delay-preview');
  const apply = document.getElementById('delay-apply');
  const status = document.getElementById('delay-status');
  let changes = [];

  function preview() {
    const { stops } = getSchedule();
    changes = start.value === '' ? [] : planDelay(stops, Number(start.value), Number(minutes.value), isPending);
    list.replaceChildren();
    for (const change of changes) {
      const row = document.createElement('li');
      row.textContent = itineraryStopName(course, stops[change.index]) + ' · ' +
        change.before + ' → ' + (change.nextDay ? '다음 날 ' : '') + change.after;
      list.append(row);
    }
    const crossesMidnight = changes.some(change => change.nextDay);
    apply.disabled = !changes.length || crossesMidnight;
    status.textContent = crossesMidnight
      ? '자정을 넘는 방문 시간이 있어요. 내 여행에서 날짜와 방문 시간을 조정해 주세요.'
      : changes.length ? '적용하면 위 방문 시간이 저장됩니다.' : '이후 장소에 입력된 방문 시간이 없어요.';
  }

  start.addEventListener('change', preview);
  minutes.addEventListener('change', preview);
  panel.addEventListener('toggle', () => { if (panel.open) preview(); });
  apply.addEventListener('click', () => {
    if (apply.disabled) return;
    const schedule = getSchedule();
    if (!savedCourseIds().includes(course.id) || JSON.stringify(schedule) !== JSON.stringify(readItinerary(course))) {
      status.textContent = '다른 화면에서 일정이 변경됐어요. 당일 모드를 다시 열어 확인해 주세요.';
      apply.disabled = true;
      return;
    }
    const changedTimes = new Map(changes.map(change => [change.index, change.after]));
    const updated = { ...schedule, stops: schedule.stops.map((stop, index) =>
      changedTimes.has(index) ? { ...stop, time: changedTimes.get(index) } : stop) };
    try {
      localStorage.setItem(itineraryKey(course.id), JSON.stringify(updated));
    } catch {
      status.textContent = '방문 시간을 저장할 수 없어요. 브라우저 저장 설정을 확인해 주세요.';
      return;
    }
    onApply(updated);
    list.replaceChildren();
    apply.disabled = true;
    status.textContent = changedTimes.size + '개 장소의 방문 시간을 ' + minutes.value + '분 미뤘어요.';
  });

  return function updateOptions() {
    start.replaceChildren();
    getSchedule().stops.forEach((stop, index) => {
      if (!isPending(stop)) return;
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = itineraryStopName(course, stop);
      start.append(option);
    });
    panel.hidden = !start.options.length;
    if (panel.open && !panel.hidden) preview();
  };
}
