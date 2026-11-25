import { budgetDescription, readTripBudget } from './trip-budget.js';
import { readItinerary, itineraryStopText } from './itinerary.js';

export function formatItinerary(course, schedule, budget = readTripBudget(course.id)) {
  const lines = [course.title];
  if (schedule.date) lines.push('여행 날짜 · ' + schedule.date);
  lines.push('');
  schedule.stops.forEach((stop, index) => {
    lines.push((index + 1) + '. ' + itineraryStopText(course, stop));
    if (stop.note) lines.push('   메모 · ' + stop.note);
  });
  if (budget) lines.push('', '여행 예산 · ' + budgetDescription(budget));
  return lines.join('\n');
}

function printItinerary(course, schedule) {
  const page = document.createElement('section');
  page.className = 'itinerary-print-page';
  page.setAttribute('aria-label', '인쇄용 여행 일정');
  const heading = document.createElement('h1');
  heading.textContent = course.title;
  page.append(heading);
  if (schedule.date) {
    const date = document.createElement('p');
    date.textContent = '여행 날짜 · ' + schedule.date;
    page.append(date);
  }
  const list = document.createElement('ol');
  for (const stop of schedule.stops) {
    const item = document.createElement('li');
    item.textContent = itineraryStopText(course, stop);
    if (stop.note) {
      const note = document.createElement('p');
      note.textContent = '메모 · ' + stop.note;
      item.append(note);
    }
    list.append(item);
  }
  page.append(list);
  const budget = readTripBudget(course.id);
  if (budget) {
    const amount = document.createElement('p');
    amount.textContent = '여행 예산 · ' + budgetDescription(budget);
    page.append(amount);
  }
  document.body.append(page);
  document.body.classList.add('printing-itinerary');

  function cleanup() {
    page.remove();
    document.body.classList.remove('printing-itinerary');
  }
  window.addEventListener('afterprint', cleanup, { once: true });
  try {
    window.print();
  } catch (error) {
    window.removeEventListener('afterprint', cleanup);
    cleanup();
    throw error;
  }
}

export function itineraryShare(course) {
  const section = document.createElement('div');
  section.className = 'itinerary-share';
  const actions = document.createElement('div');
  actions.className = 'actions';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = '일정 복사';
  copy.setAttribute('aria-label', course.title + ' 일정 복사');
  const print = document.createElement('button');
  print.type = 'button';
  print.textContent = '일정 인쇄';
  print.setAttribute('aria-label', course.title + ' 일정 인쇄');
  const status = document.createElement('p');
  status.className = 'itinerary-share-status';
  status.setAttribute('role', 'status');
  const manualCopy = document.createElement('textarea');
  manualCopy.readOnly = true;
  manualCopy.hidden = true;
  manualCopy.rows = 6;
  manualCopy.setAttribute('aria-label', course.title + ' 복사용 일정');

  copy.addEventListener('click', async () => {
    const content = formatItinerary(course, readItinerary(course));
    try {
      await navigator.clipboard.writeText(content);
      manualCopy.hidden = true;
      status.textContent = '일정을 복사했어요. 카카오톡이나 메모 앱에 붙여넣을 수 있어요.';
    } catch {
      manualCopy.value = content;
      manualCopy.hidden = false;
      manualCopy.focus();
      manualCopy.select();
      status.textContent = '자동 복사가 제한돼 있어요. 선택된 일정 텍스트를 복사해 주세요.';
    }
  });

  print.addEventListener('click', () => {
    try {
      printItinerary(course, readItinerary(course));
    } catch {
      status.textContent = '인쇄 창을 열 수 없어요. 일정 복사를 이용해 주세요.';
    }
  });

  actions.append(copy, print);
  section.append(actions, status, manualCopy);
  return section;
}
