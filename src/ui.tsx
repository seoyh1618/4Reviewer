import {
  useEffect,
  useRef,
  useId,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import {
  X,
  MessageSquare,
  Check,
  Package,
  Image,
  Star,
  Video,
  FileText,
  ShoppingBag,
  ChevronRight,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react";
import { settlement, daysUntil } from "../shared/domain.mjs";
import type { Review } from "./types";
export function PageHeading({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="page-heading">
      <span className="page-heading-icon" aria-hidden="true">
        <Icon size={22} strokeWidth={1.6} focusable="false" />
      </span>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`logo ${small ? "small" : ""}`}>
      <span className="brand-mark">
        <MessageSquare size={23} />
        <Check size={12} className="brand-check" />
      </span>
      {!small && (
        <span>
          For <b>Reviewer</b>
        </span>
      )}
    </div>
  );
}
export function Button({
  children,
  variant = "secondary",
  busy = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`button ${variant} ${className}`}
    >
      {busy && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    const focus = document.activeElement as HTMLElement;
    dialog?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const cancel = (e: Event) => {
      e.preventDefault();
      closeRef.current();
    };
    dialog?.addEventListener("cancel", cancel);
    return () => {
      dialog?.close();
      document.body.style.overflow = old;
      dialog?.removeEventListener("cancel", cancel);
      focus?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""} ${className}`}
      aria-labelledby={id}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-header">
        <div>
          <h2 id={id}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="icon-button" aria-label="닫기" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Platform({ name }: { name: string }) {
  const initials: Record<string, string> = {
    쿠팡: "C",
    네이버: "N",
    "11번가": "11",
    기타: "S",
  };
  return (
    <span className="platform">
      <span className={`platform-dot platform-${initials[name] || "S"}`}>
        {initials[name] || "S"}
      </span>
      <span className="platform-name" title={name}>
        {name}
      </span>
    </span>
  );
}
export function ReviewBadge({ item }: { item: Review }) {
  return (
    <span
      className={`badge ${item.reviewStatus === "done" ? "success" : "neutral"}`}
    >
      {item.reviewStatus === "done" ? (
        <Check size={12} />
      ) : (
        <span className="tiny-dot" />
      )}
      {item.reviewStatus === "done" ? "리뷰 완료" : "작성 전"}
    </span>
  );
}
export function PaybackBadge({
  item,
}: {
  item: Pick<
    Review,
    | "price"
    | "paybackMode"
    | "expectedPayback"
    | "additionalReviewFee"
    | "receivedAmount"
  >;
}) {
  const s = settlement(item);
  return (
    <span
      className={`badge ${{ done: "success", partial: "blue", pending: "warning", none: "neutral" }[s]}`}
    >
      {s === "done" && <Check size={12} />}
      {
        {
          done: "입금 완료",
          partial: "부분 입금",
          pending: "입금 대기",
          none: "정산 없음",
        }[s]
      }
    </span>
  );
}
export function DueBadge({ date }: { date: string }) {
  const d = daysUntil(date);
  if (d === null) return <span className="muted">마감 미정</span>;
  return (
    <span
      className={`badge ${d < 0 ? "danger" : d <= 2 ? "warning" : "neutral"}`}
    >
      {d < 0 ? `${-d}일 지남` : d === 0 ? "오늘 마감" : `D-${d}`}
    </span>
  );
}
export function TypeIcon({ type, size = 15 }: { type: string; size?: number }) {
  const Icon =
    type === "사진 리뷰"
      ? Image
      : type === "별점 리뷰"
        ? Star
        : type === "동영상 리뷰"
          ? Video
          : type === "구매만"
            ? ShoppingBag
            : FileText;
  return <Icon size={size} />;
}
export function ProductIcon({
  platform,
  index = 0,
}: {
  platform: string;
  index?: number;
}) {
  return (
    <span className={`product-icon tone-${index % 4}`}>
      <Package size={21} />
      <span className="product-dot" title={platform} />
    </span>
  );
}
export function Empty({
  title = "등록된 상품이 없습니다",
  description = "첫 상품을 등록하고 리뷰 관리를 시작해 보세요.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span>
        <Package size={30} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function SectionTitle({
  title,
  note,
  action,
}: {
  title: string;
  note?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {note && <p>{note}</p>}
      </div>
      {action}
    </div>
  );
}
export function TextLink({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      <ChevronRight size={15} />
    </button>
  );
}
