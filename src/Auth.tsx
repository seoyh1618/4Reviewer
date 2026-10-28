import { useState, type FormEvent } from "react";
import {
  Eye,
  EyeOff,
  Fingerprint,
  ShoppingBag,
  Star,
  Camera,
  Wallet,
  ClipboardCheck,
} from "lucide-react";
import { api } from "./lib";
import { Button } from "./ui";
import type { User } from "./types";
import { usernamePattern, usernameHelp } from "../shared/auth.mjs";
export default function Auth({ onAuth }: { onAuth: (u: User) => void }) {
  const [signupMethod, setSignupMethod] = useState<"email" | "username">(
    "email",
  );
  const [signup, setSignup] = useState(false),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [remember, setRemember] = useState(true);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const r = await api<{ user: User }>(
        signup ? "/auth/signup" : "/auth/login",
        "POST",
        {
          password: f.get("password"),
          ...(signup
            ? {
                [signupMethod]: f.get(signupMethod),
                signupCode: f.get("signupCode"),
              }
            : { identifier: f.get("identifier") }),
          remember,
        },
      );
      onAuth(r.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-heading">
          <h1>{signup ? "SIGN UP" : "SIGN IN"}</h1>
          <p>
            {signup
              ? "Create your For Reviewer account"
              : "Welcome to For Reviewer"}
          </p>
        </div>
        <div className="orbit" aria-hidden="true">
          <div className="orbit-circle orbit-1" />
          <div className="orbit-circle orbit-2" />
          <div className="orbit-circle orbit-3" />
          <div className="orbit-center">
            <Fingerprint size={34} strokeWidth={1.7} />
          </div>
          {[ShoppingBag, Star, Camera, Wallet, ClipboardCheck].map(
            (Icon, i) => (
              <div
                className="orbital-element"
                key={i}
                style={{
                  animationDelay: `${-i * 4}s`,
                  transform: `rotate(${i * 72}deg) translateX(var(--orbit-radius, 80px)) rotate(${-i * 72}deg)`,
                }}
              >
                <div className="orbital-item">
                  <Icon size={18} />
                </div>
              </div>
            ),
          )}
        </div>
        <form onSubmit={submit} className="auth-form">
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
          {signup && (
            <div className="signup-methods" role="group" aria-label="가입 방식">
              <button
                type="button"
                aria-pressed={signupMethod === "email"}
                disabled={busy}
                onClick={() => {
                  setSignupMethod("email");
                  setError("");
                }}
              >
                이메일로 가입
              </button>
              <button
                type="button"
                aria-pressed={signupMethod === "username"}
                disabled={busy}
                onClick={() => {
                  setSignupMethod("username");
                  setError("");
                }}
              >
                아이디로 가입
              </button>
            </div>
          )}
          <div className="username-field">
            <label htmlFor="auth-identifier">
              {signup
                ? signupMethod === "email"
                  ? "이메일"
                  : "아이디"
                : "로그인 계정"}
            </label>
            <input
              id="auth-identifier"
              key={signup ? signupMethod : "identifier"}
              name={signup ? signupMethod : "identifier"}
              type={signup && signupMethod === "email" ? "email" : "text"}
              placeholder={
                signup
                  ? signupMethod === "email"
                    ? "your@email.com"
                    : "로그인에 사용할 아이디"
                  : "이메일 또는 아이디 입력"
              }
              autoComplete={
                signup && signupMethod === "email" ? "email" : "username"
              }
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={signup && signupMethod === "username" ? 30 : 254}
              minLength={signup && signupMethod === "username" ? 4 : undefined}
              pattern={
                signup && signupMethod === "username"
                  ? usernamePattern
                  : undefined
              }
              aria-describedby={signup ? "signup-identifier-help" : undefined}
            />
            {signup && (
              <p id="signup-identifier-help" className="username-help">
                {signupMethod === "username"
                  ? usernameHelp
                  : "이메일 또는 아이디 중 하나만 선택해 가입하세요."}
              </p>
            )}
          </div>
          <label>
            비밀번호
            <div className="password-input">
              <input
                name="password"
                type={show ? "text" : "password"}
                placeholder={signup ? "10자 이상 입력해 주세요" : "••••••••••"}
                autoComplete={signup ? "new-password" : "current-password"}
                required
                minLength={signup ? 10 : 1}
                maxLength={128}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={show ? "비밀번호 숨기기" : "비밀번호 표시"}
                onClick={() => setShow(!show)}
              >
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
          {signup && (
            <label>
              회원가입 코드
              <input
                name="signupCode"
                type="text"
                placeholder="전달받은 회원가입 코드를 입력해 주세요"
                autoComplete="off"
                required
                minLength={4}
                maxLength={128}
              />
            </label>
          )}
          {!signup && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              로그인 상태 유지
            </label>
          )}
          <Button
            variant="primary"
            className="auth-submit"
            busy={busy}
            type="submit"
          >
            {signup ? "계정 만들기" : "Sign in"}
          </Button>
        </form>
        <p className="auth-switch">
          {signup ? "이미 계정이 있으신가요?" : "아직 계정이 없으신가요?"}{" "}
          <button
            onClick={() => {
              setSignup(!signup);
              setError("");
            }}
          >
            {signup ? "로그인" : "회원가입"}
          </button>
        </p>
        <p className="auth-note">
          포 리뷰어 · 상품부터 리뷰, 페이백까지 한곳에서.
        </p>
      </div>
      <footer className="auth-footer">
        For Reviewer <span>·</span> Your reviews, beautifully organized.
        <span>·</span> <a href="/about.html">서비스 소개</a>
      </footer>
    </main>
  );
}
