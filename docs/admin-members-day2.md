# 회원관리 테이블 2일 차: 필터·정렬 API

작성일: 2026-11-26 (한국 시간)
상태: API 구현·운영 DB 적용·검증 완료

## 변경 범위

- 필터 전용 RPC public.harupick_admin_members_filtered와 비공개 집계 함수를 추가했습니다.
- 기존 harupick_admin_members의 이름·인수·동작은 유지합니다. 함수 오버로드를 만들지 않습니다.
- listMembers는 새 RPC를 사용하며 기본값으로 기존 회원 목록·검색·페이지 이동을 유지합니다.
- 상태·가입 기간·정렬 선택 UI는 3일 차 범위입니다. 이번 단계에서 화면에 필터 선택기를 추가하지 않았습니다.
- 회원 정보·인증 계정·비밀번호·공유 Auth 설정을 변경하지 않습니다.

## 요청 계약

클라이언트: listMembers({query,page,pageSize,status,from,until,sort})

| 인수 | 기본값 | 허용·해석 기준 |
| --- | --- | --- |
| query / p_query | 빈 문자열 | 양끝 공백 제거, 최대 100자, 닉네임·이메일의 대소문자 무시 부분 일치. %와 _도 일반 문자 |
| page / p_page | 1 | 정수 1~1,000,000. 마지막 페이지를 넘으면 마지막 페이지 반환 |
| pageSize / p_page_size | 20 | 정수 1~50 |
| status / p_status | all | all, active, unconfirmed, suspended, deleted |
| from / p_from | 없음 | YYYY-MM-DD, 한국 날짜 시작 시각 이상 |
| until / p_until | 없음 | YYYY-MM-DD, 한국 날짜 다음 날 00시 미만 |
| sort / p_sort | created_desc | created_desc: 가입일·ID 내림차순, created_asc: 가입일·ID 오름차순 |

- 가입일은 하루픽 프로필 created_at입니다. Auth 계정 생성일이나 최근 로그인일이 아닙니다.
- 시작일·종료일은 각각 생략할 수 있습니다. 클라이언트 빈 문자열·null은 SQL null로 전달합니다.
- 유효한 서기 0001~9999년 날짜만 허용합니다. 잘못된 달력 날짜, 시작일이 종료일보다 늦은 범위, infinity와 임의 정렬 문자열은 거부합니다.
- 예: from=2026-11-26, until=2026-11-26은 UTC 2026-11-25 15:00:00 이상, 2026-11-26 15:00:00 미만입니다.
- 상태 우선순위는 삭제 → 이용 제한 → 이메일 미인증 → 이용 가능이며 서버에서 계산합니다.

## 응답·안전성

- 응답 루트는 members, total, page, pages, page_size입니다.
- 목록 행은 id, nickname, email, created_at, email_confirmed, status 6개 필드만 반환합니다. 상세 전용 필드·인증 메타데이터를 추가하지 않습니다.
- 검색·날짜·상태 조건을 모두 서버에서 적용하고, 같은 SQL 읽기 스냅샷의 결과로 전체 건수·페이지 수·현재 행을 계산합니다.
- 서버와 클라이언트 모두 Asia/Seoul을 사용하며 과거 서머타임 날짜도 같은 기준으로 검증합니다.
- 같은 가입 시각은 ID로 정렬을 고정합니다. 클라이언트는 PostgreSQL의 마이크로초를 보존해 순서를 검증합니다.
- 클라이언트는 반환 건수·페이지·필드·UUID·상태·날짜 범위·정렬·중복 회원을 확인합니다. 잘못된 응답이나 오류를 빈 성공 목록으로 바꾸지 않습니다.
- 공개 함수는 SECURITY INVOKER, 비공개 함수는 고정된 빈 search_path와 기존 is_current_admin() 검사를 사용합니다. anon 실행 권한은 없으며 일반 authenticated 회원도 실제 관리자 권한이 없으면 거부됩니다.
- 기존 페이지 번호·전체 건수 계약을 유지합니다. 대규모·깊은 페이지 성능은 별도 측정 대상이며, 이 단계에서 부하 성능을 보장한다고 주장하지 않습니다.

## 적용 기록

- 운영 프로젝트: 기존 ai-education-hub-dev / 하루픽 전용 함수만 추가.
- 마이그레이션: supabase/migrations/20261126103412_harupick_member_filters.sql.
- 공식 CLI로 파일을 생성하고, 적용 후 운영 마이그레이션 기록의 실제 버전에 파일명을 맞췄습니다.
- database/harupick-schema.sql에도 참고 정의를 추가했습니다. 이 파일은 기존 공유 DB에 재실행하지 않습니다.
- 저장소의 supabase/migrations는 이번 변경의 기록이며 공유 프로젝트의 전체 마이그레이션 이력을 포함하지 않습니다. 로컬 파일만으로 공유 DB 전체를 재구축하거나 일괄 db push하지 않습니다.

## 검증 결과

- 전체 자동 테스트 77개 통과. 회원 API 테스트는 12개이며 신규 조합·날짜 경계·마이크로초 정렬·잘못된 상태·중복 ID·비정상 응답 검증을 포함합니다.
- 정적 검사: HTML 9개, JavaScript 40개, 로컬 참조 219개 통과.
- 실제 DB에서 마이그레이션 사전 롤백 검증과 적용 후 회귀 검증을 통과했습니다.
- DB 검증: 기존 API 기본값 호환, 문자 %/_ 검색, 한국 날짜 시작·끝 경계, ID 동률 정렬, 필터 후 건수·마지막 페이지 보정·0건, 최소 응답 필드·읽기 전용, 권한 회수·일반 회원·종료 세션·익명 차단.
- 상태 필터는 기존 Auth 계정들의 실제 상태별 예상 수와 비교합니다. 검증을 위해 Auth 계정을 제한·삭제·인증 처리하지 않았으며, 해당 상태가 없는 경우는 0건으로 확인합니다. 클라이언트 모의 테스트에서는 네 가지 상태 모두 확인합니다.
- SQL 검증의 하루픽 프로필·권한 변경은 모두 ROLLBACK했습니다. Auth 사용자·자격 증명·세션은 생성·변경하지 않았습니다.
- 모의 관리자 브라우저: 기존 목록 23명·20명/3명 페이지, 이메일 검색·상세 연결, 오류 시 목록 제거·초기화 복구, 로그아웃 제거 확인. 콘솔 오류 없음.
- 운영 점검 스크립트에 신규 RPC를 추가해 기존 API와 함께 익명 접근 차단을 확인하도록 했습니다.
- 보안 진단에서 이번 함수에 관한 새 경고는 없습니다. 공유 프로젝트의 기존 유출 비밀번호 보호 경고와 다른 서비스 비공개 테이블 정책 안내는 유지됩니다.

## 재검증

```powershell
node scripts/check-site.mjs
node --test tests/*.test.mjs
node scripts/smoke-production.mjs
```

실제 DB 회귀는 database/tests/harupick-members-filter-security.sql 전체를 실행합니다. 기존 관리자 활성 세션과 별도의 기존 Auth 계정이 필요하며, 파일 마지막의 ROLLBACK을 유지합니다.

## 다음 단계

3일 차에는 상태·시작일·종료일·정렬 UI를 연결하고, 적용 조건 요약·검색 결과 수·페이지 초기화를 함께 구현합니다.

## 참고

- [Supabase Database Functions](https://supabase.com/docs/guides/database/functions)
- [Supabase 행 수준 접근 제어](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [기존 공유 프로젝트의 비밀번호 보호 안내](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
