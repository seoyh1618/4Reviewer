-- Queryable product columns stay synchronized with the existing application payload.
-- Empty date strings mean not entered; all money columns are whole Korean won.
ALTER TABLE reviews ADD COLUMN product_name text GENERATED ALWAYS AS (COALESCE(data->>'name', '')) STORED;
ALTER TABLE reviews ADD COLUMN sku text GENERATED ALWAYS AS (COALESCE(data->>'sku', '')) STORED;
ALTER TABLE reviews ADD COLUMN order_number text GENERATED ALWAYS AS (COALESCE(data->>'orderNumber', '')) STORED;
ALTER TABLE reviews ADD COLUMN purchaser text GENERATED ALWAYS AS (COALESCE(data->>'purchaser', '')) STORED;
ALTER TABLE reviews ADD COLUMN seller text GENERATED ALWAYS AS (COALESCE(data->>'seller', '')) STORED;
ALTER TABLE reviews ADD COLUMN review_mode text GENERATED ALWAYS AS (COALESCE(data->>'shippingMethod', '')) STORED;
ALTER TABLE reviews ADD COLUMN review_format text GENERATED ALWAYS AS (COALESCE(data->>'reviewType', '')) STORED;
ALTER TABLE reviews ADD COLUMN review_status text GENERATED ALWAYS AS (COALESCE(data->>'reviewStatus', '')) STORED;
ALTER TABLE reviews ADD COLUMN purchase_date text GENERATED ALWAYS AS (COALESCE(data->>'purchaseDate', '')) STORED;
ALTER TABLE reviews ADD COLUMN review_due_date text GENERATED ALWAYS AS (COALESCE(data->>'dueDate', '')) STORED;
ALTER TABLE reviews ADD COLUMN reviewed_at text GENERATED ALWAYS AS (COALESCE(data->>'reviewedAt', '')) STORED;
ALTER TABLE reviews ADD COLUMN paid_at text GENERATED ALWAYS AS (COALESCE(data->>'paidAt', '')) STORED;
ALTER TABLE reviews ADD COLUMN contact text GENERATED ALWAYS AS (COALESCE(data->>'contact', '')) STORED;
ALTER TABLE reviews ADD COLUMN kakao_name text GENERATED ALWAYS AS (COALESCE(data->>'kakaoName', '')) STORED;
ALTER TABLE reviews ADD COLUMN depositor text GENERATED ALWAYS AS (COALESCE(data->>'depositor', '')) STORED;
ALTER TABLE reviews ADD COLUMN memo text GENERATED ALWAYS AS (COALESCE(data->>'memo', '')) STORED;
ALTER TABLE reviews ADD COLUMN platform_name text GENERATED ALWAYS AS (CASE WHEN COALESCE(data->>'platform', '')='기타' THEN COALESCE(NULLIF(COALESCE(data->>'platformOther', ''), ''), '기타') ELSE COALESCE(data->>'platform', '') END) STORED;
ALTER TABLE reviews ADD COLUMN purchase_amount bigint GENERATED ALWAYS AS (COALESCE((data->>'price')::bigint, 0)) STORED;
ALTER TABLE reviews ADD COLUMN product_payback bigint GENERATED ALWAYS AS (CASE COALESCE(data->>'shippingMethod', '') WHEN '빈박스' THEN COALESCE((data->>'price')::bigint, 0) WHEN '실배송' THEN 0 ELSE COALESCE((data->>'expectedPayback')::bigint, 0) END) STORED;
ALTER TABLE reviews ADD COLUMN review_fee bigint GENERATED ALWAYS AS (COALESCE((data->>'additionalReviewFee')::bigint, 0)) STORED;
ALTER TABLE reviews ADD COLUMN received_amount bigint GENERATED ALWAYS AS (COALESCE((data->>'receivedAmount')::bigint, 0)) STORED;
ALTER TABLE reviews ADD COLUMN settlement_status text GENERATED ALWAYS AS (CASE WHEN COALESCE((data->>'receivedAmount')::bigint, 0)>0 AND COALESCE((data->>'receivedAmount')::bigint, 0)>=((CASE COALESCE(data->>'shippingMethod', '') WHEN '빈박스' THEN COALESCE((data->>'price')::bigint, 0) WHEN '실배송' THEN 0 ELSE COALESCE((data->>'expectedPayback')::bigint, 0) END) + COALESCE((data->>'additionalReviewFee')::bigint, 0)) THEN 'done' WHEN ((CASE COALESCE(data->>'shippingMethod', '') WHEN '빈박스' THEN COALESCE((data->>'price')::bigint, 0) WHEN '실배송' THEN 0 ELSE COALESCE((data->>'expectedPayback')::bigint, 0) END) + COALESCE((data->>'additionalReviewFee')::bigint, 0))=0 THEN 'none' WHEN COALESCE((data->>'receivedAmount')::bigint, 0)>0 THEN 'partial' ELSE 'pending' END) STORED;
CREATE INDEX reviews_reporting ON reviews(user_id, platform_name, review_status, purchase_date);
CREATE INDEX reviews_settlement ON reviews(user_id, settlement_status, paid_at);
CREATE TABLE review_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_id text NOT NULL,
  event_type text NOT NULL CHECK(event_type IN ('created','updated','deleted','baseline')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  database_actor text NOT NULL DEFAULT session_user,
  review_created_at text NOT NULL,
  version_before integer,
  version_after integer,
  before_data jsonb,
  after_data jsonb,
  product_name text GENERATED ALWAYS AS (COALESCE(COALESCE(after_data,before_data)->>'name', '')) STORED,
  platform_name text GENERATED ALWAYS AS (CASE WHEN COALESCE(COALESCE(after_data,before_data)->>'platform', '')='기타' THEN COALESCE(NULLIF(COALESCE(COALESCE(after_data,before_data)->>'platformOther', ''), ''), '기타') ELSE COALESCE(COALESCE(after_data,before_data)->>'platform', '') END) STORED,
  seller text GENERATED ALWAYS AS (COALESCE(COALESCE(after_data,before_data)->>'seller', '')) STORED,
  review_status_before text GENERATED ALWAYS AS (COALESCE(before_data->>'reviewStatus', '')) STORED,
  review_status_after text GENERATED ALWAYS AS (COALESCE(after_data->>'reviewStatus', '')) STORED,
  settlement_status_before text GENERATED ALWAYS AS (CASE WHEN before_data IS NULL THEN NULL ELSE CASE WHEN COALESCE((before_data->>'receivedAmount')::bigint, 0)>0 AND COALESCE((before_data->>'receivedAmount')::bigint, 0)>=((CASE COALESCE(before_data->>'shippingMethod', '') WHEN '빈박스' THEN COALESCE((before_data->>'price')::bigint, 0) WHEN '실배송' THEN 0 ELSE COALESCE((before_data->>'expectedPayback')::bigint, 0) END) + COALESCE((before_data->>'additionalReviewFee')::bigint, 0)) THEN 'done' WHEN ((CASE COALESCE(before_data->>'shippingMethod', '') WHEN '빈박스' THEN COALESCE((before_data->>'price')::bigint, 0) WHEN '실배송' THEN 0 ELSE COALESCE((before_data->>'expectedPayback')::bigint, 0) END) + COALESCE((before_data->>'additionalReviewFee')::bigint, 0))=0 THEN 'none' WHEN COALESCE((before_data->>'receivedAmount')::bigint, 0)>0 THEN 'partial' ELSE 'pending' END END) STORED,
  settlement_status_after text GENERATED ALWAYS AS (CASE WHEN after_data IS NULL THEN NULL ELSE CASE WHEN COALESCE((after_data->>'receivedAmount')::bigint, 0)>0 AND COALESCE((after_data->>'receivedAmount')::bigint, 0)>=((CASE COALESCE(after_data->>'shippingMethod', '') WHEN '빈박스' THEN COALESCE((after_data->>'price')::bigint, 0) WHEN '실배송' THEN 0 ELSE COALESCE((after_data->>'expectedPayback')::bigint, 0) END) + COALESCE((after_data->>'additionalReviewFee')::bigint, 0)) THEN 'done' WHEN ((CASE COALESCE(after_data->>'shippingMethod', '') WHEN '빈박스' THEN COALESCE((after_data->>'price')::bigint, 0) WHEN '실배송' THEN 0 ELSE COALESCE((after_data->>'expectedPayback')::bigint, 0) END) + COALESCE((after_data->>'additionalReviewFee')::bigint, 0))=0 THEN 'none' WHEN COALESCE((after_data->>'receivedAmount')::bigint, 0)>0 THEN 'partial' ELSE 'pending' END END) STORED,
  received_amount_before bigint GENERATED ALWAYS AS (COALESCE((before_data->>'receivedAmount')::bigint, 0)) STORED,
  received_amount_after bigint GENERATED ALWAYS AS (COALESCE((after_data->>'receivedAmount')::bigint, 0)) STORED,
  CHECK(before_data IS NOT NULL OR after_data IS NOT NULL)
);
CREATE INDEX review_history_user_time ON review_history(user_id, recorded_at, id);
CREATE INDEX review_history_review ON review_history(user_id, review_id, id);
CREATE TABLE payment_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_id text NOT NULL,
  payment_id text NOT NULL,
  event_type text NOT NULL CHECK(event_type IN ('created','updated','deleted','baseline')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  database_actor text NOT NULL DEFAULT session_user,
  amount_before bigint NOT NULL DEFAULT 0,
  amount_after bigint NOT NULL DEFAULT 0,
  amount_delta bigint GENERATED ALWAYS AS (amount_after - amount_before) STORED,
  paid_at_before text,
  paid_at_after text,
  review_data jsonb NOT NULL,
  product_name text GENERATED ALWAYS AS (COALESCE(review_data->>'name', '')) STORED,
  platform_name text GENERATED ALWAYS AS (CASE WHEN COALESCE(review_data->>'platform', '')='기타' THEN COALESCE(NULLIF(COALESCE(review_data->>'platformOther', ''), ''), '기타') ELSE COALESCE(review_data->>'platform', '') END) STORED,
  seller text GENERATED ALWAYS AS (COALESCE(review_data->>'seller', '')) STORED,
  depositor text GENERATED ALWAYS AS (COALESCE(review_data->>'depositor', '')) STORED
);
CREATE INDEX payment_history_user_time ON payment_history(user_id, recorded_at, id);
CREATE INDEX payment_history_review ON payment_history(user_id, review_id, id);
-- Baselines describe the known state at migration time, not invented past events.
INSERT INTO review_history(user_id,review_id,event_type,review_created_at,version_after,after_data)
SELECT user_id,id,'baseline',created_at,version,data FROM reviews;
INSERT INTO payment_history(user_id,review_id,payment_id,event_type,amount_after,paid_at_after,review_data)
SELECT p.user_id,p.review_id,p.id,'baseline',p.amount,p.paid_at,r.data FROM payments p JOIN reviews r ON r.id=p.review_id AND r.user_id=p.user_id;

-- Pin the trusted schema explicitly and place pg_temp last in definer functions.
-- migrate.mjs sets search_path before this file; SET FROM CURRENT captures it.
CREATE FUNCTION capture_review_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE owner_id text;
BEGIN
  owner_id := CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.user_id<>OLD.user_id) THEN
    RAISE EXCEPTION 'Review identity cannot change';
  END IF;
  -- An explicit account purge removes its personal data, including history.
  IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM users WHERE id=owner_id) THEN RETURN OLD; END IF;
  INSERT INTO review_history(user_id,review_id,event_type,review_created_at,version_before,version_after,before_data,after_data)
  VALUES(owner_id,CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END,
    CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'UPDATE' THEN 'updated' ELSE 'deleted' END,
    CASE WHEN TG_OP='DELETE' THEN OLD.created_at ELSE NEW.created_at END,
    CASE WHEN TG_OP<>'INSERT' THEN OLD.version END,CASE WHEN TG_OP<>'DELETE' THEN NEW.version END,
    CASE WHEN TG_OP<>'INSERT' THEN OLD.data END,CASE WHEN TG_OP<>'DELETE' THEN NEW.data END);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reviews_history_capture BEFORE INSERT OR UPDATE OR DELETE ON reviews FOR EACH ROW EXECUTE FUNCTION capture_review_history();
CREATE FUNCTION capture_payment_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE owner_id text; item_id text; snapshot jsonb;
BEGIN
  owner_id := CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  item_id := CASE WHEN TG_OP='DELETE' THEN OLD.review_id ELSE NEW.review_id END;
  IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.user_id<>OLD.user_id OR NEW.review_id<>OLD.review_id) THEN
    RAISE EXCEPTION 'Payment identity cannot change';
  END IF;
  IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM users WHERE id=owner_id) THEN RETURN OLD; END IF;
  SELECT data INTO snapshot FROM reviews WHERE id=item_id AND user_id=owner_id;
  IF snapshot IS NULL THEN
    SELECT COALESCE(after_data,before_data) INTO snapshot FROM review_history
    WHERE review_id=item_id AND user_id=owner_id ORDER BY id DESC LIMIT 1;
  END IF;
  INSERT INTO payment_history(user_id,review_id,payment_id,event_type,amount_before,amount_after,paid_at_before,paid_at_after,review_data)
  VALUES(owner_id,item_id,CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END,
    CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'UPDATE' THEN 'updated' ELSE 'deleted' END,
    CASE WHEN TG_OP<>'INSERT' THEN OLD.amount ELSE 0 END,CASE WHEN TG_OP<>'DELETE' THEN NEW.amount ELSE 0 END,
    CASE WHEN TG_OP<>'INSERT' THEN OLD.paid_at END,CASE WHEN TG_OP<>'DELETE' THEN NEW.paid_at END,snapshot);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payments_history_capture BEFORE INSERT OR UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION capture_payment_history();
CREATE FUNCTION protect_review_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
BEGIN
  IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM users WHERE id=OLD.user_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'History is append-only; correct the original review or payment instead';
END $$;
CREATE TRIGGER review_history_immutable BEFORE UPDATE OR DELETE ON review_history FOR EACH ROW EXECUTE FUNCTION protect_review_history();
CREATE TRIGGER payment_history_immutable BEFORE UPDATE OR DELETE ON payment_history FOR EACH ROW EXECUTE FUNCTION protect_review_history();
REVOKE ALL ON FUNCTION capture_review_history(), capture_payment_history(), protect_review_history() FROM PUBLIC;

CREATE VIEW review_details AS
SELECT r.*, product_payback + review_fee AS expected_total,
  GREATEST(0, product_payback + review_fee - received_amount) AS pending_total,
  GREATEST(0, product_payback - received_amount) AS pending_product,
  GREATEST(0, review_fee - GREATEST(0, received_amount-product_payback)) AS pending_review_fee
FROM reviews r;
CREATE VIEW user_review_summary AS
WITH current_totals AS (
  SELECT user_id, COUNT(*) AS active_review_count,
    SUM(CASE WHEN review_status='todo' THEN 1 ELSE 0 END) AS todo_count,
    SUM(CASE WHEN review_status='todo' AND review_mode='실배송' THEN 1 ELSE 0 END) AS todo_physical_count,
    SUM(CASE WHEN review_status='todo' AND review_mode='빈박스' THEN 1 ELSE 0 END) AS todo_empty_box_count,
    SUM(CASE WHEN review_status='done' THEN 1 ELSE 0 END) AS review_done_count,
    SUM(CASE WHEN settlement_status='done' THEN 1 ELSE 0 END) AS settled_count,
    SUM(CASE WHEN settlement_status='partial' THEN 1 ELSE 0 END) AS partially_paid_count,
    SUM(CASE WHEN settlement_status='none' THEN 1 ELSE 0 END) AS no_settlement_count,
    SUM(purchase_amount) AS purchase_total, SUM(product_payback) AS product_payback_total,
    SUM(review_fee) AS review_fee_total, SUM(received_amount) AS received_total,
    SUM(pending_total) AS pending_total, SUM(pending_product) AS pending_product,
    SUM(pending_review_fee) AS pending_review_fee
  FROM review_details GROUP BY user_id
), historical_totals AS (
  SELECT user_id,
    COUNT(DISTINCT CASE WHEN event_type IN ('created','baseline') THEN review_id END) AS registered_count,
    COUNT(DISTINCT CASE WHEN event_type='deleted' THEN review_id END) AS deleted_count,
    COUNT(DISTINCT CASE WHEN review_status_after='done' THEN review_id END) AS ever_review_done_count,
    COUNT(DISTINCT CASE WHEN settlement_status_after='done' THEN review_id END) AS ever_settled_count
  FROM review_history GROUP BY user_id
)
SELECT u.id AS user_id,u.email,u.username,
  COALESCE(h.registered_count,0) AS registered_count,
  COALESCE(h.deleted_count,0) AS deleted_count,
  COALESCE(h.ever_review_done_count,0) AS ever_review_done_count,
  COALESCE(h.ever_settled_count,0) AS ever_settled_count,
  COALESCE(c.active_review_count,0) AS active_review_count,
  COALESCE(c.todo_count,0) AS todo_count,
  COALESCE(c.todo_physical_count,0) AS todo_physical_count,
  COALESCE(c.todo_empty_box_count,0) AS todo_empty_box_count,
  COALESCE(c.review_done_count,0) AS review_done_count,
  COALESCE(c.settled_count,0) AS settled_count,
  COALESCE(c.partially_paid_count,0) AS partially_paid_count,
  COALESCE(c.no_settlement_count,0) AS no_settlement_count,
  COALESCE(c.purchase_total,0) AS purchase_total,
  COALESCE(c.product_payback_total,0) AS product_payback_total,
  COALESCE(c.review_fee_total,0) AS review_fee_total,
  COALESCE(c.received_total,0) AS received_total,
  COALESCE(c.pending_total,0) AS pending_total,
  COALESCE(c.pending_product,0) AS pending_product,
  COALESCE(c.pending_review_fee,0) AS pending_review_fee
FROM users u LEFT JOIN current_totals c ON c.user_id=u.id LEFT JOIN historical_totals h ON h.user_id=u.id;

COMMENT ON TABLE review_history IS '상품 등록, 수정, 리뷰 처리, 정산 상태 변경, 삭제의 변경 전후 이력. 상품 삭제 후 유지, 계정 삭제 시 삭제.';
COMMENT ON TABLE payment_history IS '입금 기록 추가, 정정, 삭제 이력. 음수 delta는 기록 정정/삭제이며 실제 출금이나 환불을 의미하지 않음.';
COMMENT ON VIEW user_review_summary IS '사용자별 등록 누적 수와 현재 리뷰/정산 집계. 누적 수는 이력 보존 시작 시점의 baseline 포함.';
COMMENT ON VIEW review_details IS '상품별 일반 컬럼 및 원가 우선 차감 방식의 남은 페이백/리뷰비.';
-- Existing roles may have default DML grants. History is written only by triggers.
DO $$
DECLARE role_name text; schema_name text := current_schema();
BEGIN
  FOREACH role_name IN ARRAY ARRAY['reviewer_app','reviewer_dbeaver'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('GRANT SELECT ON %I.review_details, %I.user_review_summary, %I.review_history, %I.payment_history TO %I', schema_name,schema_name,schema_name,schema_name,role_name);
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON %I.review_history, %I.payment_history FROM %I', schema_name,schema_name,role_name);
    END IF;
  END LOOP;
END $$;
INSERT INTO schema_migrations(version) VALUES(3);
