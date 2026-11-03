import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api } from "./lib";
import { Button, Modal } from "./ui";
import type { User } from "./types";
import { usernamePattern } from "../shared/auth.mjs";
import "./social-auth.css";

export const socialReturn = new URLSearchParams(location.search).get("social");

type Provider = "google" | "kakao" | "naver";
type ProviderItem = { id: Provider; name: string };
const names: Record<Provider, string> = {
  google: "Google",
  kakao: "카카오",
  naver: "네이버",
};
function Logo({ provider }: { provider: Provider }) {
  if (provider === "google")
    return (
      <img src="/brand/google-signin-icon.png" alt="" aria-hidden="true" />
    );
  if (provider === "naver")
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M15.6 3v9.3L8.4 3H2v18h6.4v-9.3l7.2 9.3H22V3Z"
        />
      </svg>
    );
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M12 3C5.9 3 1 6.8 1 11.4c0 3 2 5.6 5 7.1l-1.2 4.1c-.1.4.3.6.6.4l4.8-3.2 1.8.1c6.1 0 11-3.8 11-8.5S18.1 3 12 3Z"
      />
    </svg>
  );
}
async function start(provider: Provider, data: Record<string, unknown>) {
  const { url } = await api<{ url: string }>(
    `/auth/social/${provider}/start`,
    "POST",
    data,
  );
  window.location.assign(url);
}
export function SocialLogin({
  remember,
  onAuth,
}: {
  remember: boolean;
  onAuth: (user: User) => void;
}) {
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [pending, setPending] = useState<Provider | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void api<{ providers: ProviderItem[] }>("/auth/social/providers")
      .then((r) => {
        if (active) setProviders(r.providers);
      })
      .catch(() => {});
    void api<{ provider: Provider | null }>("/auth/social/pending")
      .then((r) => {
        if (active) setPending(r.provider);
      })
      .catch(() => {});
    const params = new URLSearchParams(location.search),
      result = socialReturn;
    if (result === "failed")
      setError(
        "소셜 로그인을 완료하지 못했습니다. 다시 시도해 주세요. 기존 계정 연결은 로그인 후 내 계정에서 진행해 주세요.",
      );
    if (result === "cancelled") setError("소셜 로그인이 취소되었습니다.");
    if (result) {
      params.delete("social");
      history.replaceState(
        null,
        "",
        `${location.pathname}${params.size ? `?${params}` : ""}${location.hash}`,
      );
    }
    return () => {
      active = false;
    };
  }, []);
  async function login(provider: Provider) {
    setBusy(true);
    setError("");
    try {
      await start(provider, { intent: "login", remember });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function cancel() {
    setBusy(true);
    setError("");
    try {
      await api("/auth/social/cancel", "POST", {});
      setPending(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function signup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const { user } = await api<{ user: User }>(
        "/auth/social/signup",
        "POST",
        { username: data.get("username"), signupCode: data.get("signupCode") },
      );
      onAuth(user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {providers.length > 0 && (
        <div className="social-login">
          <span className="social-divider">간편 로그인 · 회원가입</span>
          <div className="social-buttons">
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`social-button social-${p.id}`}
                disabled={busy}
                onClick={() => void login(p.id)}
                aria-label={`${p.name}로 계속하기`}
                title={`${p.name}로 계속하기`}
              >
                <Logo provider={p.id} />
              </button>
            ))}
          </div>
        </div>
      )}
      {error && !pending && (
        <p className="error-message social-error" role="alert">
          {error}
        </p>
      )}
      {pending && (
        <Modal
          title={`${names[pending]}로 회원가입`}
          onClose={() => void cancel()}
          dismissible={!busy}
        >
          <form onSubmit={signup}>
            <div className="modal-body social-signup-form">
              <p>
                처음 방문하셨네요. 아이디와 가입 코드를 입력하면 시작할 수
                있어요.
              </p>
              <label>
                아이디
                <input
                  name="username"
                  required
                  minLength={4}
                  maxLength={30}
                  pattern={usernamePattern}
                  autoComplete="username"
                  autoCapitalize="none"
                  placeholder="영문·숫자·밑줄 4~30자"
                />
              </label>
              <label>
                회원가입 코드
                <input
                  name="signupCode"
                  required
                  maxLength={64}
                  autoComplete="off"
                  placeholder="전달받은 가입 코드"
                />
              </label>
              <p className="username-help">
                이후에는 {names[pending]} 버튼으로 로그인하세요. 기존 계정이
                있다면 취소한 뒤, 기존 계정으로 로그인하여 내 계정에서 연결해
                주세요.
              </p>
              {error && (
                <p className="error-message" role="alert">
                  {error}
                </p>
              )}
            </div>
            <div className="modal-footer">
              <Button onClick={() => void cancel()} disabled={busy}>
                취소
              </Button>
              <Button type="submit" variant="primary" busy={busy}>
                가입 완료
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

type AccountStatus = {
  hasPassword: boolean;
  providers: ProviderItem[];
  identities: { provider: Provider; created_at: string }[];
  recentAuthentication: boolean;
};
export function SocialAccountSettings({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [action, setAction] = useState<{
    provider: Provider;
    intent: "link" | "unlink";
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(
      socialReturn === "linked"
        ? "소셜 계정을 연결했습니다."
        : socialReturn === "verified"
          ? "본인 확인을 완료했습니다."
          : socialReturn === "failed"
            ? "계정 연결을 완료하지 못했습니다. 다른 계정에 연결되어 있는지 확인한 뒤 다시 시도해 주세요."
            : socialReturn === "cancelled"
              ? "소셜 인증이 취소되었습니다."
              : "",
    );
  const reload = () =>
    api<AccountStatus>("/auth/social/accounts").then(setStatus);
  useEffect(() => {
    void reload().catch((e) => setError(e.message));
  }, []);
  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    setBusy(true);
    setError("");
    setMessage("");
    const password = new FormData(event.currentTarget).get("currentPassword");
    try {
      if (action.intent === "link") {
        await start(action.provider, {
          intent: "link",
          ...(password ? { currentPassword: password } : {}),
        });
        return;
      }
      await api(`/auth/social/${action.provider}`, "DELETE", {
        currentPassword: password || undefined,
      });
      setAction(null);
      setMessage("연결을 해제했습니다.");
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reauth(provider: Provider) {
    setBusy(true);
    setError("");
    try {
      await start(provider, { intent: "reauth" });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function setPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await api("/auth/social/password", "POST", {
        password: data.get("password"),
        passwordConfirmation: data.get("passwordConfirmation"),
      });
      setMessage("비밀번호를 설정했습니다. 아이디로도 로그인할 수 있어요.");
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const providers = status
    ? [
        ...new Set([
          ...status.providers.map((p) => p.id),
          ...status.identities.map((p) => p.provider),
        ]),
      ]
    : [];
  return (
    <>
      <section className="social-settings" aria-label="소셜 계정 연결">
        <h4>소셜 계정 연결</h4>
        <p>연결한 계정으로 로그인해도 리뷰와 정산 기록은 그대로 유지돼요.</p>
        {!status && !error && (
          <p role="status">로그인 수단을 확인하고 있어요.</p>
        )}
        {status && providers.length === 0 && (
          <p>현재 아이디·이메일 로그인을 이용할 수 있어요.</p>
        )}
        {providers.map((provider) => {
          const linked = status!.identities.some(
            (i) => i.provider === provider,
          );
          const last =
            linked && !status!.hasPassword && status!.identities.length === 1;
          return (
            <div className="social-account-row" key={provider}>
              <span className={`social-mark social-${provider}`}>
                <Logo provider={provider} />
              </span>
              <strong>{names[provider]}</strong>
              <span className="social-linked">
                {linked ? "연결됨" : "미연결"}
              </span>
              <Button
                disabled={busy || last}
                aria-label={`${names[provider]} ${linked ? "연결 해제" : "연결"}`}
                onClick={() => {
                  setAction({ provider, intent: linked ? "unlink" : "link" });
                  setError("");
                  setMessage("");
                }}
              >
                {linked ? "해제" : "연결"}
              </Button>
            </div>
          );
        })}
        {status && !status.hasPassword && (
          <>
            <p className="username-help">
              마지막 로그인 수단은 해제할 수 없어요. 비밀번호를 설정하면 아이디
              로그인과 비밀번호 복구도 사용할 수 있어요.
            </p>
            {!status.recentAuthentication && (
              <div className="social-reauth">
                <p>변경하려면 연결된 계정으로 본인 확인이 필요해요.</p>
                {status.identities
                  .filter((p) =>
                    status.providers.some((v) => v.id === p.provider),
                  )
                  .map((p) => (
                    <Button
                      key={p.provider}
                      disabled={busy}
                      onClick={() => void reauth(p.provider)}
                    >
                      {names[p.provider]}로 본인 확인
                    </Button>
                  ))}
              </div>
            )}
            {status.recentAuthentication && (
              <form onSubmit={setPassword} className="social-password-form">
                <label>
                  로그인 비밀번호 설정
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    placeholder="8자 이상"
                  />
                </label>
                <label>
                  비밀번호 확인
                  <input
                    name="passwordConfirmation"
                    type="password"
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                  />
                </label>
                <Button type="submit" busy={busy}>
                  비밀번호 설정
                </Button>
              </form>
            )}
          </>
        )}
        {action && (
          <form onSubmit={apply} className="social-action-form">
            <strong>
              {names[action.provider]} 계정{" "}
              {action.intent === "link" ? "연결" : "연결 해제"}
            </strong>
            {status?.hasPassword ? (
              <label>
                현재 비밀번호
                <input
                  name="currentPassword"
                  type="password"
                  required
                  maxLength={128}
                  autoComplete="current-password"
                />
              </label>
            ) : (
              <p>본인 확인한 계정에 적용됩니다.</p>
            )}
            <div>
              <Button disabled={busy} onClick={() => setAction(null)}>
                취소
              </Button>
              <Button
                type="submit"
                busy={busy}
                disabled={!status?.hasPassword && !status?.recentAuthentication}
              >
                {action.intent === "link" ? "연결 계속하기" : "연결 해제"}
              </Button>
            </div>
          </form>
        )}
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="username-success" role="status">
            {message}
          </p>
        )}
      </section>
      {status?.hasPassword && children}
    </>
  );
}
