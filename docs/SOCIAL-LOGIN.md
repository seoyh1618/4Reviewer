# 소셜 로그인 운영

Google, 카카오, 네이버의 기본 OAuth 로그인을 기존 서버에서 직접 처리한다. 별도 유료 인증 서비스, SMS 인증, 결제 계정, 카드 등록, 유료 API는 추가하지 않는다. 제공자별 무료 정책·쿼터는 변경될 수 있으므로 신규 부가 기능을 켜기 전에 공식 정책을 확인한다.

## 제공자 등록

대표 주소는 철자를 포함해 **https://forreviwer.com**이다. www와 IP 주소를 Callback URL로 사용하지 않는다.

| 제공자 | 서버 환경변수 | 정확한 Callback URL |
|---|---|---|
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `https://forreviwer.com/api/auth/social/google/callback` |
| 카카오 | `KAKAO_CLIENT_ID` (REST API 키), `KAKAO_CLIENT_SECRET` | `https://forreviwer.com/api/auth/social/kakao/callback` |
| 네이버 | `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | `https://forreviwer.com/api/auth/social/naver/callback` |

1. Google Auth Platform에서 전용 프로젝트, 외부 사용자용 앱, 웹 OAuth 클라이언트를 등록한다. 요청 범위는 `openid` 하나이며 Gmail·Drive·연락처 접근은 요청하지 않는다. 청구 계정을 연결하거나 Identity Platform을 활성화하지 않는다. 앱 공개와 브랜드 검증 여부는 콘솔의 실제 요구사항을 확인한다.
2. 카카오 Developers에서 앱을 등록하고 카카오 로그인을 켠다. REST API 키에 위 URI를 추가하고 클라이언트 시크릿을 활성화한다. 회원 고유번호만 사용하므로 이메일·전화번호 등의 추가 동의항목은 요구하지 않는다. 지도·메시지 등 유료 부가 기능을 활성화하지 않는다.
3. 네이버 Developers에서 네이버 로그인용 웹 앱을 등록한다. 서비스 URL은 대표 주소, Callback URL은 위 주소다. 고유 식별값만 필요하며 선택 개인정보가 없어도 가입된다. 공개 이용에 필요한 검수를 완료해야 일반 사용자가 접근할 수 있다. 검수 전에는 등록한 테스트 계정으로만 확인한다.
4. 비밀값은 `/opt/4reviewer/.env`에만 저장하고 파일 권한을 제한한다. Git·브라우저 코드·CI 로그·스크린샷에 노출하지 않는다. `deployment/compose.yml`의 제공자 환경변수 전달 설정을 운영 Compose에도 반영한다. **앱만 재생성**하고 같은 서버의 게임 프로젝트는 변경하지 않는다.
5. `/api/auth/social/providers`에 설정된 제공자만 노출된다. 키가 없는 제공자는 로그인 화면에 표시하지 않는다. 이 응답은 실제 제공자 로그인의 성공이나 공개 검수 완료를 의미하지 않는다.

## 가입·연결·해제

- 처음 소셜 로그인하면 아이디와 가입 코드(`SIGNUP_CODE`)를 입력한다. 비밀번호는 강제하지 않는다.
- 이미 연결된 소셜 계정이면 원래 사용자 ID로 로그인한다. 상품·리뷰·정산 데이터가 새 계정으로 복사되거나 이동하지 않는다.
- 기존 계정은 먼저 로그인한 뒤 **내 계정 → 소셜 계정 연결**에서 연결한다. 비밀번호가 있는 계정은 현재 비밀번호를 확인한다. 이메일이 같아도 자동 병합하지 않는다.
- 소셜 전용 계정은 최근 10분 내 인증이 필요하다. 시간이 지났으면 연결된 제공자의 **본인 확인**을 거친다. 같은 화면에서 8~128자의 로컬 비밀번호를 설정하면 아이디 로그인과 기존 질문+복구코드 설정도 이용할 수 있다.
- 마지막 로그인 수단은 해제할 수 없다. 연결 해제는 포리뷰어의 로그인 연결을 제거하며 외부 서비스 계정을 탈퇴시키지 않는다. 제공자 자체의 앱 동의 철회는 해당 제공자의 계정 설정에서 관리한다.

## DB와 보안

DB 버전 6:

- `social_identities`: 사용자 ID, 제공자, 제공자 고유 식별값, 연결일, 최근 로그인일. `(provider,subject)`와 `(user_id,provider)`는 각각 유일하다.
- `social_auth_events`: 가입, 로그인, 연결, 해제, 재인증, 비밀번호 최초 설정 이력. 앱은 추가·조회, DBeaver는 조회만 가능하다.
- `oauth_flows`: 10분 유효한 인증/가입 진행 상태. 상태 토큰과 브라우저 쿠키의 해시, PKCE verifier, nonce를 저장한다. 만료 상태는 다음 인증 시작 시 정리한다. DBeaver 역할에는 접근 권한을 주지 않는다.
- `sessions`: 인증 시각과 인증 방식을 추가한다. 기존 세션·사용자·리뷰를 보존하는 추가형 마이그레이션이다.

인증 요청은 브라우저 쿠키, 일회용 state, 제공자, 연결을 시작한 사용자·세션에 묶인다. Google ID 토큰은 서명·issuer·audience·만료·nonce를 확인한다. Google/카카오는 PKCE를 함께 요청한다. 토큰 교환은 서버에서만 수행하며 외부 access/refresh token을 DB에 보관하지 않는다. Callback 이후에는 토큰 없는 고정 내부 경로로 이동한다. HTTPS에서는 인증 진행 쿠키에 `__Host-`, Secure, HttpOnly, SameSite=Lax를 적용한다.

```sql
SELECT u.id, u.username, s.provider, s.created_at, s.last_login_at
FROM reviewer.users u
JOIN reviewer.social_identities s ON s.user_id = u.id;

SELECT user_id, provider, event_kind, created_at
FROM reviewer.social_auth_events
ORDER BY created_at DESC;
```

## 검증과 공개

단위 테스트는 실제 키 없이 서명된 테스트 ID 토큰을 검증하고, 격리된 SQLite/PostgreSQL에서 가입·연결·해제·중복·재전송·세션 변경·만료·기존 리뷰 보존을 확인한다. 브라우저 테스트는 제공자 목록을 모의 응답으로 주입해 Chrome/WebKit의 모바일 레이아웃과 가입 폼을 검증한다. **이 테스트만으로 실제 Google·카카오·네이버 로그인 성공을 주장하지 않는다.**

키 등록 후 소유자의 실제 계정으로 각 제공자의 승인 → Callback → 신규 가입/로그인 → 기존 계정 연결을 확인한다. 다른 계정의 데이터가 보이지 않는지, 로그아웃 후 동일 계정으로 돌아오는지, DB 연결·이력이 같은 사용자 ID에 기록되는지 확인한 뒤 공개한다. 네이버 검수와 Google 공개 상태는 별도로 기록한다.

공식 문서: [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect), [카카오 로그인](https://developers.kakao.com/docs/ko/kakaologin/rest-api), [카카오 무료 쿼터](https://developers.kakao.com/docs/ko/getting-started/quota), [네이버 로그인](https://developers.naver.com/docs/login/api/api.md).

Google 버튼 이미지는 [공식 배포 아이콘](https://developers.google.com/identity/branding-guidelines)의 Android/Web Light Square 아이콘 전용 PNG를 원형 그대로 사용한다. 다른 제공자와 동일한 44px 클릭 영역 및 접근 가능한 로그인 이름을 제공한다.
