import { useEffect, useId, useState } from "react";
import { ChevronDown, Plus, UserRound } from "lucide-react";
import { profileLabel } from "../shared/registration-profiles.mjs";
import { api } from "./lib";
import { Button } from "./ui";
import RegistrationProfileEditor from "./RegistrationProfileEditor";
import type { RegistrationProfile } from "./types";
import "./registration-defaults.css";

function summary(profile: RegistrationProfile) {
  const { phone, bank, accountNumber } = profile.details;
  return (
    [
      phone ? `연락처 ····${phone.slice(-4)}` : "",
      [bank, accountNumber ? `····${accountNumber.slice(-4)}` : ""]
        .filter(Boolean)
        .join(" "),
    ]
      .filter(Boolean)
      .join(" · ") || "연락처·주소·정산 계좌를 추가하세요"
  );
}

export default function RegistrationDefaultsForm() {
  const [profiles, setProfiles] = useState<RegistrationProfile[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const id = useId();
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void api<{ profiles: RegistrationProfile[] }>("/registration-profiles")
      .then((r) => {
        if (!cancelled) {
          setProfiles(r.profiles);
          setOpen(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);
  const saved = (next: RegistrationProfile[], selected?: string) => {
    setProfiles(next);
    setOpen(selected ?? null);
    setNotice(
      selected ? "정보 묶음을 저장했습니다." : "정보 묶음을 삭제했습니다.",
    );
  };
  return (
    <section className="registration-profiles" aria-label="내 정보 묶음">
      <header className="profiles-heading">
        <div>
          <h3>
            내 정보 묶음 <span>{profiles.length}</span>
          </h3>
          <p>이름과 플랫폼별로 연락처·주소·정산 계좌를 관리하세요.</p>
        </div>
        <Button
          disabled={loading || busy || open === "new" || profiles.length >= 50}
          onClick={() => {
            setOpen("new");
            setNotice("");
          }}
        >
          <Plus size={16} />
          묶음 추가
        </Button>
      </header>
      {loading && <p role="status">내 정보를 불러오는 중…</p>}
      {error && (
        <div className="error-message" role="alert">
          {error}
          <Button onClick={() => setReload((n) => n + 1)}>다시 불러오기</Button>
        </div>
      )}
      {!loading && !error && (
        <>
          {!profiles.length && open !== "new" && (
            <div className="profiles-empty">
              <UserRound size={26} />
              <strong>첫 번째 정보 묶음을 만들어 보세요</strong>
              <p>같은 이름도 플랫폼별로 나누어 저장할 수 있어요.</p>
            </div>
          )}
          {profiles.map((p) => (
            <article
              className={`profile-card${open === p.id ? " is-open" : ""}`}
              key={p.id}
            >
              <button
                type="button"
                className="profile-toggle"
                disabled={busy}
                aria-expanded={open === p.id}
                aria-controls={`${id}-${p.id}`}
                onClick={() => setOpen(open === p.id ? null : p.id)}
              >
                <span className="profile-summary">
                  <span className="profile-title">
                    {profileLabel(p)}
                    {p.isDefault && <small>기본</small>}
                  </span>
                  <span className="profile-subline">{summary(p)}</span>
                </span>
                <span className="profile-toggle-label">
                  {open === p.id ? "접기" : "열기"}
                  <ChevronDown size={16} />
                </span>
              </button>
              <div id={`${id}-${p.id}`} hidden={open !== p.id}>
                <RegistrationProfileEditor
                  key={`${p.id}-${p.version}`}
                  profile={p}
                  onSaved={saved}
                  onBusy={setBusy}
                />
              </div>
            </article>
          ))}
          {open === "new" && (
            <article className="profile-card is-open profile-new">
              <h4>새 정보 묶음</h4>
              <RegistrationProfileEditor
                onSaved={saved}
                onBusy={setBusy}
                onCancel={() => setOpen(null)}
              />
            </article>
          )}
          <p className="defaults-help">
            기본 묶음은 새 상품에 자동 적용돼요. 다른 묶음은 상품 등록에서
            선택할 수 있어요.
          </p>
        </>
      )}
      {notice && (
        <p className="defaults-success" role="status">
          {notice}
        </p>
      )}
      {!loading && !error && profiles.length > 0 && (
        <button
          type="button"
          className="profiles-reload"
          disabled={busy}
          onClick={() => {
            setReload((n) => n + 1);
            setNotice("");
          }}
        >
          저장된 정보 다시 불러오기
        </button>
      )}
    </section>
  );
}
