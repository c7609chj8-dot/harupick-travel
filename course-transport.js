const locations = {
  '부산 바다 당일치기': ['해운대 해수욕장', '해운대시장', '광안리 해수욕장'],
  '부산 비 오는 날 코스': ['SEA LIFE 부산아쿠아리움', '해운대시장', '신세계백화점 센텀시티'],
  '부산 차 없는 반나절': ['자갈치역', '자갈치시장', 'BIFF광장'],
  '부산 걷는 구간을 줄인 코스': ['국립해양박물관', '동삼동 식당가', '아미르공원'],
  '부산 원도심 실내 반나절': ['부산영화체험박물관', '부산근현대역사관 본관'],
  '부산 센텀시티 지하철 휴식 코스': ['센텀시티역', '신세계백화점 센텀시티점', '스파랜드 센텀시티'],
  '경주 역사 산책': ['대릉원', '황리단길', ['첨성대', '동궁과 월지']],
  '제주 동쪽 바다 코스': ['함덕해수욕장', '조천리', '월정리 해수욕장'],
  '강릉 바다와 커피': ['경포호', '강릉중앙시장', '안목해변']
};

export function courseStopPlaces(course, index) {
  const place = locations[course.templateId ?? course.id]?.[index] ?? course.body[index];
  return [place].flat();
}

export function routeLink(city, start, end, mode) {
  const query = new URLSearchParams({
    api: '1',
    destination: city + ' ' + end
  });
  if (start) query.set('origin', city + ' ' + start);
  if (mode) query.set('travelmode', mode);
  return 'https://www.google.com/maps/dir/?' + query;
}

function externalLink(text, href) {
  const link = document.createElement('a');
  link.textContent = text;
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

export function courseTransport(course, visitOrder = () => course.body.map((_, index) => index)) {
  const places = locations[course.templateId ?? course.id];
  if (!places) return null;

  const panel = document.createElement('details');
  panel.className = 'course-transport';
  const heading = document.createElement('summary');
  heading.textContent = '이동수단별 코스 보기';
  const label = document.createElement('label');
  label.textContent = '이동수단';
  const select = document.createElement('select');
  for (const [value, name] of [['driving', '자차'], ['transit', '대중교통']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = name;
    select.append(option);
  }
  label.append(select);
  const list = document.createElement('ol');
  const note = document.createElement('p');
  note.textContent = '길찾기는 Google 지도에서, 주변 주차장·역·정류장은 네이버 지도에서 확인할 수 있어요.';
  panel.append(heading, label, list, note);

  function render() {
    const stops = visitOrder().flatMap(index => typeof index === 'number' ? places[index] : index).filter(Boolean);
    const nearby = select.value === 'driving' ? '주변 주차장' : '주변 역·정류장';
    const searchTerm = select.value === 'driving' ? '주차장' : '버스정류장 지하철역';
    list.replaceChildren();
    stops.forEach((stop, index) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = stop;
      const search = 'https://map.naver.com/p/search/' + encodeURIComponent(course.city + ' ' + stop + ' ' + searchTerm);
      item.append(title, externalLink(stop + ' ' + nearby, search));
      if (index > 0) {
        const previous = stops[index - 1];
        const link = externalLink('이전 장소에서 길찾기', routeLink(course.city, previous, stop, select.value));
        link.setAttribute('aria-label', previous + '에서 ' + stop + '까지 길찾기');
        item.append(link);
      }
      list.append(item);
    });
  }

  select.addEventListener('change', render);
  panel.addEventListener('toggle', () => { if (panel.open) render(); });
  render();
  return { panel, render };
}
