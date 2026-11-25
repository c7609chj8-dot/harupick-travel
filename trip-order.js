export const tripGroups = [
  ['editing', '편집 중인 일정'],
  ['today', '오늘 일정'],
  ['upcoming', '다가오는 여행'],
  ['undated', '날짜 미정'],
  ['past', '지난 여행']
];

export function firstScheduledTime(schedule) {
  return schedule.stops.map(stop => stop.time).filter(Boolean).sort()[0] ?? '';
}

export function compareTripTime(first, second) {
  return (first.firstTime || '24:00').localeCompare(second.firstTime || '24:00') ||
    first.course.title.localeCompare(second.course.title, 'ko');
}

export function organizeTrips(entries, today, editingId) {
  const groups = new Map(tripGroups.map(([key]) => [key, []]));
  for (const entry of entries) {
    const { course, schedule } = entry;
    let key = 'undated';
    if (course.id === editingId) key = 'editing';
    else if (schedule.date === today) key = 'today';
    else if (schedule.date) key = schedule.date > today ? 'upcoming' : 'past';
    groups.get(key).push({ ...entry, firstTime: firstScheduledTime(schedule) });
  }
  for (const [key, group] of groups) {
    group.sort((first, second) => {
      const dateOrder = first.schedule.date.localeCompare(second.schedule.date);
      return (key === 'past' ? -dateOrder : dateOrder) || compareTripTime(first, second);
    });
  }
  return groups;
}
