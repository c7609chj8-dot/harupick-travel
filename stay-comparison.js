import { routeLink } from './course-transport.js';

const areas = {
  부산: {
    stays: [
      ['해운대', '바다 산책', '해운대역'],
      ['광안리', '광안대교 야경', '광안리 해수욕장'],
      ['부산역 주변', '기차 이동', '부산역']
    ],
    destinations: ['해운대 해수욕장', 'SEA LIFE 부산아쿠아리움', '광안리 해수욕장', '해운대시장']
  },
  경주: {
    stays: [
      ['황리단길', '도보 관광', '황리단길'],
      ['보문단지', '호수 산책과 휴양', '보문호']
    ],
    destinations: ['대릉원', '황리단길', '첨성대', '동궁과 월지']
  },
  제주: {
    stays: [
      ['제주시', '공항을 오가는 일정', '제주국제공항'],
      ['함덕', '해변 산책', '함덕해수욕장']
    ],
    destinations: ['함덕해수욕장', '조천리', '월정리 해수욕장', '제주국제공항']
  },
  강릉: {
    stays: [
      ['경포', '바다와 호수 산책', '경포해변'],
      ['강릉역 주변', '기차 이동과 시내 관광', '강릉역']
    ],
    destinations: ['경포호', '강릉중앙시장', '안목해변', '강릉역']
  }
};

function element(tag, text = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function selectField(labelText, options) {
  const label = element('label', labelText);
  const select = element('select');
  for (const [value, name] of options) {
    const option = element('option', name);
    option.value = value;
    select.append(option);
  }
  label.append(select);
  return { label, select };
}

function mapLink(text, href) {
  const link = element('a', text);
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

export function stayComparison(city) {
  const area = areas[city];
  if (!area) return null;

  const panel = element('details');
  panel.className = 'course-transport stay-comparison';
  const destination = selectField('다음 날 첫 방문지', area.destinations.map(place => [place, place]));
  const mode = selectField('이동수단', [['driving','자차'], ['transit','대중교통']]);
  const list = element('ul');
  const routes = area.stays.map(([name, highlight, start]) => {
    const item = element('li');
    const search = 'https://map.naver.com/p/search/' + encodeURIComponent(city + ' ' + name + ' 숙소');
    const route = mapLink('', '#');
    item.append(element('strong', name), element('p', highlight), element('p', '길찾기 출발 기준 · ' + start),
      mapLink(name + ' 숙소 찾기', search), route);
    list.append(item);
    return { name, start, route };
  });

  function updateRoutes() {
    for (const {name, start, route} of routes) {
      route.textContent = '첫 방문지까지 길찾기';
      route.href = routeLink(city, start, destination.select.value, mode.select.value);
      route.setAttribute('aria-label', name + ' 권역에서 ' + destination.select.value + '까지 길찾기');
    }
  }
  destination.select.addEventListener('change', updateRoutes);
  mode.select.addEventListener('change', updateRoutes);
  updateRoutes();
  panel.append(element('summary', '숙소 위치 비교'), destination.label, mode.label, list,
    element('p','구체적인 숙소를 고르기 전 권역별 동선을 비교해 보세요. 길찾기는 표시된 기준 지점에서 출발합니다.'));
  return panel;
}
