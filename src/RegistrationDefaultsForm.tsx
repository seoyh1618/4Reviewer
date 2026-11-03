import { useEffect, useId, useState, type FormEvent } from "react";
import { platforms, shippingMethods, reviewTypes } from "../shared/domain.mjs";
import {
  registrationDefaultsSchema,
  registrationFields,
} from "../shared/registration-defaults.mjs";
import { api } from "./lib";
import { Button } from "./ui";
import type { RegistrationDefaults, RegistrationDefaultKey } from "./types";
import "./registration-defaults.css";

export default function RegistrationDefaultsForm({
  onSaved,
  formId,
  onPendingChange,
}: {
  onSaved?: (defaults: RegistrationDefaults) => void;
  formId?: string;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [data, setData] = useState<RegistrationDefaults | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [reload, setReload] = useState(0);
  const id = useId();
  useEffect(() => {
    onPendingChange?.(loading || busy || !data);
  }, [loading, busy, data, onPendingChange]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void api<{ defaults: RegistrationDefaults }>("/registration-defaults")
      .then((result) => {
        if (!cancelled) setData(result.defaults);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);
  function update<K extends keyof RegistrationDefaults["values"]>(
    key: K,
    value: RegistrationDefaults["values"][K],
  ) {
    setSaved(false);
    setData(
      (current) =>
        current && { ...current, values: { ...current.values, [key]: value } },
    );
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!data || busy || loading) return;
    setSaved(false);
    setError("");
    const parsed = registrationDefaultsSchema.safeParse({
      values: data.values,
      enabledFields: data.enabledFields,
      version: data.version,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ defaults: RegistrationDefaults }>(
        "/registration-defaults",
        "PUT",
        parsed.data,
      );
      setData(result.defaults);
      setSaved(true);
      onSaved?.(result.defaults);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="registration-defaults-form"
      id={formId}
      onSubmit={submit}
      aria-label="상품 등록 기본정보"
    >
      <header>
        {!formId && <h3>상품 등록 기본정보</h3>}
        <p>
          자주 쓰는 정보를 저장하고 자동 채울 항목을 선택하세요. 내 계정에
          저장되어 다른 기기에서도 사용할 수 있어요.
        </p>
      </header>
      {loading ? (
        <p role="status">기본정보를 불러오는 중…</p>
      ) : (
        data && (
          <fieldset disabled={busy} className="defaults-grid">
            {registrationFields.map(({ key: fieldKey, label }) => {
              const key = fieldKey as RegistrationDefaultKey;
              const enabled = data.enabledFields.includes(key);
              return (
                <div className="defaults-field" key={key}>
                  <div className="defaults-field-heading">
                    <label htmlFor={`${id}-${key}`}>{label}</label>
                    <label className="defaults-check">
                      <input
                        type="checkbox"
                        aria-label={`${label} 자동 채움`}
                        checked={enabled}
                        onChange={(e) => {
                          setSaved(false);
                          setData({
                            ...data,
                            enabledFields: e.target.checked
                              ? [...data.enabledFields, key]
                              : data.enabledFields.filter(
                                  (value) => value !== key,
                                ),
                          });
                        }}
                      />
                      자동 채움
                    </label>
                  </div>
                  {key === "purchaser" ? (
                    <input
                      id={`${id}-${key}`}
                      maxLength={80}
                      required={enabled}
                      placeholder="구매에 사용하는 계정주 또는 계정명"
                      value={data.values.purchaser}
                      onChange={(e) => update("purchaser", e.target.value)}
                    />
                  ) : key === "additionalReviewFee" ? (
                    <div className="unit-input">
                      <input
                        id={`${id}-${key}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={1_000_000_000}
                        step={1}
                        required
                        value={data.values.additionalReviewFee}
                        onChange={(e) =>
                          update("additionalReviewFee", Number(e.target.value))
                        }
                      />
                      <span>원</span>
                    </div>
                  ) : (
                    <select
                      id={`${id}-${key}`}
                      value={data.values[key]}
                      onChange={(e) =>
                        key === "shippingMethod"
                          ? update(
                              key,
                              e.target
                                .value as RegistrationDefaults["values"]["shippingMethod"],
                            )
                          : update(key, e.target.value)
                      }
                    >
                      {(key === "platform"
                        ? platforms
                        : key === "shippingMethod"
                          ? shippingMethods
                          : reviewTypes
                      ).map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  )}
                  {key === "platform" && data.values.platform === "기타" && (
                    <label className="defaults-other">
                      기타 플랫폼 이름
                      <input
                        maxLength={80}
                        required={enabled}
                        placeholder="예: G마켓"
                        value={data.values.platformOther}
                        onChange={(e) =>
                          update("platformOther", e.target.value)
                        }
                      />
                    </label>
                  )}
                </div>
              );
            })}
          </fieldset>
        )
      )}
      <p className="defaults-help">
        체크한 항목만 새 상품에 자동 입력돼요. 기존 리뷰는 변경되지 않아요. 카톡
        이름은 리뷰를 제안한 상대방의 이름이므로 상품별로 입력해 주세요.
      </p>
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      {saved && (
        <p className="defaults-success" role="status">
          기본정보와 자동 채움 항목을 저장했습니다.
        </p>
      )}
      <div className="defaults-actions">
        {error && (
          <Button
            type="button"
            disabled={busy || loading}
            onClick={() => {
              setSaved(false);
              setReload((n) => n + 1);
            }}
          >
            다시 불러오기
          </Button>
        )}
        {!formId && (
          <Button
            type="submit"
            variant="primary"
            busy={busy}
            disabled={loading || !data}
          >
            기본정보 저장
          </Button>
        )}
      </div>
    </form>
  );
}
