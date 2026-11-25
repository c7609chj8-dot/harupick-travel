import { readItinerary } from './itinerary.js';
import { savedTrips } from './trip-records.js';
import { savedCourseIds } from './demo-storage.js';
import { budgetTotals, formatWon, readTripBudget, saveTripBudget } from './trip-budget.js';

const form = document.getElementById('budget-form');
const travelers = document.getElementById('travelers');
const costFields = [...form.querySelectorAll('[data-cost]')];
const totalOutput = document.getElementById('budget-total');
const perPersonOutput = document.getElementById('budget-per-person');
const feedback = document.getElementById('budget-feedback');
const courseSelect = document.getElementById('budget-course');
const saveButton = document.getElementById('budget-save');
const saveStatus = document.getElementById('budget-save-status');
const courses = savedTrips();

for (const course of courses) {
  const option = document.createElement('option');
  option.value = course.id;
  const date = readItinerary(course).date;
  option.textContent = course.title + ' · ' + (date || '날짜 미정');
  courseSelect.append(option);
}
if (!courses.length) {
  courseSelect.disabled = true;
  saveStatus.textContent = '추천 코스에서 일정을 먼저 저장하면 예산을 연결할 수 있어요.';
}

function calculate() {
  const fields = [travelers, ...costFields];
  for (const field of fields) {
    if (field.validity.valid) field.removeAttribute('aria-invalid');
    else field.setAttribute('aria-invalid', 'true');
  }

  const invalid = fields.find(field => !field.validity.valid);
  if (invalid) {
    totalOutput.textContent = '—';
    perPersonOutput.textContent = '—';
    feedback.textContent = invalid === travelers
      ? '여행 인원은 1~999명 사이의 정수로 입력하세요.'
      : '비용은 0원 이상 9,999,999,999원 이하의 정수로 입력하세요.';
    saveButton.disabled = true;
    return null;
  }

  const count = travelers.valueAsNumber;
  const budget = {
    travelers: count,
    costs: Object.fromEntries(costFields.map(field => [field.dataset.budgetKey, field.valueAsNumber || 0]))
  };
  const { total, perPerson } = budgetTotals(budget);
  totalOutput.textContent = formatWon(total);
  perPersonOutput.textContent = formatWon(perPerson);
  feedback.textContent = count + '명 기준 · 1인당 금액은 원 단위로 반올림합니다.';
  saveButton.disabled = !courseSelect.value;
  return budget;
}

function loadSelectedBudget() {
  const budget = readTripBudget(courseSelect.value);
  if (budget) {
    travelers.value = budget.travelers;
    for (const field of costFields) field.value = budget.costs[field.dataset.budgetKey];
  }
  saveStatus.textContent = budget ? '이 일정에 저장한 예산을 불러왔어요.' : '';
  calculate();
}

const requested = new URLSearchParams(location.search).get('course');
if (courses.some(course => course.id === requested)) {
  courseSelect.value = requested;
  loadSelectedBudget();
}
courseSelect.addEventListener('change', loadSelectedBudget);
form.addEventListener('input', event => {
  if (event.target !== courseSelect && courses.length) saveStatus.textContent = '';
  calculate();
});
form.addEventListener('submit', event => {
  event.preventDefault();
  const budget = calculate();
  const course = courses.find(item => item.id === courseSelect.value);
  if (!budget || !course) return;
  if (!savedCourseIds().includes(course.id)) {
    saveStatus.textContent = '이 일정이 내 여행 목록에 없어요. 일정을 다시 저장해 주세요.';
    return;
  }
  try {
    saveTripBudget(course.id, budget);
    saveStatus.textContent = course.title + ' 일정에 예산을 저장했어요.';
  } catch {
    saveStatus.textContent = '이 브라우저에 예산을 저장할 수 없어요.';
  }
});
form.addEventListener('reset', () => {
  const selected = courseSelect.value;
  requestAnimationFrame(() => {
    courseSelect.value = selected;
    if (courses.length) saveStatus.textContent = '입력값을 초기화했어요. 이전에 저장한 예산은 그대로 있습니다.';
    calculate();
  });
});
window.addEventListener('pageshow', calculate);
calculate();
