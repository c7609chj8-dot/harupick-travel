import { maxDuration, travelLegKey, validDuration, validTravelMinutes } from './itinerary-timing.js';
import { rainAlternative } from './rain-alternatives.js';

export const itineraryKey = courseId => 'harupick-itinerary:' + courseId;
const customIndexPattern = /^custom-[a-f0-9-]{36}$/;
const maxPlaceLength = 80;
const maxTitleLength = 80;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export function readItinerary(course) {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(itineraryKey(course.id)));
  } catch {
    saved = null;
  }

  return normalizeItinerary(course, saved);
}

export function normalizeItinerary(course, saved) {
  const remaining = new Set(course.body.map((_, index) => index));
  const stops = [];
  const customIds = new Set();
  for (const stop of Array.isArray(saved?.stops) ? saved.stops : []) {
    if (!stop) continue;
    const custom = typeof stop.index === 'string' && customIndexPattern.test(stop.index);
    const place = custom && typeof stop.place === 'string' ? stop.place.trim().slice(0, maxPlaceLength) : '';
    if (custom) {
      if (!place || customIds.has(stop.index)) continue;
      customIds.add(stop.index);
    } else if (!remaining.delete(stop.index)) {
      continue;
    }
    stops.push({
      index: stop.index,
      ...(custom ? { place } : {}),
      time: typeof stop.time === 'string' && timePattern.test(stop.time) ? stop.time : '',
      duration: validDuration(stop.duration) ? stop.duration : null,
      travel: typeof stop.travel?.leg === 'string' && validTravelMinutes(stop.travel.minutes) ? stop.travel : null,
      note: typeof stop.note === 'string' ? stop.note.slice(0, 240) : '',
      indoor: stop.indoor === true && Boolean(rainAlternative(course, stop.index))
    });
  }
  for (const index of remaining) stops.push({ index, time: '', duration: null, note: '', indoor: false });

  return {
    title: typeof saved?.title === 'string' ? saved.title.trim().slice(0, maxTitleLength) : '',
    date: typeof saved?.date === 'string' && datePattern.test(saved.date) ? saved.date : '',
    stops
  };
}

export function itineraryStopName(course, stop) {
  return stop.place || (stop.indoor && rainAlternative(course, stop.index)) || course.body[stop.index];
}

export function itineraryStopText(course, stop) {
  const duration = validDuration(stop.duration) ? '체류 ' + stop.duration + '분' : '';
  return [stop.time, itineraryStopName(course, stop), duration].filter(Boolean).join(' · ');
}

function element(tag, text = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function labeledInput(label, type, value) {
  const field = element('label', label);
  const input = element('input');
  input.type = type;
  input.value = value;
  field.append(input);
  return { field, input };
}

function moveButton(text, direction, item, list, updateButtons) {
  const button = element('button', text);
  button.type = 'button';
  button.setAttribute('aria-label', item.querySelector('strong').textContent + ' ' + text);
  button.addEventListener('click', () => {
    const neighbor = direction < 0 ? item.previousElementSibling : item.nextElementSibling;
    if (!neighbor) return;
    if (direction < 0) list.insertBefore(item, neighbor);
    else list.insertBefore(neighbor, item);
    updateButtons();
    (button.disabled ? item.querySelector('button:not(:disabled)') : button)?.focus();
  });
  return button;
}

export function itineraryEditor(course, onSave = () => {}) {
  const schedule = readItinerary(course);
  const details = element('details');
  details.className = 'itinerary';
  const summary = element('summary', '내 일정 편집');
  const form = element('form');
  const titleField = labeledInput('일정 제목', 'text', schedule.title);
  titleField.input.maxLength = maxTitleLength;
  titleField.input.placeholder = course.templateTitle ?? course.title;
  const titleHelp = element('small', '제목을 비우면 추천 코스 이름이 표시됩니다.');
  const date = labeledInput('여행 날짜', 'date', schedule.date);
  const list = element('ol');
  const fields = new Map();
  const add = element('button', '내 장소 추가');
  add.type = 'button';
  add.className = 'itinerary-add-place';
  const savedLegs = new Map(schedule.stops.filter(stop => stop.travel)
    .map(stop => [stop.travel.leg, String(stop.travel.minutes)]));
  const status = element('p');
  status.setAttribute('role', 'status');

  function stopIdentity(item) {
    const place = fields.get(item).place;
    const index = place ? item.dataset.index : Number(item.dataset.index);
    return { index, ...(place ? { place: place.value.trim() } : {}), indoor: item.dataset.indoor === 'true' };
  }

  function updateButtons() {
    Array.from(list.children).forEach((item, index, rows) => {
      const [up, down] = item.querySelectorAll('.itinerary-order button');
      up.disabled = index === 0;
      down.disabled = index === rows.length - 1;
      const { field, input, hint } = fields.get(item).travel;
      const previous = rows[index - 1];
      const leg = previous ? travelLegKey(stopIdentity(previous), stopIdentity(item)) : '';
      field.hidden = !previous;
      input.disabled = !previous;
      if (input.dataset.leg !== leg) {
        input.dataset.leg = leg;
        input.value = savedLegs.get(leg) ?? '';
      }
      hint.textContent = previous ? previous.querySelector('strong').textContent + '에서 이 장소까지' : '';
    });
  }

  function addStopRow(stop) {
    const item = element('li');
    item.dataset.index = String(stop.index);
    const custom = typeof stop.index === 'string';
    const original = course.body[stop.index];
    const alternative = rainAlternative(course, stop.index);
    const title = element('strong', itineraryStopName(course, stop) || '새 장소');
    const name = custom ? labeledInput('장소 이름', 'text', stop.place) : null;
    item.dataset.indoor = String(stop.indoor);
    const time = labeledInput('방문 시간', 'time', stop.time);
    const duration = labeledInput('예상 체류 시간 (분)', 'number', stop.duration ?? '');
    duration.input.min = '1';
    duration.input.max = String(maxDuration);
    duration.input.step = '1';
    duration.input.inputMode = 'numeric';
    duration.input.placeholder = '예: 60';
    const travel = labeledInput('이동시간 (분)', 'number', '');
    travel.input.setAttribute('data-travel-time', '');
    travel.input.min = '0';
    travel.input.max = String(maxDuration);
    travel.input.step = '1';
    travel.input.inputMode = 'numeric';
    travel.input.placeholder = '예: 25';
    const hint = element('span');
    hint.className = 'travel-field-hint';
    travel.field.append(hint);
    travel.input.addEventListener('input', () => savedLegs.set(travel.input.dataset.leg, travel.input.value));
    const note = labeledInput('메모', 'text', stop.note);
    note.input.maxLength = 240;
    const controls = element('div');
    controls.className = 'itinerary-order';
    fields.set(item, { time: time.input, duration: duration.input, note: note.input, travel: { ...travel, hint }, place: name?.input });
    item.append(title);
    if (name) item.append(name.field);
    item.append(time.field, duration.field, note.field, travel.field, controls);
    const up = moveButton('위로', -1, item, list, updateButtons);
    const down = moveButton('아래로', 1, item, list, updateButtons);
    controls.append(up, down);

    function setTitle(text) {
      title.textContent = text;
      up.setAttribute('aria-label', text + ' 위로');
      down.setAttribute('aria-label', text + ' 아래로');
    }

    if (name) {
      name.input.required = true;
      name.input.maxLength = maxPlaceLength;
      name.input.placeholder = '예: 시장 근처 카페';
      const remove = element('button', '추가한 장소 빼기');
      remove.type = 'button';
      remove.setAttribute('aria-label', title.textContent + ' 빼기');
      name.input.addEventListener('input', () => {
        const place = name.input.value.trim();
        name.input.setCustomValidity(place || !name.input.value ? '' : '장소 이름을 입력해 주세요.');
        setTitle(place || '새 장소');
        remove.setAttribute('aria-label', title.textContent + ' 빼기');
        updateButtons();
      });
      remove.addEventListener('click', () => {
        fields.delete(item);
        item.remove();
        updateButtons();
        add.focus();
      });
      item.append(remove);
    }
    if (alternative) {
      const replacement = element('button');
      replacement.type = 'button';
      replacement.className = 'itinerary-rain';
      const hint = element('small', '비 오는 날 대체 장소 · ' + alternative);

      function showReplacement(indoor) {
        item.dataset.indoor = String(indoor);
        setTitle(indoor ? alternative : original);
        replacement.textContent = indoor ? '원래 장소로 되돌리기' : '실내로 바꾸기';
        replacement.setAttribute('aria-label', original + ' ' + replacement.textContent);
      }
      replacement.addEventListener('click', () => {
        showReplacement(item.dataset.indoor !== 'true');
        updateButtons();
      });
      showReplacement(stop.indoor);
      item.append(hint, replacement);
    }
    list.append(item);
    return name?.input;
  }

  schedule.stops.forEach(addStopRow);
  updateButtons();
  add.addEventListener('click', () => {
    const name = addStopRow({ index: 'custom-' + crypto.randomUUID(), place: '', time: '', duration: null, note: '', indoor: false });
    updateButtons();
    name.focus();
  });

  const submit = element('button', '일정 저장');
  submit.type = 'submit';
  const actions = element('div');
  actions.className = 'itinerary-edit-actions';
  actions.append(add, submit);
  form.append(titleField.field, titleHelp, date.field, list, actions, status);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const stops = Array.from(list.children, item => {
      const { time, duration, note, travel } = fields.get(item);
      const { input } = travel;
      const minutes = input.valueAsNumber;
      return {
        ...stopIdentity(item),
        time: time.value,
        duration: validDuration(duration.valueAsNumber) ? duration.valueAsNumber : null,
        note: note.value.trim(),
        travel: !input.disabled && validTravelMinutes(minutes) ? { leg: input.dataset.leg, minutes } : null
      };
    });
    try {
      localStorage.setItem(itineraryKey(course.id), JSON.stringify({ title: titleField.input.value.trim(), date: date.input.value, stops }));
      onSave();
      status.textContent = '이 브라우저에 일정을 저장했어요.';
      details.dispatchEvent(new Event('itinerarysaved'));
    } catch {
      status.textContent = '일정을 저장할 수 없어요. 브라우저 저장 설정을 확인해 주세요.';
    }
  });
  details.append(summary, form);
  return details;
}
