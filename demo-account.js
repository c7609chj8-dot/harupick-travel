import { organizeTrips, tripGroups } from './trip-order.js';
import { tripReadiness } from './trip-readiness.js';
import { dayModeLink, renderTodayTrips, todayInKorea, tripCardId } from './today-trips.js';
import { downloadTripBackup, setupTripBackup } from './trip-backup.js';
import { tripChecklist } from './trip-checklist.js';
import { budgetDescription, readTripBudget } from './trip-budget.js';
import { timingDetails } from './itinerary-timing.js';
import { itineraryShare } from './itinerary-share.js';
import { rainAlternative } from './rain-alternatives.js';
import { courseTransport } from './course-transport.js';
import { itineraryEditor, itineraryStopText, readItinerary } from './itinerary.js';
import { duplicateTrip, findTrip, savedTrips } from './trip-records.js';
import { isDemoSignedIn, sessionKey, savedCourseIds, setCourseSaved } from './demo-storage.js';
const loginButton = document.getElementById('demo-login');
const logoutButton = document.getElementById('demo-logout');
const resetForm = document.getElementById('demo-reset');

let activeCourseId = new URLSearchParams(location.search).get('course');
let refreshSavedGroups = () => {};

function showTripState() {
  const signedIn = isDemoSignedIn();
  document.getElementById('trip-status').textContent = signedIn
    ? '체험 계정으로 로그인했어요.'
    : '로그인 없이 일정을 만들 수 있어요.';
  document.getElementById('trip-login').hidden = signedIn;
  logoutButton.hidden = !signedIn;
  document.getElementById('saved-feedback').textContent = '';
  renderSavedTrips();
}

function renderSavedTrips() {
  renderTodayTrips();
  const list = document.getElementById('saved-list');
  const feedback = document.getElementById('saved-feedback');
  const ids = savedCourseIds();
  const activeCourse = findTrip(activeCourseId);
  const courses = savedTrips().filter(course => course.id !== activeCourseId);
  if (activeCourse) courses.unshift(activeCourse);

  const pastWasOpen = list.querySelector('.saved-trip-history')?.open ?? false;
  list.replaceChildren();
  refreshSavedGroups = () => {};
  if (!courses.length) {
    const empty = document.createElement('p');
    empty.textContent = '아직 저장한 코스가 없어요. 추천 코스에서 마음에 드는 일정을 저장해 보세요.';
    list.append(empty);
    return;
  }
  const containers = new Map();
  const cards = [];
  for (const [key, name] of tripGroups) {
    const isPast = key === 'past';
    const section = document.createElement(isPast ? 'details' : 'section');
    section.className = isPast ? 'saved-trip-group saved-trip-history' : 'saved-trip-group';
    if (isPast) section.open = pastWasOpen;
    const heading = document.createElement(isPast ? 'summary' : 'h3');
    heading.id = 'trip-group-' + key;
    heading.textContent = name;
    section.setAttribute('aria-labelledby', heading.id);
    const items = document.createElement('div');
    section.append(heading, items);
    list.append(section);
    containers.set(key, { section, heading, items });
  }

  refreshSavedGroups = () => {
    const entries = cards.map(({ course, card }) => ({ course, card, schedule: readItinerary(course) }));
    const groups = organizeTrips(entries, todayInKorea(), activeCourseId);
    const focused = document.activeElement;
    let focusTarget = focused;
    for (const [key, entries] of groups) {
      const { section, heading, items } = containers.get(key);
      section.hidden = !entries.length;
      if (key === 'past') {
        heading.textContent = '지난 여행 ' + entries.length + '개';
        if (!section.open && entries.some(({card}) => card.contains(focused))) focusTarget = heading;
      }
      entries.forEach(({card}, position) => {
        if (items.children[position] !== card) items.insertBefore(card, items.children[position] ?? null);
      });
    }
    if (focusTarget?.isConnected && focusTarget !== document.body && document.activeElement !== focusTarget) focusTarget.focus();
  };

  for (const course of courses) {
    const card = document.createElement('article');
    card.className = 'saved-card';
    card.id = tripCardId(course.id);
    card.tabIndex = -1;
    const title = document.createElement('h4');
    title.textContent = course.title;
    const date = document.createElement('p');
    date.className = 'itinerary-date';
    const stops = document.createElement('ol');
    const timingNote = document.createElement('p');
    timingNote.className = 'timing-note';
    timingNote.textContent = '구간별 이동시간을 입력하면 이동 후 여유나 부족한 시간이 표시됩니다.';
    function updateSchedule() {
      const schedule = readItinerary(course);
      date.hidden = !schedule.date;
      date.textContent = schedule.date ? '여행 날짜 ' + schedule.date : '';
      stops.replaceChildren();
      const timing = timingDetails(schedule.stops);
      readiness.update(schedule.stops, timing);
      timingNote.hidden = !timing.some(entry => entry.endsAt || entry.message);
      for (const [index, stop] of schedule.stops.entries()) {
        const item = document.createElement('li');
        const alternative = stop.indoor && rainAlternative(course, stop.index);
        const mapPlace = stop.place || alternative;
        item.textContent = itineraryStopText(course, stop);
        if (mapPlace) {
          const mapLink = document.createElement('a');
          mapLink.href = 'https://map.naver.com/p/search/' + encodeURIComponent(course.city + ' ' + mapPlace);
          mapLink.target = '_blank';
          mapLink.rel = 'noopener noreferrer';
          mapLink.className = 'itinerary-note';
          mapLink.textContent = stop.place ? '추가 장소 지도 보기' : '대체 장소 지도 보기';
          mapLink.setAttribute('aria-label', mapPlace + ' 지도 보기');
          item.append(mapLink);
        }
        if (stop.note) {
          const note = document.createElement('div');
          note.className = 'itinerary-note';
          note.textContent = stop.note;
          item.append(note);
        }
        const { endsAt, message, warning } = timing[index];
        if (endsAt) {
          const finish = document.createElement('div');
          finish.className = 'timing-note';
          finish.textContent = '예상 종료 · ' + endsAt;
          item.append(finish);
        }
        if (message) {
          const advisory = document.createElement('div');
          advisory.className = warning ? 'timing-warning' : 'timing-gap';
          advisory.textContent = message;
          item.append(advisory);
        }
        stops.append(item);
      }
    }
    const isActive = course.id === activeCourseId;
    const hasSaved = ids.includes(course.id);
    const checklist = tripChecklist(course.id);
    checklist.addEventListener('checklistsaved', renderTodayTrips);
    checklist.hidden = !hasSaved;
    const share = itineraryShare(course);
    const budget = readTripBudget(course.id);
    const budgetAmount = document.createElement('p');
    budgetAmount.className = 'itinerary-budget-amount';
    budgetAmount.hidden = !hasSaved || !budget;
    if (budget) budgetAmount.textContent = '여행 예산 · ' + budgetDescription(budget);
    const budgetLink = document.createElement('a');
    budgetLink.href = './budget.html?' + new URLSearchParams({ course: course.id });
    budgetLink.textContent = budget ? '예산 편집' : '예산 입력';
    budgetLink.setAttribute('aria-label', course.title + ' ' + budgetLink.textContent);
    budgetLink.hidden = !hasSaved;
    share.hidden = !hasSaved;
    const editor = itineraryEditor(course, () => {
      setCourseSaved(course.id, true);
      renderTodayTrips();
      share.hidden = false;
      exportButton.hidden = false;
      copyForm.hidden = false;
      dayLink.hidden = false;
      checklist.hidden = false;
      readiness.panel.hidden = false;
      budgetLink.hidden = false;
      budgetAmount.hidden = !budget;
      remove.hidden = false;
      if (course.id === activeCourseId) {
        activeCourseId = null;
        history.replaceState(null, '', location.pathname);
      }
    });
    editor.open = isActive;
    editor.id = 'itinerary-' + encodeURIComponent(course.id);
    editor.querySelector('summary').hidden = true;
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'trip-edit-button';
    edit.textContent = '일정 편집';
    edit.setAttribute('aria-label', course.title + ' 일정 편집');
    edit.setAttribute('aria-controls', editor.id);
    edit.setAttribute('aria-expanded', String(editor.open));
    edit.addEventListener('click', () => {
      editor.open = !editor.open;
      edit.setAttribute('aria-expanded', String(editor.open));
    });
    const readiness = tripReadiness(course.id, {
      checklist,
      openEditor(index, selector) {
        editor.open = true;
        edit.setAttribute('aria-expanded', 'true');
        const list = editor.querySelector('ol');
        const field = list.children[index]?.querySelector(selector + ':not(:disabled)');
        (field ?? editor.querySelector('input[type=date]'))?.focus();
      }
    });
    readiness.panel.hidden = !hasSaved;
    const transport = courseTransport(course, () => readItinerary(course).stops.map(stop => stop.place || (stop.indoor && rainAlternative(course, stop.index)) || stop.index));
    editor.addEventListener('itinerarysaved', () => {
      const updated = findTrip(course.id);
      if (updated.title !== course.title) {
        renderSavedTrips();
        const updatedCard = document.getElementById(tripCardId(course.id));
        const historyGroup = updatedCard.closest('.saved-trip-history');
        if (historyGroup) historyGroup.open = true;
        updatedCard.querySelector('.trip-edit-button').focus();
        feedback.textContent = updated.title + ' 일정을 저장했어요.';
        return;
      }
      updateSchedule();
      transport?.render();
      refreshSavedGroups();
    });
    updateSchedule();
    const primaryActions = document.createElement('div');
    primaryActions.className = 'trip-card-primary';
    const dayLink = dayModeLink(course, '여행 당일 모드');
    dayLink.hidden = !hasSaved;
    const map = document.createElement('a');
    map.href = course.url;
    map.target = '_blank';
    map.rel = 'noopener noreferrer';
    map.textContent = '주요 장소 지도 보기';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.hidden = !hasSaved;
    remove.textContent = '저장 삭제';
    remove.setAttribute('aria-label', course.title + ' 저장 삭제');
    remove.addEventListener('click', () => {
      try {
        setCourseSaved(course.id, false);
        if (course.id === activeCourseId) {
          activeCourseId = null;
          history.replaceState(null, '', location.pathname);
        }
        renderSavedTrips();
        feedback.textContent = course.title + ' 코스를 삭제했어요.';
        document.getElementById('saved-heading').focus();
      } catch {
        feedback.textContent = '코스를 삭제할 수 없어요. 다시 시도해 주세요.';
      }
    });
    primaryActions.append(dayLink, edit);
    const more = document.createElement('details');
    more.className = 'trip-card-more';
    const moreLabel = document.createElement('summary');
    moreLabel.textContent = '더보기';
    moreLabel.setAttribute('aria-label', course.title + ' 더보기');
    const secondaryActions = document.createElement('div');
    secondaryActions.className = 'actions';
    secondaryActions.append(budgetLink, map, remove);
    const copyForm = document.createElement('form');
    copyForm.className = 'trip-copy-form';
    copyForm.hidden = !hasSaved;
    const copyLabel = document.createElement('label');
    copyLabel.textContent = '새 여행 날짜';
    const copyDate = document.createElement('input');
    copyDate.type = 'date';
    copyDate.required = true;
    copyLabel.append(copyDate);
    const copyButton = document.createElement('button');
    copyButton.type = 'submit';
    copyButton.textContent = '일정 복제';
    const copyStatus = document.createElement('p');
    copyStatus.setAttribute('role', 'status');
    copyForm.append(copyLabel, copyButton, copyStatus);
    copyForm.addEventListener('submit', event => {
      event.preventDefault();
      try {
        const id = duplicateTrip(course, copyDate.value);
        location.assign('./my-trip.html?' + new URLSearchParams({ course: id }));
      } catch {
        copyStatus.textContent = '새 일정을 저장할 수 없어요. 날짜와 브라우저 저장 설정을 확인해 주세요.';
      }
    });
    const exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.textContent = '이 일정 파일로 내보내기';
    exportButton.setAttribute('aria-label', course.title + ' 파일로 내보내기');
    exportButton.hidden = !hasSaved;
    const exportStatus = document.createElement('p');
    exportStatus.className = 'itinerary-share-status';
    exportStatus.setAttribute('role', 'status');
    exportButton.addEventListener('click', () => {
      try {
        exportStatus.textContent = downloadTripBackup(course.id)
          ? '이 일정의 백업 파일을 만들었어요. 메모와 예산도 포함됩니다.'
          : '먼저 일정을 저장해 주세요.';
      } catch {
        exportStatus.textContent = '백업 파일을 만들 수 없어요.';
      }
    });
    secondaryActions.append(exportButton);
    more.append(moreLabel, secondaryActions, exportStatus, share, copyForm);
    if (transport) more.append(transport.panel);
    card.append(title, date, primaryActions, readiness.panel, editor, stops, timingNote, checklist, budgetAmount, more);
    cards.push({ course, card });
  }
  refreshSavedGroups();
}

if (loginButton) {
  loginButton.disabled = false;
  loginButton.addEventListener('click', () => {
    try {
      sessionStorage.setItem(sessionKey, 'active');
    } catch {
      document.getElementById('demo-login-status').textContent = '브라우저에서 탭 저장을 허용하면 체험 로그인할 수 있어요.';
      return;
    }
    const next = new URLSearchParams(location.search).get('next');
    location.assign(next === 'courses' ? './index.html?view=courses#results' : './my-trip.html');
  });
}

if (logoutButton) {
  setupTripBackup(renderSavedTrips);
  showTripState();
  window.addEventListener('pageshow', event => { if (event.persisted) showTripState(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      renderTodayTrips();
      refreshSavedGroups();
    }
  });
  logoutButton.addEventListener('click', () => {
    try {
      sessionStorage.removeItem(sessionKey);
    } catch {
      document.getElementById('trip-status').textContent = '체험 로그인 상태를 지울 수 없어요. 이 탭을 닫아 주세요.';
      return;
    }
    showTripState();
    document.getElementById('trip-login').focus();
  });
}

if (resetForm) {
  document.getElementById('reset-fields').disabled = false;
  resetForm.addEventListener('submit', event => {
    event.preventDefault();
    document.getElementById('reset-status').textContent = '재설정 요청 체험이 완료됐어요. 계정 연결 후에는 이 단계에서 재설정 링크가 이메일로 발송됩니다.';
  });
}
