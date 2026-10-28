import { useState, useEffect, useCallback, useRef } from "react";
import {
  LayoutDashboard,
  Package,
  CalendarDays,
  Wallet,
  ChartNoAxesCombined,
  Search,
  Bell,
  ChevronRight,
  ChevronDown,
  Settings,
  LogOut,
  HelpCircle,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  ShieldCheck,
  Plus,
  Sparkles,
  LoaderCircle,
  Menu,
  UserRound,
  LayoutTemplate,
} from "lucide-react";
import Auth from "./Auth";
import UsernameForm from "./UsernameForm";
import { PwaInstallButton } from "./PwaInstall";
import Dashboard from "./Dashboard";
import Products from "./Products";
import Calendar from "./Calendar";
import Insights from "./Insights";
import ReviewTemplates from "./ReviewTemplates";
import ReviewForm from "./ReviewForm";
import ReviewDetail from "./ReviewDetail";
import ReviewStageForm from "./ReviewStageForm";
import type { ReviewStage } from "./ReviewProgress";
import { Logo, Button, Modal } from "./ui";
import { api, won, exportCsv } from "./lib";
import {
  today,
  totals,
  daysUntil,
  expectedSettlement,
  remainingPayback,
  shippingMethods,
} from "../shared/domain.mjs";
import type {
  Review,
  ReviewInput,
  User,
  Page,
  Filters,
  Payment,
} from "./types";

const nav = [
  { id: "dashboard" as Page, label: "대시보드", Icon: LayoutDashboard },
  { id: "products" as Page, label: "내 리뷰", Icon: Package },
  { id: "templates" as Page, label: "리뷰 템플릿", Icon: LayoutTemplate },
  { id: "calendar" as Page, label: "리뷰 캘린더", Icon: CalendarDays },
  { id: "payback" as Page, label: "페이백", Icon: Wallet },
  { id: "insights" as Page, label: "통계", Icon: ChartNoAxesCombined },
];
const defaultFilters: Filters = {
  search: "",
  platform: "",
  shippingMethod: "",
  status: "",
  sort: "recent",
};
const sidebarPreferenceKey = "for-reviewer:sidebar";
function urlState() {
  const p = new URLSearchParams(location.search);
  const shippingMethod = p.get("shipping") || "";
  return {
    page: (nav.some((n) => n.id === p.get("view"))
      ? p.get("view")
      : "dashboard") as Page,
    filters: {
      search: p.get("q") || "",
      platform: p.get("platform") || "",
      shippingMethod: shippingMethods.includes(shippingMethod)
        ? shippingMethod
        : "",
      status: p.get("status") || "",
      sort: p.get("sort") || "recent",
    },
  };
}
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [authLoading, setAuthLoading] = useState(true),
    [authError, setAuthError] = useState("");
  const [items, setItems] = useState<Review[]>([]),
    [payments, setPayments] = useState<Payment[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [synced, setSynced] = useState("");
  const [page, setPage] = useState<Page>(urlState().page),
    [filters, setFilters] = useState<Filters>(urlState().filters),
    [form, setForm] = useState<{ item?: Review; ocr?: boolean } | null>(null),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [workflow, setWorkflow] = useState<{
      item: Review;
      stage: ReviewStage;
    } | null>(null),
    [account, setAccount] = useState(false),
    [help, setHelp] = useState(false),
    [toast, setToast] = useState(""),
    [offline, setOffline] = useState(!navigator.onLine);
  const generation = useRef(0),
    loadCounter = useRef(0);
  const [templateRefresh, setTemplateRefresh] = useState(0);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(sidebarPreferenceKey) === "collapsed";
    } catch {
      return false;
    }
  });
  function toggleSidebar() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try {
      localStorage.setItem(
        sidebarPreferenceKey,
        next ? "collapsed" : "expanded",
      );
    } catch {
      // The sidebar still works when browser storage is unavailable.
    }
  }
  const refresh = () =>
    page === "templates" ? setTemplateRefresh((n) => n + 1) : void load();
  const loadAuth = useCallback(async () => {
    setAuthLoading(true);
    setAuthError("");
    try {
      const r = await api<{ user: User | null }>("/auth/me");
      setUser(r.user);
    } catch (e) {
      setAuthError((e as Error).message);
    } finally {
      setAuthLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadAuth();
  }, [loadAuth]);
  const load = useCallback(async () => {
    if (!user) return;
    const run = ++loadCounter.current;
    const gen = generation.current;
    setLoading(true);
    try {
      const r = await api<{
        reviews: Review[];
        payments: Payment[];
      }>("/reviews");
      if (gen !== generation.current || run !== loadCounter.current) return;
      setItems(r.reviews);
      setPayments(r.payments);
      setSynced(
        new Date().toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Seoul",
        }),
      );
      setError("");
    } catch (e) {
      if (gen === generation.current) setError((e as Error).message);
    } finally {
      if (gen === generation.current && run === loadCounter.current)
        setLoading(false);
    }
  }, [user]);
  useEffect(() => {
    generation.current++;
    setItems([]);
    setPayments([]);
    setSynced("");
    setError("");
    if (user) void load();
  }, [user, load]);
  useEffect(() => {
    const focus = () => {
      void api<{ user: User | null }>("/auth/me")
        .then((r) => {
          if (r.user?.id !== user?.id) {
            generation.current++;
            setSelectedId(null);
            setForm(null);
            setWorkflow(null);
            setUser(r.user);
          } else if (user) void load();
        })
        .catch(() => {});
    };
    const online = () => {
        setOffline(false);
        void load();
      },
      offline = () => setOffline(true);
    window.addEventListener("focus", focus);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [load, user]);
  useEffect(() => {
    const pop = () => {
      const s = urlState();
      setPage(s.page);
      setFilters(s.filters);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    const p = new URLSearchParams();
    if (page !== "dashboard") p.set("view", page);
    if (page === "insights") {
      const current = new URLSearchParams(location.search);
      for (const key of ["statsYear", "statsMonth"]) {
        const value = current.get(key);
        if (value) p.set(key, value);
      }
    }
    if (filters.search) p.set("q", filters.search);
    if (filters.platform) p.set("platform", filters.platform);
    if (filters.shippingMethod) p.set("shipping", filters.shippingMethod);
    if (filters.status) p.set("status", filters.status);
    if (filters.sort !== "recent") p.set("sort", filters.sort);
    history.replaceState(null, "", location.pathname + (p.size ? "?" + p : ""));
  }, [page, filters]);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 4200);
      return () => clearTimeout(id);
    }
  }, [toast]);
  function navigate(p: Page, status = "") {
    history.pushState(
      null,
      "",
      `?view=${p}${status ? `&status=${status}` : ""}`,
    );
    setPage(p);
    setFilters({ ...defaultFilters, status });
    window.scrollTo({ top: 0 });
  }
  async function logout() {
    try {
      await api("/auth/logout", "POST", {});
      generation.current++;
      setUser(null);
      setAccount(false);
      setSelectedId(null);
      setForm(null);
      setWorkflow(null);
      setItems([]);
      setToast("");
      navigate("dashboard");
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  function authenticated(u: User) {
    generation.current++;
    setUser(u);
    setAuthError("");
  }
  async function save(data: ReviewInput) {
    const old = form?.item;
    const r = await api<{ review: Review }>(
      old ? `/reviews/${old.id}` : "/reviews",
      old ? "PUT" : "POST",
      { ...data, ...(old ? { version: old.version } : {}) },
    );
    setItems((list) =>
      old
        ? list.map((i) => (i.id === old.id ? r.review : i))
        : [r.review, ...list],
    );
    setForm(null);
    setToast(old ? "변경사항을 저장했어요." : "새 상품을 등록했어요.");
    await load();
  }
  const selected = items.find((i) => i.id === selectedId);
  async function saveProgress(data: ReviewInput) {
    if (!workflow) return;
    const snapshot = workflow.item;
    const gen = generation.current;
    const r = await api<{ review: Review; payments: Payment[] }>(
      `/reviews/${snapshot.id}`,
      "PUT",
      {
        ...data,
        version: snapshot.version,
      },
    );
    if (gen !== generation.current) return;
    loadCounter.current++;
    setItems((list) => list.map((i) => (i.id === snapshot.id ? r.review : i)));
    setPayments((list) => [
      ...list.filter((p) => p.reviewId !== snapshot.id),
      ...r.payments,
    ]);
    if (
      page === "products" &&
      workflow.stage === "review" &&
      ["todo", "urgent"].includes(filters.status)
    ) {
      setFilters((current) => ({ ...current, status: "done" }));
    } else if (
      workflow.stage === "payment" &&
      r.review.receivedAmount === expectedSettlement(r.review) &&
      ["done", "pending", "partial"].includes(filters.status)
    ) {
      setFilters((current) => ({ ...current, status: "paid" }));
    }
    setWorkflow(null);
    setToast(
      workflow.stage === "review"
        ? "리뷰 완료 정보를 저장했어요."
        : r.review.receivedAmount === expectedSettlement(r.review)
          ? "정산이 완료되었어요."
          : "부분 입금을 기록했어요. 남은 페이백을 확인해 주세요.",
    );
    await load();
  }
  async function remove() {
    if (!selected) return;
    await api(`/reviews/${selected.id}`, "DELETE", {
      version: selected.version,
    });
    setItems((list) => list.filter((i) => i.id !== selected.id));
    setSelectedId(null);
    setToast("상품을 삭제했어요.");
    await load();
  }
  if (authLoading)
    return (
      <div className="loading-screen">
        <Logo />
        <LoaderCircle size={24} className="spin" />
        <p>나의 워크스페이스를 준비하고 있어요.</p>
      </div>
    );
  if (authError)
    return (
      <div className="loading-screen">
        <Logo />
        <AlertCircle size={32} />
        <p>서버에 연결하지 못했어요.</p>
        <Button onClick={() => void loadAuth()}>다시 연결</Button>
      </div>
    );
  if (!user) return <Auth onAuth={authenticated} />;
  const sum = totals(items),
    pending = items.filter((i) => remainingPayback(i) > 0).length,
    urgent = items.filter(
      (i) =>
        i.reviewStatus === "todo" &&
        i.dueDate &&
        (daysUntil(i.dueDate) ?? 99) <= 3,
    ).length;
  return (
    <div className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <a className="skip-link" href="#main">
        본문으로 이동
      </a>
      <aside
        className="sidebar"
        id="workspace-sidebar"
        aria-label="워크스페이스 사이드바"
      >
        <div className="sidebar-brand">
          <Logo />
          <span className="workspace-caption">YOUR REVIEW WORKSPACE</span>
        </div>
        <button
          className="workspace-profile"
          aria-label="내 워크스페이스"
          title="내 워크스페이스"
          onClick={() => setAccount(true)}
        >
          <span className="avatar">
            <UserRound size={19} />
          </span>
          <span>
            <strong>내 워크스페이스</strong>
            <small>개인 워크스페이스</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <div className="sidebar-mini-stats">
          <div>
            <strong>{sum.count}</strong>
            <span>등록 상품</span>
          </div>
          <div>
            <strong>{sum.done}</strong>
            <span>완료한 리뷰</span>
          </div>
        </div>
        <div className="nav-heading">WORKSPACE</div>
        <nav aria-label="메인 메뉴">
          {nav.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              aria-label={sidebarCollapsed ? label : undefined}
              title={label}
              aria-current={page === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "products" && items.length > 0 ? (
                <small>{items.length}</small>
              ) : id === "payback" && pending > 0 ? (
                <small>{pending}</small>
              ) : page === id ? (
                <ChevronRight size={15} />
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="nav-item sidebar-import"
            aria-label="주문내역 가져오기"
            title="주문내역 가져오기"
            onClick={() => setForm({ ocr: true })}
          >
            <Sparkles size={18} />
          </button>
          <div className="sidebar-tip">
            <span className="tip-icon">
              <Sparkles size={18} />
            </span>
            <strong>주문내역 등록</strong>
            <p>주문내역 이미지에서 상품 정보를 불러옵니다.</p>
            <button onClick={() => setForm({ ocr: true })}>
              주문내역 가져오기 <ArrowUpRight size={14} />
            </button>
          </div>
          <PwaInstallButton navigation />
          <button
            className="nav-item"
            aria-label="사용 가이드"
            title="사용 가이드"
            onClick={() => setHelp(true)}
          >
            <HelpCircle size={18} />
            <span>사용 가이드</span>
          </button>
          <button
            className="nav-item"
            aria-label="계정 설정"
            title="계정 설정"
            onClick={() => setAccount(true)}
          >
            <Settings size={18} />
            <span>계정 설정</span>
          </button>
          <div className="sidebar-bottom-line">
            <span>
              For Reviewer <small>v0.1</small>
            </span>
            <button
              aria-label="로그아웃"
              title="로그아웃"
              className="icon-button"
              onClick={() => void logout()}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="icon-button sidebar-toggle"
              aria-label={
                sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"
              }
              title={sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
              aria-expanded={!sidebarCollapsed}
              aria-controls="workspace-sidebar"
              onClick={toggleSidebar}
            >
              <Menu size={20} />
            </button>
            <div className="breadcrumb">
              <span>워크스페이스</span>
              <ChevronRight size={14} />
              <b>{nav.find((n) => n.id === page)?.label}</b>
            </div>
            <div className="mobile-logo">
              <Logo />
            </div>
          </div>
          <div className="topbar-right">
            <span className="header-date">
              {new Date(today() + "T12:00:00Z").toLocaleDateString("ko-KR", {
                month: "long",
                day: "numeric",
                weekday: "short",
                timeZone: "Asia/Seoul",
              })}
            </span>
            <button
              className="icon-button refresh-button"
              aria-label="새로고침"
              onClick={refresh}
              disabled={page === "templates" ? templatesLoading : loading}
            >
              <RefreshCw
                size={18}
                className={
                  (page === "templates" ? templatesLoading : loading)
                    ? "spin"
                    : ""
                }
              />
            </button>
            <button
              className="icon-button notification-button"
              aria-label={`마감 확인 ${urgent}건`}
              onClick={() => navigate("products", "urgent")}
            >
              <Bell size={19} />
              {urgent > 0 && <i />}
            </button>
            <span className="header-divider" />
            <button
              className="header-avatar"
              aria-label="내 계정"
              onClick={() => setAccount(true)}
            >
              <UserRound size={19} />
            </button>
          </div>
        </header>
        <main
          id="main"
          className={`content${page === "products" || page === "payback" ? " content--table" : ""}`}
        >
          {((error && page !== "templates") || offline) && (
            <div className="connection-alert" role="alert">
              <AlertCircle size={18} />
              <span>
                {offline
                  ? "인터넷 연결이 끊어졌어요. 마지막으로 불러온 내용을 표시합니다."
                  : error}
              </span>
              <Button onClick={refresh}>다시 시도</Button>
            </div>
          )}
          {page === "templates" ? (
            <ReviewTemplates
              key={user.id}
              refreshKey={templateRefresh}
              onLoadingChange={setTemplatesLoading}
              onNotify={setToast}
            />
          ) : loading && !synced ? (
            <div className="skeleton-grid" aria-label="데이터 불러오는 중">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} />
              ))}
            </div>
          ) : page === "dashboard" ? (
            <Dashboard
              items={items}
              payments={payments}
              onNavigate={navigate}
              onOpen={(i) => setSelectedId(i.id)}
              onAdd={(ocr) => setForm({ ocr })}
            />
          ) : page === "products" || page === "payback" ? (
            <Products
              key={`${user.id}:${page}`}
              preferenceKey={`for-reviewer:columns:${user.id}:${page}`}
              items={items}
              onOpen={(i) => setSelectedId(i.id)}
              onProgress={(item, stage) => setWorkflow({ item, stage })}
              onAdd={(ocr) => setForm({ ocr })}
              filters={filters}
              setFilters={setFilters}
              payback={page === "payback"}
            />
          ) : page === "calendar" ? (
            <Calendar
              items={items}
              onOpen={(i) => setSelectedId(i.id)}
              onAdd={() => setForm({})}
            />
          ) : (
            <Insights items={items} payments={payments} />
          )}
          {page !== "templates" && (
            <div className="sync-status">
              <span className={error || offline ? "stale-dot" : "sync-dot"} />
              {synced
                ? `${synced} 마지막 동기화 · 한국 시간`
                : "데이터를 불러오는 중"}
            </div>
          )}
        </main>
      </div>
      <nav className="mobile-nav" aria-label="모바일 메뉴">
        {nav.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={page === id ? "active" : ""}
            aria-current={page === id ? "page" : undefined}
            onClick={() => navigate(id)}
          >
            <Icon size={21} />
            <span>
              {id === "calendar"
                ? "캘린더"
                : id === "templates"
                  ? "템플릿"
                  : label}
            </span>
          </button>
        ))}
      </nav>
      {form && (
        <ReviewForm
          item={form.item}
          startOcr={form.ocr}
          onClose={() => setForm(null)}
          onSave={save}
        />
      )}
      {selected && !form && !workflow && (
        <ReviewDetail
          item={selected}
          payments={payments}
          onClose={() => setSelectedId(null)}
          onEdit={() => setForm({ item: selected })}
          onProgress={(stage) => setWorkflow({ item: selected, stage })}
          onDelete={remove}
        />
      )}
      {workflow && (
        <ReviewStageForm
          key={`${workflow.item.id}:${workflow.stage}`}
          item={workflow.item}
          stage={workflow.stage}
          onClose={() => setWorkflow(null)}
          onSave={saveProgress}
        />
      )}
      {account && (
        <Modal title="내 계정" onClose={() => setAccount(false)}>
          <div className="modal-body account-body">
            <span className="account-avatar">
              <UserRound size={19} />
            </span>
            <h3>내 계정</h3>
            <p>{user.email || user.username}</p>
            <UsernameForm
              user={user}
              onSave={(updated) =>
                setUser((current) =>
                  current?.id === updated.id ? updated : current,
                )
              }
            />
            <div className="account-info">
              <ShieldCheck size={22} />
              <div>
                <strong>개인 전용 워크스페이스</strong>
                <p>상품과 정산 기록은 내 계정에서만 볼 수 있어요.</p>
              </div>
            </div>
            <dl className="detail-fields">
              <div>
                <dt>등록한 상품</dt>
                <dd>{items.length}개</dd>
              </div>
              <div>
                <dt>시간대</dt>
                <dd>한국 표준시 (서울)</dd>
              </div>
              <div>
                <dt>통화</dt>
                <dd>대한민국 원 (KRW)</dd>
              </div>
            </dl>
            <PwaInstallButton />
            <Button onClick={() => exportCsv(items)}>내 데이터 내보내기</Button>
          </div>
          <div className="modal-footer">
            <Button variant="ghost" onClick={() => void logout()}>
              <LogOut size={16} />
              로그아웃
            </Button>
            <span className="footer-spacer" />
            <Button onClick={() => setAccount(false)}>닫기</Button>
          </div>
        </Modal>
      )}
      {help && (
        <Modal title="For Reviewer 사용 가이드" onClose={() => setHelp(false)}>
          <div className="modal-body guide-body">
            {[
              [
                "01",
                "상품을 등록하세요",
                "주문내역 이미지를 올려 정보를 읽거나 직접 입력하세요. 인식된 값은 저장 전에 꼭 확인해 주세요.",
              ],
              [
                "02",
                "리뷰를 완료 처리하세요",
                "마감 예정 리뷰는 내 리뷰에서 확인하고, 리뷰를 완료하면 처리일 기준으로 캘린더에 표시됩니다.",
              ],
              [
                "03",
                "실제 입금을 기록하세요",
                "은행 입금 내역을 확인하고 상품 상세에서 금액을 입력하세요. 일부만 받았다면 남은 금액을 계속 확인할 수 있어요.",
              ],
              [
                "04",
                "기록을 돌아보세요",
                "통계에서 과거 활동을 확인하고, CSV로 내보내 엑셀에서도 활용하세요.",
              ],
            ].map(([n, h, p]) => (
              <div key={n}>
                <span>{n}</span>
                <section>
                  <h3>{h}</h3>
                  <p>{p}</p>
                </section>
              </div>
            ))}
            <p className="form-hint">
              리뷰 완료·페이백 입금은 직접 기록한 상태입니다. 쇼핑몰·은행과 자동
              연동되지는 않습니다.
            </p>
          </div>
          <div className="modal-footer">
            <Button variant="primary" onClick={() => setHelp(false)}>
              확인했어요
            </Button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}
