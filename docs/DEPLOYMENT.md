# For Reviewer 운영

## 프로젝트 분리

- 저장소: https://github.com/seoyh1618/4Reviewer — main 브랜치
- 운영 디렉터리: `/opt/4reviewer`
- Compose 프로젝트: `for-reviewer`
- 웹 접속: https://forreviwer.com — https://www.forreviwer.com 은 대표 주소로 이동
- 앱: 외부 포트 없이 전용 네트워크의 `app:3001`
- PostgreSQL 17: 전용 컨테이너·볼륨·계정·DB·스키마. DBeaver 직접 접속용 `55432`는 허용한 관리 PC의 IPv4 주소에만 개방하고 TLS 인증서 검증을 필수로 사용
- 게임 앱·DB·Redis·미리보기·배포 Runner는 분리 유지. 80/443을 담당하는 기존 Caddy 진입점만 공유하며, 도메인별로 서로 다른 앱으로 전달한다. 게임 앱과 DB를 재배포하지 않는다.
- 같은 VM의 OS·물리 자원은 공유한다. 앱·DB·프록시에 메모리/CPU 한도를 설정했으며, VM 관리자 권한까지 분리되는 별도 서버 구성은 아니다.

## 도메인과 HTTPS

2026-10-28 가비아 DNS에 다음 레코드를 저장했다. 등록한 도메인의 정확한 철자는 `forreviwer.com`이다.

| 유형 | 호스트 | 값 | TTL |
|---|---|---|---|
| A | @ | 43.202.80.103 | 600 |
| A | www | 43.202.80.103 | 600 |

Caddy가 두 호스트의 Let's Encrypt 공인 인증서를 발급하고 자동 갱신한다. HTTP는 HTTPS로, www는 대표 주소 `https://forreviwer.com`으로 이동한다. `.env`의 `APP_ORIGIN`은 대표 주소와 정확히 같아야 하며, 변경 시 For Reviewer 앱만 재생성한다. 로그인은 Secure/HttpOnly 쿠키와 Origin 검사를 사용한다.

연결 경로: 공통 Caddy 443 → Docker 호스트의 사설 주소 `172.18.0.1:18081` → For Reviewer nginx 8080 → 전용 네트워크의 app 3001. `18081`은 사설 브리지 주소에만 바인딩하며 Lightsail 방화벽에 개방하지 않는다. 앱·DB 네트워크를 게임 네트워크와 합치지 않는다. 브리지 재생성 시 실제 게이트웨이를 확인하고 Compose와 Caddy upstream을 함께 변경한다.

- 이 저장소의 `deployment/for-reviewer.caddy`가 도메인 연결 설정의 원본이다.
- 운영 파일은 `yutnori-production_caddy-config` 볼륨의 `/config/for-reviewer/for-reviewer.caddy`에 설치한다. 호스트 위치는 `docker volume inspect`로 확인한다.
- 공통 Caddyfile `/opt/yutnori/docker/proxy/Caddyfile`은 `import /config/for-reviewer/*.caddy` 한 줄로 위 파일을 불러온다. 이 import는 [게임 저장소 커밋](https://github.com/seoyh1618/Yut-API-Master/commit/71f80904c4f220d203c1c12d46db2c9254d43ab8)에도 반영해 다음 게임 배포 시 유지된다. 해당 커밋은 `[skip ci]`로 게임 앱 재배포를 실행하지 않았다.
- 인증서·갱신 정보는 기존 `yutnori-production_caddy-data` 볼륨에 보존된다. 공통 진입점 볼륨을 삭제하면 두 프로젝트의 접속에 영향을 줄 수 있다.
- 현재 Caddy 2.10.2는 `admin off`로 실행된다. 변경 전 별도 제안 파일을 `caddy validate`로 검증한 뒤 **Caddy 컨테이너만** 재시작한다. 게임의 전체 Compose 재기동을 하지 않는다. 파일 바인드가 이전 inode를 가리킬 수 있으므로 재시작 후 컨테이너 안의 실제 설정과 각 서비스 응답도 확인한다.
- 기존 `https://43.202.80.103:8443`은 임시 IP 인증서의 유지보수 경로로 남아 있다. 일반 사용자에게는 공인 인증서가 적용된 도메인 주소를 안내한다. 기존 IP 주소는 운영 로그인 Origin이 아니다.

도메인 등록 연장(가비아)과 HTTPS 인증서 자동 갱신(Caddy)은 별개다. 자동 갱신을 위해 DNS가 서버를 가리키고 80/443이 열려 있어야 한다. 웹 인증서 설정은 아래 DBeaver용 DB 인증서와 별개다.

## DB 접속

| 항목 | 값 |
|---|---|
| host | 43.202.80.103 |
| port | 55432 (DBeaver 직접 접속), 5432 (컨테이너 내부) |
| user | reviewer_dbeaver |
| name | reviewer |
| schema | reviewer |
| password | 별도 전달한 비공개 접속 문서 |
| SSL | verify-full, 전달한 DB 전용 ca.crt 지정 |

DBeaver에서 PostgreSQL 연결을 만들고 위 값을 입력한다. SSH 설정은 사용하지 않는다. SSL 탭에서 Use SSL을 켜고 `verify-full`과 별도 전달한 `ca.crt`를 선택한다. 드라이버 속성으로 설정할 때는 `sslmode=verify-full`, `sslrootcert=ca.crt의 절대 경로`를 사용한다. 클라이언트 인증서나 개인 키는 지정하지 않는다. 기본 스키마는 계정에 `reviewer,pg_catalog`로 설정했다.

Lightsail 방화벽에는 TCP 55432를 **승인된 관리 PC의 공인 IPv4 /32만** 허용한다. PostgreSQL의 `/opt/4reviewer/postgres/pg_hba.conf`에서도 같은 IP의 `reviewer_dbeaver` 계정에만 TLS 연결을 허용한다. 관리 PC의 공인 IP가 바뀌면 두 곳의 허용 주소를 함께 갱신하고 이전 주소를 제거해야 한다. IPv6 DB 공개 규칙은 추가하지 않는다. `5432`는 외부에 노출하지 않는다.

앱 계정 `reviewer_app`과 외부 관리 계정 `reviewer_dbeaver`는 비밀번호를 공유하지 않는다. 두 계정은 스키마 사용, 원본 테이블 조회/등록/수정/삭제와 시퀀스 사용만 가능하며 DB·역할·테이블 생성 권한은 없다. DBeaver 계정은 운영 원본 데이터를 조회·수정할 수 있는 소유자용 계정으로 일반 사용자에게 배포하지 않는다. DDL 마이그레이션과 복원은 SSH로 서버에 접속한 뒤 별도 `reviewer_admin` 관리자 계정으로 수행한다. 앱/관리자 역할의 직접 외부 접속은 HBA에서 거부한다. 비밀번호와 운영 파일은 GitHub에 저장하지 않는다.

### DB TLS와 접속 규칙 관리

- 운영 HBA는 `deployment/pg_hba.conf.example`을 참고해 실제 Docker DB 네트워크와 허용 IP를 지정한다. 현재 DB 네트워크는 `172.19.0.0/16`이며, 재구성 시 `docker network inspect for-reviewer_database`로 다시 확인한다. 예시 파일은 미치환 상태로 배포하지 않는다.
- Compose 기동 전 `/opt/4reviewer/postgres/tls/server.crt`, `server.key`, `/opt/4reviewer/postgres/pg_hba.conf`가 있어야 한다. 인증서에는 접속 IP의 SAN이 필요하다. CA 개인 키는 소유자 비공개 로컬 폴더에만 보관하고 서버/GitHub에 올리지 않는다.
- PostgreSQL 컨테이너의 postgres GID를 확인해 TLS 폴더는 root:해당 GID, 0750, 서버 키는 같은 소유권과 0640, 서버 인증서/HBA는 0644로 설치한다. 키를 전체 읽기 가능하게 만들지 않는다.
- DB 서버 인증서는 1년 유효하며 2027-10-28 이전에 갱신해야 한다. 자동 갱신은 아직 설정하지 않았다. 동일 CA로 새 서버 인증서를 발급해 키·인증서를 교체하고 `SELECT pg_reload_conf()`를 실행한 뒤 새로운 연결에서 `verify-full` 성공을 확인한다. HBA 변경도 reload 후 `pg_hba_file_rules` 오류와 실제 연결을 확인한다.
- DB 덤프에는 클러스터 역할, HBA, TLS 파일이 포함되지 않는다. 새 서버 복구 시 별도 비공개 접속 정보를 사용해 관리자/앱/DBeaver 역할 및 기본 권한을 먼저 재구성하고, TLS/HBA 파일과 방화벽 규칙을 복원한다.

연결 설정 참고: [DBeaver SSL 설정](https://dbeaver.com/docs/dbeaver/SSL-Configuration/), [PostgreSQL TLS 설정](https://www.postgresql.org/docs/17/ssl-tcp.html).

## 저장 구조

`reviewer` 스키마의 테이블:

- `users`: 이메일, 아이디, salt+scrypt 비밀번호 해시, 생성일. 이메일·아이디 중복 방지.
- `sessions`: 무작위 세션 토큰의 SHA-256 해시, 사용자, 만료 시각. 만료 기록은 주기적으로 제거.
- `reviews`: 사용자 소유권, 상품·연락처·리뷰·정산 정보(JSONB), 생성/수정일, 동시 수정 버전. 버전 3부터 상품명·구매처·리뷰 상태·금액 등의 22개 생성 컬럼으로 바로 조회 가능.
- `payments`: 실제 입금 금액·일자 원장. 사용자와 리뷰를 함께 참조하여 타인 리뷰에 입금 기록 연결 방지.
- `activities`: 기존 화면용 활동 문구. 화면 표시와 별개로 저장.
- `review_history`: 상품의 등록·수정·삭제 및 리뷰/정산 상태 변경 전후 값. 상품 삭제 후에도 보존.
- `payment_history`: 입금 기록의 추가·정정·삭제 전후 금액과 날짜. 상품 삭제 후에도 보존.
- `review_details`, `user_review_summary` 뷰: 상품 상세와 사용자별 등록/리뷰/정산 집계.
- `review_templates`, `template_groups`: 개인별 템플릿과 그룹.
- `schema_migrations`: 적용한 DB 버전.

이력 테이블은 앱 및 DBeaver 계정에서 조회만 가능하고 DB 트리거로 저장한다. 상품 삭제 시 유지되며, 회원 영구 삭제 시에는 개인정보 이력도 함께 제거한다. DBeaver의 reviewer 스키마에서 Tables/Views를 새로고침한다. [조회 가이드](REVIEW-DATA.md)와 [SQL 예제](REVIEW-DATA.sql)를 참고한다.

모든 API는 로그인 사용자 범위로 조회·변경하고 버전을 조건으로 원자적 갱신한다. 입금·리뷰·변경 기록은 같은 트랜잭션으로 저장한다. OCR 이미지는 브라우저에서만 처리한다. 운영 로그에 요청 본문·쿠키·연락처를 남기지 않는다.

로컬 SQLite는 개발용으로 유지한다. 운영 DB에는 로컬 테스트 데이터를 자동 업로드하지 않는다. 기존 데이터 이전이 필요한 경우 먼저 SQLite 백업과 이전 대상 계정을 확정한다.

## 배포

GitHub Actions `Verify and deploy For Reviewer`는 다음을 수행한다.

1. Node 24 의존성 설치, 단위/API 테스트 및 별도 PostgreSQL 테스트 DB 검증
2. 프런트엔드 빌드와 주요 PC/모바일 브라우저 회귀 검사
3. main 브랜치이고 `PRODUCTION_DEPLOY_ENABLED=true`이면 커밋별 Docker 이미지를 빌드
4. 프로젝트 전용 SSH 키로 이미지를 전달하고 암호화 DB 백업·마이그레이션·앱 교체
5. 앱 건강 검사 실패 시 직전 앱 이미지로 복귀. DB는 이전 버전과 호환되는 추가형 마이그레이션만 자동 배포한다.

키는 `reviewer-deploy` 계정의 강제 명령에 제한된다. 일반 쉘, 포트 포워딩, 임의 Docker 명령은 허용하지 않는다. 이 계정은 게임 배포 그룹이나 docker 그룹에 가입하지 않는다. GitHub-hosted Runner를 사용하며 기존 게임 Runner는 공유하지 않는다.

GitHub 설정: `DEPLOY_HOST`, `PRODUCTION_DEPLOY_ENABLED` 변수와 `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` Secrets. production 환경을 사용한다. 운영 Compose/프록시/배포 스크립트 변경은 SSH로 따로 검토·적용한다. 앱 커밋 배포가 운영 비밀값이나 인프라 설정을 덮어쓰지 않는다.

서버에서 상태 확인:

```sh
sudo docker compose --project-directory /opt/4reviewer \
  -f /opt/4reviewer/compose.yml --env-file /opt/4reviewer/.env ps
sudo cat /opt/4reviewer/deployed-revision
sudo systemctl status 4reviewer-backup.timer
```

`/api/health`는 DB 연결과 배포 커밋을 반환한다. 비밀값은 반환하지 않는다.

```sh
curl --fail https://forreviwer.com/api/health
curl --head https://www.forreviwer.com/
curl --fail http://43.202.80.103/health/ready
```

운영 변경 전 `/opt/4reviewer`의 Compose·nginx·환경 파일과 공통 Caddyfile을 비공개 백업한다. 문제가 있으면 직전 설정으로 복구하고 변경한 컨테이너만 재기동한다. 도메인 연결 작업의 백업은 `/opt/4reviewer/backups/domain-20261028T091316Z`에 있다.

## 백업과 복구

- 매일 한국 시간 03:15 전후, 배포 직전에 PostgreSQL custom dump를 생성한다.
- AES-256-CBC/PBKDF2로 암호화하여 `/opt/4reviewer/backups`에 14일 보관한다.
- 키는 `/opt/4reviewer/backup.key`와 소유자에게 전달한 비공개 로컬 폴더에 저장한다. 키를 잃으면 복호화할 수 없다.
- 운영 환경 파일·키·백업은 소유자 전용 권한으로 보관한다. GitHub에는 업로드하지 않는다.
- 같은 서버의 백업만으로 VM 손실에 대비할 수 없다. 별도 저장소에 암호화 백업을 보관하는 자동화는 추가 구성이 필요하다.

먼저 별도의 복원 DB에서 검증한다. 운영 DB를 지우거나 덮어쓰는 명령을 자동 실행하지 않는다.

```sh
sudo -i
cd /opt/4reviewer
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass file:backup.key -in backups/REPLACE.dump.enc \
  | docker exec -i for-reviewer-postgres-1 pg_restore \
      -U reviewer_admin -d reviewer_restore_check --no-owner --no-acl
```

복원 DB는 사전에 생성해야 한다. 복원 후 테이블 수·행 수·제약조건·로그인·리뷰/정산 흐름을 검증한 뒤 실제 복구를 결정한다.
