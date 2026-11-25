export const maxDuration = 1440;

export function validDuration(value) {
  return Number.isInteger(value) && value > 0 && value <= maxDuration;
}

export function validTravelMinutes(value) {
  return Number.isInteger(value) && value >= 0 && value <= maxDuration;
}

export function travelLegKey(previous, stop) {
  const locationKey = item => item.index + ':' + Number(Boolean(item.indoor)) +
    (item.place ? ':' + JSON.stringify(item.place) : '');
  return locationKey(previous) + '>' + locationKey(stop);
}

export function hasTravelTime(previous, stop) {
  return stop.travel?.leg === travelLegKey(previous, stop) && validTravelMinutes(stop.travel.minutes);
}

function toMinutes(time) {
  if (!time) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function clock(minutes) {
  const hours = String(Math.floor(minutes / 60) % 24).padStart(2, '0');
  const remainder = String(minutes % 60).padStart(2, '0');
  return (minutes >= 1440 ? '다음 날 ' : '') + hours + ':' + remainder;
}

export function timingDetails(stops) {
  const earlier = [];
  let previous = null;

  return stops.map(stop => {
    const start = toMinutes(stop.time);
    const end = start !== null && validDuration(stop.duration) ? start + stop.duration : null;
    let message = '';
    let warning = false;
    let issue = '';

    if (start !== null) {
      const overlap = earlier.reduce((longest, interval) => {
        if (end === null) return longest;
        const shared = Math.min(end, interval.end) - Math.max(start, interval.start);
        return Math.max(longest, shared);
      }, 0);
      if (overlap > 0) {
        message = '일정 겹침 · ' + overlap + '분';
        issue = 'overlap';
        warning = true;
      } else if (previous && previous.start !== null && start < previous.start) {
        message = '방문 시간이 앞 장소보다 이릅니다. 순서를 확인해 주세요.';
        issue = 'order';
        warning = true;
      } else if (previous && previous.end !== null) {
        const latestEnd = Math.max(...earlier.map(interval => interval.end));
        const gap = start - latestEnd;
        if (hasTravelTime(previous.stop, stop)) {
          const balance = gap - stop.travel.minutes;
          warning = balance < 0;
          if (warning) issue = 'travel';
          message = warning
            ? '이동시간 포함 · ' + Math.abs(balance) + '분 부족'
            : '이동 후 여유 · ' + balance + '분';
        } else if (gap >= 0) {
          message = gap ? '앞 일정 후 여유 · ' + gap + '분' : '앞 일정과 여유 시간 없음';
        }
      }
    }

    previous = { start, end, stop };
    if (end !== null) earlier.push(previous);
    return { endsAt: end === null ? '' : clock(end), message, warning, issue };
  });
}
