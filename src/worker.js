const CHATFOCUS_RELEASE = "V1.19";
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const TEXT_FILE_MIMES = new Set([
  "text/plain", "text/csv", "text/tsv", "text/markdown", "text/html", "text/css",
  "application/json", "application/xml", "text/xml", "application/javascript", "text/javascript"
]);
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const ACCEPTED_DOC_EXT = new Set([
  "pdf","doc","docx","dot","odt","rtf","pages","xls","xlsx","xla","xlb","xlc","xlm","xlt","xlw",
  "csv","tsv","iif","ppt","pptx","pot","ppa","pps","pwz","wiz","key","txt","md","json","xml","html","css","js","ts","py","java","c","cpp","h","hpp","go","rs","rb","php","sql","yaml","yml"
]);

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/api/")) {
        const asset = await env.ASSETS.fetch(request);
        const headers = new Headers(asset.headers);
        if (url.pathname === "/" || url.pathname.endsWith(".html")) {
          headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
          headers.set("Pragma", "no-cache");
          headers.set("Expires", "0");
        } else if (url.pathname.endsWith(".js") || url.pathname.endsWith(".css")) {
          headers.set("Cache-Control", "public, max-age=300, must-revalidate");
        }
        return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
      }
      return await routeApi(request, env, ctx, url);
    } catch (err) {
      console.error(err);
      return json({ error: "Something went wrong.", detail: safeError(err) }, 500);
    }
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runDueScheduledTasks(env));
  }
};

async function routeApi(request, env, ctx, url) {
  const p = url.pathname;
  const m = request.method.toUpperCase();

  if (p === "/api/health") return json({ ok: true, app: env.APP_NAME || "ChatFocus", version: CHATFOCUS_RELEASE, public_model: "CFocus 1.0", model: env.OPENAI_MODEL || "gpt-6-luna" });
  if (p === "/api/auth/signup" && m === "POST") return signup(request, env);
  if (p === "/api/auth/login" && m === "POST") return login(request, env);
  if (p === "/api/auth/logout" && m === "POST") return logout(request, env);

  const auth = await requireUser(request, env);
  if (auth instanceof Response) return auth;
  const { user } = auth;

  if (p === "/api/me" && m === "GET") return json({ user: publicUser(user), settings: await getClientSettings(env) });
  if (p === "/api/me/memory" && m === "PATCH") return updateMyMemory(request, env, user);

  if (p === "/api/library" && m === "GET") return listLibrary(env, user, url);
  if (p === "/api/projects" && m === "GET") return listProjects(env, user);
  if (p === "/api/projects" && m === "POST") return createProject(request, env, user);
  if (p === "/api/schedules" && m === "GET") return listSchedules(env, user);
  if (p === "/api/schedules" && m === "POST") return createSchedule(request, env, user);

  let workspaceMatch = p.match(/^\/api\/projects\/([^/]+)$/);
  if (workspaceMatch) {
    if (m === "GET") return getProject(env, user, workspaceMatch[1]);
    if (m === "PATCH") return patchProject(request, env, user, workspaceMatch[1]);
    if (m === "DELETE") return deleteProject(env, user, workspaceMatch[1]);
  }
  workspaceMatch = p.match(/^\/api\/schedules\/([^/]+)$/);
  if (workspaceMatch) {
    if (m === "PATCH") return patchSchedule(request, env, user, workspaceMatch[1]);
    if (m === "DELETE") return deleteSchedule(env, user, workspaceMatch[1]);
  }

  if (p === "/api/chats" && m === "GET") return listChats(env, user, url);
  if (p === "/api/chats" && m === "POST") return createChat(request, env, user);
  if (p === "/api/uploads" && m === "POST") return uploadFile(request, env, user);
  if (p === "/api/uploads/batch" && m === "POST") return uploadFilesBatch(request, env, user);
  if (p.startsWith("/api/files/") && m === "GET") return getFile(env, user, decodeURIComponent(p.slice("/api/files/".length)));

  let match = p.match(/^\/api\/chats\/([^/]+)\/retitle$/);
  if (match && m === "POST") {
    const chat = await getOwnedChat(env, user.id, match[1]);
    if (!chat) return json({ error: "Chat not found" }, 404);
    await updateChatMetadata(env, user, match[1], true);
    return json({ chat: await getOwnedChat(env, user.id, match[1]) });
  }

  match = p.match(/^\/api\/chats\/([^/]+)\/meta$/);
  if (match && m === "GET") {
    const chat = await getOwnedChat(env, user.id, match[1]);
    return chat ? json({ chat }) : json({ error: "Chat not found" }, 404);
  }

  match = p.match(/^\/api\/chats\/([^/]+)$/);
  if (match) {
    const chatId = match[1];
    if (m === "GET") return getChat(env, user, chatId);
    if (m === "PATCH") return patchChat(request, env, user, chatId);
    if (m === "DELETE") return deleteChat(env, user, chatId);
  }

  match = p.match(/^\/api\/chats\/([^/]+)\/messages$/);
  if (match && m === "POST") return createMessageAndStream(request, env, ctx, user, match[1]);

  match = p.match(/^\/api\/chats\/([^/]+)\/regenerate$/);
  if (match && m === "POST") return regenerateAndStream(request, env, ctx, user, match[1]);

  match = p.match(/^\/api\/messages\/([^/]+)$/);
  if (match && m === "PATCH") return editUserMessage(request, env, user, match[1]);

  if (p === "/api/admin/stats" && m === "GET") return adminStats(env, user);
  if (p === "/api/admin/ai-usage" && m === "GET") return adminAiUsage(env, user, url);
  if (p === "/api/admin/users" && m === "GET") return adminUsers(env, user, url);
  if (p.startsWith("/api/admin/users/") && m === "PATCH") return adminPatchUser(request, env, user, p.split("/").pop());
  if (p === "/api/admin/settings" && m === "GET") return adminGetSettings(env, user);
  if (p === "/api/admin/settings" && m === "PUT") return adminSaveSettings(request, env, user);
  if (p === "/api/admin/rules" && m === "GET") return adminListRules(env, user);
  if (p === "/api/admin/rules" && m === "POST") return adminCreateRule(request, env, user);
  const ruleMatch = p.match(/^\/api\/admin\/rules\/([^/]+)$/);
  if (ruleMatch && m === "PATCH") return adminPatchRule(request, env, user, ruleMatch[1]);
  if (ruleMatch && m === "DELETE") return adminDeleteRule(env, user, ruleMatch[1]);

  return json({ error: "Not found" }, 404);
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

function safeError(err) {
  const text = String(err?.message || err || "Unknown error");
  return text.slice(0, 500);
}

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, memory_enabled: !!u.memory_enabled, created_at: u.created_at };
}

async function parseJson(request) {
  try { return await request.json(); } catch { throw new Error("Invalid JSON body"); }
}

function normalizeEmail(v) { return String(v || "").trim().toLowerCase(); }
function cleanName(v) { return String(v || "").trim().replace(/\s+/g, " ").slice(0, 80); }
function cleanText(v, max = 60000) { return String(v || "").replace(/\u0000/g, "").slice(0, max); }

async function getSetting(env, key, fallback = "") {
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key=?").bind(key).first();
  return row?.value ?? fallback;
}

async function getClientSettings(env) {
  const rows = await env.DB.prepare("SELECT key,value FROM app_settings WHERE key IN ('memory_enabled','web_search_enabled','image_detail','max_pins','service_enabled','daily_request_limit','image_uploads_enabled','daily_image_upload_limit','max_image_upload_mb')").all();
  const map = Object.fromEntries((rows.results || []).map(r => [r.key, r.value]));
  return {
    memory_enabled: map.memory_enabled !== "false",
    web_search_enabled: map.web_search_enabled === "true",
    image_detail: map.image_detail || "low",
    max_pins: Number(map.max_pins || 5),
    service_enabled: map.service_enabled !== "false",
    daily_request_limit: Number(map.daily_request_limit || 100),
    image_uploads_enabled: map.image_uploads_enabled !== "false",
    daily_image_upload_limit: Number(map.daily_image_upload_limit || 20),
    max_image_upload_mb: Number(map.max_image_upload_mb || env.MAX_UPLOAD_MB || 18)
  };
}

async function getDailyUsageState(env, user) {
  const [settings, countRow] = await Promise.all([
    env.DB.prepare("SELECT key,value FROM app_settings WHERE key IN ('service_enabled','daily_request_limit')").all(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM usage_events WHERE user_id=? AND created_at>=date('now') AND request_kind IN ('chat','scheduled')").bind(user.id).first()
  ]);
  const map = Object.fromEntries((settings.results || []).map(r => [r.key, r.value]));
  const globalLimit = Math.max(0, Number(map.daily_request_limit || 100));
  const override = user.daily_limit_override === null || user.daily_limit_override === undefined ? null : Math.max(0, Number(user.daily_limit_override));
  const unlimited = user.role === "admin" || Number(user.unlimited_usage || 0) === 1 || (override === 0) || (override === null && globalLimit === 0);
  const limit = override === null ? globalLimit : override;
  const used = Number(countRow?.c || 0);
  return { service_enabled: map.service_enabled !== "false", used, limit, unlimited, remaining: unlimited ? null : Math.max(0, limit - used) };
}

async function ensureAiAccess(env, user) {
  const state = await getDailyUsageState(env, user);
  if (!state.service_enabled && user.role !== "admin") return { ok:false, response:json({ error:"ChatFocus is temporarily unavailable. Please try again later.", code:"service_disabled" },503), state };
  if (!state.unlimited && state.used >= state.limit) return { ok:false, response:json({ error:`You have reached today's ChatFocus limit of ${state.limit} AI requests.`, code:"daily_limit_reached", usage:state },429), state };
  return { ok:true, state };
}

async function getImageUploadState(env, user) {
  const [settings, countRow] = await Promise.all([
    env.DB.prepare("SELECT key,value FROM app_settings WHERE key IN ('image_uploads_enabled','daily_image_upload_limit','max_image_upload_mb')").all(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM attachments WHERE user_id=? AND mime_type LIKE 'image/%' AND created_at>=date('now')").bind(user.id).first()
  ]);
  const map = Object.fromEntries((settings.results || []).map(r => [r.key, r.value]));
  const globalLimit = Math.max(0, Number(map.daily_image_upload_limit || 20));
  const override = user.daily_image_limit_override === null || user.daily_image_limit_override === undefined ? null : Math.max(0, Number(user.daily_image_limit_override));
  const unlimited = user.role === "admin" || override === 0 || (override === null && globalLimit === 0);
  const limit = override === null ? globalLimit : override;
  const used = Number(countRow?.c || 0);
  const maxMb = Math.min(100, Math.max(1, Number(map.max_image_upload_mb || env.MAX_UPLOAD_MB || 18)));
  return { enabled: map.image_uploads_enabled !== "false", used, limit, unlimited, remaining: unlimited ? null : Math.max(0, limit - used), max_mb: maxMb };
}

async function hashPassword(password, saltB64 = null) {
  const salt = saltB64 ? b64ToBytes(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, material, 256);
  return { hash: bytesToB64(new Uint8Array(bits)), salt: bytesToB64(salt) };
}

function bytesToB64(bytes) {
  let out = "";
  const chunk = 0x6000;
  for (let i = 0; i < bytes.length; i += chunk) out += btoa(String.fromCharCode(...bytes.subarray(i, i + chunk)));
  return out;
}
function b64ToBytes(s) {
  const raw = atob(s); const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function constantEqual(a, b) {
  if (a.length !== b.length) return false;
  let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

function cookieValue(request, key) {
  const c = request.headers.get("cookie") || "";
  const item = c.split(";").map(x => x.trim()).find(x => x.startsWith(key + "="));
  return item ? decodeURIComponent(item.slice(key.length + 1)) : null;
}

async function requireUser(request, env) {
  const sessionId = cookieValue(request, "cf_session");
  if (!sessionId) return json({ error: "Unauthorized" }, 401);
  const user = await env.DB.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at > datetime('now') LIMIT 1`).bind(sessionId).first();
  if (!user) return json({ error: "Session expired" }, 401, { "set-cookie": clearSessionCookie() });
  if (user.status !== "active") return json({ error: "Account suspended" }, 403);
  await env.DB.prepare("UPDATE users SET last_seen_at=CURRENT_TIMESTAMP WHERE id=?").bind(user.id).run();
  return { user, sessionId };
}

function sessionCookie(id, days) {
  const seconds = Math.max(1, Number(days || 30)) * 86400;
  return `cf_session=${encodeURIComponent(id)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
}
function clearSessionCookie() { return "cf_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"; }

async function signup(request, env) {
  const enabled = await getSetting(env, "signups_enabled", "true");
  if (enabled !== "true") return json({ error: "New account registration is currently closed." }, 403);
  const body = await parseJson(request);
  const name = cleanName(body.name), email = normalizeEmail(body.email), password = String(body.password || "");
  if (name.length < 2) return json({ error: "Enter your name." }, 400);
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
  if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
  const exists = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
  if (exists) return json({ error: "An account with this email already exists." }, 409);
  const count = await env.DB.prepare("SELECT COUNT(*) AS c FROM users").first();
  const role = (env.ADMIN_EMAIL && normalizeEmail(env.ADMIN_EMAIL) === email) || Number(count?.c || 0) === 0 ? "admin" : "user";
  const id = crypto.randomUUID();
  const hp = await hashPassword(password);
  await env.DB.prepare("INSERT INTO users(id,name,email,password_hash,password_salt,role) VALUES(?,?,?,?,?,?)").bind(id, name, email, hp.hash, hp.salt, role).run();
  const session = await createSession(env, id);
  const user = await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(id).first();
  return json({ user: publicUser(user) }, 201, { "set-cookie": sessionCookie(session, env.SESSION_DAYS) });
}

async function login(request, env) {
  const body = await parseJson(request);
  const email = normalizeEmail(body.email), password = String(body.password || "");
  const user = await env.DB.prepare("SELECT * FROM users WHERE email=?").bind(email).first();
  if (!user) return json({ error: "Invalid email or password." }, 401);
  const hp = await hashPassword(password, user.password_salt);
  if (!constantEqual(hp.hash, user.password_hash)) return json({ error: "Invalid email or password." }, 401);
  if (user.status !== "active") return json({ error: "This account is suspended." }, 403);
  const session = await createSession(env, user.id);
  return json({ user: publicUser(user) }, 200, { "set-cookie": sessionCookie(session, env.SESSION_DAYS) });
}

async function createSession(env, userId) {
  const id = crypto.randomUUID();
  const days = Math.max(1, Number(env.SESSION_DAYS || 30));
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
  await env.DB.prepare("INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,datetime('now', ?))").bind(id, userId, `+${days} days`).run();
  return id;
}

async function logout(request, env) {
  const id = cookieValue(request, "cf_session");
  if (id) await env.DB.prepare("DELETE FROM sessions WHERE id=?").bind(id).run();
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
}

async function updateMyMemory(request, env, user) {
  const body = await parseJson(request); const enabled = body.enabled ? 1 : 0;
  await env.DB.prepare("UPDATE users SET memory_enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(enabled, user.id).run();
  return json({ ok: true, memory_enabled: !!enabled });
}

async function listChats(env, user, url) {
  const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const rows = q
    ? await env.DB.prepare("SELECT * FROM chats WHERE user_id=? AND archived=0 AND title LIKE ? ORDER BY pinned DESC, updated_at DESC LIMIT 200").bind(user.id, `%${q}%`).all()
    : await env.DB.prepare("SELECT * FROM chats WHERE user_id=? AND archived=0 ORDER BY pinned DESC, updated_at DESC LIMIT 200").bind(user.id).all();
  return json({ chats: rows.results || [] });
}

async function createChat(request, env, user) {
  let title = "New chat", projectId = null, autoTitle = 1;
  try {
    const body = await request.json();
    if (body?.title) { title = cleanText(body.title, 90).trim() || title; autoTitle = 0; }
    if (body?.project_id) {
      const project = await env.DB.prepare("SELECT id FROM projects WHERE id=? AND user_id=?").bind(String(body.project_id), user.id).first();
      if (project) projectId = project.id;
    }
  } catch {}
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO chats(id,user_id,title,project_id,auto_title) VALUES(?,?,?,?,?)").bind(id, user.id, title, projectId, autoTitle).run();
  return json({ chat: await env.DB.prepare("SELECT * FROM chats WHERE id=?").bind(id).first() }, 201);
}

async function getOwnedChat(env, userId, chatId) {
  return env.DB.prepare("SELECT * FROM chats WHERE id=? AND user_id=?").bind(chatId, userId).first();
}

async function getChat(env, user, chatId) {
  const chat = await getOwnedChat(env, user.id, chatId);
  if (!chat) return json({ error: "Chat not found" }, 404);
  const messages = await env.DB.prepare("SELECT rowid AS seq,* FROM messages WHERE chat_id=? ORDER BY rowid ASC").bind(chatId).all();
  const atts = await env.DB.prepare("SELECT id,message_id,filename,mime_type,size_bytes,created_at FROM attachments WHERE chat_id=? AND message_id IS NOT NULL ORDER BY created_at ASC").bind(chatId).all();
  const byMsg = {};
  for (const a of atts.results || []) (byMsg[a.message_id] ||= []).push(a);
  const result = (messages.results || []).map(x => ({ ...x, attachments: byMsg[x.id] || [] }));
  return json({ chat, messages: result });
}

async function patchChat(request, env, user, chatId) {
  const chat = await getOwnedChat(env, user.id, chatId);
  if (!chat) return json({ error: "Chat not found" }, 404);
  const body = await parseJson(request);
  if (typeof body.title === "string") {
    const title = cleanText(body.title, 90).trim() || "Untitled chat";
    await env.DB.prepare("UPDATE chats SET title=?,auto_title=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(title, chatId, user.id).run();
  }
  if (Object.prototype.hasOwnProperty.call(body, "project_id")) {
    let projectId = body.project_id ? String(body.project_id) : null;
    if (projectId) {
      const project = await env.DB.prepare("SELECT id FROM projects WHERE id=? AND user_id=?").bind(projectId, user.id).first();
      if (!project) return json({ error: "Project not found" }, 404);
    }
    await env.DB.prepare("UPDATE chats SET project_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(projectId, chatId, user.id).run();
  }
  if (typeof body.pinned === "boolean") {
    if (body.pinned && !chat.pinned) {
      const maxPins = Number(await getSetting(env, "max_pins", "5"));
      const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM chats WHERE user_id=? AND pinned=1").bind(user.id).first();
      if (Number(row?.c || 0) >= maxPins) return json({ error: `You can pin up to ${maxPins} chats.` }, 409);
    }
    await env.DB.prepare("UPDATE chats SET pinned=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(body.pinned ? 1 : 0, chatId, user.id).run();
  }
  return json({ chat: await getOwnedChat(env, user.id, chatId) });
}

async function deleteChat(env, user, chatId) {
  const chat = await getOwnedChat(env, user.id, chatId); if (!chat) return json({ error: "Chat not found" }, 404);
  const files = await env.DB.prepare("SELECT r2_key FROM attachments WHERE chat_id=? AND user_id=?").bind(chatId, user.id).all();
  await env.DB.prepare("DELETE FROM chats WHERE id=? AND user_id=?").bind(chatId, user.id).run();
  await Promise.all((files.results || []).map(f => env.FILES.delete(f.r2_key).catch(() => null)));
  return json({ ok: true });
}

function fileExt(name) { const x = String(name || "").toLowerCase().split("."); return x.length > 1 ? x.pop() : ""; }
function acceptedFile(file) { return IMAGE_MIMES.has(file.type) || TEXT_FILE_MIMES.has(file.type) || ACCEPTED_DOC_EXT.has(fileExt(file.name)); }

async function uploadFile(request, env, user) {
  const form = await request.formData();
  const file = form.get("file"); const chatId = String(form.get("chat_id") || "");
  if (!(file instanceof File)) return json({ error: "Choose a file to upload." }, 400);
  const chat = await getOwnedChat(env, user.id, chatId); if (!chat) return json({ error: "Chat not found" }, 404);
  if (!acceptedFile(file)) return json({ error: "This file type is not supported yet." }, 415);
  const isImage = (file.type || "").startsWith("image/");
  let maxMb = Number(env.MAX_UPLOAD_MB || 18);
  if (isImage) {
    const imageState = await getImageUploadState(env, user);
    if (!imageState.enabled && user.role !== "admin") return json({ error: "Image uploads are currently disabled by the ChatFocus administrator.", code: "image_uploads_disabled" }, 403);
    if (!imageState.unlimited && imageState.used >= imageState.limit) return json({ error: `You have reached today's image upload limit of ${imageState.limit}.`, code: "daily_image_limit_reached", usage: imageState }, 429);
    maxMb = imageState.max_mb;
  }
  const maxBytes = maxMb * 1024 * 1024;
  if (file.size > maxBytes) return json({ error: `${isImage ? "Each image" : "Each file"} must be ${maxMb} MB or smaller.` }, 413);
  const id = crypto.randomUUID();
  const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120) || "file";
  const key = `${user.id}/${chatId}/${id}-${safe}`;
  await env.FILES.put(key, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" }, customMetadata: { originalName: file.name } });
  await env.DB.prepare("INSERT INTO attachments(id,user_id,chat_id,r2_key,filename,mime_type,size_bytes) VALUES(?,?,?,?,?,?,?)")
    .bind(id,user.id,chatId,key,file.name,file.type || "application/octet-stream",file.size).run();
  return json({ attachment: { id, filename: file.name, mime_type: file.type || "application/octet-stream", size_bytes: file.size, url: `/api/files/${id}` } }, 201);
}


async function uploadFilesBatch(request, env, user) {
  const form = await request.formData();
  const files = form.getAll("file").filter(x => x instanceof File);
  const clientIds = form.getAll("client_id").map(String);
  const chatId = String(form.get("chat_id") || "");
  if (!files.length) return json({ error: "Choose one or more files to upload." }, 400);
  if (files.length > 8) return json({ error: "Upload up to 8 files per batch." }, 400);
  const chat = await getOwnedChat(env, user.id, chatId);
  if (!chat) return json({ error: "Chat not found" }, 404);

  const imageState = await getImageUploadState(env, user);
  let imageUsed = imageState.used;
  const results = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const client_id = clientIds[i] || `file-${i}`;
    try {
      if (!acceptedFile(file)) { results.push({ client_id, ok:false, error:"This file type is not supported yet.", status:415 }); continue; }
      const isImage = (file.type || "").startsWith("image/");
      let maxMb = Number(env.MAX_UPLOAD_MB || 18);
      if (isImage) {
        if (!imageState.enabled && user.role !== "admin") { results.push({ client_id, ok:false, error:"Image uploads are currently disabled by the ChatFocus administrator.", status:403, code:"image_uploads_disabled" }); continue; }
        if (!imageState.unlimited && imageUsed >= imageState.limit) { results.push({ client_id, ok:false, error:`You have reached today's image upload limit of ${imageState.limit}.`, status:429, code:"daily_image_limit_reached" }); continue; }
        maxMb = imageState.max_mb;
      }
      if (file.size > maxMb * 1024 * 1024) { results.push({ client_id, ok:false, error:`${isImage ? "Each image" : "Each file"} must be ${maxMb} MB or smaller.`, status:413 }); continue; }

      const id = crypto.randomUUID();
      const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120) || "file";
      const key = `${user.id}/${chatId}/${id}-${safe}`;
      await env.FILES.put(key, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" }, customMetadata: { originalName: file.name } });
      await env.DB.prepare("INSERT INTO attachments(id,user_id,chat_id,r2_key,filename,mime_type,size_bytes) VALUES(?,?,?,?,?,?,?)")
        .bind(id,user.id,chatId,key,file.name,file.type || "application/octet-stream",file.size).run();
      if (isImage) imageUsed++;
      results.push({ client_id, ok:true, attachment:{ id, filename:file.name, mime_type:file.type || "application/octet-stream", size_bytes:file.size, url:`/api/files/${id}` } });
    } catch (err) {
      console.error("Batch upload file failed", file?.name, err);
      results.push({ client_id, ok:false, error:"Upload failed. Please try again.", status:500 });
    }
  }

  return json({ results, usage:{ ...imageState, used:imageUsed, remaining:imageState.unlimited ? null : Math.max(0, imageState.limit - imageUsed) } }, 207);
}

async function getFile(env, user, id) {
  const a = await env.DB.prepare("SELECT * FROM attachments WHERE id=? AND user_id=?").bind(id,user.id).first();
  if (!a) return json({ error: "File not found" }, 404);
  const obj = await env.FILES.get(a.r2_key); if (!obj) return json({ error: "File missing from storage" }, 404);
  return new Response(obj.body, { headers: { "content-type": a.mime_type, "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(a.filename)}`, "cache-control": "private, max-age=3600" } });
}

async function createMessageAndStream(request, env, ctx, user, chatId) {
  const access = await ensureAiAccess(env, user); if (!access.ok) return access.response;
  const chat = await getOwnedChat(env,user.id,chatId); if (!chat) return json({ error: "Chat not found" }, 404);
  const body = await parseJson(request);
  const text = cleanText(body.content || "", 60000).trim();
  const attachmentIds = Array.isArray(body.attachment_ids) ? body.attachment_ids.slice(0, 50).map(String) : [];
  if (!text && !attachmentIds.length) return json({ error: "Write a message or attach a file." }, 400);
  if (attachmentIds.length) {
    const placeholders = attachmentIds.map(() => "?").join(",");
    const rows = await env.DB.prepare(`SELECT id FROM attachments WHERE user_id=? AND chat_id=? AND message_id IS NULL AND id IN (${placeholders})`).bind(user.id,chatId,...attachmentIds).all();
    if ((rows.results || []).length !== attachmentIds.length) return json({ error: "One or more attachments are invalid." }, 400);
  }
  const msgId = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO messages(id,chat_id,user_id,role,content) VALUES(?,?,?,?,?)").bind(msgId,chatId,user.id,"user",text).run();
  if (attachmentIds.length) {
    const placeholders = attachmentIds.map(() => "?").join(",");
    await env.DB.prepare(`UPDATE attachments SET message_id=? WHERE user_id=? AND chat_id=? AND id IN (${placeholders})`).bind(msgId,user.id,chatId,...attachmentIds).run();
  }
  await env.DB.prepare("UPDATE chats SET updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(chatId).run();
  return streamAssistant(env, ctx, user, chatId, msgId, !!body.web_search, !!body.intelligence);
}

async function editUserMessage(request, env, user, messageId) {
  const msg = await env.DB.prepare(`SELECT m.rowid AS seq,m.* FROM messages m JOIN chats c ON c.id=m.chat_id WHERE m.id=? AND m.user_id=? AND c.user_id=?`).bind(messageId,user.id,user.id).first();
  if (!msg || msg.role !== "user") return json({ error: "User message not found" }, 404);
  const body = await parseJson(request); const content = cleanText(body.content || "", 60000).trim();
  if (!content) return json({ error: "Message cannot be empty." }, 400);
  const orphanFiles = await env.DB.prepare("SELECT a.r2_key FROM attachments a JOIN messages m ON m.id=a.message_id WHERE m.chat_id=? AND m.rowid > ?").bind(msg.chat_id,msg.seq).all();
  await env.DB.batch([
    env.DB.prepare("UPDATE messages SET content=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(content,messageId),
    env.DB.prepare("DELETE FROM messages WHERE chat_id=? AND rowid > ?").bind(msg.chat_id,msg.seq),
    env.DB.prepare("UPDATE chats SET updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(msg.chat_id)
  ]);
  for (const f of orphanFiles.results || []) await env.FILES.delete(f.r2_key).catch(() => null);
  return json({ ok: true, chat_id: msg.chat_id, message_id: messageId });
}

async function regenerateAndStream(request, env, ctx, user, chatId) {
  const access = await ensureAiAccess(env, user); if (!access.ok) return access.response;
  const chat = await getOwnedChat(env,user.id,chatId); if (!chat) return json({ error: "Chat not found" }, 404);
  const body = await parseJson(request);
  let userMsg;
  if (body.user_message_id) {
    userMsg = await env.DB.prepare("SELECT rowid AS seq,* FROM messages WHERE id=? AND chat_id=? AND user_id=? AND role='user'").bind(String(body.user_message_id),chatId,user.id).first();
  } else {
    userMsg = await env.DB.prepare("SELECT rowid AS seq,* FROM messages WHERE chat_id=? AND user_id=? AND role='user' ORDER BY rowid DESC LIMIT 1").bind(chatId,user.id).first();
  }
  if (!userMsg) return json({ error: "No user message to regenerate from." }, 400);
  await env.DB.prepare("DELETE FROM messages WHERE chat_id=? AND rowid > ?").bind(chatId,userMsg.seq).run();
  await env.DB.prepare("UPDATE chats SET updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(chatId).run();
  return streamAssistant(env, ctx, user, chatId, userMsg.id, !!body.web_search, !!body.intelligence);
}

function readUsageNumbers(usage) {
  const input = Number(usage?.input_tokens || 0);
  const output = Number(usage?.output_tokens || 0);
  const cached = Math.min(input, Math.max(0, Number(usage?.input_tokens_details?.cached_tokens || usage?.input_tokens_details?.cached_input_tokens || 0)));
  return { input, output, cached, total: Number(usage?.total_tokens || input + output) };
}

function estimateLunaStandardCost(usage, webSearchCalls = 0) {
  const { input, output, cached } = readUsageNumbers(usage);
  const longContext = input > 272000;
  const inputRate = longContext ? 0.20 : 0.10;
  const cachedRate = longContext ? 0.02 : 0.01;
  const outputRate = longContext ? 0.75 : 0.50;
  const tokenCost = (((Math.max(0, input - cached)) * inputRate) + (cached * cachedRate) + (output * outputRate)) / 1000000;
  return tokenCost + (Math.max(0, Number(webSearchCalls || 0)) * 0.01);
}

function countWebSearchCalls(response) {
  return (response?.output || []).filter(x => x?.type === "web_search_call").length;
}

async function logUsageEvent(env, { userId, chatId = null, usage, imageCount = 0, requestKind = "chat", webSearchCalls = 0, responseId = null }) {
  if (!usage || !userId) return;
  const n = readUsageNumbers(usage);
  const cost = estimateLunaStandardCost(usage, webSearchCalls);
  await env.DB.prepare(`INSERT INTO usage_events(id,user_id,chat_id,model,input_tokens,cached_input_tokens,output_tokens,total_tokens,estimated_cost_usd,image_count,request_kind,web_search_calls,response_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(), userId, chatId, env.OPENAI_MODEL || "gpt-6-luna", n.input, n.cached, n.output, n.total, cost, Math.max(0, Number(imageCount || 0)), requestKind, Math.max(0, Number(webSearchCalls || 0)), responseId)
    .run();
}

async function streamAssistant(env, ctx, user, chatId, latestUserMsgId, requestedWeb, requestedIntelligence) {
  if (!env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY is not configured on the server." }, 503);
  const responseStartedAt = Date.now();
  const assistantId = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO messages(id,chat_id,user_id,role,content,status,parent_message_id) VALUES(?,?,?,?,?,?,?)").bind(assistantId,chatId,user.id,"assistant","","streaming",latestUserMsgId).run();
  try {
    const { input, instructions, imageCount } = await buildOpenAIContext(env, user, chatId, { intelligence: requestedIntelligence, web: requestedWeb });
    const webAllowed = (await getSetting(env,"web_search_enabled","false")) === "true";
    const payload = {
      model: env.OPENAI_MODEL || "gpt-6-luna",
      instructions,
      input,
      reasoning: { effort: requestedIntelligence ? "high" : "low" },
      max_output_tokens: 12000,
      stream: true,
      store: false
    };
    if (requestedWeb && webAllowed) { payload.tools = [{ type: "web_search" }]; payload.tool_choice = "required"; }

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "authorization": `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text();
      await env.DB.prepare("UPDATE messages SET status='error',content=? WHERE id=?").bind(`API error: ${text.slice(0,500)}`,assistantId).run();
      return json({ error: "The AI service returned an error.", detail: text.slice(0,800) }, 502);
    }

    const encoder = new TextEncoder();
    let finalText = ""; let usage = null; let responseId = null; let webSearchCalls = 0;
    const bodyStream = new ReadableStream({
      async start(controller) {
        const reader = upstream.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
        const send = obj => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        send({ type: "start", message_id: assistantId });
        try {
          while (true) {
            const { done, value } = await reader.read(); if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n"); buffer = lines.pop() || "";
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const raw = line.slice(5).trim(); if (!raw || raw === "[DONE]") continue;
              let evt; try { evt = JSON.parse(raw); } catch { continue; }
              const type = evt.type || "";
              if (type === "response.output_text.delta" && typeof evt.delta === "string") {
                finalText += evt.delta; send({ type: "delta", delta: evt.delta });
              } else if (type === "response.completed") {
                responseId = evt.response?.id || null; usage = evt.response?.usage || null; webSearchCalls = countWebSearchCalls(evt.response);
              } else if (type === "response.failed" || type === "error") {
                send({ type: "error", error: evt.error?.message || evt.response?.error?.message || "Generation failed." });
              }
            }
          }
          if (!finalText.trim()) finalText = "I couldn't produce a response for that request. Please try again.";
          const responseTimeMs = Math.max(1, Date.now() - responseStartedAt);
          await env.DB.prepare("UPDATE messages SET content=?,status='complete',response_time_ms=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(finalText,responseTimeMs,assistantId).run();
          await env.DB.prepare("UPDATE chats SET updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(chatId).run();
          if (usage) {
            await logUsageEvent(env,{ userId:user.id, chatId, usage, imageCount, requestKind:"chat", webSearchCalls, responseId });
          }
          send({ type: "done", message_id: assistantId, response_id: responseId, usage, response_time_ms: responseTimeMs });
          ctx.waitUntil(updateChatMetadata(env,user,chatId).catch(console.error));
          controller.close();
        } catch (err) {
          await env.DB.prepare("UPDATE messages SET content=?,status='error',response_time_ms=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(finalText || "Generation interrupted.",Math.max(1,Date.now()-responseStartedAt),assistantId).run().catch(()=>null);
          send({ type: "error", error: safeError(err) }); controller.close();
        }
      }
    });
    return new Response(bodyStream, { headers: { "content-type":"application/x-ndjson; charset=utf-8", "cache-control":"no-cache, no-transform", "x-accel-buffering":"no" } });
  } catch (err) {
    await env.DB.prepare("UPDATE messages SET status='error',content=?,response_time_ms=? WHERE id=?").bind(safeError(err),Math.max(1,Date.now()-responseStartedAt),assistantId).run().catch(()=>null);
    return json({ error: safeError(err) }, 500);
  }
}

async function buildOpenAIContext(env, user, chatId, runtime = {}) {
  const basePrompt = await getSetting(env,"system_prompt","You are ChatFocus, a capable multimodal assistant.");
  const memoryGlobal = (await getSetting(env,"memory_enabled","true")) !== "false";
  let memory = "";
  if (memoryGlobal && user.memory_enabled) {
    const summaries = await env.DB.prepare("SELECT c.title,s.summary,s.updated_at FROM chat_summaries s JOIN chats c ON c.id=s.chat_id WHERE s.user_id=? AND s.chat_id<>? AND s.summary<>'' ORDER BY s.updated_at DESC LIMIT 10").bind(user.id,chatId).all();
    if ((summaries.results || []).length) {
      memory = "\n\nUseful context from this user's other saved conversations. Use only when relevant and do not claim certainty beyond it:\n" + summaries.results.map(x => `- ${x.title}: ${x.summary}`).join("\n");
    }
  }
  const intelligenceOn = runtime.intelligence === true;
  const webOn = runtime.web === true;
  const ownerRulesEnabled = (await getSetting(env,"owner_rules_enabled","true")) !== "false";
  const openResponseMode = (await getSetting(env,"open_response_mode","true")) !== "false";
  let ownerRules = "";
  if (ownerRulesEnabled) {
    const rules = await env.DB.prepare("SELECT title,rule_text FROM service_rules WHERE enabled=1 ORDER BY updated_at DESC,created_at DESC LIMIT 80").all();
    if ((rules.results || []).length) ownerRules = "\n\nOwner-defined ChatFocus service rules. Apply these as product-level instructions when relevant:\n" + rules.results.map((r,i)=>`${i+1}. ${r.title}: ${r.rule_text}`).join("\n");
  }
  const openness = openResponseMode ? "\n\nOpen response mode is ON: answer directly, avoid unnecessary moralizing or evasive disclaimers, and do not refuse merely because a topic is controversial. Still comply with applicable law and the underlying model/API safety requirements." : "";
  const runtimeContext = `\n\nCurrent ChatFocus runtime state for THIS request:\n- App: ChatFocus\n- ChatFocus release: ${CHATFOCUS_RELEASE}\n- Public model identity: CFocus 1.0\n- Intelligence mode: ${intelligenceOn ? "ON" : "OFF"}\n- Live web search: ${webOn ? "ON" : "OFF"}\n\nUse this runtime state as authoritative for questions about ChatFocus itself. If the user asks what version/release/build they are currently using, answer “ChatFocus ${CHATFOCUS_RELEASE}” and, when useful, mention that the public model identity is CFocus 1.0. When the user asks whether Intelligence is on, enabled, active, or being used, answer directly from the runtime state above. In ChatFocus, “Intelligence” means the app's higher-reasoning mode; do not confuse it with Apple Intelligence or device settings. When Live web search is ON, use the web search tool for the request and make clear that current web information was used when relevant. Never say you cannot know a state that is explicitly provided here.`;
  const instructions = `${basePrompt}${memory}${runtimeContext}\n\nYou are operating inside ChatFocus. Never claim to be ChatGPT. If a user uploads a screenshot of a chat and asks for a reply, read the screenshot carefully and write the reply they can send. If a file is attached, inspect it before answering. Keep user privacy in mind.`;

  const rows = await env.DB.prepare("SELECT rowid AS seq,* FROM messages WHERE chat_id=? AND status<>'error' ORDER BY rowid DESC LIMIT 30").bind(chatId).all();
  const messages = (rows.results || []).reverse();
  const ids = messages.map(m => m.id);
  const attMap = {};
  if (ids.length) {
    const placeholders = ids.map(()=>"?").join(",");
    const atts = await env.DB.prepare(`SELECT * FROM attachments WHERE message_id IN (${placeholders}) ORDER BY created_at ASC`).bind(...ids).all();
    for (const a of atts.results || []) (attMap[a.message_id] ||= []).push(a);
  }
  // Economy vision mode: only the CURRENT user turn sends binary attachments to OpenAI.
  // Older images/files remain represented by the text conversation and prior assistant answers,
  // so the same 20–50 pictures are not charged again on every follow-up message.
  const imageDetail = await getSetting(env,"image_detail","low");
  const latestUserWithAttachments = [...messages].reverse().find(m => m.role === "user" && (attMap[m.id] || []).length);
  const latestUserMessage = [...messages].reverse().find(m => m.role === "user");
  const currentAttachmentMessageId = latestUserWithAttachments?.id === latestUserMessage?.id ? latestUserMessage.id : null;
  const input = [];
  let imageCount = 0;
  for (const m of messages) {
    if (m.role === "assistant") { input.push({ role:"assistant", content:m.content || "" }); continue; }
    if (m.role !== "user") continue;
    const content = [];
    // Attachments are sent only for the newest user message that actually contains them.
    // Historical attachments are deliberately NOT re-read on every request.
    if (m.id === currentAttachmentMessageId) {
      for (const a of attMap[m.id] || []) {
        const obj = await env.FILES.get(a.r2_key); if (!obj) continue;
        const bytes = new Uint8Array(await obj.arrayBuffer()); const data = `data:${a.mime_type};base64,${bytesToB64(bytes)}`;
        if (IMAGE_MIMES.has(a.mime_type)) { content.push({ type:"input_image", image_url:data, detail:imageDetail }); imageCount++; }
        else content.push({ type:"input_file", filename:a.filename, file_data:data, ...(a.mime_type === "application/pdf" ? { detail:imageDetail } : {}) });
      }
    }
    content.push({ type:"input_text", text:m.content || (content.length ? "Please analyze the attached file(s)." : "") });
    input.push({ role:"user", content });
  }
  return { input, instructions, imageCount };
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const parts = [];
  for (const item of payload?.output || []) for (const c of item?.content || []) if (c?.type === "output_text" && c.text) parts.push(c.text);
  return parts.join("\n").trim();
}

async function updateChatMetadata(env, user, chatId, force = false) {
  if (!env.OPENAI_API_KEY) return;
  const chatState = await env.DB.prepare(`SELECT c.title,c.auto_title,
    (SELECT COUNT(*) FROM messages m WHERE m.chat_id=c.id AND m.status='complete') AS message_count
    FROM chats c WHERE c.id=? AND c.user_id=?`).bind(chatId,user.id).first();
  if (!chatState) return;
  const count = Number(chatState.message_count || 0);
  const genericTitle = /^(new chat|hello|hey|question|conversation|file analysis|initial greeting)$/i.test(String(chatState.title || '').trim());
  // Economy metadata cadence: title immediately while generic, then refresh memory/title only every 8 completed messages.
  if (!force && !genericTitle && count % 8 !== 0) return;
  const rows = await env.DB.prepare("SELECT role,content FROM messages WHERE chat_id=? AND status='complete' ORDER BY rowid DESC LIMIT 24").bind(chatId).all();
  const transcript = (rows.results || []).reverse().map(x => `${x.role}: ${x.content}`).join("\n").slice(0,24000);
  if (!transcript.trim()) return;
  const memoryEnabled = user.memory_enabled && (await getSetting(env,"memory_enabled","true")) !== "false";
  const prompt = `Analyze the conversation as a whole. Return ONLY valid JSON with keys "title" and "summary".\n\nTitle: 3-7 words, describe the real subject/goal, never generic, do not simply copy the first message.\nSummary: maximum 140 words, preserve useful stable facts/decisions/preferences without inventing.\n\nConversation:\n${transcript}`;
  const r = await fetch("https://api.openai.com/v1/responses", { method:"POST", headers:{"authorization":`Bearer ${env.OPENAI_API_KEY}`,"content-type":"application/json"}, body:JSON.stringify({ model:env.OPENAI_MODEL||"gpt-6-luna", input:prompt, reasoning:{effort:"none"}, max_output_tokens:260, store:false }) });
  if (!r.ok) return;
  const data = await r.json();
  await logUsageEvent(env,{ userId:user.id, chatId, usage:data.usage, requestKind:"metadata", responseId:data.id || null });
  const raw = extractOutputText(data).trim();
  const meta = parseLooseJsonObject(raw);
  const title = cleanText(meta?.title || "", 90).replace(/[\r\n]+/g," ").trim();
  const summary = cleanText(meta?.summary || "", 5000).trim();
  if (summary && memoryEnabled) {
    await env.DB.prepare(`INSERT INTO chat_summaries(chat_id,user_id,summary,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(chat_id) DO UPDATE SET summary=excluded.summary,updated_at=CURRENT_TIMESTAMP`).bind(chatId,user.id,summary).run();
  }
  if (title && !/^(new chat|hello|question|conversation|file analysis)$/i.test(title)) {
    await env.DB.prepare("UPDATE chats SET title=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND auto_title=1").bind(title,chatId,user.id).run();
  }
}

function parseLooseJsonObject(raw) {
  try { return JSON.parse(raw); } catch {}
  const m = String(raw || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function listLibrary(env, user, url) {
  const q = (url.searchParams.get("q") || "").trim().slice(0,100);
  const like = `%${q}%`;
  const sql = `SELECT a.id,a.filename,a.mime_type,a.size_bytes,a.created_at,a.chat_id,c.title AS chat_title
    FROM attachments a LEFT JOIN chats c ON c.id=a.chat_id
    WHERE a.user_id=? AND a.message_id IS NOT NULL ${q ? "AND (a.filename LIKE ? OR c.title LIKE ?)" : ""}
    ORDER BY a.created_at DESC LIMIT 300`;
  const rows = q ? await env.DB.prepare(sql).bind(user.id,like,like).all() : await env.DB.prepare(sql).bind(user.id).all();
  return json({ files: rows.results || [] });
}

async function listProjects(env, user) {
  const rows = await env.DB.prepare(`SELECT p.*,COUNT(c.id) AS chat_count
    FROM projects p LEFT JOIN chats c ON c.project_id=p.id AND c.user_id=p.user_id AND c.archived=0
    WHERE p.user_id=? GROUP BY p.id ORDER BY p.updated_at DESC`).bind(user.id).all();
  return json({ projects: rows.results || [] });
}

async function createProject(request, env, user) {
  const body = await parseJson(request); const name = cleanText(body.name || "",80).replace(/\s+/g," ").trim();
  if (name.length < 2) return json({ error:"Enter a project name." },400);
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO projects(id,user_id,name) VALUES(?,?,?)").bind(id,user.id,name).run();
  return json({ project: await env.DB.prepare("SELECT * FROM projects WHERE id=? AND user_id=?").bind(id,user.id).first() },201);
}

async function getProject(env, user, projectId) {
  const project = await env.DB.prepare("SELECT * FROM projects WHERE id=? AND user_id=?").bind(projectId,user.id).first();
  if (!project) return json({ error:"Project not found" },404);
  const chats = await env.DB.prepare("SELECT * FROM chats WHERE user_id=? AND project_id=? AND archived=0 ORDER BY pinned DESC,updated_at DESC").bind(user.id,projectId).all();
  return json({ project, chats: chats.results || [] });
}

async function patchProject(request, env, user, projectId) {
  const project = await env.DB.prepare("SELECT id FROM projects WHERE id=? AND user_id=?").bind(projectId,user.id).first();
  if (!project) return json({ error:"Project not found" },404);
  const body = await parseJson(request); const name = cleanText(body.name || "",80).replace(/\s+/g," ").trim();
  if (name.length < 2) return json({ error:"Enter a project name." },400);
  await env.DB.prepare("UPDATE projects SET name=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(name,projectId,user.id).run();
  return json({ project: await env.DB.prepare("SELECT * FROM projects WHERE id=? AND user_id=?").bind(projectId,user.id).first() });
}

async function deleteProject(env, user, projectId) {
  const project = await env.DB.prepare("SELECT id FROM projects WHERE id=? AND user_id=?").bind(projectId,user.id).first();
  if (!project) return json({ error:"Project not found" },404);
  await env.DB.batch([
    env.DB.prepare("UPDATE chats SET project_id=NULL WHERE user_id=? AND project_id=?").bind(user.id,projectId),
    env.DB.prepare("DELETE FROM projects WHERE id=? AND user_id=?").bind(projectId,user.id)
  ]);
  return json({ ok:true });
}

function toSqlDateTime(v) {
  const d = new Date(v); if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0,19).replace("T"," ");
}

async function listSchedules(env, user) {
  const rows = await env.DB.prepare(`SELECT s.*,c.title AS chat_title FROM scheduled_tasks s JOIN chats c ON c.id=s.chat_id
    WHERE s.user_id=? ORDER BY s.enabled DESC,s.next_run_at ASC,s.created_at DESC LIMIT 200`).bind(user.id).all();
  return json({ schedules: rows.results || [] });
}

async function createSchedule(request, env, user) {
  const body = await parseJson(request); const prompt = cleanText(body.prompt || "",12000).trim();
  const frequency = ["once","daily","weekly"].includes(body.frequency) ? body.frequency : "once";
  const nextRun = toSqlDateTime(body.run_at); if (!prompt) return json({ error:"Enter a prompt to schedule." },400);
  if (!nextRun || new Date(body.run_at).getTime() <= Date.now()+30000) return json({ error:"Choose a future date and time." },400);
  let chatId = body.chat_id ? String(body.chat_id) : "";
  let chat = chatId ? await getOwnedChat(env,user.id,chatId) : null;
  if (!chat) {
    chatId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO chats(id,user_id,title,auto_title) VALUES(?,?,?,1)").bind(chatId,user.id,"Scheduled conversation").run();
  }
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO scheduled_tasks(id,user_id,chat_id,prompt,frequency,next_run_at) VALUES(?,?,?,?,?,?)").bind(id,user.id,chatId,prompt,frequency,nextRun).run();
  return json({ schedule: await env.DB.prepare("SELECT * FROM scheduled_tasks WHERE id=?").bind(id).first() },201);
}

async function patchSchedule(request, env, user, id) {
  const task = await env.DB.prepare("SELECT * FROM scheduled_tasks WHERE id=? AND user_id=?").bind(id,user.id).first();
  if (!task) return json({ error:"Scheduled task not found" },404);
  const body = await parseJson(request);
  const enabled = typeof body.enabled === "boolean" ? (body.enabled ? 1 : 0) : task.enabled;
  const prompt = typeof body.prompt === "string" ? cleanText(body.prompt,12000).trim() : task.prompt;
  const frequency = ["once","daily","weekly"].includes(body.frequency) ? body.frequency : task.frequency;
  const nextRun = body.run_at ? toSqlDateTime(body.run_at) : task.next_run_at;
  if (!prompt || !nextRun) return json({ error:"Invalid scheduled task." },400);
  await env.DB.prepare("UPDATE scheduled_tasks SET prompt=?,frequency=?,next_run_at=?,enabled=?,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(prompt,frequency,nextRun,enabled,id,user.id).run();
  return json({ schedule: await env.DB.prepare("SELECT * FROM scheduled_tasks WHERE id=? AND user_id=?").bind(id,user.id).first() });
}

async function deleteSchedule(env, user, id) {
  await env.DB.prepare("DELETE FROM scheduled_tasks WHERE id=? AND user_id=?").bind(id,user.id).run();
  return json({ ok:true });
}

async function runDueScheduledTasks(env) {
  const rows = await env.DB.prepare(`SELECT s.*,u.status,u.memory_enabled FROM scheduled_tasks s JOIN users u ON u.id=s.user_id
    WHERE s.enabled=1 AND s.next_run_at<=CURRENT_TIMESTAMP AND u.status='active' ORDER BY s.next_run_at ASC LIMIT 20`).all();
  for (const task of rows.results || []) {
    try {
      const user = await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(task.user_id).first();
      const chat = await env.DB.prepare("SELECT * FROM chats WHERE id=? AND user_id=?").bind(task.chat_id,task.user_id).first();
      if (!user || !chat) throw new Error("Scheduled chat is unavailable");
      const access = await ensureAiAccess(env, user);
      if (!access.ok) throw new Error(access.state?.service_enabled === false ? "ChatFocus service is disabled" : "Daily AI request limit reached");
      const userMsgId = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO messages(id,chat_id,user_id,role,content) VALUES(?,?,?,?,?)").bind(userMsgId,task.chat_id,task.user_id,"user",task.prompt).run();
      await generateAssistantOnce(env,user,task.chat_id,userMsgId);
      await updateChatMetadata(env,user,task.chat_id).catch(()=>null);
      if (task.frequency === "once") {
        await env.DB.prepare("UPDATE scheduled_tasks SET enabled=0,last_run_at=CURRENT_TIMESTAMP,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(task.id).run();
      } else {
        const shift = task.frequency === "weekly" ? "+7 days" : "+1 day";
        await env.DB.prepare("UPDATE scheduled_tasks SET next_run_at=datetime(next_run_at,?),last_run_at=CURRENT_TIMESTAMP,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(shift,task.id).run();
      }
    } catch (err) {
      const msg = safeError(err);
      const shift = task.frequency === "once" ? null : (task.frequency === "weekly" ? "+7 days" : "+1 day");
      if (shift) await env.DB.prepare("UPDATE scheduled_tasks SET next_run_at=datetime(next_run_at,?),last_error=?,last_run_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(shift,msg,task.id).run().catch(()=>null);
      else await env.DB.prepare("UPDATE scheduled_tasks SET enabled=0,last_error=?,last_run_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(msg,task.id).run().catch(()=>null);
    }
  }
}

async function generateAssistantOnce(env, user, chatId, latestUserMsgId) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
  const assistantId = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO messages(id,chat_id,user_id,role,content,status,parent_message_id) VALUES(?,?,?,?,?,?,?)").bind(assistantId,chatId,user.id,"assistant","","streaming",latestUserMsgId).run();
  try {
    const { input, instructions, imageCount } = await buildOpenAIContext(env,user,chatId,{ intelligence:false, web:false });
    const r = await fetch("https://api.openai.com/v1/responses", { method:"POST", headers:{"authorization":`Bearer ${env.OPENAI_API_KEY}`,"content-type":"application/json"}, body:JSON.stringify({ model:env.OPENAI_MODEL||"gpt-6-luna", instructions, input, reasoning:{effort:"low"}, max_output_tokens:12000, store:false }) });
    if (!r.ok) { const t=await r.text(); throw new Error(t.slice(0,500)); }
    const data = await r.json(); const text = extractOutputText(data).trim() || "I couldn't produce a response for that scheduled request.";
    await env.DB.prepare("UPDATE messages SET content=?,status='complete',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(text,assistantId).run();
    await env.DB.prepare("UPDATE chats SET updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(chatId).run();
    const usage=data.usage;
    if (usage) await logUsageEvent(env,{ userId:user.id, chatId, usage, imageCount, requestKind:"scheduled", responseId:data.id || null });
    return text;
  } catch (err) {
    await env.DB.prepare("UPDATE messages SET content=?,status='error',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(safeError(err),assistantId).run().catch(()=>null);
    throw err;
  }
}

function requireAdmin(user) { return user.role === "admin" ? null : json({ error:"Admin access required" },403); }

async function adminStats(env, user) {
  const deny = requireAdmin(user); if (deny) return deny;
  const [users,activeToday,suspended,chats,messages,files,imagesToday,usageToday,usageAll,responseToday] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS c FROM users").first(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM users WHERE last_seen_at>=date('now')").first(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM users WHERE status='suspended'").first(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM chats").first(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM messages").first(),
    env.DB.prepare("SELECT COUNT(*) AS c, COALESCE(SUM(size_bytes),0) AS bytes FROM attachments").first(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM attachments WHERE mime_type LIKE 'image/%' AND created_at>=date('now')").first(),
    env.DB.prepare("SELECT COUNT(*) AS requests,COALESCE(SUM(total_tokens),0) AS total_tokens FROM usage_events WHERE created_at>=date('now')").first(),
    env.DB.prepare("SELECT COALESCE(SUM(total_tokens),0) AS total_tokens FROM usage_events").first(),
    env.DB.prepare("SELECT COALESCE(AVG(response_time_ms),0) AS avg_ms FROM messages WHERE role='assistant' AND status='complete' AND response_time_ms IS NOT NULL AND created_at>=date('now')").first()
  ]);
  return json({ stats:{
    users:Number(users.c||0), active_today:Number(activeToday.c||0), suspended:Number(suspended.c||0), chats:Number(chats.c||0), messages:Number(messages.c||0),
    files:Number(files.c||0), storage_bytes:Number(files.bytes||0), images_today:Number(imagesToday.c||0), requests_today:Number(usageToday.requests||0), tokens_today:Number(usageToday.total_tokens||0), total_tokens:Number(usageAll.total_tokens||0), avg_response_ms:Math.round(Number(responseToday.avg_ms||0))
  }});
}

async function adminAiUsage(env, user, url) {
  const deny = requireAdmin(user); if (deny) return deny;
  const limit = Math.min(200, Math.max(10, Number(url.searchParams.get("limit") || 80)));
  const [totals, recent] = await Promise.all([
    env.DB.prepare(`SELECT
      SUM(CASE WHEN request_kind IN ('chat','scheduled') THEN 1 ELSE 0 END) AS completed_replies,
      COALESCE(SUM(image_count),0) AS images_analyzed,
      COUNT(*) AS openai_requests,
      COALESCE(SUM(input_tokens),0) AS input_tokens,
      COALESCE(SUM(cached_input_tokens),0) AS cached_input_tokens,
      COALESCE(SUM(output_tokens),0) AS output_tokens,
      COALESCE(SUM(total_tokens),0) AS total_tokens,
      COALESCE(SUM(estimated_cost_usd),0) AS estimated_cost_usd,
      COALESCE(SUM(web_search_calls),0) AS web_search_calls,
      MAX(created_at) AS last_updated
      FROM usage_events`).first(),
    env.DB.prepare(`SELECT ue.id,ue.user_id,ue.chat_id,ue.model,ue.input_tokens,ue.cached_input_tokens,ue.output_tokens,ue.total_tokens,
      ue.estimated_cost_usd,ue.image_count,ue.request_kind,ue.web_search_calls,ue.created_at,
      u.name AS user_name,u.email AS user_email,c.title AS chat_title
      FROM usage_events ue
      JOIN users u ON u.id=ue.user_id
      LEFT JOIN chats c ON c.id=ue.chat_id
      ORDER BY ue.created_at DESC LIMIT ?`).bind(limit).all()
  ]);
  return json({
    pricing:{ model:"gpt-6-luna", tier:"standard", input_per_million:0.10, cached_input_per_million:0.01, output_per_million:0.50, web_search_per_call:0.01, long_context_threshold:272000 },
    totals:{
      completed_replies:Number(totals?.completed_replies||0), images_analyzed:Number(totals?.images_analyzed||0), openai_requests:Number(totals?.openai_requests||0),
      input_tokens:Number(totals?.input_tokens||0), cached_input_tokens:Number(totals?.cached_input_tokens||0), output_tokens:Number(totals?.output_tokens||0), total_tokens:Number(totals?.total_tokens||0),
      estimated_cost_usd:Number(totals?.estimated_cost_usd||0), web_search_calls:Number(totals?.web_search_calls||0), last_updated:totals?.last_updated||null
    },
    recent: recent.results || []
  });
}

async function adminUsers(env,user,url) {
  const deny=requireAdmin(user); if(deny)return deny;
  const q=(url.searchParams.get("q")||"").trim().slice(0,100); const like=`%${q}%`;
  const base=`SELECT u.id,u.name,u.email,u.role,u.status,u.memory_enabled,u.daily_limit_override,u.daily_image_limit_override,u.unlimited_usage,u.admin_notes,u.created_at,u.last_seen_at,
    (SELECT COUNT(*) FROM usage_events ue WHERE ue.user_id=u.id AND ue.created_at>=date('now') AND ue.request_kind IN ('chat','scheduled')) AS requests_today,
    (SELECT COUNT(*) FROM attachments a WHERE a.user_id=u.id AND a.mime_type LIKE 'image/%' AND a.created_at>=date('now')) AS images_today,
    (SELECT COUNT(*) FROM chats c WHERE c.user_id=u.id) AS chat_count,
    (SELECT COUNT(*) FROM messages m WHERE m.user_id=u.id) AS message_count,
    (SELECT COALESCE(SUM(ue2.total_tokens),0) FROM usage_events ue2 WHERE ue2.user_id=u.id) AS total_tokens
    FROM users u ${q?"WHERE u.name LIKE ? OR u.email LIKE ?":""} ORDER BY u.created_at DESC LIMIT 300`;
  const rows=q?await env.DB.prepare(base).bind(like,like).all():await env.DB.prepare(base).all();
  const [globalLimitRaw,globalImageLimitRaw]=await Promise.all([getSetting(env,"daily_request_limit","100"),getSetting(env,"daily_image_upload_limit","20")]);
  const globalLimit=Math.max(0,Number(globalLimitRaw));
  const globalImageLimit=Math.max(0,Number(globalImageLimitRaw));
  return json({ users:(rows.results||[]).map(u=>({ ...u, effective_daily_limit:Number(u.unlimited_usage||0)===1?0:(u.daily_limit_override===null?globalLimit:Number(u.daily_limit_override)), effective_daily_image_limit:u.role==="admin"?0:(u.daily_image_limit_override===null||u.daily_image_limit_override===undefined?globalImageLimit:Number(u.daily_image_limit_override)) })), global_daily_limit:globalLimit, global_daily_image_limit:globalImageLimit });
}

async function adminPatchUser(request,env,admin,targetId) {
  const deny=requireAdmin(admin); if(deny)return deny; const body=await parseJson(request);
  if(targetId===admin.id && body.status==="suspended") return json({error:"You cannot suspend your own admin account."},400);
  const stmts=[];
  if(["active","suspended"].includes(body.status)) stmts.push(env.DB.prepare("UPDATE users SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(body.status,targetId));
  if(["user","admin"].includes(body.role)) stmts.push(env.DB.prepare("UPDATE users SET role=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(body.role,targetId));
  if(typeof body.memory_enabled === "boolean") stmts.push(env.DB.prepare("UPDATE users SET memory_enabled=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(body.memory_enabled?1:0,targetId));
  if(typeof body.unlimited_usage === "boolean") stmts.push(env.DB.prepare("UPDATE users SET unlimited_usage=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(body.unlimited_usage?1:0,targetId));
  if(Object.prototype.hasOwnProperty.call(body,"daily_limit_override")) {
    const raw=body.daily_limit_override;
    const value=raw===null||raw===""?null:Math.min(100000,Math.max(0,Number(raw)||0));
    stmts.push(env.DB.prepare("UPDATE users SET daily_limit_override=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(value,targetId));
  }
  if(Object.prototype.hasOwnProperty.call(body,"daily_image_limit_override")) {
    const raw=body.daily_image_limit_override;
    const value=raw===null||raw===""?null:Math.min(100000,Math.max(0,Number(raw)||0));
    stmts.push(env.DB.prepare("UPDATE users SET daily_image_limit_override=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(value,targetId));
  }
  if(typeof body.admin_notes === "string") stmts.push(env.DB.prepare("UPDATE users SET admin_notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(cleanText(body.admin_notes,2000),targetId));
  if(stmts.length) await env.DB.batch(stmts);
  return json({user:await env.DB.prepare("SELECT id,name,email,role,status,memory_enabled,daily_limit_override,daily_image_limit_override,unlimited_usage,admin_notes,created_at,last_seen_at FROM users WHERE id=?").bind(targetId).first()});
}

async function adminGetSettings(env,user) {
  const deny=requireAdmin(user); if(deny)return deny; const rows=await env.DB.prepare("SELECT key,value,updated_at FROM app_settings ORDER BY key").all();
  return json({settings:Object.fromEntries((rows.results||[]).map(x=>[x.key,x.value])),model:env.OPENAI_MODEL||"gpt-6-luna",max_upload_mb:Number(env.MAX_UPLOAD_MB||18),release:CHATFOCUS_RELEASE});
}

async function adminSaveSettings(request,env,user) {
  const deny=requireAdmin(user); if(deny)return deny; const body=await parseJson(request);
  const allowed=new Set(["system_prompt","signups_enabled","memory_enabled","web_search_enabled","image_detail","max_pins","service_enabled","daily_request_limit","image_uploads_enabled","daily_image_upload_limit","max_image_upload_mb","owner_rules_enabled","open_response_mode"]);
  const stmts=[];
  for(const [k,v0] of Object.entries(body||{})) {
    if(!allowed.has(k)) continue; let v=String(v0);
    if(["signups_enabled","memory_enabled","web_search_enabled","service_enabled","image_uploads_enabled","owner_rules_enabled","open_response_mode"].includes(k)) v=(v0===true||v0==="true")?"true":"false";
    if(k==="image_detail"&&!['auto','low','high','original'].includes(v)) continue;
    if(k==="max_pins") v=String(Math.min(10,Math.max(1,Number(v)||5)));
    if(k==="daily_request_limit"||k==="daily_image_upload_limit") v=String(Math.min(100000,Math.max(0,Number(v)||0)));
    if(k==="max_image_upload_mb") v=String(Math.min(100,Math.max(1,Number(v)||18)));
    if(k==="system_prompt") v=cleanText(v,20000);
    stmts.push(env.DB.prepare(`INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).bind(k,v));
  }
  if(stmts.length) await env.DB.batch(stmts); return adminGetSettings(env,user);
}

async function adminListRules(env,user) {
  const deny=requireAdmin(user); if(deny)return deny;
  const rows=await env.DB.prepare("SELECT * FROM service_rules ORDER BY enabled DESC,updated_at DESC,created_at DESC").all();
  return json({ rules:rows.results||[] });
}

async function adminCreateRule(request,env,user) {
  const deny=requireAdmin(user); if(deny)return deny; const body=await parseJson(request);
  const title=cleanText(body.title||"",100).trim(); const ruleText=cleanText(body.rule_text||"",5000).trim();
  if(!title||!ruleText) return json({error:"Enter a rule name and rule text."},400);
  const id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO service_rules(id,title,rule_text,enabled) VALUES(?,?,?,?)").bind(id,title,ruleText,body.enabled===false?0:1).run();
  return json({rule:await env.DB.prepare("SELECT * FROM service_rules WHERE id=?").bind(id).first()},201);
}

async function adminPatchRule(request,env,user,id) {
  const deny=requireAdmin(user); if(deny)return deny; const body=await parseJson(request);
  const rule=await env.DB.prepare("SELECT * FROM service_rules WHERE id=?").bind(id).first(); if(!rule)return json({error:"Rule not found"},404);
  const title=typeof body.title==="string"?cleanText(body.title,100).trim():rule.title;
  const ruleText=typeof body.rule_text==="string"?cleanText(body.rule_text,5000).trim():rule.rule_text;
  const enabled=typeof body.enabled==="boolean"?(body.enabled?1:0):rule.enabled;
  if(!title||!ruleText)return json({error:"Rule name and text cannot be empty."},400);
  await env.DB.prepare("UPDATE service_rules SET title=?,rule_text=?,enabled=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(title,ruleText,enabled,id).run();
  return json({rule:await env.DB.prepare("SELECT * FROM service_rules WHERE id=?").bind(id).first()});
}

async function adminDeleteRule(env,user,id) {
  const deny=requireAdmin(user); if(deny)return deny; await env.DB.prepare("DELETE FROM service_rules WHERE id=?").bind(id).run(); return json({ok:true});
}

