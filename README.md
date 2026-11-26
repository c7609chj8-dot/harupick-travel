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

## 대시보드 개발

- [1일 차 지표 정의와 화면 구성](docs/admin-dashboard-day1.md)
- [2일 차 통계 조회 API와 검증 결과](docs/admin-dashboard-day2.md)
- 서버 집계 API와 응답 검증 모듈을 준비했습니다. 화면 수치·목록 연결은 3일 차, 기간 선택·차트 연결은 4일 차입니다.

## 검증

Node.js로 다음 명령을 실행합니다.

```powershell
node scripts/check-site.mjs
node --test tests/*.test.mjs
node scripts/smoke-production.mjs
```

- [최종 검증 결과와 남은 사항](docs/admin-release-verification.md)
- [DB 보안 검증 방법](database/tests/README.md)
- [스키마 참고](database/harupick-schema.sql): 새 데이터베이스용 참고이며 기존 연결 DB에 재실행하지 않습니다.

auth-config.js에는 브라우저용 공개 publishable key만 사용합니다. service-role·secret key를 프런트엔드에 추가하지 않습니다.

