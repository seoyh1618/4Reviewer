import { useId, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { platforms, shippingMethods, reviewTypes } from "../shared/domain.mjs";
import { registrationFields } from "../shared/registration-defaults.mjs";
import {
  emptyRegistrationProfile,
  profileLabel,
  registrationProfileSchema,
} from "../shared/registration-profiles.mjs";
import { api } from "./lib";
import { Button } from "./ui";
import type {
  RegistrationProfile,
  RegistrationProfileInput,
  RegistrationDefaultKey,
} from "./types";

export default function RegistrationProfileEditor({
  profile,
  onSaved,
  onCancel,
  onBusy,
}: {
  profile?: RegistrationProfile;
  onSaved: (profiles: RegistrationProfile[], id?: string) => void;
  onCancel?: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const [data, setData] = useState<RegistrationProfileInput>(() =>
    profile
      ? {
          values: profile.values,
          details: profile.details,
          enabledFields: profile.enabledFields,
          version: profile.version,
          makeDefault: profile.isDefault,
        }
      : (emptyRegistrationProfile() as RegistrationProfileInput),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const id = useId();
  const value = <K extends keyof RegistrationProfileInput["values"]>(
    key: K,
    val: RegistrationProfileInput["values"][K],
  ) => setData((d) => ({ ...d, values: { ...d.values, [key]: val } }));
  const detail = (
    key: keyof RegistrationProfileInput["details"],
    val: string,
  ) => setData((d) => ({ ...d, details: { ...d.details, [key]: val } }));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsed = registrationProfileSchema.safeParse(data);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError("");
    setBusy(true);
    onBusy(true);
    try {
      const result = await api<{ profiles: RegistrationProfile[]; id: string }>(
        profile
          ? `/registration-profiles/${profile.id}`
          : "/registration-profiles",
        profile ? "PUT" : "POST",
        parsed.data,
      );
      onSaved(result.profiles, result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  async function remove() {
    if (!profile || busy) return;
    setError("");
    setBusy(true);
    onBusy(true);
    try {
      const result = await api<{ profiles: RegistrationProfile[] }>(
        `/registration-profiles/${profile.id}`,
        "DELETE",
        { version: profile.version },
      );
      onSaved(result.profiles);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <form
      className="registration-defaults-form profile-editor"
      aria-label={profile ? `${profileLabel(profile)} 수정` : "새 정보 등록"}
      onSubmit={save}
    >
      <fieldset disabled={busy} className="profile-fields">
        <label>
          이름 (계정주) <em>*</em>
          <input
            autoComplete="off"
            required
            maxLength={80}
            value={data.values.purchaser}
            onChange={(e) => value("purchaser", e.target.value)}
            placeholder="구매에 사용하는 이름"
          />
        </label>
        <label>
          전화번호
          <input
            type="tel"
            autoComplete="off"
            maxLength={40}
            value={data.details.phone}
            onChange={(e) => detail("phone", e.target.value)}
            placeholder="010-0000-0000"
          />
        </label>
        <label className="profile-full">
          주소
          <input
            autoComplete="off"
            maxLength={400}
            value={data.details.address}
            onChange={(e) => detail("address", e.target.value)}
            placeholder="도로명 주소와 상세 주소"
          />
        </label>
        <label className="profile-full">
          이메일
          <input
            type="email"
            autoComplete="off"
            maxLength={254}
            value={data.details.email}
            onChange={(e) => detail("email", e.target.value)}
            placeholder="구매 계정 이메일"
          />
        </label>
        <label>
          구매 플랫폼 <em>*</em>
          <select
            aria-label="구매 플랫폼"
            value={data.values.platform}
            onChange={(e) => value("platform", e.target.value)}
          >
            {platforms.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          은행
          <input
            autoComplete="off"
            maxLength={80}
            value={data.details.bank}
            onChange={(e) => detail("bank", e.target.value)}
            placeholder="은행명"
          />
        </label>
        {data.values.platform === "기타" && (
          <label className="profile-full">
            기타 플랫폼 이름 <em>*</em>
            <input
              required
              maxLength={80}
              value={data.values.platformOther}
              onChange={(e) => value("platformOther", e.target.value)}
              placeholder="플랫폼 이름"
            />
          </label>
        )}
        <label>
          계좌번호
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={80}
            value={data.details.accountNumber}
            onChange={(e) => detail("accountNumber", e.target.value)}
            placeholder="계좌번호"
          />
        </label>
        <label>
          예금주
          <input
            autoComplete="off"
            maxLength={80}
            value={data.details.accountHolder}
            onChange={(e) => detail("accountHolder", e.target.value)}
            placeholder="계좌에 등록된 이름"
          />
        </label>
        <label className="profile-default-check profile-full">
          <input
            type="checkbox"
            checked={data.makeDefault}
            disabled={profile?.isDefault}
            onChange={(e) =>
              setData((d) => ({ ...d, makeDefault: e.target.checked }))
            }
          />
          기본 정보로 사용
        </label>
        <details className="profile-autofill profile-full">
          <summary>상품 등록 자동 채움</summary>
          <p className="defaults-help">
            이 정보를 선택했을 때 채울 항목을 선택하세요. 주소와 계좌는 이곳에서
            관리해요.
          </p>
          <div className="profile-autofill-options">
            {registrationFields.map(({ key, label }) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={data.enabledFields.includes(
                    key as RegistrationDefaultKey,
                  )}
                  onChange={(e) =>
                    setData((d) => ({
                      ...d,
                      enabledFields: e.target.checked
                        ? [...d.enabledFields, key as RegistrationDefaultKey]
                        : d.enabledFields.filter((v) => v !== key),
                    }))
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <div className="profile-fields">
            <label>
              리뷰 타입
              <select
                aria-label="리뷰 타입"
                value={data.values.shippingMethod}
                onChange={(e) =>
                  value("shippingMethod", e.target.value as "빈박스" | "실배송")
                }
              >
                {shippingMethods.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              리뷰 가이드
              <select
                aria-label="리뷰 가이드"
                value={data.values.reviewType}
                onChange={(e) => value("reviewType", e.target.value)}
              >
                {reviewTypes.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              리뷰비
              <div className="unit-input">
                <input
                  aria-label="리뷰비"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={1000000000}
                  step={1}
                  required
                  value={data.values.additionalReviewFee}
                  onChange={(e) =>
                    value("additionalReviewFee", Number(e.target.value))
                  }
                />
                <span>원</span>
              </div>
            </label>
          </div>
        </details>
      </fieldset>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {deleting ? (
        <div
          className="profile-delete-confirm"
          role="group"
          aria-labelledby={`${id}-delete`}
        >
          <p id={`${id}-delete`}>
            이 등록 정보를 삭제할까요? 기존 상품과 정산 기록은 유지됩니다.
          </p>
          <div className="defaults-actions">
            <Button
              type="button"
              disabled={busy}
              onClick={() => setDeleting(false)}
            >
              취소
            </Button>
            <Button type="button" busy={busy} onClick={remove}>
              정보 삭제
            </Button>
          </div>
        </div>
      ) : (
        <div className="profile-editor-actions">
          {profile ? (
            <Button
              type="button"
              disabled={busy}
              className="profile-delete"
              onClick={() => setDeleting(true)}
            >
              <Trash2 size={15} />
              삭제
            </Button>
          ) : (
            <Button type="button" disabled={busy} onClick={onCancel}>
              취소
            </Button>
          )}
          <Button type="submit" variant="primary" busy={busy}>
            저장
          </Button>
        </div>
      )}
    </form>
  );
}
