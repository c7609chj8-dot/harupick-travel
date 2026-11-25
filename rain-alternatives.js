const alternatives = new Map([
  ['부산 바다 당일치기', new Map([
    [0, 'SEA LIFE 부산아쿠아리움'],
    [2, '신세계백화점 센텀시티']
  ])]
]);

export function rainAlternative(course, index) {
  return alternatives.get(course.templateId ?? course.id)?.get(index);
}
