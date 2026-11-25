export const savedKey = 'harupick-demo-saved-courses';

export function savedCourseIds() {
  try {
    const saved = JSON.parse(localStorage.getItem(savedKey) ?? '[]');
    return Array.isArray(saved) ? saved.filter(id => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function setCourseSaved(id, saved) {
  const ids = new Set(savedCourseIds());
  if (saved) ids.add(id);
  else ids.delete(id);
  localStorage.setItem(savedKey, JSON.stringify([...ids]));
}
