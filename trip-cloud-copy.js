import { findTrip } from './trip-records.js';
import { restoreTripBackup } from './trip-backup.js';
// Restore as a new local trip so no browser itinerary is silently overwritten.
export function copyCloudTrip(record) {
  const course = findTrip(record?.local_id);
  if (!course || !record.snapshot || record.snapshot.id !== record.local_id) throw Error('지원되지 않는 일정입니다.');
  const id = 'trip:' + crypto.randomUUID() + ':' + course.templateId;
  const result = restoreTripBackup({ format: 'harupick-trip-backup', version: 1, trips: [{ ...record.snapshot, id }] });
  if (result.restored !== 1) throw Error('일정을 복사할 수 없습니다.');
  return id;
}

