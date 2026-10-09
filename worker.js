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
      if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
      return await routeApi(request, env, ctx, url);
    } catch (err) {
      console.error(err);
      return json({ error: "Something went wrong.", detail: safeError(err) }, 500);
    }
  }
};

async function routeApi(request, env, ctx, url) {
  const p = url.pathname;
  const m = request.method.toUpperCase();

  if (p === "/api/health") return json({ ok: true, app: env.APP_NAME || "ChatFocus", model: env.OPENAI_MODEL || "gpt-6-luna" });
  if (p === "/api/auth/signup" && m === "POST") return signup(request, env);
  if (p === "/api/auth/login" && m === "POST") return login(request, env);
  if (p === "/api/auth/logout" && m === "POST") return logout(request, env);

  const auth = await requireUser(request, env);
  if (auth instanceof Response) return auth;
  const { user } = auth;

  if (p === "/api/me" && m === "GET") return json({ user: publicUser(user), settings: await getClientSettings(env) });
  if (p === "/api/me/memory" && m === "PATCH") return updateMyMemory(request, env, user);

  if (p === "/api/chats" && m === "GET") return listChats(env, user, url);
  if (p === "/api/chats" && m === "POST") return createChat(request, env, user);
  if (p === "/api/uploads" && m === "POST") return uploadFile(request, env, user);
  if (p.startsWith("/api/files/") && m === "GET") return getFile(env, user, decodeURIComponent(p.slice("/api/files/".length)));

  let match = p.match(/^\/api\/chats\/([^/]+)$/);
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
  if (p === "/api/admin/users" && m === "GET") return adminUsers(env, user, url);
  if (p.startsWith("/api/admin/users/") && m === "PATCH") return adminPatchUser(request, env, user, p.split("/").pop());
  if (p === "/api/admin/settings" && m === "GET") return adminGetSettings(env, user);
  if (p === "/api/admin/settings" && m === "PUT") return adminSaveSettings(request, env, user);

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
  const rows = await env.DB.prepare("SELECT key,value FROM app_settings WHERE key IN ('memory_enabled','web_search_enabled','image_detail','max_pins')").all();
  const map = Object.fromEntries((rows.results || []).map(r => [r.key, r.value]));
  return {
    memory_enabled: map.memory_enabled !== "false",
    web_search_enabled: map.web_search_enabled === "true",
    image_detail: map.image_detail || "auto",
    max_pins: Number(map.max_pins || 5)
  };
}

async function hashPassword(password, saltB64 = null) {
  const salt = saltB64 ? b64ToBytes(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 210000 }, material, 256);
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
  let title = "New chat";
  try { const body = await request.json(); if (body?.title) title = cleanText(body.title, 90).trim() || title; } catch {}
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO chats(id,user_id,title) VALUES(?,?,?)").bind(id, user.id, title).run();
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
    await env.DB.prepare("UPDATE chats SET title=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(title, chatId, user.id).run();
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
  const maxMb = Number(env.MAX_UPLOAD_MB || 18); const maxBytes = maxMb * 1024 * 1024;
  if (file.size > maxBytes) return json({ error: `Each file must be ${maxMb} MB or smaller.` }, 413);
  if (!acceptedFile(file)) return json({ error: "This file type is not supported yet." }, 415);
  const id = crypto.randomUUID();
  const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120) || "file";
  const key = `${user.id}/${chatId}/${id}-${safe}`;
  await env.FILES.put(key, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" }, customMetadata: { originalName: file.name } });
  await env.DB.prepare("INSERT INTO attachments(id,user_id,chat_id,r2_key,filename,mime_type,size_bytes) VALUES(?,?,?,?,?,?,?)")
    .bind(id,user.id,chatId,key,file.name,file.type || "application/octet-stream",file.size).run();
  return json({ attachment: { id, filename: file.name, mime_type: file.type || "application/octet-stream", size_bytes: file.size, url: `/api/files/${id}` } }, 201);
}

async function getFile(env, user, id) {
  const a = await env.DB.prepare("SELECT * FROM attachments WHERE id=? AND user_id=?").bind(id,user.id).first();
  if (!a) return json({ error: "File not found" }, 404);
  const obj = await env.FILES.get(a.r2_key); if (!obj) return json({ error: "File missing from storage" }, 404);
  return new Response(obj.body, { headers: { "content-type": a.mime_type, "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(a.filename)}`, "cache-control": "private, max-age=3600" } });
}

async function createMessageAndStream(request, env, ctx, user, chatId) {
  const chat = await getOwnedChat(env,user.id,chatId); if (!chat) return json({ error: "Chat not found" }, 404);
  const body = await parseJson(request);
  const text = cleanText(body.content || "", 60000).trim();
  const attachmentIds = Array.isArray(body.attachment_ids) ? body.attachment_ids.slice(0, Number(env.MAX_ATTACHMENTS || 10)).map(String) : [];
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
  if (chat.title === "New chat") {
    const title = makeLocalTitle(text, attachmentIds.length);
    await env.DB.prepare("UPDATE chats SET title=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(title,chatId).run();
  } else await env.DB.prepare("UPDATE chats SET updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(chatId).run();
  return streamAssistant(env, ctx, user, chatId, msgId, !!body.web_search);
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
  return streamAssistant(env, ctx, user, chatId, userMsg.id, !!body.web_search);
}

async function streamAssistant(env, ctx, user, chatId, latestUserMsgId, requestedWeb) {
  if (!env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY is not configured on the server." }, 503);
  const assistantId = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO messages(id,chat_id,user_id,role,content,status,parent_message_id) VALUES(?,?,?,?,?,?,?)").bind(assistantId,chatId,user.id,"assistant","","streaming",latestUserMsgId).run();
  try {
    const { input, instructions } = await buildOpenAIContext(env, user, chatId);
    const webAllowed = (await getSetting(env,"web_search_enabled","false")) === "true";
    const payload = {
      model: env.OPENAI_MODEL || "gpt-6-luna",
      instructions,
      input,
      reasoning: { effort: "medium" },
      max_output_tokens: 12000,
      stream: true,
      store: false
    };
    if (requestedWeb && webAllowed) payload.tools = [{ type: "web_search" }];

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
    let finalText = ""; let usage = null; let responseId = null;
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
                responseId = evt.response?.id || null; usage = evt.response?.usage || null;
              } else if (type === "response.failed" || type === "error") {
                send({ type: "error", error: evt.error?.message || evt.response?.error?.message || "Generation failed." });
              }
            }
          }
          if (!finalText.trim()) finalText = "I couldn't produce a response for that request. Please try again.";
          await env.DB.prepare("UPDATE messages SET content=?,status='complete',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(finalText,assistantId).run();
          await env.DB.prepare("UPDATE chats SET updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(chatId).run();
          if (usage) {
            await env.DB.prepare("INSERT INTO usage_events(id,user_id,chat_id,model,input_tokens,output_tokens,total_tokens) VALUES(?,?,?,?,?,?,?)")
              .bind(crypto.randomUUID(),user.id,chatId,env.OPENAI_MODEL || "gpt-6-luna",Number(usage.input_tokens||0),Number(usage.output_tokens||0),Number(usage.total_tokens||0)).run();
          }
          send({ type: "done", message_id: assistantId, response_id: responseId, usage });
          ctx.waitUntil(updateChatSummary(env,user,chatId).catch(console.error));
          controller.close();
        } catch (err) {
          await env.DB.prepare("UPDATE messages SET content=?,status='error',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(finalText || "Generation interrupted.",assistantId).run().catch(()=>null);
          send({ type: "error", error: safeError(err) }); controller.close();
        }
      }
    });
    return new Response(bodyStream, { headers: { "content-type":"application/x-ndjson; charset=utf-8", "cache-control":"no-cache, no-transform", "x-accel-buffering":"no" } });
  } catch (err) {
    await env.DB.prepare("UPDATE messages SET status='error',content=? WHERE id=?").bind(safeError(err),assistantId).run().catch(()=>null);
    return json({ error: safeError(err) }, 500);
  }
}

async function buildOpenAIContext(env, user, chatId) {
  const basePrompt = await getSetting(env,"system_prompt","You are ChatFocus, a capable multimodal assistant.");
  const memoryGlobal = (await getSetting(env,"memory_enabled","true")) !== "false";
  let memory = "";
  if (memoryGlobal && user.memory_enabled) {
    const summaries = await env.DB.prepare("SELECT c.title,s.summary,s.updated_at FROM chat_summaries s JOIN chats c ON c.id=s.chat_id WHERE s.user_id=? AND s.chat_id<>? AND s.summary<>'' ORDER BY s.updated_at DESC LIMIT 10").bind(user.id,chatId).all();
    if ((summaries.results || []).length) {
      memory = "\n\nUseful context from this user's other saved conversations. Use only when relevant and do not claim certainty beyond it:\n" + summaries.results.map(x => `- ${x.title}: ${x.summary}`).join("\n");
    }
  }
  const instructions = `${basePrompt}${memory}\n\nYou are operating inside ChatFocus. Never claim to be ChatGPT. If a user uploads a screenshot of a chat and asks for a reply, read the screenshot carefully and write the reply they can send. If a file is attached, inspect it before answering. Keep user privacy in mind.`;

  const rows = await env.DB.prepare("SELECT rowid AS seq,* FROM messages WHERE chat_id=? AND status<>'error' ORDER BY rowid DESC LIMIT 30").bind(chatId).all();
  const messages = (rows.results || []).reverse();
  const ids = messages.map(m => m.id);
  const attMap = {};
  if (ids.length) {
    const placeholders = ids.map(()=>"?").join(",");
    const atts = await env.DB.prepare(`SELECT * FROM attachments WHERE message_id IN (${placeholders}) ORDER BY created_at ASC`).bind(...ids).all();
    for (const a of atts.results || []) (attMap[a.message_id] ||= []).push(a);
  }
  const imageDetail = await getSetting(env,"image_detail","auto");
  const input = [];
  for (const m of messages) {
    if (m.role === "assistant") { input.push({ role:"assistant", content:m.content || "" }); continue; }
    if (m.role !== "user") continue;
    const content = [];
    for (const a of attMap[m.id] || []) {
      const obj = await env.FILES.get(a.r2_key); if (!obj) continue;
      const bytes = new Uint8Array(await obj.arrayBuffer()); const data = `data:${a.mime_type};base64,${bytesToB64(bytes)}`;
      if (IMAGE_MIMES.has(a.mime_type)) content.push({ type:"input_image", image_url:data, detail:imageDetail });
      else content.push({ type:"input_file", filename:a.filename, file_data:data, ...(a.mime_type === "application/pdf" ? { detail:imageDetail } : {}) });
    }
    content.push({ type:"input_text", text:m.content || (content.length ? "Please analyze the attached file(s)." : "") });
    input.push({ role:"user", content });
  }
  return { input, instructions };
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const parts = [];
  for (const item of payload?.output || []) for (const c of item?.content || []) if (c?.type === "output_text" && c.text) parts.push(c.text);
  return parts.join("\n").trim();
}

async function updateChatSummary(env, user, chatId) {
  if (!env.OPENAI_API_KEY || !user.memory_enabled || (await getSetting(env,"memory_enabled","true")) === "false") return;
  const rows = await env.DB.prepare("SELECT role,content FROM messages WHERE chat_id=? AND status='complete' ORDER BY rowid DESC LIMIT 18").bind(chatId).all();
  const transcript = (rows.results || []).reverse().map(x => `${x.role}: ${x.content}`).join("\n").slice(0,28000);
  if (!transcript.trim()) return;
  const prompt = `Create a compact memory summary of this conversation for future relevant chats. Preserve stable preferences, project facts, decisions, names the user explicitly supplied, and unresolved tasks. Do not invent anything. Avoid sensitive personal data unless it is necessary to the user's ongoing task. Max 180 words.\n\n${transcript}`;
  const r = await fetch("https://api.openai.com/v1/responses", { method:"POST", headers:{"authorization":`Bearer ${env.OPENAI_API_KEY}`,"content-type":"application/json"}, body:JSON.stringify({ model:env.OPENAI_MODEL||"gpt-6-luna", input:prompt, reasoning:{effort:"low"}, max_output_tokens:350, store:false }) });
  if (!r.ok) return;
  const data = await r.json(); const summary = extractOutputText(data).slice(0,5000); if (!summary) return;
  await env.DB.prepare(`INSERT INTO chat_summaries(chat_id,user_id,summary,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(chat_id) DO UPDATE SET summary=excluded.summary,updated_at=CURRENT_TIMESTAMP`).bind(chatId,user.id,summary).run();
}

function makeLocalTitle(text, files) {
  const t = String(text || "").replace(/\s+/g," ").trim();
  if (t) return t.length > 54 ? t.slice(0,54).replace(/\s+\S*$/,"") + "…" : t;
  return files ? "File analysis" : "New chat";
}

function requireAdmin(user) { return user.role === "admin" ? null : json({ error:"Admin access required" },403); }

async function adminStats(env, user) {
  const deny = requireAdmin(user); if (deny) return deny;
  const [users,chats,messages,files,usage] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS c FROM users").first(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM chats").first(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM messages").first(),
    env.DB.prepare("SELECT COUNT(*) AS c, COALESCE(SUM(size_bytes),0) AS bytes FROM attachments").first(),
    env.DB.prepare("SELECT COALESCE(SUM(input_tokens),0) AS input_tokens,COALESCE(SUM(output_tokens),0) AS output_tokens,COALESCE(SUM(total_tokens),0) AS total_tokens FROM usage_events").first()
  ]);
  return json({ stats:{ users:Number(users.c||0), chats:Number(chats.c||0), messages:Number(messages.c||0), files:Number(files.c||0), storage_bytes:Number(files.bytes||0), ...usage } });
}

async function adminUsers(env,user,url) {
  const deny=requireAdmin(user); if(deny)return deny;
  const q=(url.searchParams.get("q")||"").trim().slice(0,100);
  const rows=q?await env.DB.prepare("SELECT id,name,email,role,status,memory_enabled,created_at,last_seen_at FROM users WHERE name LIKE ? OR email LIKE ? ORDER BY created_at DESC LIMIT 300").bind(`%${q}%`,`%${q}%`).all():await env.DB.prepare("SELECT id,name,email,role,status,memory_enabled,created_at,last_seen_at FROM users ORDER BY created_at DESC LIMIT 300").all();
  return json({users:rows.results||[]});
}

async function adminPatchUser(request,env,admin,targetId) {
  const deny=requireAdmin(admin); if(deny)return deny; const body=await parseJson(request);
  if(targetId===admin.id && body.status==="suspended") return json({error:"You cannot suspend your own admin account."},400);
  if(["active","suspended"].includes(body.status)) await env.DB.prepare("UPDATE users SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(body.status,targetId).run();
  if(["user","admin"].includes(body.role)) await env.DB.prepare("UPDATE users SET role=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(body.role,targetId).run();
  return json({user:await env.DB.prepare("SELECT id,name,email,role,status,memory_enabled,created_at,last_seen_at FROM users WHERE id=?").bind(targetId).first()});
}

async function adminGetSettings(env,user) {
  const deny=requireAdmin(user); if(deny)return deny; const rows=await env.DB.prepare("SELECT key,value,updated_at FROM app_settings ORDER BY key").all();
  return json({settings:Object.fromEntries((rows.results||[]).map(x=>[x.key,x.value])),model:env.OPENAI_MODEL||"gpt-6-luna",max_upload_mb:Number(env.MAX_UPLOAD_MB||18)});
}

async function adminSaveSettings(request,env,user) {
  const deny=requireAdmin(user); if(deny)return deny; const body=await parseJson(request);
  const allowed=new Set(["system_prompt","signups_enabled","memory_enabled","web_search_enabled","image_detail","max_pins"]);
  const stmts=[];
  for(const [k,v0] of Object.entries(body||{})) {
    if(!allowed.has(k)) continue; let v=String(v0);
    if(["signups_enabled","memory_enabled","web_search_enabled"].includes(k)) v=(v0===true||v0==="true")?"true":"false";
    if(k==="image_detail"&&!['auto','low','high','original'].includes(v)) continue;
    if(k==="max_pins") v=String(Math.min(10,Math.max(1,Number(v)||5)));
    if(k==="system_prompt") v=cleanText(v,20000);
    stmts.push(env.DB.prepare(`INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).bind(k,v));
  }
  if(stmts.length) await env.DB.batch(stmts); return adminGetSettings(env,user);
}
