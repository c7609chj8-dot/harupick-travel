const items = [
  ['hours', '방문 장소의 운영시간과 휴무일 확인'],
  ['transport', '교통편과 구간별 길찾기 확인'],
  ['weather', '날씨 확인하고 우산이나 겉옷 챙기기'],
  ['booking', '예약 내역과 입장권 확인'],
  ['essentials', '충전기, 신분증 등 준비물 챙기기']
];

export const checklistKey = courseId => 'harupick-checklist:' + courseId;

export function normalizeChecklist(value) {
  const stored = new Set(Array.isArray(value) ? value : []);
  return items.filter(([key]) => stored.has(key)).map(([key]) => key);
}

export function readChecklist(courseId) {
  try {
    const stored = JSON.parse(localStorage.getItem(checklistKey(courseId)));
    return new Set(normalizeChecklist(stored));
  } catch {
    return new Set();
  }
}

export function checklistRemaining(courseId) {
  return items.length - readChecklist(courseId).size;
}

export function tripChecklist(courseId) {
  const details = document.createElement('details');
  details.className = 'trip-checklist';
  const heading = document.createElement('summary');
  heading.append('출발 전 확인 목록');
  const count = document.createElement('span');
  count.className = 'trip-checklist-count';
  count.setAttribute('role', 'status');
  heading.append(' · ', count);
  const list = document.createElement('ul');
  const error = document.createElement('p');
  error.className = 'trip-checklist-error';
  error.setAttribute('role', 'status');
  const inputs = new Map();

  function render(completed) {
    let remaining = 0;
    for (const [key, input] of inputs) {
      input.checked = completed.has(key);
      if (!input.checked) remaining++;
    }
    count.textContent = remaining ? remaining + '개 남음' : '모두 확인했어요';
  }

  for (const [key, text] of items) {
    const row = document.createElement('li');
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    label.append(input, text);
    row.append(label);
    list.append(row);
    inputs.set(key, input);

    input.addEventListener('change', () => {
      const previous = readChecklist(courseId);
      const completed = new Set(previous);
      if (input.checked) completed.add(key);
      else completed.delete(key);
      try {
        localStorage.setItem(checklistKey(courseId), JSON.stringify([...completed]));
        error.textContent = '';
        render(completed);
        details.dispatchEvent(new Event('checklistsaved'));
      } catch {
        render(previous);
        error.textContent = '이 브라우저에 확인 상태를 저장할 수 없어요.';
      }
    });
  }

  render(readChecklist(courseId));
  details.append(heading, list, error);
  return details;
}
