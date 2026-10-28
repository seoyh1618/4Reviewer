import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Check,
  Copy,
  FileText,
  Files,
  Folder,
  FolderPlus,
  Image,
  LayoutTemplate,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import {
  templateSchema,
  templateGroupSchema,
  templateTypes,
} from "../shared/templates.mjs";
import { api } from "./lib";
import { Button, Modal, PageHeading } from "./ui";
import type {
  ReviewTemplate,
  ReviewTemplateInput,
  TemplateGroup,
} from "./types";

async function copyContent(content: string) {
  if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
  await navigator.clipboard.writeText(content);
}

export default function ReviewTemplates({
  refreshKey,
  onLoadingChange,
  onNotify,
}: {
  refreshKey: number;
  onLoadingChange: (loading: boolean) => void;
  onNotify: (message: string) => void;
}) {
  const [templates, setTemplates] = useState<ReviewTemplate[]>([]);
  const [groups, setGroups] = useState<TemplateGroup[]>([]);
  const [groupFilter, setGroupFilter] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [synced, setSynced] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [editor, setEditor] = useState<{ item?: ReviewTemplate } | null>(null);
  const [copyFallback, setCopyFallback] = useState<ReviewTemplate | null>(null);
  const [copied, setCopied] = useState("");
  const [copying, setCopying] = useState("");
  const counter = useRef(0),
    alive = useRef(true),
    copyingRef = useRef(false);
  const load = useCallback(async () => {
    const run = ++counter.current;
    setLoading(true);
    try {
      const response = await api<{
        templates: ReviewTemplate[];
        groups: TemplateGroup[];
      }>("/templates");
      if (!alive.current || run !== counter.current) return;
      setTemplates(response.templates);
      setGroups(response.groups || []);
      setError("");
      setSynced(
        new Date().toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Seoul",
        }),
      );
    } catch (e) {
      if (alive.current && run === counter.current)
        setError((e as Error).message);
    } finally {
      if (alive.current && run === counter.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      counter.current++;
    };
  }, [load, refreshKey]);
  useEffect(() => {
    window.addEventListener("online", load);
    return () => {
      window.removeEventListener("online", load);
    };
  }, [load]);
  useEffect(() => {
    onLoadingChange(loading);
    return () => onLoadingChange(false);
  }, [loading, onLoadingChange]);
  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(""), 2200);
      return () => clearTimeout(timer);
    }
  }, [copied]);
  async function save(data: ReviewTemplateInput) {
    const old = editor?.item;
    const response = await api<{ template: ReviewTemplate }>(
      old ? `/templates/${old.id}` : "/templates",
      old ? "PUT" : "POST",
      { ...data, ...(old ? { version: old.version } : {}) },
    );
    if (!alive.current) return;
    counter.current++;
    setLoading(false);
    setTemplates((list) =>
      old
        ? list.map((t) => (t.id === old.id ? response.template : t))
        : [response.template, ...list],
    );
    setEditor(null);
    setSearch("");
    setType("");
    setGroupFilter(data.groupId || "ungrouped");
    setCopied("");
    onNotify("템플릿을 저장했어요.");
    void load();
  }
  async function createGroup(name: string) {
    const response = await api<{ group: TemplateGroup }>(
      "/template-groups",
      "POST",
      { name },
    );
    if (!alive.current) return;
    counter.current++;
    setLoading(false);
    setGroups((list) => [...list, response.group]);
    setGroupFilter(response.group.id);
    setSearch("");
    setType("");
    setCreatingGroup(false);
    onNotify("템플릿 그룹을 만들었어요.");
    void load();
  }
  async function copy(item: ReviewTemplate) {
    if (copyingRef.current) return;
    copyingRef.current = true;
    setCopying(item.id);
    try {
      await copyContent(item.content);
      if (!alive.current) return;
      setCopied(item.id);
      onNotify("리뷰 내용을 복사했어요.");
    } catch {
      if (alive.current) setCopyFallback(item);
    } finally {
      copyingRef.current = false;
      if (alive.current) setCopying("");
    }
  }
  const filtered = templates.filter(
    (t) =>
      (!groupFilter ||
        (groupFilter === "ungrouped"
          ? !t.groupId
          : t.groupId === groupFilter)) &&
      (!type || type === t.reviewType) &&
      `${t.title} ${t.content}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <section className="templates-page" aria-label="리뷰 템플릿 목록">
      <div className="page-title">
        <PageHeading
          icon={Files}
          title="리뷰 템플릿"
          subtitle="자주 쓰는 리뷰 문구를 저장하고 간편하게 복사하세요."
        />
        <Button variant="primary" onClick={() => setEditor({})}>
          <Plus size={16} />새 템플릿
        </Button>
      </div>
      <div className="template-groups">
        <div className="template-groups-heading">
          <h2>
            <Folder size={17} />
            템플릿 그룹
          </h2>
          <Button disabled={loading} onClick={() => setCreatingGroup(true)}>
            <FolderPlus size={15} />
            그룹 만들기
          </Button>
        </div>
        <div
          className="template-group-filters"
          role="group"
          aria-label="템플릿 그룹 필터"
        >
          {[
            { id: "", name: "전체 그룹", count: templates.length },
            {
              id: "ungrouped",
              name: "미분류",
              count: templates.filter((t) => !t.groupId).length,
            },
            ...groups.map((g) => ({
              ...g,
              count: templates.filter((t) => t.groupId === g.id).length,
            })),
          ].map((g) => (
            <button
              key={g.id}
              aria-label={`${g.name} (${g.count})`}
              aria-pressed={groupFilter === g.id}
              onClick={() => setGroupFilter(g.id)}
            >
              <span>{g.name}</span>
              <span className="template-group-count">{g.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="template-toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="템플릿 검색"
            placeholder="템플릿 이름, 내용 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div
          className="template-filters"
          role="group"
          aria-label="리뷰 유형 필터"
        >
          {["", ...templateTypes].map((value) => (
            <button
              key={value}
              aria-pressed={type === value}
              onClick={() => setType(value)}
            >
              {value || "전체"}
            </button>
          ))}
        </div>
      </div>
      <div className="template-guidance">
        <LayoutTemplate size={17} />
        <span>
          <b>[대괄호]</b> 안을 실제 사용 경험으로 채운 뒤 복사하세요.
        </span>
      </div>
      {error && (
        <div className="connection-alert" role="alert">
          <span>{error}</span>
          <Button busy={loading} onClick={() => void load()}>
            다시 시도
          </Button>
        </div>
      )}
      {loading && !synced ? (
        <div className="skeleton-grid" aria-label="템플릿 불러오는 중">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} />
          ))}
        </div>
      ) : (
        <>
          <div className="template-list-meta">
            템플릿 <strong>{filtered.length}</strong>개
          </div>
          <div className="template-grid">
            {filtered.map((item) => (
              <article
                className="template-card"
                key={item.id}
                aria-label={item.title}
              >
                <div className="template-card-top">
                  <span className="template-type">
                    {item.reviewType === "사진 리뷰" ? (
                      <Image size={14} />
                    ) : (
                      <FileText size={14} />
                    )}
                    {item.reviewType}
                  </span>
                  <span className="template-origin">
                    {item.isStarter ? "기본 템플릿" : "내 템플릿"}
                  </span>
                </div>
                <span className="template-card-group">
                  <Folder size={12} />
                  {groups.find((g) => g.id === item.groupId)?.name || "미분류"}
                </span>
                <h2>{item.title}</h2>
                <p className="template-preview">{item.content}</p>
                <div className="template-card-footer">
                  <span>{item.content.length.toLocaleString()}자</span>
                  <Button onClick={() => setEditor({ item })}>
                    <Pencil size={14} />
                    수정
                  </Button>
                  <Button
                    className="template-copy-button"
                    busy={copying === item.id}
                    disabled={!!copying}
                    onClick={() => void copy(item)}
                  >
                    {copied === item.id ? (
                      <Check size={15} />
                    ) : (
                      <Copy size={15} />
                    )}
                    {copied === item.id ? "복사됨" : "복사"}
                  </Button>
                </div>
              </article>
            ))}
          </div>
          {!filtered.length && (
            <div className="template-empty">
              <Search size={28} />
              <h2>
                {groupFilter && !search && !type
                  ? "이 그룹에 템플릿이 없습니다"
                  : "검색 결과가 없습니다"}
              </h2>
              {groupFilter && !search && !type && (
                <Button variant="primary" onClick={() => setEditor({})}>
                  이 그룹에 템플릿 추가
                </Button>
              )}
              <Button
                onClick={() => {
                  setSearch("");
                  setType("");
                  setGroupFilter("");
                }}
              >
                전체 템플릿 보기
              </Button>
            </div>
          )}
        </>
      )}
      {synced && (
        <div className="sync-status">
          <span className={error ? "stale-dot" : "sync-dot"} />
          {synced} 템플릿 동기화 · 한국 시간
        </div>
      )}
      {editor && (
        <TemplateEditor
          item={editor.item}
          groups={groups}
          initialGroupId={
            groups.some((g) => g.id === groupFilter) ? groupFilter : ""
          }
          onSave={save}
          onClose={() => setEditor(null)}
          onNotify={onNotify}
        />
      )}
      {creatingGroup && (
        <TemplateGroupEditor
          onSave={createGroup}
          onClose={() => setCreatingGroup(false)}
        />
      )}
      {copyFallback && (
        <ManualCopy item={copyFallback} onClose={() => setCopyFallback(null)} />
      )}
    </section>
  );
}

function TemplateEditor({
  item,
  groups,
  initialGroupId,
  onSave,
  onClose,
  onNotify,
}: {
  item?: ReviewTemplate;
  groups: TemplateGroup[];
  initialGroupId: string;
  onSave: (data: ReviewTemplateInput) => Promise<void>;
  onClose: () => void;
  onNotify: (message: string) => void;
}) {
  const [title, setTitle] = useState(item?.title || "");
  const [groupId, setGroupId] = useState(item?.groupId ?? initialGroupId);
  const [reviewType, setReviewType] = useState<
    ReviewTemplateInput["reviewType"]
  >(item?.reviewType || "텍스트 리뷰");
  const [content, setContent] = useState(item?.content || "");
  const [error, setError] = useState("");
  const [copyError, setCopyError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const saving = useRef(false),
    body = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 2200);
      return () => clearTimeout(timer);
    }
  }, [copied]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving.current) return;
    const parsed = templateSchema.safeParse({
      title,
      reviewType,
      content,
      groupId,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await onSave(parsed.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function copyDraft() {
    setCopying(true);
    setCopyError(false);
    try {
      await copyContent(content);
      setCopied(true);
      onNotify("입력한 리뷰 내용을 복사했어요.");
    } catch {
      setCopyError(true);
      body.current?.focus();
      body.current?.select();
    } finally {
      setCopying(false);
    }
  }
  return (
    <Modal
      title={item ? "템플릿 수정" : "새 템플릿"}
      onClose={() => {
        if (!saving.current) onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="modal-body template-editor">
          <fieldset disabled={busy} className="stage-fields">
            <div className="form-grid">
              <label>
                템플릿 이름
                <input
                  aria-label="템플릿 이름"
                  value={title}
                  maxLength={60}
                  required
                  placeholder="예: 나의 사진 리뷰"
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label>
                리뷰 유형
                <select
                  aria-label="리뷰 유형"
                  value={reviewType}
                  onChange={(e) =>
                    setReviewType(
                      e.target.value as ReviewTemplateInput["reviewType"],
                    )
                  }
                >
                  {templateTypes.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="span-2">
                템플릿 그룹
                <select
                  aria-label="템플릿 그룹"
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                >
                  <option value="">미분류</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <small>
                  그룹은 템플릿 목록의 ‘그룹 만들기’에서 추가할 수 있어요.
                </small>
              </label>
              <label className="span-2">
                리뷰 내용
                <textarea
                  ref={body}
                  aria-label="리뷰 내용"
                  aria-describedby="template-content-hint"
                  value={content}
                  maxLength={5000}
                  required
                  rows={12}
                  placeholder="자주 사용하는 리뷰 문구를 입력하세요."
                  onChange={(e) => {
                    setContent(e.target.value);
                    setCopied(false);
                  }}
                />
              </label>
            </div>
          </fieldset>
          <div className="template-editor-hint" id="template-content-hint">
            <span>[대괄호]를 실제 경험으로 바꿔 주세요.</span>
            <span>{content.length.toLocaleString()} / 5,000자</span>
          </div>
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
          {copyError && (
            <p className="template-copy-help" role="alert">
              자동 복사를 사용할 수 없어요. 선택된 본문을 길게 누르거나
              Ctrl/Cmd+C로 복사해 주세요.
            </p>
          )}
        </div>
        <div className="modal-footer template-editor-footer">
          <Button type="button" disabled={busy} onClick={onClose}>
            취소
          </Button>
          <span className="footer-spacer" />
          <Button
            type="button"
            disabled={busy || !content.trim()}
            busy={copying}
            onClick={() => void copyDraft()}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "복사됨" : "내용 복사"}
          </Button>
          <Button type="submit" variant="primary" busy={busy}>
            저장
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TemplateGroupEditor({
  onSave,
  onClose,
}: {
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving.current) return;
    const parsed = templateGroupSchema.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await onSave(parsed.data.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      title="템플릿 그룹 만들기"
      subtitle="원하는 기준으로 템플릿을 모아보세요."
      onClose={() => {
        if (!saving.current) onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="modal-body template-editor">
          <fieldset disabled={busy} className="stage-fields">
            <div className="form-grid">
              <label className="span-2">
                그룹 이름
                <input
                  aria-label="그룹 이름"
                  value={name}
                  required
                  maxLength={40}
                  placeholder="예: 식품 후기, 뷰티, 자주 쓰는 리뷰"
                  onChange={(e) => setName(e.target.value)}
                />
                <small>
                  그룹을 만든 후 새 템플릿이나 기존 템플릿을 넣을 수 있어요.
                </small>
              </label>
            </div>
          </fieldset>
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <Button type="button" disabled={busy} onClick={onClose}>
            취소
          </Button>
          <span className="footer-spacer" />
          <Button type="submit" variant="primary" busy={busy}>
            그룹 만들기
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ManualCopy({
  item,
  onClose,
}: {
  item: ReviewTemplate;
  onClose: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <Modal title="리뷰 내용 복사" onClose={onClose}>
      <div className="modal-body template-editor">
        <p className="template-copy-help" role="alert">
          자동 복사를 사용할 수 없어요. 본문을 길게 누르거나 Ctrl/Cmd+C로 복사해
          주세요.
        </p>
        <div className="form-grid">
          <label className="span-2">
            {item.title}
            <textarea
              aria-label="복사할 리뷰 내용"
              ref={ref}
              value={item.content}
              readOnly
              rows={12}
              onFocus={(e) => e.target.select()}
            />
          </label>
        </div>
      </div>
      <div className="modal-footer">
        <Button
          onClick={() => {
            ref.current?.focus();
            ref.current?.select();
          }}
        >
          전체 선택
        </Button>
        <span className="footer-spacer" />
        <Button onClick={onClose}>닫기</Button>
      </div>
    </Modal>
  );
}
