import { checklistRemaining } from './trip-checklist.js';
import { hasTravelTime } from './itinerary-timing.js';

export function tripReadiness(courseId, { checklist, openEditor }) {
  const panel = document.createElement('div');
  panel.className = 'trip-readiness';
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', '출발 준비 상태');
  const checks = document.createElement('button');
  const travel = document.createElement('button');
  const timing = document.createElement('button');
  for (const button of [checks, travel, timing]) button.type = 'button';

  function updateChecklist() {
    const remaining = checklistRemaining(courseId);
    checks.textContent = remaining ? '출발 확인 ' + remaining + '개 남음' : '출발 확인 완료';
    checks.dataset.pending = String(remaining > 0);
  }

  checks.addEventListener('click', () => {
    checklist.open = true;
    const target = checklist.querySelector('input:not(:checked)') ?? checklist.querySelector('summary');
    target?.focus();
  });
  checklist.addEventListener('checklistsaved', updateChecklist);
  updateChecklist();

  let firstMissingLeg = 1;
  let firstTimingIssue = 0;
  travel.addEventListener('click', () => openEditor(firstMissingLeg, '[data-travel-time]'));
  timing.addEventListener('click', () => openEditor(firstTimingIssue, 'input[type=time]'));

  function update(stops, details) {
    const missingLegs = stops.flatMap((stop, index) =>
      index > 0 && !hasTravelTime(stops[index - 1], stop) ? [index] : []);
    firstMissingLeg = missingLegs[0] ?? 1;
    travel.textContent = missingLegs.length ? '이동시간 미입력 ' + missingLegs.length + '구간' : '이동시간 입력 완료';
    travel.dataset.pending = String(missingLegs.length > 0);

    const overlaps = details.flatMap((entry, index) => entry.issue === 'overlap' ? [index] : []);
    const otherIssues = details.flatMap((entry, index) => entry.warning ? [index] : []);
    const incomplete = stops.findIndex(stop => !stop.time || !stop.duration);
    firstTimingIssue = overlaps[0] ?? otherIssues[0] ?? Math.max(0, incomplete);
    if (overlaps.length) timing.textContent = '일정 겹침 ' + overlaps.length + '곳';
    else if (otherIssues.length) timing.textContent = '일정 조정 필요 ' + otherIssues.length + '곳';
    else if (incomplete !== -1) timing.textContent = '방문·체류 시간 확인 필요';
    else timing.textContent = '겹치는 일정 없음';
    timing.dataset.pending = String(otherIssues.length > 0 || incomplete !== -1);
  }

  panel.append(checks, travel, timing);
  return { panel, update };
}
