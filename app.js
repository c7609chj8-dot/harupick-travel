import { rainAlternative } from './rain-alternatives.js';
import { stayComparison } from './stay-comparison.js';
import { courseTransport } from './course-transport.js';
import { data } from './travel-data.js';
import { savedCourseIds } from './demo-storage.js';

const cities = [...new Set(data.map(item => item.city))];
const featuredCourseIds = new Set(cities.map(city => data.find(item => item.city === city && item.type === 4)?.id));
const types = ['전체', '여행지', '교통편', '숙소', '추천 코스'];
const cityImages = { '부산':'busan', '경주':'gyeongju', '제주':'jeju', '강릉':'gangneung' };
const $ = id => document.getElementById(id);
const region = $('region');
const keyword = $('keyword');
const initialView = new URLSearchParams(window.location.search).get('view');
const initialType = new Map([['all', 0], ['places', 1], ['transport', 2], ['stays', 3], ['courses', 4]]).get(initialView) ?? 4;
let visibleCount = 4;
let selection = { city:'', query:'', type:initialType };
const activeConditions = new Set();
const courseConditions = [
  { label:'반나절', matches:profile => profile.duration === '반나절' },
  { label:'차 없이', matches:profile => profile.carFree === true },
  { label:'걷기 적게', matches:profile => profile.walking === '적음' },
  { label:'실내 위주', matches:profile => profile.indoor === true }
];

function addButton(parent, label, className, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', handler);
  parent.append(button);
  return button;
}

const cityButtons = cities.map(city => addButton($('cities'),city,'chip',() => {
  region.value = selection.city === city ? '' : city;
  applySearch();
}));
const typeButtons = types.map((type,index) => addButton($('filters'),type,'filter',() => {
  selection.type = index;
  render();
}));

const conditionButtons = courseConditions.map(condition =>
  addButton($('course-condition-buttons'), condition.label, 'chip', () => {
    if (activeConditions.has(condition)) activeConditions.delete(condition);
    else activeConditions.add(condition);
    render();
  })
);
$('clear-course-conditions').addEventListener('click', () => {
  activeConditions.clear();
  render();
  conditionButtons[0].focus();
});

function applySearch() {
  selection.city = region.value;
  selection.query = keyword.value.trim().toLocaleLowerCase('ko');
  render();
}
$('search-form').addEventListener('submit', event => {
  event.preventDefault();
  selection.type = 0;
  activeConditions.clear();
  applySearch();
  $('results').scrollIntoView({block:'start'});
});
document.querySelectorAll('[data-city]').forEach(button => {
  button.addEventListener('click', () => {
    selection.type = 4;
    region.value = button.dataset.city;
    keyword.value = '';
    activeConditions.clear();
    applySearch();
    $('results').scrollIntoView({block:'start'});
  });
});
region.addEventListener('change', applySearch);
$('course-nav').addEventListener('click', () => {
  selection = {city:'',query:'',type:4};
  activeConditions.clear();
  region.value = '';
  keyword.value = '';
  render();
});

function element(tag, content, className) {
  const node = document.createElement(tag);
  node.textContent = content;
  if(className) node.className = className;
  return node;
}

function card({id,city,type,title,body,profile,url,link}) {
  const wrapper = element('article','','card');
  const visual = element('div','','card-image');
  const image = document.createElement('img');
  image.src = './assets/' + cityImages[city] + '.jpg';
  image.alt = city + ' 여행 풍경';
  image.width = 640;
  image.height = 400;
  image.loading = 'lazy';
  visual.append(image, element('span', types[type], 'card-badge'));
  const article = element('div','','card-body');
  wrapper.append(visual, article);
  article.append(element('p',city+' · '+types[type],'meta'),element('h3',title));
  if (profile) {
    const summary = element('p', '', 'course-profile');
    const labels = [profile.duration, profile.mode, '걷기 ' + profile.walking];
    summary.append(...labels.map(label => element('span', label)));
    article.append(summary);
  }
  if(Array.isArray(body)) {
    const list = element('ol','','course');
    list.append(...body.map(step => element('li',step)));
    article.append(list);
  } else {
    article.append(element('p',body,'desc'));
  }
  const anchor = element('a',link);
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.setAttribute('aria-label',title+' '+link+' (새 탭)');
  if (type === 4) {
    const actions = element('div','','card-actions');
    const saved = savedCourseIds().includes(id);
    const plan = element('a', saved ? '내 일정 이어서 편집' : '이 코스로 내 일정 만들기', 'course-plan');
    plan.href = './my-trip.html?' + new URLSearchParams({ course: id });
    plan.setAttribute('aria-label', title + ' ' + plan.textContent);
    actions.append(plan, anchor);
    if (body.some((_, index) => rainAlternative({id}, index))) {
      article.append(element('p','일정 편집에서 야외 장소를 실내로 바꿀 수 있어요.','desc'));
    }
    const transport = courseTransport({id, city, body});
    article.append(actions);
    if (transport) article.append(transport.panel);
  } else {
    article.append(anchor);
    if (type === 3) {
      const comparison = stayComparison(city);
      if (comparison) article.append(comparison);
    }
  }
  return wrapper;
}

function render(reset = true) {
  if (reset) visibleCount = 4;
  cityButtons.forEach((button,index) => button.setAttribute('aria-pressed',cities[index] === selection.city));
  typeButtons.forEach((button,index) => button.setAttribute('aria-pressed',index === selection.type));
  const showingCourses = selection.type === 4;
  $('course-conditions').hidden = !showingCourses;
  $('clear-course-conditions').hidden = !activeConditions.size;
  courseConditions.forEach((condition, index) => {
    conditionButtons[index].setAttribute('aria-pressed', String(activeConditions.has(condition)));
  });
  const requirements = showingCourses ? [...activeConditions] : [];
  const words = selection.query.split(/\s+/).filter(Boolean);
  const results = data.filter(item => {
    const haystack = [item.city,types[item.type],item.title,item.body].flat().join(' ').toLocaleLowerCase('ko');
    return (!selection.city || item.city === selection.city) &&
      (!selection.type || item.type === selection.type) &&
      words.every(word => haystack.includes(word)) &&
      requirements.every(condition => item.profile && condition.matches(item.profile));
  });
  if (showingCourses) results.sort((a, b) => Number(featuredCourseIds.has(b.id)) - Number(featuredCourseIds.has(a.id)));
  $('load-more').hidden = results.length <= visibleCount;
  $('load-more').textContent = '여행 정보 더 보기 (' + Math.min(visibleCount, results.length) + ' / ' + results.length + ')';
  $('summary').textContent = (selection.city || '전체 지역')+' · '+results.length+'건';
  $('cards').replaceChildren(...(results.length ? results.slice(0, visibleCount).map(card) :
    [element('p', requirements.length
      ? '조건을 모두 만족하는 코스가 없어요. 일부 조건을 해제하거나 지역을 바꿔보세요.'
      : '검색 결과가 없어요. 지역을 전체로 바꾸거나 검색어를 줄여보세요.', 'empty')]));
}
$('load-more').addEventListener('click', () => {
  const firstNewIndex = visibleCount;
  visibleCount += 4;
  render(false);
  const firstNewCard = $('cards').children[firstNewIndex];
  if (firstNewCard) {
    firstNewCard.tabIndex = -1;
    firstNewCard.focus({ preventScroll: true });
    firstNewCard.scrollIntoView({ block: 'nearest' });
  }
});
document.querySelectorAll('[data-condition]').forEach(button => {
  button.addEventListener('click', () => {
    selection = { city: '', query: '', type: 4 };
    region.value = '';
    keyword.value = '';
    activeConditions.clear();
    const condition = courseConditions.find(item => item.label === button.dataset.condition);
    if (condition) activeConditions.add(condition);
    render();
    $('results').scrollIntoView({ block: 'start' });
  });
});
$('close-announcement').addEventListener('click', () => { $('announcement').hidden = true; });
const posterViewport = $('poster-viewport');
const posterPrev = $('poster-prev');
const posterNext = $('poster-next');
const updatePosterControls = () => {
  posterPrev.disabled = posterViewport.scrollLeft <= 2;
  posterNext.disabled = posterViewport.scrollLeft + posterViewport.clientWidth >= posterViewport.scrollWidth - 2;
};
const movePosters = direction => {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
  posterViewport.scrollBy({ left: direction * (posterViewport.querySelector('button').offsetWidth + 18), behavior: motion });
};
posterPrev.addEventListener('click', () => movePosters(-1));
posterNext.addEventListener('click', () => movePosters(1));
posterViewport.addEventListener('scroll', updatePosterControls, { passive: true });
new ResizeObserver(updatePosterControls).observe(posterViewport);
window.addEventListener('pageshow', event => { if (event.persisted) render(); });
render();
