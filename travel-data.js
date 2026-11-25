const rail = 'https://www.korail.com/';
const airport = 'https://www.airport.co.kr/';
const map = query => 'https://map.naver.com/p/search/' + encodeURIComponent(query);
const guides = [
  {city:'부산', place:['해운대 해수욕장','바다를 따라 걷고 해운대시장도 둘러보기 좋은 곳이에요.'], transport:['KTX·부산 도시철도','부산역까지 KTX로 이동하고, 해운대 방면은 도시철도 노선을 확인하세요.',rail], stay:['해운대·광안리 숙소','해변 산책을 원하면 해운대, 광안대교 야경을 보고 싶다면 광안리 일대를 살펴보세요.','부산 해운대 광안리 호텔'], route:['부산 바다 당일치기',['오전 · 해운대 해수욕장 산책','점심 · 해운대시장','오후 · 광안리 해변과 카페'],'부산 광안리 해수욕장',{duration:'하루',mode:'지하철+도보',walking:'보통',carFree:true}], extra:[['부산 비 오는 날 코스',['오전 · 해운대 아쿠아리움','점심 · 해운대시장','오후 · 센텀시티 실내 쇼핑'],'부산 해운대 아쿠아리움',{duration:'하루',mode:'지하철+도보',walking:'보통',carFree:true,indoor:true}],
  ['부산 차 없는 반나절',['출발 · 자갈치역','시장 구경과 식사 · 자갈치시장','영화 거리 산책 · BIFF광장'],'부산 BIFF광장',{duration:'반나절',mode:'지하철+도보',walking:'보통',carFree:true}],
  ['부산 걷는 구간을 줄인 코스',['오전 실내 관람 · 국립해양박물관','점심과 휴식 · 동삼동 식당가','오후 짧은 바다 산책 · 아미르공원'],'부산 국립해양박물관',{duration:'하루',mode:'택시+짧은 도보',walking:'적음'}],
  ['부산 원도심 실내 반나절',
    ['첫 관람 · 부산영화체험박물관','다음 관람 · 부산근현대역사관 본관'],
    '부산영화체험박물관',{duration:'반나절',mode:'지하철+도보',walking:'보통',carFree:true,indoor:true}],
  ['부산 센텀시티 지하철 휴식 코스',
    ['출발 · 센텀시티역','식사 · 신세계 센텀시티 지하 식품관','휴식 · 스파랜드 센텀시티'],
    '스파랜드 센텀시티',{duration:'반나절',mode:'지하철+짧은 도보',walking:'적음',carFree:true,indoor:true}]]},
  {city:'경주', place:['대릉원','고분이 이어지는 산책길을 걷고 인근 황리단길을 둘러보세요.'], transport:['KTX·시내버스','경주역 도착 후 시내버스나 택시로 대릉원 일대에 이동하는 방법을 살펴보세요.',rail], stay:['황리단길·보문단지 숙소','도보 관광은 황리단길 주변, 리조트나 호수 산책은 보문단지 일대를 살펴보세요.','경주 황리단길 한옥 숙소'], route:['경주 역사 산책',['오전 · 대릉원','점심 · 황리단길','오후 · 첨성대와 동궁과 월지'],'경주 동궁과 월지',{duration:'하루',mode:'도보',walking:'많음',carFree:true}]},
  {city:'제주', place:['함덕해수욕장','바다 산책과 카페 휴식을 함께 즐길 수 있는 제주 동쪽 해변이에요.'], transport:['제주공항 항공편·렌터카','출발 공항에서 제주행 항공편을 확인하고 공항에서 버스나 렌터카로 이동하세요.',airport], stay:['제주시·함덕 숙소','공항 접근성이 중요하면 제주시, 해변 근처에서 쉬고 싶다면 함덕 일대를 살펴보세요.','제주 함덕 호텔'], route:['제주 동쪽 바다 코스',['오전 · 함덕해수욕장','점심 · 조천 일대','오후 · 월정리 해변'],'제주 월정리 해수욕장',{duration:'하루',mode:'렌터카',walking:'적음'}]},
  {city:'강릉', place:['안목해변','해변과 커피거리를 함께 둘러볼 수 있는 곳이에요.'], transport:['KTX·시내버스','강릉역까지 KTX로 이동하고, 해변이나 중앙시장 방면 버스 노선을 확인하세요.',rail], stay:['경포·강릉역 주변 숙소','바다와 호수 산책은 경포, 기차 이동과 시내 관광은 강릉역 주변이 편리해요.','강릉 경포 호텔'], route:['강릉 바다와 커피',['오전 · 경포호 산책','점심 · 강릉중앙시장','오후 · 안목 커피거리'],'강릉 안목해변',{duration:'하루',mode:'버스+도보',walking:'보통',carFree:true}]}
];
export const data = guides.flatMap(({city,place,transport,stay,route,extra=[]}) => [
  {city,type:1,title:place[0],body:place[1],url:map(city+' '+place[0]),link:'지도 보기'},
  {city,type:2,title:transport[0],body:transport[1],url:transport[2],link:'운행 정보 확인'},
  {city,type:3,title:stay[0],body:stay[1],url:map(stay[2]),link:'주변 숙소 찾아보기'},
  ...[route,...extra].map(([title,body,query,profile]) => ({id:title,city,type:4,title,body,profile,url:map(query),link:'코스 주요 장소 보기'}))
]);
