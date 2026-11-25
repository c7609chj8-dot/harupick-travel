export const budgetKey = courseId => 'harupick-budget:' + courseId;
const currency = new Intl.NumberFormat('ko-KR');

export const costKeys = ['transport', 'stay', 'food', 'entry'];

export function formatWon(value) {
  return currency.format(value) + '원';
}

export function budgetTotals(budget) {
  const total = costKeys.reduce((sum, key) => sum + budget.costs[key], 0);
  return { total, perPerson: Math.round(total / budget.travelers) };
}

export function budgetDescription(budget) {
  const { total, perPerson } = budgetTotals(budget);
  return budget.travelers + '명 기준 · 총 ' + formatWon(total) + ' · 1인당 ' + formatWon(perPerson);
}

export function normalizeBudget(budget) {
  if (!Number.isInteger(budget?.travelers) || budget.travelers < 1 || budget.travelers > 999) return null;
  const costs = Object.fromEntries(costKeys.map(key => [key, budget.costs?.[key]]));
  if (!Object.values(costs).every(cost => Number.isSafeInteger(cost) && cost >= 0 && cost <= 9999999999)) return null;
  return { travelers: budget.travelers, costs };
}

export function readTripBudget(courseId) {
  try {
    return normalizeBudget(JSON.parse(localStorage.getItem(budgetKey(courseId))));
  } catch {
    return null;
  }
}

export function saveTripBudget(courseId, budget) {
  localStorage.setItem(budgetKey(courseId), JSON.stringify(budget));
}
