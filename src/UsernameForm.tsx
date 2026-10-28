import { useState, type FormEvent } from "react";
import { usernamePattern, usernameHelp } from "../shared/auth.mjs";
import { api } from "./lib";
import { Button } from "./ui";
import type { User } from "./types";

export default function UsernameForm({
  user,
  onSave,
}: {
  user: User;
  onSave: (user: User) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const result = await api<{ user: User }>("/auth/username", "PATCH", {
        username: fields.get("username"),
        currentPassword: fields.get("currentPassword"),
      });
      onSave(result.user);
      (form.elements.namedItem("username") as HTMLInputElement).value =
        result.user.username || "";
      (form.elements.namedItem("currentPassword") as HTMLInputElement).value =
        "";
      setSaved(true);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="account-username-form"
      onSubmit={submit}
      onChange={() => {
        setSaved(false);
        setError("");
      }}
    >
      <div className="username-field">
        <label htmlFor="account-username">로그인 아이디</label>
        <input
          id="account-username"
          name="username"
          type="text"
          defaultValue={user.username || ""}
          placeholder="로그인에 사용할 아이디"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          minLength={4}
          maxLength={30}
          pattern={usernamePattern}
          aria-describedby="account-username-help"
        />
        <p id="account-username-help" className="username-help">
          {usernameHelp}
        </p>
      </div>
      <label>
        현재 비밀번호
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          placeholder="아이디 저장을 위해 입력해 주세요"
          required
          maxLength={128}
        />
      </label>
      <p className="username-help">
        {user.email
          ? "저장한 아이디 또는 기존 이메일로 로그인할 수 있어요."
          : "저장한 아이디로 로그인할 수 있어요."}
      </p>
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      {saved && (
        <p className="username-success" role="status">
          아이디를 저장했습니다.
        </p>
      )}
      <Button type="submit" variant="primary" busy={busy}>
        아이디 저장
      </Button>
    </form>
  );
}
