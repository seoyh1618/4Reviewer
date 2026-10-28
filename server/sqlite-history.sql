-- Queryable product columns stay synchronized with the existing application payload.
-- Empty date strings mean not entered; all money columns are whole Korean won.
ALTER TABLE reviews ADD COLUMN product_name TEXT GENERATED ALWAYS AS (COALESCE(json_extract(data, '$.name'), '')) VIRTUAL;
ALTER TABLE reviews ADD COLUMN sku TEXT GENERATED ALWAYS AS (COALESCE(json_extract(data, '$.sku'), '')) VIRTUAL;
ALTER TABLE reviews ADD COLUMN order_number TEXT GENERATED ALWAYS AS (COALESCE(json_extract(data, '$.orderNumber'), '')) VIRTUAL;
ALTER TABLE reviews ADD COLUMN purchaser TEXT GENERATED ALWAYS AS (COALESCE(json_extract(data, '$.purchaser'), '')) VIRTUAL;
ALTER TABLE reviews ADD COLUMN seller TEXT GENERATED ALWAYS AS (COALESCE(json_extract(data, '$.seller'), '')) VIRTUAL;
ALTER TABLE reviews ADD COLUMN review_mode TEXT GENERATED ALWAYS AS (COALESCE(json_extract(data, '$.shippingMethod'), '')) VIRTUAL;
ALTER TABLE reviews ADD COLUMN review_format TEXT GENERATED ALWAYS AS (COALESCE(json_extract(data, '$.reviewType'), '')) VIRTUAL;
ALTER TABLE reviews ADD COLUMN review_status TEXT GENERATED ALWAYS AS (COALESCE(json_extract(data, '$.reviewStatus'), '')) VIRTUAL;
ALTER TABLE reviews ADD COLUMN purchase_date TEXT GENERATED ALWAYS AS (COALESCE(json_extract(data, '$.purchaseDate'), '')) VIRTUAL;
ALTER TABLE reviews ADD COLUMN review_due_date TEXT GENERATED ALWAYS AS (COALESCE(json_extract(data, '$.dueDate'), '')) VIRTUAL;
ALTER TABLE reviews ADD COLUMN reviewed_at TEXT GENERATED ALWAYS AS (COALESCE(json_extract(data, '$.reviewedAt'), '')) VIRTUAL;
ALTER TABLE reviews ADD COLUMN paid_at TEXT GENERATED ALWAYS AS (COALESCE(json_extract(data, '$.paidAt'), '')) VIRTUAL;
ALTER TABLE reviews ADD COLUMN contact TEXT GENERATED ALWAYS AS (COALESCE(json_extract(data, '$.contact'), '')) VIRTUAL;
ALTER TABLE reviews ADD COLUMN kakao_name TEXT GENERATED ALWAYS AS (COALESCE(json_extract(data, '$.kakaoName'), '')) VIRTUAL;
ALTER TABLE reviews ADD COLUMN depositor TEXT GENERATED ALWAYS AS (COALESCE(json_extract(data, '$.depositor'), '')) VIRTUAL;
ALTER TABLE reviews ADD COLUMN memo TEXT GENERATED ALWAYS AS (COALESCE(json_extract(data, '$.memo'), '')) VIRTUAL;
ALTER TABLE reviews ADD COLUMN platform_name TEXT GENERATED ALWAYS AS (CASE WHEN COALESCE(json_extract(data, '$.platform'), '')='기타' THEN COALESCE(NULLIF(COALESCE(json_extract(data, '$.platformOther'), ''), ''), '기타') ELSE COALESCE(json_extract(data, '$.platform'), '') END) VIRTUAL;
ALTER TABLE reviews ADD COLUMN purchase_amount INTEGER GENERATED ALWAYS AS (COALESCE(CAST(json_extract(data, '$.price') AS INTEGER), 0)) VIRTUAL;
ALTER TABLE reviews ADD COLUMN product_payback INTEGER GENERATED ALWAYS AS (CASE COALESCE(json_extract(data, '$.shippingMethod'), '') WHEN '빈박스' THEN COALESCE(CAST(json_extract(data, '$.price') AS INTEGER), 0) WHEN '실배송' THEN 0 ELSE COALESCE(CAST(json_extract(data, '$.expectedPayback') AS INTEGER), 0) END) VIRTUAL;
ALTER TABLE reviews ADD COLUMN review_fee INTEGER GENERATED ALWAYS AS (COALESCE(CAST(json_extract(data, '$.additionalReviewFee') AS INTEGER), 0)) VIRTUAL;
ALTER TABLE reviews ADD COLUMN received_amount INTEGER GENERATED ALWAYS AS (COALESCE(CAST(json_extract(data, '$.receivedAmount') AS INTEGER), 0)) VIRTUAL;
ALTER TABLE reviews ADD COLUMN settlement_status TEXT GENERATED ALWAYS AS (CASE WHEN COALESCE(CAST(json_extract(data, '$.receivedAmount') AS INTEGER), 0)>0 AND COALESCE(CAST(json_extract(data, '$.receivedAmount') AS INTEGER), 0)>=((CASE COALESCE(json_extract(data, '$.shippingMethod'), '') WHEN '빈박스' THEN COALESCE(CAST(json_extract(data, '$.price') AS INTEGER), 0) WHEN '실배송' THEN 0 ELSE COALESCE(CAST(json_extract(data, '$.expectedPayback') AS INTEGER), 0) END) + COALESCE(CAST(json_extract(data, '$.additionalReviewFee') AS INTEGER), 0)) THEN 'done' WHEN ((CASE COALESCE(json_extract(data, '$.shippingMethod'), '') WHEN '빈박스' THEN COALESCE(CAST(json_extract(data, '$.price') AS INTEGER), 0) WHEN '실배송' THEN 0 ELSE COALESCE(CAST(json_extract(data, '$.expectedPayback') AS INTEGER), 0) END) + COALESCE(CAST(json_extract(data, '$.additionalReviewFee') AS INTEGER), 0))=0 THEN 'none' WHEN COALESCE(CAST(json_extract(data, '$.receivedAmount') AS INTEGER), 0)>0 THEN 'partial' ELSE 'pending' END) VIRTUAL;
CREATE INDEX reviews_reporting ON reviews(user_id, platform_name, review_status, purchase_date);
CREATE INDEX reviews_settlement ON reviews(user_id, settlement_status, paid_at);
CREATE TABLE review_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('created','updated','deleted','baseline')),
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  database_actor TEXT NOT NULL DEFAULT 'sqlite',
  review_created_at TEXT NOT NULL,
  version_before integer,
  version_after integer,
  before_data TEXT,
  after_data TEXT,
  product_name TEXT GENERATED ALWAYS AS (COALESCE(json_extract(COALESCE(after_data,before_data), '$.name'), '')) VIRTUAL,
  platform_name TEXT GENERATED ALWAYS AS (CASE WHEN COALESCE(json_extract(COALESCE(after_data,before_data), '$.platform'), '')='기타' THEN COALESCE(NULLIF(COALESCE(json_extract(COALESCE(after_data,before_data), '$.platformOther'), ''), ''), '기타') ELSE COALESCE(json_extract(COALESCE(after_data,before_data), '$.platform'), '') END) VIRTUAL,
  seller TEXT GENERATED ALWAYS AS (COALESCE(json_extract(COALESCE(after_data,before_data), '$.seller'), '')) VIRTUAL,
  review_status_before TEXT GENERATED ALWAYS AS (COALESCE(json_extract(before_data, '$.reviewStatus'), '')) VIRTUAL,
  review_status_after TEXT GENERATED ALWAYS AS (COALESCE(json_extract(after_data, '$.reviewStatus'), '')) VIRTUAL,
  settlement_status_before TEXT GENERATED ALWAYS AS (CASE WHEN before_data IS NULL THEN NULL ELSE CASE WHEN COALESCE(CAST(json_extract(before_data, '$.receivedAmount') AS INTEGER), 0)>0 AND COALESCE(CAST(json_extract(before_data, '$.receivedAmount') AS INTEGER), 0)>=((CASE COALESCE(json_extract(before_data, '$.shippingMethod'), '') WHEN '빈박스' THEN COALESCE(CAST(json_extract(before_data, '$.price') AS INTEGER), 0) WHEN '실배송' THEN 0 ELSE COALESCE(CAST(json_extract(before_data, '$.expectedPayback') AS INTEGER), 0) END) + COALESCE(CAST(json_extract(before_data, '$.additionalReviewFee') AS INTEGER), 0)) THEN 'done' WHEN ((CASE COALESCE(json_extract(before_data, '$.shippingMethod'), '') WHEN '빈박스' THEN COALESCE(CAST(json_extract(before_data, '$.price') AS INTEGER), 0) WHEN '실배송' THEN 0 ELSE COALESCE(CAST(json_extract(before_data, '$.expectedPayback') AS INTEGER), 0) END) + COALESCE(CAST(json_extract(before_data, '$.additionalReviewFee') AS INTEGER), 0))=0 THEN 'none' WHEN COALESCE(CAST(json_extract(before_data, '$.receivedAmount') AS INTEGER), 0)>0 THEN 'partial' ELSE 'pending' END END) VIRTUAL,
  settlement_status_after TEXT GENERATED ALWAYS AS (CASE WHEN after_data IS NULL THEN NULL ELSE CASE WHEN COALESCE(CAST(json_extract(after_data, '$.receivedAmount') AS INTEGER), 0)>0 AND COALESCE(CAST(json_extract(after_data, '$.receivedAmount') AS INTEGER), 0)>=((CASE COALESCE(json_extract(after_data, '$.shippingMethod'), '') WHEN '빈박스' THEN COALESCE(CAST(json_extract(after_data, '$.price') AS INTEGER), 0) WHEN '실배송' THEN 0 ELSE COALESCE(CAST(json_extract(after_data, '$.expectedPayback') AS INTEGER), 0) END) + COALESCE(CAST(json_extract(after_data, '$.additionalReviewFee') AS INTEGER), 0)) THEN 'done' WHEN ((CASE COALESCE(json_extract(after_data, '$.shippingMethod'), '') WHEN '빈박스' THEN COALESCE(CAST(json_extract(after_data, '$.price') AS INTEGER), 0) WHEN '실배송' THEN 0 ELSE COALESCE(CAST(json_extract(after_data, '$.expectedPayback') AS INTEGER), 0) END) + COALESCE(CAST(json_extract(after_data, '$.additionalReviewFee') AS INTEGER), 0))=0 THEN 'none' WHEN COALESCE(CAST(json_extract(after_data, '$.receivedAmount') AS INTEGER), 0)>0 THEN 'partial' ELSE 'pending' END END) VIRTUAL,
  received_amount_before INTEGER GENERATED ALWAYS AS (COALESCE(CAST(json_extract(before_data, '$.receivedAmount') AS INTEGER), 0)) VIRTUAL,
  received_amount_after INTEGER GENERATED ALWAYS AS (COALESCE(CAST(json_extract(after_data, '$.receivedAmount') AS INTEGER), 0)) VIRTUAL,
  CHECK(before_data IS NOT NULL OR after_data IS NOT NULL)
);
CREATE INDEX review_history_user_time ON review_history(user_id, recorded_at, id);
CREATE INDEX review_history_review ON review_history(user_id, review_id, id);
CREATE TABLE payment_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('created','updated','deleted','baseline')),
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  database_actor TEXT NOT NULL DEFAULT 'sqlite',
  amount_before INTEGER NOT NULL DEFAULT 0,
  amount_after INTEGER NOT NULL DEFAULT 0,
  amount_delta INTEGER GENERATED ALWAYS AS (amount_after - amount_before) VIRTUAL,
  paid_at_before TEXT,
  paid_at_after TEXT,
  review_data TEXT NOT NULL,
  product_name TEXT GENERATED ALWAYS AS (COALESCE(json_extract(review_data, '$.name'), '')) VIRTUAL,
  platform_name TEXT GENERATED ALWAYS AS (CASE WHEN COALESCE(json_extract(review_data, '$.platform'), '')='기타' THEN COALESCE(NULLIF(COALESCE(json_extract(review_data, '$.platformOther'), ''), ''), '기타') ELSE COALESCE(json_extract(review_data, '$.platform'), '') END) VIRTUAL,
  seller TEXT GENERATED ALWAYS AS (COALESCE(json_extract(review_data, '$.seller'), '')) VIRTUAL,
  depositor TEXT GENERATED ALWAYS AS (COALESCE(json_extract(review_data, '$.depositor'), '')) VIRTUAL
);
CREATE INDEX payment_history_user_time ON payment_history(user_id, recorded_at, id);
CREATE INDEX payment_history_review ON payment_history(user_id, review_id, id);
-- Baselines describe the known state at migration time, not invented past events.
INSERT INTO review_history(user_id,review_id,event_type,review_created_at,version_after,after_data)
SELECT user_id,id,'baseline',created_at,version,data FROM reviews;
INSERT INTO payment_history(user_id,review_id,payment_id,event_type,amount_after,paid_at_after,review_data)
SELECT p.user_id,p.review_id,p.id,'baseline',p.amount,p.paid_at,r.data FROM payments p JOIN reviews r ON r.id=p.review_id AND r.user_id=p.user_id;

CREATE TRIGGER reviews_identity BEFORE UPDATE ON reviews WHEN NEW.id<>OLD.id OR NEW.user_id<>OLD.user_id BEGIN SELECT RAISE(ABORT, 'Record identity cannot change'); END;
CREATE TRIGGER reviews_history_created BEFORE INSERT ON reviews WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id) BEGIN INSERT INTO review_history(user_id,review_id,event_type,review_created_at,version_before,version_after,before_data,after_data) VALUES(NEW.user_id,NEW.id,'created',NEW.created_at,NULL,NEW.version,NULL,NEW.data); END;
CREATE TRIGGER reviews_history_updated BEFORE UPDATE ON reviews WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id) BEGIN INSERT INTO review_history(user_id,review_id,event_type,review_created_at,version_before,version_after,before_data,after_data) VALUES(NEW.user_id,NEW.id,'updated',NEW.created_at,OLD.version,NEW.version,OLD.data,NEW.data); END;
CREATE TRIGGER reviews_history_deleted BEFORE DELETE ON reviews WHEN EXISTS(SELECT 1 FROM users WHERE id=OLD.user_id) BEGIN INSERT INTO review_history(user_id,review_id,event_type,review_created_at,version_before,version_after,before_data,after_data) VALUES(OLD.user_id,OLD.id,'deleted',OLD.created_at,OLD.version,NULL,OLD.data,NULL); END;
CREATE TRIGGER payments_identity BEFORE UPDATE ON payments WHEN NEW.id<>OLD.id OR NEW.user_id<>OLD.user_id OR NEW.review_id<>OLD.review_id BEGIN SELECT RAISE(ABORT, 'Record identity cannot change'); END;
CREATE TRIGGER payments_history_created BEFORE INSERT ON payments WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id) BEGIN INSERT INTO payment_history(user_id,review_id,payment_id,event_type,amount_before,amount_after,paid_at_before,paid_at_after,review_data) VALUES(NEW.user_id,NEW.review_id,NEW.id,'created',0,NEW.amount,NULL,NEW.paid_at,COALESCE((SELECT data FROM reviews WHERE id=NEW.review_id AND user_id=NEW.user_id),(SELECT COALESCE(after_data,before_data) FROM review_history WHERE review_id=NEW.review_id AND user_id=NEW.user_id ORDER BY id DESC LIMIT 1))); END;
CREATE TRIGGER payments_history_updated BEFORE UPDATE ON payments WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id) BEGIN INSERT INTO payment_history(user_id,review_id,payment_id,event_type,amount_before,amount_after,paid_at_before,paid_at_after,review_data) VALUES(NEW.user_id,NEW.review_id,NEW.id,'updated',OLD.amount,NEW.amount,OLD.paid_at,NEW.paid_at,COALESCE((SELECT data FROM reviews WHERE id=NEW.review_id AND user_id=NEW.user_id),(SELECT COALESCE(after_data,before_data) FROM review_history WHERE review_id=NEW.review_id AND user_id=NEW.user_id ORDER BY id DESC LIMIT 1))); END;
CREATE TRIGGER payments_history_deleted BEFORE DELETE ON payments WHEN EXISTS(SELECT 1 FROM users WHERE id=OLD.user_id) BEGIN INSERT INTO payment_history(user_id,review_id,payment_id,event_type,amount_before,amount_after,paid_at_before,paid_at_after,review_data) VALUES(OLD.user_id,OLD.review_id,OLD.id,'deleted',OLD.amount,0,OLD.paid_at,NULL,COALESCE((SELECT data FROM reviews WHERE id=OLD.review_id AND user_id=OLD.user_id),(SELECT COALESCE(after_data,before_data) FROM review_history WHERE review_id=OLD.review_id AND user_id=OLD.user_id ORDER BY id DESC LIMIT 1))); END;
CREATE TRIGGER review_history_no_update BEFORE UPDATE ON review_history BEGIN SELECT RAISE(ABORT, 'History is append-only'); END;
CREATE TRIGGER review_history_no_delete BEFORE DELETE ON review_history WHEN EXISTS(SELECT 1 FROM users WHERE id=OLD.user_id) BEGIN SELECT RAISE(ABORT, 'History is append-only'); END;
CREATE TRIGGER payment_history_no_update BEFORE UPDATE ON payment_history BEGIN SELECT RAISE(ABORT, 'History is append-only'); END;
CREATE TRIGGER payment_history_no_delete BEFORE DELETE ON payment_history WHEN EXISTS(SELECT 1 FROM users WHERE id=OLD.user_id) BEGIN SELECT RAISE(ABORT, 'History is append-only'); END;
CREATE VIEW review_details AS
SELECT r.*, product_payback + review_fee AS expected_total,
  MAX(0, product_payback + review_fee - received_amount) AS pending_total,
  MAX(0, product_payback - received_amount) AS pending_product,
  MAX(0, review_fee - MAX(0, received_amount-product_payback)) AS pending_review_fee
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

PRAGMA user_version=3;