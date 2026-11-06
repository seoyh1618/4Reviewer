CREATE TABLE registration_profiles (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purchaser text NOT NULL DEFAULT '',
  platform text NOT NULL DEFAULT '쿠팡',
  platform_other text NOT NULL DEFAULT '',
  shipping_method text NOT NULL DEFAULT '실배송' CHECK(shipping_method IN ('실배송','빈박스')),
  review_type text NOT NULL DEFAULT '사진 리뷰',
  additional_review_fee bigint NOT NULL DEFAULT 0 CHECK(additional_review_fee BETWEEN 0 AND 1000000000),
  enabled_fields jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(enabled_fields)='array'),
  phone text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  bank text NOT NULL DEFAULT '',
  account_number text NOT NULL DEFAULT '',
  account_holder text NOT NULL DEFAULT '',
  is_default integer NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE INDEX registration_profiles_user ON registration_profiles(user_id,created_at,id);
CREATE UNIQUE INDEX registration_profiles_one_default ON registration_profiles(user_id) WHERE is_default=1;
INSERT INTO registration_profiles(id,user_id,purchaser,platform,platform_other,shipping_method,review_type,additional_review_fee,enabled_fields,is_default,created_at,updated_at)
SELECT user_id,user_id,purchaser,platform,platform_other,shipping_method,review_type,additional_review_fee,enabled_fields,1,updated_at,updated_at FROM registration_defaults;
COMMENT ON TABLE registration_profiles IS '사용자별 이름·플랫폼 단위 정보 묶음. 연락처·주소·이메일·정산 계좌와 상품 등록 자동 채움 설정.';
COMMENT ON TABLE registration_defaults IS '기본 정보 묶음의 자동 채움 호환용 데이터. registration_profiles가 묶음 원본이며 기존 클라이언트도 계속 지원.';
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='reviewer_app') THEN
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I.registration_profiles TO reviewer_app',current_schema());
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='reviewer_dbeaver') THEN
    EXECUTE format('GRANT SELECT ON %I.registration_profiles TO reviewer_dbeaver',current_schema());
  END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES(7);
