import { useEffect, useId, useState, type FormEvent } from "react";
import { Copy, KeyRound, ShieldCheck } from "lucide-react";
import { recoveryQuestions } from "../shared/recovery.mjs";
import { passwordMinLength } from "../shared/auth.mjs";
import { api } from "./lib";
import { Button, Modal } from "./ui";
import "./recovery.css";

export function RecoveryFields({
  confirm = false,
  questionId = "",
}: {
  confirm?: boolean;
  questionId?: string;
}) {
  const id = useId();
  return (
    <div className="recovery-fields">
      <label>
        인증 질문
        <select
          name="questionId"
          aria-label="인증 질문"
          required
          defaultValue={questionId}
        >
          <option value="" disabled>
            질문을 선택해 주세요
          </option>
          {recoveryQuestions.map((q) => (
            <option key={q.id} value={q.id}>
              {q.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        인증 답변
        <input
          name="answer"
          type="password"
          autoComplete="off"
          required
          minLength={confirm ? 4 : 1}
          maxLength={128}
          aria-describedby={`${id}-help`}
        />
      </label>
      {confirm && (
        <label>
          인증 답변 확인
          <input
            name="answerConfirmation"
            type="password"
            autoComplete="off"
            required
            minLength={4}
            maxLength={128}
          />
        </label>
      )}
      <p id={`${id}-help`} className="recovery-help">
        {confirm && "4자 이상, 다른 사람이 추측하기 어려운 답변을 입력하세요. "}
        영문 대소문자와 앞뒤 공백은 구분하지 않아요.
      </p>
    </div>
  );
}

export function RecoveryCodeDialog({
  code,
  reset = false,
  onDone,
}: {
  code: string;
  reset?: boolean;
  onDone: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <Modal
      title={reset ? "비밀번호를 변경했어요" : "복구코드를 보관해 주세요"}
      onClose={onDone}
      dismissible={saved}
      className="recovery-modal"
    >
      <div className="modal-body recovery-body">
        <span className="recovery-icon">
          <ShieldCheck size={24} />
        </span>
        <p>
          {reset
            ? "기존 로그인이 모두 해제됐어요. 다음 복구에 사용할 새 코드를 보관하고 새 비밀번호로 로그인해 주세요."
            : "인증 질문의 답변과 이 코드가 함께 있어야 비밀번호를 재설정할 수 있어요."}
        </p>
        <label>
          새 복구코드
          <textarea
            className="recovery-code"
            aria-label="새 복구코드"
            value={code}
            readOnly
            rows={2}
            onFocus={(e) => e.target.select()}
          />
        </label>
        <Button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setMessage("복구코드를 복사했습니다.");
            } catch {
              setMessage("코드를 길게 누르거나 선택해서 직접 복사해 주세요.");
            }
          }}
        >
          <Copy size={15} />
          복구코드 복사
        </Button>
        {message && <p role="status">{message}</p>}
        <div className="recovery-notice">
          이 코드는 지금 한 번만 표시됩니다. 비밀번호 관리자 등 안전한 곳에
          보관하세요. 이전 복구코드는 더 이상 사용할 수 없어요.
        </div>
        <label className="recovery-check">
          <input
            type="checkbox"
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
          />
          복구코드를 안전한 곳에 보관했습니다.
        </label>
      </div>
      <div className="modal-footer">
        <span className="footer-spacer" />
        <Button variant="primary" disabled={!saved} onClick={onDone}>
          {reset ? "로그인으로 돌아가기" : "확인"}
        </Button>
      </div>
    </Modal>
  );
}

export function RecoverySettingsForm() {
  const [settings, setSettings] = useState<{
    configured: boolean;
    questionId: string | null;
  } | null>(null);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [code, setCode] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    api<{ configured: boolean; questionId: string | null }>(
      "/auth/recovery-settings",
    )
      .then((data) => {
        if (!cancelled) {
          setSettings(data);
          setError("");
        }
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError("");
    try {
      const result = await api<{ recoveryCode: string }>(
        "/auth/recovery-settings",
        "PUT",
        fields,
      );
      form.reset();
      setCode(result.recoveryCode);
      setOpen(false);
      setSettings({ configured: true, questionId: String(fields.questionId) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="recovery-settings" aria-label="비밀번호 복구 설정">
      <div className="recovery-settings-heading">
        <KeyRound size={19} />
        <h3>비밀번호 복구</h3>
        <span>
          {settings
            ? settings.configured
              ? "설정 완료"
              : "미설정"
            : "불러오는 중"}
        </span>
      </div>
      <p className="recovery-help">
        인증 질문과 복구코드를 미리 등록하면 비밀번호를 잊었을 때 재설정할 수
        있어요.
      </p>
      {settings && (
        <Button
          onClick={() => {
            setOpen(!open);
            setError("");
          }}
          aria-expanded={open}
        >
          {open
            ? "접기"
            : settings.configured
              ? "복구 수단 변경"
              : "복구 수단 등록"}
        </Button>
      )}
      {open && (
        <form onSubmit={submit} aria-label="복구 수단 등록">
          <fieldset disabled={busy}>
            <label>
              현재 비밀번호
              <input
                type="password"
                name="currentPassword"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </label>
            <RecoveryFields confirm questionId={settings?.questionId || ""} />
            {settings?.configured && (
              <p className="recovery-help">
                저장하면 기존 복구코드는 폐기되고 새 코드가 발급돼요.
              </p>
            )}
            <Button type="submit" variant="primary" busy={busy}>
              복구코드 발급
            </Button>
          </fieldset>
        </form>
      )}
      {error && (
        <div className="error-message" role="alert">
          {error}
          {!settings && (
            <Button onClick={() => setReload((n) => n + 1)}>
              다시 불러오기
            </Button>
          )}
        </div>
      )}
      {code && <RecoveryCodeDialog code={code} onDone={() => setCode("")} />}
    </section>
  );
}

export function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  const [token, setToken] = useState(""),
    [code, setCode] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    try {
      if (!token) {
        const result = await api<{ resetToken: string }>(
          "/auth/recovery/verify",
          "POST",
          fields,
        );
        setToken(result.resetToken);
      } else {
        const result = await api<{ recoveryCode: string }>(
          "/auth/recovery/reset",
          "POST",
          { ...fields, resetToken: token },
        );
        setCode(result.recoveryCode);
        setToken("");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (code) return <RecoveryCodeDialog code={code} reset onDone={onClose} />;
  return (
    <Modal
      title="비밀번호 찾기"
      onClose={onClose}
      dismissible={!busy}
      className="recovery-modal"
    >
      <form onSubmit={submit} key={token ? "reset" : "verify"}>
        <div className="modal-body recovery-body">
          <p>
            {token
              ? "인증이 완료됐어요. 10분 안에 새 비밀번호를 설정해 주세요."
              : "가입한 계정과 미리 등록한 인증 질문·답변, 복구코드를 입력해 주세요."}
          </p>
          <fieldset disabled={busy}>
            {!token ? (
              <>
                <label>
                  이메일 또는 아이디
                  <input
                    name="identifier"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    maxLength={254}
                  />
                </label>
                <RecoveryFields />
                <label>
                  복구코드
                  <input
                    className="recovery-code"
                    name="recoveryCode"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    required
                    maxLength={100}
                    placeholder="보관한 복구코드 입력"
                  />
                </label>
                <p className="recovery-help">
                  복구 수단을 등록하지 않았거나 코드를 잃어버린 경우 이 방법으로
                  재설정할 수 없어요. 로그인 가능한 기기가 있다면 계정 설정에서
                  새로 등록해 주세요.
                </p>
              </>
            ) : (
              <>
                <label>
                  새 비밀번호
                  <input
                    autoFocus
                    type="password"
                    name="password"
                    autoComplete="new-password"
                    required
                    minLength={passwordMinLength}
                    maxLength={128}
                    placeholder="8자 이상 입력"
                  />
                </label>
                <label>
                  새 비밀번호 확인
                  <input
                    type="password"
                    name="passwordConfirmation"
                    autoComplete="new-password"
                    required
                    minLength={passwordMinLength}
                    maxLength={128}
                  />
                </label>
                <p className="recovery-help">
                  변경하면 모든 기기에서 로그아웃되고, 새 복구코드가 발급돼요.
                </p>
              </>
            )}
          </fieldset>
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <Button type="button" disabled={busy} onClick={onClose}>
            닫기
          </Button>
          <span className="footer-spacer" />
          {token && (
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                setToken("");
                setError("");
              }}
            >
              다시 인증
            </Button>
          )}
          <Button type="submit" variant="primary" busy={busy}>
            {token ? "비밀번호 변경" : "복구 정보 확인"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
