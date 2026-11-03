CREATE TABLE registration_defaults (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  purchaser text NOT NULL DEFAULT '',
  platform text NOT NULL DEFAULT '쿠팡',
  platform_other text NOT NULL DEFAULT '',
  shipping_method text NOT NULL DEFAULT '실배송' CHECK(shipping_method IN ('실배송','빈박스')),
  review_type text NOT NULL DEFAULT '사진 리뷰',
  additional_review_fee bigint NOT NULL DEFAULT 0 CHECK(additional_review_fee BETWEEN 0 AND 1000000000),
  enabled_fields jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(enabled_fields)='array'),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  updated_at text NOT NULL
);
COMMENT ON TABLE registration_defaults IS '사용자별 상품 등록 기본정보와 자동 채움 선택 항목. 기존 상품 기록과 독립적으로 저장.';
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='reviewer_app') THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I.registration_defaults TO reviewer_app',current_schema());
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='reviewer_dbeaver') THEN
    EXECUTE format('GRANT SELECT ON %I.registration_defaults TO reviewer_dbeaver',current_schema());
  END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES(4);
