-- For Reviewer / PostgreSQL / DBeaver
-- 연결: reviewer DB → reviewer 스키마. Tables와 Views를 새로고침하세요.
-- 아래 '조회할_아이디_또는_이메일'을 실제 값으로 바꾼 뒤 필요한 쿼리만 실행합니다.
-- 모든 금액은 원(KRW). 비밀번호/세션은 조회하지 않습니다.

-- 1. 사용자별 등록 누적 수, 현재 리뷰/정산 수, 입금·미수 금액
SELECT * FROM reviewer.user_review_summary
ORDER BY registered_count DESC, user_id;

-- 2. 특정 사용자의 상품·구매처·리뷰·정산 현황
SELECT r.id AS review_id, u.username, u.email,
       r.product_name, r.platform_name, r.seller, r.order_number, r.sku,
       r.purchaser, r.purchase_date, r.review_mode, r.review_format,
       r.review_status, r.reviewed_at, r.review_due_date,
       r.purchase_amount, r.product_payback, r.review_fee, r.expected_total,
       r.received_amount, r.pending_product, r.pending_review_fee,
       r.settlement_status, r.paid_at, r.depositor, r.kakao_name, r.contact,
       r.created_at, r.updated_at
FROM reviewer.review_details r
JOIN reviewer.users u ON u.id=r.user_id
WHERE u.username='조회할_아이디_또는_이메일' OR u.email='조회할_아이디_또는_이메일'
ORDER BY r.created_at DESC, r.id;

-- 3. 등록·수정·리뷰 완료·입금 상태 변경·삭제의 모든 변경 전후 이력
-- 상품을 삭제해도 review_history는 남습니다. baseline은 도입 시점의 상태입니다.
SELECT h.id, h.recorded_at AT TIME ZONE 'Asia/Seoul' AS recorded_at_kst,
       h.review_id, h.product_name, h.platform_name, h.seller, h.event_type,
       h.review_status_before, h.review_status_after,
       h.settlement_status_before, h.settlement_status_after,
       h.received_amount_before, h.received_amount_after,
       h.version_before, h.version_after, h.database_actor,
       h.before_data, h.after_data
FROM reviewer.review_history h JOIN reviewer.users u ON u.id=h.user_id
WHERE u.username='조회할_아이디_또는_이메일' OR u.email='조회할_아이디_또는_이메일'
ORDER BY h.recorded_at DESC, h.id DESC;

-- 4. 입금 추가·정정·삭제 이력: 정정 전 금액과 날짜도 보존됩니다.
-- amount_delta는 기록의 증감입니다. 음수는 실제 출금/환불을 의미하지 않습니다.
-- 이력의 amount_after를 단순 합산하면 정정 내역이 중복됩니다. 현재 금액은 1 또는 5를 사용하세요.
SELECT h.id, h.recorded_at AT TIME ZONE 'Asia/Seoul' AS recorded_at_kst,
       h.review_id, h.payment_id, h.product_name, h.platform_name, h.seller,
       h.event_type, h.amount_before, h.amount_after, h.amount_delta,
       h.paid_at_before, h.paid_at_after, h.depositor, h.database_actor
FROM reviewer.payment_history h JOIN reviewer.users u ON u.id=h.user_id
WHERE u.username='조회할_아이디_또는_이메일' OR u.email='조회할_아이디_또는_이메일'
ORDER BY h.recorded_at DESC, h.id DESC;

-- 5. 정정 사항이 반영된 사용자별 월별 입금액 (현재 남아 있는 상품 기준)
SELECT p.user_id, u.username, u.email, LEFT(p.paid_at,7) AS paid_month,
       COUNT(*) AS payment_count, COUNT(DISTINCT p.review_id) AS paid_product_count,
       SUM(p.amount) AS received_amount
FROM reviewer.payments p JOIN reviewer.users u ON u.id=p.user_id
GROUP BY p.user_id,u.username,u.email,LEFT(p.paid_at,7)
ORDER BY paid_month DESC,p.user_id;

-- 6. 사용자·플랫폼·판매처별 현재 상품과 정산 현황
SELECT user_id,platform_name,seller,COUNT(*) AS product_count,
       COUNT(*) FILTER(WHERE review_status='done') AS review_done_count,
       COUNT(*) FILTER(WHERE settlement_status='done') AS settled_count,
       SUM(purchase_amount) AS purchase_total,SUM(received_amount) AS received_total,
       SUM(pending_product) AS pending_product,SUM(pending_review_fee) AS pending_review_fee
FROM reviewer.review_details
GROUP BY user_id,platform_name,seller
ORDER BY user_id,product_count DESC;

-- 7. 삭제된 상품까지 포함한 상품별 마지막 보존 상태
-- 삭제 직전의 상품/리뷰/금액을 확인하는 쿼리이며 현재 받을 금액 집계에는 포함하지 않습니다.
SELECT DISTINCT ON (h.user_id,h.review_id)
       h.user_id,h.review_id,h.product_name,h.platform_name,h.seller,
       h.event_type AS last_event,h.recorded_at,
       COALESCE(h.after_data,h.before_data) AS last_known_data
FROM reviewer.review_history h
ORDER BY h.user_id,h.review_id,h.id DESC;
