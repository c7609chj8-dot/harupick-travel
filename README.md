# 하루픽 여행

국내 여행 코스를 찾아 브라우저에서 편집하고, 로그인한 계정에 일정을 저장하는 정적 웹사이트입니다.

- 운영 사이트: https://harupick-travel.vercel.app
- 관리자 화면: https://harupick-travel.vercel.app/admin.html
- 데이터·인증: 기존 ai-education-hub-dev Supabase 프로젝트의 하루픽 전용 테이블과 함수
- 배포: GitHub main과 연결된 Vercel 정적 배포. 별도 빌드 단계가 없습니다.

## 일정 저장 방식

브라우저 저장은 로그인 없이 사용할 수 있습니다. ‘계정에 저장’ 버튼을 누른 일정만 서버에 저장됩니다. 다른 기기에서는 서버 목록의 ‘브라우저로 복사’로 편집할 수 있습니다. 복사본은 기존 일정과 별개이며 로그아웃 후에도 기기에 남습니다.

## 관리자

서버가 현재 관리자 권한과 활성 인증 세션을 확인합니다. 관리자 화면에서 회원 조회, 일정 제목·날짜 수정, 보관·복원, 감사 이력 조회를 지원합니다. 관리자 권한 부여·회수는 인증된 운영 도구에서만 수행합니다.

## 운영매뉴얼

- [운영 범위·담당 역할·일상 점검 기준과 5일 작성 일정](docs/operations-manual.md)
- [일상 점검·인계·담당 배정 템플릿](docs/operations-checklist.md)

## 회원관리 테이블 개선

- [1일 차 표시 기준·화면 구성과 5일 일정](docs/admin-members-day1.md)
- [2일 차 상태·가입 기간 필터와 정렬 API](docs/admin-members-day2.md)
- [3일 차 필터·정렬 화면과 적용 조건 요약](docs/admin-members-day3.md)
- [4일 차 상세 정보·목록 복귀·키보드 조작](docs/admin-members-day4.md)
- [5일 차 회원관리 통합 검증과 운영 점검](docs/admin-members-day5.md)

## 대시보드 개발

- [1일 차 지표 정의와 화면 구성](docs/admin-dashboard-day1.md)
- [2일 차 통계 조회 API와 검증 결과](docs/admin-dashboard-day2.md)
- [3일 차 통계 카드·목록 연결](docs/admin-dashboard-day3.md)
- [4일 차 기간 선택·추이 차트](docs/admin-dashboard-day4.md)
- [5일 차 통합 검증과 운영 점검](docs/admin-dashboard-day5.md)
- 실제 카드·목록·기준 시각·새로고침과 최근 7일·30일 추이, 날짜별 수치 표를 연결했습니다.

## 검증

Node.js로 다음 명령을 실행합니다.

```powershell
node scripts/check-site.mjs
node --test tests/*.test.mjs
node scripts/smoke-production.mjs
```

- [회원관리 최신 통합 검증](docs/admin-members-day5.md)
- [대시보드 통합 검증](docs/admin-dashboard-day5.md)
- [기존 관리자 검증 결과와 남은 사항](docs/admin-release-verification.md)
- [DB 보안 검증 방법](database/tests/README.md)
- [스키마 참고](database/harupick-schema.sql): 새 데이터베이스용 참고이며 기존 연결 DB에 재실행하지 않습니다.

auth-config.js에는 브라우저용 공개 publishable key만 사용합니다. service-role·secret key를 프런트엔드에 추가하지 않습니다.
