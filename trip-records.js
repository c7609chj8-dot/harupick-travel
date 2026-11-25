import { data } from './travel-data.js';
import { savedCourseIds, setCourseSaved } from './demo-storage.js';
import { itineraryKey, readItinerary } from './itinerary.js';

const templates = new Map(data.filter(course => course.type === 4).map(course => [course.id, course]));
const copyPattern = /^trip:[a-f0-9-]{36}:/;

export function findTrip(id) {
  if (typeof id !== 'string') return undefined;
  const prefix = id.match(copyPattern)?.[0];
  const template = templates.get(prefix ? id.slice(prefix.length) : id);
  if (!template) return undefined;
  const course = { ...template, id, templateId: template.id, templateTitle: template.title };
  const title = readItinerary(course).title;
  return title ? { ...course, title } : course;
}

export function savedTrips() {
  return [...new Set(savedCourseIds())].map(findTrip).filter(Boolean);
}

export function duplicateTrip(course, date) {
  const parsed = new Date(date + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date) throw new TypeError('여행 날짜를 확인해 주세요.');

  const id = 'trip:' + crypto.randomUUID() + ':' + (course.templateId ?? course.id);
  const key = itineraryKey(id);
  localStorage.setItem(key, JSON.stringify({ ...readItinerary(course), date }));
  try {
    setCourseSaved(id, true);
  } catch (error) {
    localStorage.removeItem(key);
    throw error;
  }
  return id;
}
