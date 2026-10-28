import { randomUUID } from "node:crypto";
import {
  templateSchema,
  templateGroupSchema,
  starterTemplates,
} from "../shared/templates.mjs";
export function registerTemplateRoutes(app, db) {
  const decode = (row) => ({
    groupId: "",
    ...JSON.parse(row.data),
    id: row.id,
    isStarter: starterTemplates.some((t) => t.id === row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  });
  const starter = (t) => ({
    ...t,
    groupId: "",
    isStarter: true,
    createdAt: null,
    updatedAt: null,
    version: 0,
  });
  const find = async (userId, id) => {
    const row = await db
      .prepare("SELECT * FROM review_templates WHERE user_id=? AND id=?")
      .get(userId, id);
    const base = starterTemplates.find((t) => t.id === id);
    return row ? decode(row) : base ? starter(base) : null;
  };
  const ownsGroup = async (userId, groupId) =>
    !groupId ||
    !!(await db
      .prepare("SELECT id FROM template_groups WHERE user_id=? AND id=?")
      .get(userId, groupId));
  app.post("/api/template-groups", async (req, res) => {
    const parsed = templateGroupSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.issues[0].message });
    const { name } = parsed.data;
    if (
      await db
        .prepare("SELECT id FROM template_groups WHERE user_id=? AND name=?")
        .get(req.user.id, name)
    )
      return res.status(409).json({
        error: "같은 이름의 그룹이 있어요. 다른 이름을 입력해 주세요.",
      });
    const group = {
      id: randomUUID(),
      name,
      createdAt: new Date().toISOString(),
    };
    await db
      .prepare(
        "INSERT INTO template_groups (id,user_id,name,created_at) VALUES(?,?,?,?)",
      )
      .run(group.id, req.user.id, name, group.createdAt);
    res.status(201).json({ group });
  });
  app.get("/api/templates", async (req, res) => {
    const saved = (
      await db
        .prepare(
          "SELECT * FROM review_templates WHERE user_id=? ORDER BY created_at DESC, rowid DESC",
        )
        .all(req.user.id)
    ).map(decode);
    res.json({
      groups: await db
        .prepare(
          'SELECT id,name,created_at AS "createdAt" FROM template_groups WHERE user_id=? ORDER BY created_at, rowid',
        )
        .all(req.user.id),
      templates: [
        ...saved.filter((t) => !t.isStarter),
        ...starterTemplates.map(
          (t) => saved.find((s) => s.id === t.id) || starter(t),
        ),
      ],
    });
  });
  app.post("/api/templates", async (req, res) => {
    const parsed = templateSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.issues[0].message });
    if (!(await ownsGroup(req.user.id, parsed.data.groupId)))
      return res.status(400).json({
        error:
          "선택한 그룹을 사용할 수 없습니다. 그룹 목록을 새로고침해 주세요.",
      });
    const id = randomUUID(),
      now = new Date().toISOString();
    await db
      .prepare(
        "INSERT INTO review_templates (id,user_id,data,created_at,updated_at,version) VALUES(?,?,?,?,?,1)",
      )
      .run(id, req.user.id, JSON.stringify(parsed.data), now, now);
    res.status(201).json({ template: await find(req.user.id, id) });
  });
  app.put("/api/templates/:id", async (req, res) => {
    const current = await find(req.user.id, req.params.id);
    if (!current)
      return res.status(404).json({ error: "템플릿을 찾을 수 없습니다." });
    if (req.body?.version !== current.version)
      return res.status(409).json({
        error:
          "다른 화면에서 수정된 템플릿입니다. 입력 내용을 복사한 뒤 닫고 새로고침해 주세요.",
      });
    const parsed = templateSchema.safeParse({
      ...req.body,
      groupId:
        req.body?.groupId === undefined ? current.groupId : req.body.groupId,
    });
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.issues[0].message });
    if (!(await ownsGroup(req.user.id, parsed.data.groupId)))
      return res.status(400).json({
        error:
          "선택한 그룹을 사용할 수 없습니다. 그룹 목록을 새로고침해 주세요.",
      });
    const now = new Date().toISOString();
    // Compare the saved version atomically, including first edits of starter templates.
    const updated = await db
      .prepare(
        `INSERT INTO review_templates (id,user_id,data,created_at,updated_at,version) VALUES(?,?,?,?,?,?)
      ON CONFLICT(user_id,id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at,version=excluded.version WHERE review_templates.version=?`,
      )
      .run(
        current.id,
        req.user.id,
        JSON.stringify(parsed.data),
        current.createdAt || now,
        now,
        current.version + 1,
        current.version,
      );
    if (!updated.changes)
      return res
        .status(409)
        .json({
          error:
            "다른 화면에서 수정된 템플릿입니다. 새로고침 후 확인해 주세요.",
        });
    res.json({ template: await find(req.user.id, current.id) });
  });
}
