import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Download, Smartphone, Share, CheckCircle2 } from "lucide-react";
import { Button, Modal } from "./ui";
import "./pwa.css";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
interface InstallState {
  installed: boolean;
  prompt: InstallPromptEvent | null;
  install: () => Promise<"accepted" | "dismissed" | "unavailable">;
}
const InstallContext = createContext<InstallState>({
  installed: false,
  prompt: null,
  install: async () => "unavailable",
});
const isStandalone = () =>
  matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function PwaProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState(isStandalone);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    const displayMode = matchMedia("(display-mode: standalone)");
    const updateMode = () => setInstalled(isStandalone());
    const available = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const complete = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", available);
    window.addEventListener("appinstalled", complete);
    displayMode.addEventListener("change", updateMode);
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      // Installation is an enhancement; registration failure must not block login.
      void navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .catch(() => {});
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", available);
      window.removeEventListener("appinstalled", complete);
      displayMode.removeEventListener("change", updateMode);
    };
  }, []);

  async function install() {
    if (!prompt) return "unavailable" as const;
    setPrompt(null); // A browser install prompt can only be used once.
    await prompt.prompt();
    return (await prompt.userChoice).outcome;
  }

  return (
    <InstallContext.Provider value={{ installed, prompt, install }}>
      {children}
    </InstallContext.Provider>
  );
}

export function PwaInstallButton({
  navigation = false,
}: {
  navigation?: boolean;
}) {
  const { installed, prompt, install } = useContext(InstallContext);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const isApple =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(navigator.userAgent);
  const isEmbedded = /KAKAOTALK|NAVER\(|Instagram|FBAN|FBAV|; wv\)/i.test(
    navigator.userAgent,
  );

  async function requestInstall() {
    setBusy(true);
    setNotice("");
    try {
      const result = await install();
      setNotice(
        result === "accepted"
          ? "설치 요청을 보냈어요. 홈 화면이나 앱 목록을 확인해 주세요."
          : result === "dismissed"
            ? "설치를 취소했어요. 브라우저 메뉴에서 나중에 추가할 수 있어요."
            : "아래 안내에 따라 브라우저 메뉴에서 추가해 주세요.",
      );
    } catch {
      setNotice(
        "설치 창을 열지 못했어요. 아래 안내에 따라 브라우저 메뉴에서 추가해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={
          navigation ? "nav-item" : "button secondary pwa-install-entry"
        }
        aria-label={installed ? "앱 사용 안내" : "앱 설치"}
        title={installed ? "앱 사용 안내" : "앱 설치"}
        onClick={() => {
          setNotice("");
          setOpen(true);
        }}
      >
        <Smartphone size={18} aria-hidden="true" />
        <span>{installed ? "앱 사용 안내" : "앱 설치"}</span>
      </button>
      {open && (
        <Modal
          title={installed ? "포 리뷰어 웹앱" : "포 리뷰어 앱 설치"}
          onClose={() => setOpen(false)}
          className="pwa-install-modal"
        >
          <div className="modal-body pwa-install-body">
            <div className="pwa-app-preview">
              <img src="/icons/app-192.png" width="56" height="56" alt="" />
              <div>
                <strong>포 리뷰어</strong>
                <p>리뷰 관리, 정산 관리.</p>
              </div>
            </div>
            {installed ? (
              <p className="pwa-installed" role="status">
                <CheckCircle2 size={20} />
                앱으로 사용할 준비가 됐어요.
              </p>
            ) : (
              <>
                <p>
                  홈 화면에서 바로 열고, 리뷰와 정산 기록을 앱처럼 관리하세요.
                </p>
                {isEmbedded && (
                  <p className="pwa-install-hint">
                    지금 사용 중인 앱의 메뉴에서 {isApple ? "Safari" : "Chrome"}
                    로 열어 설치해 주세요.
                  </p>
                )}
                {prompt && (
                  <Button
                    variant="primary"
                    busy={busy}
                    onClick={() => void requestInstall()}
                  >
                    <Download size={17} />이 기기에 설치
                  </Button>
                )}
                <section className="pwa-install-steps" aria-label="설치 방법">
                  <h3>
                    {isApple
                      ? "아이폰·아이패드"
                      : isAndroid
                        ? "안드로이드"
                        : "브라우저에서 설치하기"}
                  </h3>
                  {isApple ? (
                    <ol>
                      <li>Safari에서 포 리뷰어를 열어 주세요.</li>
                      <li>
                        <Share size={15} aria-hidden="true" /> 공유 메뉴에서{" "}
                        <strong>홈 화면에 추가</strong>를 선택하세요.
                      </li>
                      <li>
                        <strong>웹 앱으로 열기</strong>가 보이면 켜고{" "}
                        <strong>추가</strong>를 누르세요.
                      </li>
                    </ol>
                  ) : (
                    <ol>
                      <li>
                        {isAndroid
                          ? "Chrome에서 포 리뷰어를 열어 주세요."
                          : "Chrome 또는 Edge에서 포 리뷰어를 열어 주세요."}
                      </li>
                      <li>
                        {isAndroid
                          ? "우측 상단 ⋮ 메뉴에서"
                          : "주소창의 설치 아이콘 또는 브라우저 메뉴에서"}{" "}
                        <strong>앱 설치</strong>
                        {isAndroid
                          ? " 또는 홈 화면에 추가를 선택하세요."
                          : "를 선택하세요."}
                      </li>
                      <li>
                        설치 후 {isAndroid ? "홈 화면" : "앱 목록"}의{" "}
                        <strong>포 리뷰어</strong> 아이콘으로 시작하세요.
                      </li>
                    </ol>
                  )}
                </section>
                {notice && (
                  <p className="pwa-install-notice" role="status">
                    {notice}
                  </p>
                )}
              </>
            )}
            <p className="pwa-install-hint">
              조회와 저장에는 인터넷 연결이 필요해요. 설치 후에는 기존 계정으로
              로그인해 주세요.
            </p>
          </div>
          <div className="modal-footer">
            <Button onClick={() => setOpen(false)}>닫기</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
