CREATE TABLE registration_defaults (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  purchaser TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT '쿠팡',
  platform_other TEXT NOT NULL DEFAULT '',
  shipping_method TEXT NOT NULL DEFAULT '실배송' CHECK(shipping_method IN ('실배송','빈박스')),
  review_type TEXT NOT NULL DEFAULT '사진 리뷰',
  additional_review_fee INTEGER NOT NULL DEFAULT 0 CHECK(additional_review_fee BETWEEN 0 AND 1000000000),
  enabled_fields TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(enabled_fields) AND json_type(enabled_fields)='array'),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  updated_at TEXT NOT NULL
);
PRAGMA user_version=4;
