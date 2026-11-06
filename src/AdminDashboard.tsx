import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { today } from "../shared/domain.mjs";
import { won } from "./lib";
import { Modal } from "./ui";
import type { User } from "./types";
import "./admin.css";

type Member = {
  id: string;
  username: string | null;
  email: string | null;
  created_at: string;
  last_seen_at: string | null;
  active: number;
  is_admin: number;
  registered_count: number;
  deleted_count: number;
  active_review_count: number;
  todo_count: number;
  review_done_count: number;
  settled_count: number;
  purchase_total: number;
  received_total: number;
  pending_total: number;
};
type Trend = { day: string; joined: number; active: number; future: boolean };
type HistoryRow = {
  id: number;
  user_id: string;
  username: string | null;
  email: string | null;
  product_name: string;
  platform_name: string;
  event_type: string;
  recorded_at: string;
  review_status_before: string;
  review_status_after: string;
  settlement_status_before: string;
  settlement_status_after: string;
};
type AdminData = {
  month: string;
  updatedAt: string;
  summary: {
    total: number;
    joined: number;
    active: number;
    active30: number;
    reviews: number;
    registered: number;
    completed: number;
    settled: number;
    received: number;
    pending: number;
    monthlyRegistrations: number;
    monthlyDeposits: number;
  };
  trend: Trend[];
  platforms: { name: string; count: number; received: number }[];
  members: { rows: Member[]; total: number; page: number; pages: number };
  recent: HistoryRow[];
};
type Detail = {
  member: Member;
  page: number;
  pages: number;
  reviews: {
    id: string;
    product_name: string;
    platform_name: string;
    review_mode: string;
    review_status: string;
    settlement_status: string;
    purchase_amount: number;
    received_amount: number;
    review_fee: number;
    pending_total: number;
    created_at: string;
  }[];
};
class AccessError extends Error {}
async function fetchAdmin<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`/api/admin/${path}`, { signal });
  if (response.status === 401 || response.status === 403)
    throw new AccessError(
      "관리자 로그인이 필요합니다. 권한을 확인한 뒤 다시 로그인해 주세요.",
    );
  if (!response.ok)
    throw new Error("정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  return response.json();
}
const date = (value: string | null, time = false) =>
  value
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "2-digit",
        day: "2-digit",
        ...(time
          ? { hour: "2-digit", minute: "2-digit" }
          : { year: "numeric" }),
      }).format(new Date(value))
    : "기록 없음";
const identity = (member: { username: string | null; email: string | null }) =>
  member.username || member.email || "소셜 회원";
const eventLabel = (row: HistoryRow) =>
  row.event_type === "created"
    ? "상품 등록"
    : row.event_type === "deleted"
      ? "상품 삭제"
      : row.settlement_status_after === "done" &&
          row.settlement_status_before !== "done"
        ? "정산 완료"
        : row.review_status_after === "done" &&
            row.review_status_before !== "done"
          ? "리뷰 완료"
          : "정보 수정";
function initialFilters() {
  const p = new URLSearchParams(location.search);
  const month = p.get("adminMonth") || today().slice(0, 7);
  return {
    month:
      /^20\d{2}-(0[1-9]|1[0-2])$/.test(month) && month <= today().slice(0, 7)
        ? month
        : today().slice(0, 7),
    q: (p.get("adminQ") || "").slice(0, 100),
    status: ["active", "new"].includes(p.get("adminStatus") || "")
      ? p.get("adminStatus")!
      : "all",
    sort: ["reviews", "received", "joined"].includes(p.get("adminSort") || "")
      ? p.get("adminSort")!
      : "recent",
    page: 1,
  };
}

function MemberTrend({ data }: { data: Trend[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720),
    [selected, setSelected] = useState<string>("");
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(260, entry.contentRect.width)),
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const available = data.filter((d) => !d.future);
  const value =
    available.find((d) => d.day === selected) || available.at(-1) || data[0];
  const max = Math.max(
    4,
    Math.ceil(
      Math.max(...available.map((d) => Math.max(d.active, d.joined)), 0) / 4,
    ) * 4,
  );
  const x = (i: number) =>
    32 + (i / Math.max(1, data.length - 1)) * (width - 48);
  const y = (n: number) => 178 - (n / max) * 152;
  const line = (key: "active" | "joined") =>
    available.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d[key])}`).join(" ");
  return (
    <div className="admin-trend" ref={ref}>
      <div className="admin-chart-key">
        <span>
          <i className="admin-key-active" />
          활성 회원
        </span>
        <span>
          <i className="admin-key-joined" />
          신규 가입
        </span>
        <small>일별 · 명</small>
      </div>
      <svg
        width="100%"
        height="210"
        viewBox={`0 0 ${width} 210`}
        role="img"
        aria-label="선택 월 일별 활성 회원과 신규 가입 추이. 아래 날짜 선택과 일별 데이터에서도 정확한 값을 확인할 수 있습니다."
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line
              x1="32"
              y1={y((max * i) / 4)}
              x2={width - 16}
              y2={y((max * i) / 4)}
              className="admin-gridline"
            />
            <text x="24" y={y((max * i) / 4) + 4} textAnchor="end">
              {(max * i) / 4}
            </text>
          </g>
        ))}
        {data.map(
          (d, i) =>
            (i === 0 ||
              ((i + 1) % 7 === 0 &&
                (width > 480 || data.length - i - 1 >= 4)) ||
              i === data.length - 1) && (
              <text key={d.day} x={x(i)} y="201" textAnchor="middle">
                {i + 1}일
              </text>
            ),
        )}
        <path d={line("active")} className="admin-line-active" />
        <path d={line("joined")} className="admin-line-joined" />
        {value && (
          <line
            x1={x(data.indexOf(value))}
            x2={x(data.indexOf(value))}
            y1="20"
            y2="178"
            className="admin-chart-cursor"
          />
        )}
        {available.map((d, i) => (
          <g key={d.day}>
            <circle
              cx={x(i)}
              cy={y(d.active)}
              r="3"
              className="admin-point-active"
            />
            <circle
              cx={x(i)}
              cy={y(d.joined)}
              r="3"
              className="admin-point-joined"
            />
            <rect
              x={x(i) - Math.max(6, (width - 48) / data.length / 2)}
              y="15"
              width={Math.max(12, (width - 48) / data.length)}
              height="170"
              fill="transparent"
              onPointerEnter={() => setSelected(d.day)}
              onClick={() => setSelected(d.day)}
            >
              <title>
                {d.day}: 활성 {d.active}명, 신규 {d.joined}명
              </title>
            </rect>
          </g>
        ))}
      </svg>
      <div className="admin-chart-values">
        <label>
          날짜{" "}
          <select
            aria-label="추이 날짜 선택"
            value={value?.day || ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {available.map((d) => (
              <option key={d.day} value={d.day}>
                {d.day.slice(5).replace("-", ".")}.
              </option>
            ))}
          </select>
        </label>
        <span>
          활성 <b>{won(value?.active || 0)}명</b>
        </span>
        <span>
          신규 <b>{won(value?.joined || 0)}명</b>
        </span>
      </div>
      <details className="admin-data-alternative">
        <summary>일별 데이터 보기</summary>
        <table>
          <thead>
            <tr>
              <th>날짜</th>
              <th>활성 회원</th>
              <th>신규 가입</th>
            </tr>
          </thead>
          <tbody>
            {available.map((d) => (
              <tr key={d.day}>
                <td>{d.day}</td>
                <td>{d.active}명</td>
                <td>{d.joined}명</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function MemberDetail({
  id,
  onClose,
  onDenied,
}: {
  id: string;
  onClose: () => void;
  onDenied: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null),
    [error, setError] = useState(""),
    [page, setPage] = useState(1);
  useEffect(() => {
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 20000);
    setDetail(null);
    setError("");
    void fetchAdmin<Detail>(
      `members/${encodeURIComponent(id)}?page=${page}`,
      controller.signal,
    )
      .then(setDetail)
      .catch((e) => {
        if (e instanceof AccessError) onDenied();
        else
          setError(
            e.name === "AbortError"
              ? "연결이 지연되고 있습니다. 닫은 뒤 다시 시도해 주세요."
              : e.message,
          );
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [id, page, onDenied]);
  return (
    <Modal
      title="회원별 이용 내역"
      onClose={onClose}
      wide
      className="admin-detail-modal"
    >
      <div className="modal-body admin-detail-body">
        {error ? (
          <p role="alert">{error}</p>
        ) : !detail ? (
          <p role="status">불러오는 중…</p>
        ) : (
          <>
            <div className="admin-member-heading">
              <h3>{identity(detail.member)}</h3>
              <p>
                {detail.member.email}
                {detail.member.email ? " · " : ""}가입{" "}
                {date(detail.member.created_at)}
              </p>
              <small>회원 ID {detail.member.id}</small>
            </div>
            <div className="admin-detail-kpis">
              <span>
                누적 등록 <b>{won(detail.member.registered_count)}건</b>
              </span>
              <span>
                현재 상품 <b>{won(detail.member.active_review_count)}건</b>
              </span>
              <span>
                리뷰 완료 <b>{won(detail.member.review_done_count)}건</b>
              </span>
              <span>
                정산 완료 <b>{won(detail.member.settled_count)}건</b>
              </span>
              <span>
                누적 입금 <b>{won(detail.member.received_total)}원</b>
              </span>
              <span>
                받을 금액 <b>{won(detail.member.pending_total)}원</b>
              </span>
            </div>
            <p className="admin-note">
              현재 보관 중인 상품 기준 · 삭제된 상품{" "}
              {won(detail.member.deleted_count)}건은 누적 등록 건수에만
              포함됩니다.
            </p>
            <div
              className="admin-table-scroll"
              tabIndex={0}
              role="region"
              aria-label="회원 상품 내역"
            >
              <table>
                <thead>
                  <tr>
                    <th>상품 / 플랫폼</th>
                    <th>리뷰 타입</th>
                    <th>진행 상태</th>
                    <th>구매금액</th>
                    <th>입금액</th>
                    <th>받을 금액</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.reviews.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.product_name}</strong>
                        <small>
                          {r.platform_name} · {date(r.created_at)}
                        </small>
                      </td>
                      <td>{r.review_mode || "미지정"}</td>
                      <td>
                        {r.review_status === "done" ? "리뷰 완료" : "작성 전"}
                        <small>
                          {{
                            done: "정산 완료",
                            partial: "부분 입금",
                            pending: "입금 대기",
                            none: "정산 없음",
                          }[r.settlement_status] || r.settlement_status}
                        </small>
                      </td>
                      <td>{won(r.purchase_amount)}원</td>
                      <td>{won(r.received_amount)}원</td>
                      <td>{won(r.pending_total)}원</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!detail.reviews.length && (
              <p className="admin-empty">등록된 상품이 없습니다.</p>
            )}
            <div className="admin-pagination">
              <span>
                {detail.page} / {detail.pages}
              </span>
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                aria-label="이전 상품 페이지"
              >
                <ChevronLeft size={17} />
              </button>
              <button
                disabled={page >= detail.pages}
                onClick={() => setPage(page + 1)}
                aria-label="다음 상품 페이지"
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </>
        )}
      </div>
      <div className="modal-footer">
        <button className="button secondary" onClick={onClose}>
          닫기
        </button>
      </div>
    </Modal>
  );
}

export default function AdminDashboard({
  user,
  onBack,
  onLogout,
}: {
  user: User;
  onBack: () => void;
  onLogout: () => void;
}) {
  const [filters, setFilters] = useState(initialFilters),
    [draft, setDraft] = useState(filters.q),
    [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [refresh, setRefresh] = useState(0),
    [selected, setSelected] = useState<string | null>(null),
    [denied, setDenied] = useState(!user.isAdmin);
  const [offline, setOffline] = useState(!navigator.onLine);
  const deny = useRef(() => {
    setDenied(true);
    setData(null);
    setSelected(null);
  });
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    for (const [key, value] of Object.entries({
      adminMonth: filters.month,
      adminQ: filters.q,
      adminStatus: filters.status,
      adminSort: filters.sort,
    }))
      value ? p.set(key, value) : p.delete(key);
    p.set("view", "admin");
    history.replaceState(null, "", `?${p}`);
  }, [filters]);
  useEffect(() => {
    const restore = () => {
      const next = initialFilters();
      setFilters(next);
      setDraft(next.q);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    if (denied) return;
    let alive = true,
      controller: AbortController | undefined;
    setData(null);
    async function load() {
      controller?.abort();
      controller = new AbortController();
      const current = controller,
        timeout = setTimeout(() => current.abort(), 20000);
      setLoading(true);
      try {
        const result = await fetchAdmin<AdminData>(
          `dashboard?${new URLSearchParams({ month: filters.month, q: filters.q, status: filters.status, sort: filters.sort, page: String(filters.page) })}`,
          current.signal,
        );
        if (alive && current === controller) {
          setData(result);
          setError("");
          setOffline(false);
        }
      } catch (e) {
        if (alive && current === controller) {
          if (e instanceof AccessError) deny.current();
          else
            setError(
              "갱신하지 못했습니다. 마지막 조회 결과를 표시합니다. 연결을 확인한 뒤 새로고침해 주세요.",
            );
        }
      } finally {
        clearTimeout(timeout);
        if (alive && current === controller) setLoading(false);
      }
    }
    void load();
    const periodic = setInterval(() => {
      if (!document.hidden && navigator.onLine) void load();
    }, 60000);
    const reconnect = () => {
        setOffline(false);
        void load();
      },
      disconnect = () => setOffline(true);
    const visible = () => {
      if (!document.hidden && navigator.onLine) void load();
    };
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", disconnect);
    document.addEventListener("visibilitychange", visible);
    return () => {
      alive = false;
      controller?.abort();
      clearInterval(periodic);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", disconnect);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [filters, refresh, denied]);
  const change = (patch: Partial<typeof filters>) => {
    setSelected(null);
    setFilters({ ...filters, ...patch, page: 1 });
  };
  const s = data?.summary,
    monthLabel = `${Number(filters.month.slice(5))}월`;
  return (
    <div className="admin-app">
      <a className="skip-link" href="#admin-main">
        관리자 본문으로 이동
      </a>
      <header className="admin-header">
        <div className="admin-brand">
          <span>
            <ShieldCheck size={22} />
          </span>
          <b>
            For Reviewer <em>Admin</em>
          </b>
        </div>
        <div className="admin-header-actions">
          <span className="admin-login-name">{identity(user)}</span>
          <button onClick={onBack}>
            <ArrowLeft size={15} />내 워크스페이스
          </button>
          <button onClick={onLogout}>
            <LogOut size={15} />
            로그아웃
          </button>
        </div>
      </header>
      <main id="admin-main" className="admin-main">
        {denied ? (
          <section className="admin-denied">
            <ShieldCheck size={36} />
            <h1>관리자 전용 대시보드</h1>
            <p>이 계정에는 관리자 접근 권한이 없습니다.</p>
            <button onClick={onLogout}>다른 계정으로 로그인</button>
          </section>
        ) : (
          <>
            <div className="admin-heading">
              <div>
                <div className="admin-eyebrow">
                  운영 현황 <span>관리자 전용</span>
                </div>
                <h1>회원과 리뷰, 한눈에.</h1>
                <p>회원 성장부터 리뷰 활동과 정산 현황까지 확인하세요.</p>
              </div>
              <div className="admin-period">
                <label>
                  조회 월
                  <input
                    aria-label="조회 월"
                    type="month"
                    value={filters.month}
                    min="2020-01"
                    max={today().slice(0, 7)}
                    onChange={(e) => {
                      if (
                        /^20\d{2}-(0[1-9]|1[0-2])$/.test(e.target.value) &&
                        e.target.value <= today().slice(0, 7)
                      )
                        change({ month: e.target.value });
                    }}
                  />
                </label>
                <button
                  onClick={() => setRefresh((v) => v + 1)}
                  disabled={loading}
                  aria-label="관리자 현황 새로고침"
                >
                  <RefreshCw size={16} className={loading ? "spin" : ""} />
                  새로고침
                </button>
              </div>
            </div>
            <div className="admin-update">
              <i className={offline || error ? "is-stale" : ""} />
              {offline
                ? "오프라인 · 마지막 조회 결과"
                : error
                  ? "갱신 지연"
                  : data
                    ? `갱신 ${date(data.updatedAt, true)}`
                    : "조회 중"}
              <span>한국 시간 · 60초마다 갱신</span>
            </div>
            {(error || offline) && (
              <div className="admin-alert" role="alert">
                {offline
                  ? "인터넷 연결이 끊어졌습니다. 연결되면 자동으로 다시 조회합니다."
                  : error}
              </div>
            )}
            {!data ? (
              <div className="admin-empty" role="status">
                {loading
                  ? "운영 현황을 불러오고 있습니다…"
                  : "조회할 수 없습니다. 새로고침해 주세요."}
              </div>
            ) : (
              <>
                <section
                  className="admin-kpis"
                  aria-label="회원과 리뷰 핵심 지표"
                >
                  {[
                    {
                      label: "전체 회원",
                      value: s!.total,
                      unit: "명",
                      note: "현재 가입 계정",
                      color: "blue",
                    },
                    {
                      label: `${monthLabel} 신규 가입`,
                      value: s!.joined,
                      unit: "명",
                      note: `${filters.month} 가입`,
                      color: "mint",
                    },
                    {
                      label: `${monthLabel} 활성 회원`,
                      value: s!.active,
                      unit: "명",
                      note: `최근 30일 ${won(s!.active30)}명`,
                      color: "purple",
                    },
                    {
                      label: `${monthLabel} 상품 등록`,
                      value: s!.monthlyRegistrations,
                      unit: "건",
                      note: `현재 보관 ${won(s!.reviews)}건`,
                      color: "blue",
                    },
                    {
                      label: "리뷰 완료",
                      value: s!.completed,
                      unit: "건",
                      note: "현재 상품의 완료 상태",
                      color: "mint",
                    },
                    {
                      label: "정산 완료",
                      value: s!.settled,
                      unit: "건",
                      note: `현재 입금 합계 ${won(s!.received)}원`,
                      color: "amber",
                    },
                  ].map((k) => (
                    <article className={`admin-kpi ${k.color}`} key={k.label}>
                      <h2>{k.label}</h2>
                      <strong>
                        {won(k.value)}
                        <small>{k.unit}</small>
                      </strong>
                      <p>{k.note}</p>
                    </article>
                  ))}
                </section>
                <div className="admin-overview-grid">
                  <section className="admin-panel">
                    <div className="admin-panel-title">
                      <h2>
                        <Activity size={17} />
                        {monthLabel} 회원 활동 추이
                      </h2>
                      <span>월간 활성 {won(s!.active)}명</span>
                    </div>
                    <div className="admin-panel-body">
                      <MemberTrend data={data.trend} />
                    </div>
                  </section>
                  <section className="admin-panel">
                    <div className="admin-panel-title">
                      <h2>플랫폼별 이용 현황</h2>
                      <span>현재 상품</span>
                    </div>
                    <div className="admin-platforms">
                      {data.platforms.length ? (
                        data.platforms.map((p) => (
                          <div key={p.name}>
                            <div>
                              <span>{p.name || "미지정"}</span>
                              <b>
                                {won(p.count)}
                                <small>건</small>
                              </b>
                            </div>
                            <div className="admin-platform-track">
                              <i
                                style={{
                                  width: `${s!.reviews ? (p.count / s!.reviews) * 100 : 0}%`,
                                }}
                              />
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="admin-empty">등록된 상품이 없습니다.</p>
                      )}
                    </div>
                    <div className="admin-money-strip">
                      <div>
                        <span>{monthLabel} 입금액</span>
                        <strong>
                          {won(s!.monthlyDeposits)}
                          <small>원</small>
                        </strong>
                      </div>
                      <div>
                        <span>현재 받을 금액</span>
                        <strong>
                          {won(s!.pending)}
                          <small>원</small>
                        </strong>
                      </div>
                    </div>
                  </section>
                </div>
                <div className="admin-lower-grid">
                  <section className="admin-panel admin-members">
                    <div className="admin-panel-title">
                      <h2>
                        <Users size={17} />
                        회원별 이용 현황{" "}
                        <span>{won(data.members.total)}명</span>
                      </h2>
                      <span>상품·정산은 현재 누적</span>
                    </div>
                    <div className="admin-member-tools">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          change({ q: draft });
                        }}
                      >
                        <label className="admin-search">
                          <Search size={16} />
                          <input
                            aria-label="회원 검색"
                            placeholder="아이디, 이메일 검색"
                            value={draft}
                            maxLength={100}
                            onChange={(e) => setDraft(e.target.value)}
                          />
                        </label>
                        <button type="submit">검색</button>
                        {filters.q && (
                          <button
                            type="button"
                            aria-label="회원 검색 초기화"
                            onClick={() => {
                              setDraft("");
                              change({ q: "" });
                            }}
                          >
                            <X size={15} />
                          </button>
                        )}
                      </form>
                      <div>
                        <select
                          aria-label="회원 필터"
                          value={filters.status}
                          onChange={(e) => change({ status: e.target.value })}
                        >
                          <option value="all">전체 회원</option>
                          <option value="active">{monthLabel} 활성 회원</option>
                          <option value="new">{monthLabel} 신규 회원</option>
                        </select>
                        <select
                          aria-label="회원 정렬"
                          value={filters.sort}
                          onChange={(e) => change({ sort: e.target.value })}
                        >
                          <option value="recent">최근 활동순</option>
                          <option value="joined">최근 가입순</option>
                          <option value="reviews">상품 많은순</option>
                          <option value="received">입금액 높은순</option>
                        </select>
                      </div>
                    </div>
                    <div
                      className="admin-table-scroll admin-member-desktop"
                      role="region"
                      aria-label="회원별 이용 현황 표"
                      tabIndex={0}
                    >
                      <table>
                        <thead>
                          <tr>
                            <th>회원</th>
                            <th>가입일</th>
                            <th>최근 활동</th>
                            <th>월간 활동</th>
                            <th>상품</th>
                            <th>리뷰 완료</th>
                            <th>정산 완료</th>
                            <th>입금액</th>
                            <th>받을 금액</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.members.rows.map((m) => (
                            <tr key={m.id}>
                              <td>
                                <button
                                  className="admin-member-link"
                                  onClick={() => setSelected(m.id)}
                                >
                                  {identity(m)}
                                  {m.is_admin === 1 && (
                                    <span className="admin-role">관리자</span>
                                  )}
                                </button>
                                {m.email && m.username && (
                                  <small>{m.email}</small>
                                )}
                              </td>
                              <td>{date(m.created_at)}</td>
                              <td>{date(m.last_seen_at, true)}</td>
                              <td>
                                <span
                                  className={`admin-status ${m.active ? "is-active" : ""}`}
                                >
                                  {m.active ? "활성" : "기록 없음"}
                                </span>
                              </td>
                              <td>{won(m.active_review_count)}</td>
                              <td>{won(m.review_done_count)}</td>
                              <td>{won(m.settled_count)}</td>
                              <td>{won(m.received_total)}원</td>
                              <td>{won(m.pending_total)}원</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="admin-member-mobile">
                      {data.members.rows.map((m) => (
                        <button
                          key={m.id}
                          className="admin-member-card"
                          onClick={() => setSelected(m.id)}
                        >
                          <div>
                            <strong>{identity(m)}</strong>
                            <span
                              className={`admin-status ${m.active ? "is-active" : ""}`}
                            >
                              {m.active ? "활성" : "기록 없음"}
                            </span>
                          </div>
                          <small>최근 활동 {date(m.last_seen_at, true)}</small>
                          <div className="admin-member-card-stats">
                            <span>
                              상품 <b>{won(m.active_review_count)}</b>
                            </span>
                            <span>
                              리뷰 완료 <b>{won(m.review_done_count)}</b>
                            </span>
                            <span>
                              정산 완료 <b>{won(m.settled_count)}</b>
                            </span>
                          </div>
                          <div>
                            <span>입금액</span>
                            <b>{won(m.received_total)}원</b>
                          </div>
                        </button>
                      ))}
                    </div>
                    {!data.members.rows.length && (
                      <p className="admin-empty">
                        조건에 맞는 회원이 없습니다.
                      </p>
                    )}
                    <div className="admin-pagination">
                      <span>
                        {won(data.members.total)}명 · {data.members.page} /{" "}
                        {data.members.pages} 페이지
                      </span>
                      <button
                        aria-label="이전 회원 페이지"
                        disabled={data.members.page <= 1}
                        onClick={() =>
                          setFilters({
                            ...filters,
                            page: data.members.page - 1,
                          })
                        }
                      >
                        <ChevronLeft size={17} />
                      </button>
                      <button
                        aria-label="다음 회원 페이지"
                        disabled={data.members.page >= data.members.pages}
                        onClick={() =>
                          setFilters({
                            ...filters,
                            page: data.members.page + 1,
                          })
                        }
                      >
                        <ChevronRight size={17} />
                      </button>
                    </div>
                  </section>
                  <section className="admin-panel">
                    <div className="admin-panel-title">
                      <h2>최근 리뷰 활동</h2>
                      <span>전체 기간 · 최근 8건</span>
                    </div>
                    <div className="admin-events">
                      {data.recent.length ? (
                        data.recent.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => setSelected(r.user_id)}
                          >
                            <div>
                              <span className="admin-event-label">
                                {eventLabel(r)}
                              </span>
                              <time>{date(r.recorded_at, true)}</time>
                            </div>
                            <strong>{r.product_name}</strong>
                            <small>
                              {identity(r)} · {r.platform_name}
                            </small>
                          </button>
                        ))
                      ) : (
                        <p className="admin-empty">
                          아직 리뷰 활동이 없습니다.
                        </p>
                      )}
                    </div>
                  </section>
                </div>
                <footer className="admin-footnote">
                  <p>
                    활성 회원은 해당 기간에 로그인하거나 인증된 서비스를 이용한
                    회원입니다. 같은 회원은 월 합계에서 한 번만 집계됩니다.
                  </p>
                  <p>
                    활동 수집 도입 전 기간은 보유 중인 로그인·리뷰 변경 기록
                    기준입니다. 월 입금액은 현재 입금 기록의 입금일 기준이며,
                    삭제·정정한 기록은 합계에서 제외됩니다.
                    주소·전화번호·계좌번호는 이 화면에 표시하지 않습니다.
                  </p>
                </footer>
              </>
            )}
          </>
        )}
      </main>
      {selected && !denied && (
        <MemberDetail
          key={selected}
          id={selected}
          onClose={() => setSelected(null)}
          onDenied={deny.current}
        />
      )}
    </div>
  );
}
