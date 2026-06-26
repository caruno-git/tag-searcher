import { mainMenu, lengthMenu, sourceMenu, digitsMenu, continueKb, resultKb } from "./keyboards";
import { randBatch, dictBatch, wordsByMask, shuffle } from "./words";
import { isFree } from "./checker";
import { liquidity } from "./rating";

export interface Env {
  BOT_TOKEN: string;
  WEBHOOK_SECRET?: string;
  TRAPS: KVNamespace;
}

const API = "https://api.telegram.org/bot";
const TME = "https://t.me/";

// За один круг (держимся под лимитом запросов Cloudflare ~50/вызов).
const PER_ROUND_RAND = 40;
const PER_ROUND_DICT = 30;
const CHUNK = 10; // параллельных проверок за раз
const MAX_ROUNDS = 40; // предохранитель от бесконечного цикла

type Job = {
  chatId: number;
  messageId: number;
  length: number;
  source: string; // "dict" | "rand"
  withDigits: boolean;
  attempt: number;
  checked: number;
};

const START_TEXT =
  "👁 <b>Tag Searcher</b> — поиск свободных юзернеймов\n\n" +
  "Как работает:\n" +
  "1️⃣ Выбираешь длину (5–8)\n" +
  "2️⃣ Словарь 📖 или рандом букв 🎲\n" +
  "3️⃣ С цифрами или без\n" +
  "4️⃣ Бот САМ ищет пока не найдёт свободный ник\n\n" +
  "Проверка: <b>Telegram</b> (t.me) + <b>Fragment</b>.\n" +
  "♾ Всё бесплатно и без лимитов.\n\n" +
  "Нажми «🔍 ПОИСК».";

const SEARCH_TEXT = "💎 <b>ПОИСК ЮЗЕРНЕЙМА</b>\n\n♾ Попыток: <b>безлимит</b>\n\nВыбери количество символов 👇";

async function tg(env: Env, method: string, payload: Record<string, unknown>): Promise<any> {
  try {
    const res = await fetch(API + env.BOT_TOKEN + "/" + method, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (_) {
    return null;
  }
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "GET") return new Response("tag-searcher worker OK");
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

    // Внутреннее продолжение поиска.
    if (url.pathname === "/__continue") {
      if ((req.headers.get("x-internal-secret") ?? "") !== (env.WEBHOOK_SECRET ?? "")) {
        return new Response("forbidden", { status: 403 });
      }
      let job: Job;
      try {
        job = (await req.json()) as Job;
      } catch (_) {
        return new Response("bad request", { status: 400 });
      }
      ctx.waitUntil(searchRound(env, job, url.origin).catch((e) => console.error("round", e)));
      return new Response("OK");
    }

    // Telegram webhook (корень)
    if (env.WEBHOOK_SECRET) {
      const s = req.headers.get("x-telegram-bot-api-secret-token");
      if (s !== env.WEBHOOK_SECRET) return new Response("forbidden", { status: 403 });
    }
    let update: any;
    try {
      update = await req.json();
    } catch (_) {
      return new Response("bad request", { status: 400 });
    }
    ctx.waitUntil(handleUpdate(update, env, url.origin).catch((e) => console.error("update", e)));
    return new Response("OK");
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(checkTraps(env).catch((e) => console.error("cron", e)));
  },
};

async function handleUpdate(update: any, env: Env, origin: string): Promise<void> {
  if (update.message) return handleMessage(update.message, env, origin);
  if (update.callback_query) return handleCallback(update.callback_query, env, origin);
}

async function handleMessage(msg: any, env: Env, origin: string): Promise<void> {
  const chatId = msg.chat.id;
  const text: string = (msg.text || "").trim();
  if (!text) return;

  if (text === "/start" || text.startsWith("/start")) {
    await tg(env, "sendMessage", { chat_id: chatId, parse_mode: "HTML", reply_markup: mainMenu, text: START_TEXT });
    return;
  }
  if (text.startsWith("/trap")) {
    await handleTrap(msg, env);
    return;
  }

  switch (text) {
    case "🔍 ПОИСК":
      await tg(env, "sendMessage", { chat_id: chatId, parse_mode: "HTML", reply_markup: lengthMenu, text: SEARCH_TEXT });
      return;
    case "💎 Премиум":
      await tg(env, "sendMessage", { chat_id: chatId, text: "💎 В этой сборке все Premium-функции открыты бесплатно 🎉" });
      return;
    case "👤 Профиль":
      await tg(env, "sendMessage", { chat_id: chatId, parse_mode: "HTML", text: `👤 <b>Профиль</b>\nID: <code>${msg.from.id}</code>\nСтатус: ♾ Безлимит` });
      return;
    case "👥 Рефералы": {
      const me = await tg(env, "getMe", {});
      const un = me?.result?.username;
      await tg(env, "sendMessage", { chat_id: chatId, text: `👥 Твоя реферальная ссылка:\n${TME}${un}?start=ref${msg.from.id}` });
      return;
    }
    case "🛟 Поддержка":
      await tg(env, "sendMessage", { chat_id: chatId, text: "🛟 Open-source копия. Вопросы — в репозитории." });
      return;
  }

  if (/^[a-z?]{4,8}$/.test(text)) {
    await handleMask(text, chatId, env);
  }
}

async function handleCallback(cq: any, env: Env, origin: string): Promise<void> {
  const data: string = cq.data || "";
  const chatId = cq.message.chat.id;
  const messageId = cq.message.message_id;
  await tg(env, "answerCallbackQuery", { callback_query_id: cq.id });

  if (data === "sec:open") {
    await tg(env, "editMessageText", { chat_id: chatId, message_id: messageId, parse_mode: "HTML", reply_markup: lengthMenu, text: SEARCH_TEXT });
    return;
  }
  if (data === "sec:back" || data === "close") {
    await tg(env, "deleteMessage", { chat_id: chatId, message_id: messageId });
    return;
  }
  if (data.startsWith("len:")) {
    const length = parseInt(data.split(":")[1], 10);
    await tg(env, "editMessageText", { chat_id: chatId, message_id: messageId, parse_mode: "HTML", reply_markup: sourceMenu(length), text: `Длина: <b>${length}</b>\n\nОткуда брать ники?` });
    return;
  }
  if (data.startsWith("src:")) {
    const [, len, source] = data.split(":");
    const length = parseInt(len, 10);
    const label = source === "rand" ? "🎲 рандом букв" : "📖 словарь";
    await tg(env, "editMessageText", { chat_id: chatId, message_id: messageId, parse_mode: "HTML", reply_markup: digitsMenu(length, source), text: `Длина: <b>${length}</b> · ${label}\n\nС цифрами или без?` });
    return;
  }
  if (data === "sec:filter") {
    await tg(env, "sendMessage", { chat_id: chatId, parse_mode: "HTML", text: "🔎 <b>Фильтр</b>\n\nОтправь маску, где <code>?</code> — любая буква.\nПример: <code>a?b?c</code>" });
    return;
  }
  if (data === "sec:trap") {
    await tg(env, "sendMessage", { chat_id: chatId, parse_mode: "HTML", text: "🔔 <b>Ловушка</b>\n\n<code>/trap username</code> — пришлю уведомление, когда ник освободится." });
    return;
  }
  if (data.startsWith("go:")) {
    const [, len, source, digFlag] = data.split(":");
    const status = await tg(env, "sendMessage", { chat_id: chatId, text: "🔎 Запускаю автопоиск…" });
    const job: Job = {
      chatId,
      messageId: status?.result?.message_id,
      length: parseInt(len, 10),
      source,
      withDigits: digFlag === "dig",
      attempt: 1,
      checked: 0,
    };
    if (job.messageId) await searchRound(env, job, origin);
  }
}

// Один круг автопоиска — проверяем пачками, показывая живой прогресс.
async function searchRound(env: Env, job: Job, origin: string): Promise<void> {
  const isRand = job.source === "rand";
  const deep = !isRand;
  const perRound = isRand ? PER_ROUND_RAND : PER_ROUND_DICT;
  const batch = isRand
    ? randBatch(job.length, job.withDigits, perRound)
    : await dictBatch(job.length, job.withDigits, perRound);

  const srcLabel = isRand ? "🎲 рандом" : "📖 словарь";
  let found: string | null = null;
  let localChecked = 0;
  let last = "";
  for (let i = 0; i < batch.length && !found; i += CHUNK) {
    const slice = batch.slice(i, i + CHUNK);
    last = slice[slice.length - 1];
    // Живой показ: какой ник сейчас проверяем.
    await tg(env, "editMessageText", {
      chat_id: job.chatId,
      message_id: job.messageId,
      parse_mode: "HTML",
      text: `🔎 <b>Автопоиск</b> · ${srcLabel}\n\n⏳ Проверяю: <code>@${last}</code>\nПроверено: <b>${job.checked + i}</b>`,
    });
    const results = await Promise.all(
      slice.map(async (c) => ({ c, free: await isFree(c, deep) })),
    );
    localChecked += slice.length;
    const hit = results.find((r) => r.free);
    if (hit) found = hit.c;
  }
  const total = job.checked + localChecked;

  if (found) {
    await finalizeFound(env, job, found);
    return;
  }

  const dig = job.withDigits ? "dig" : "nodig";

  if (job.attempt < MAX_ROUNDS && batch.length > 0) {
    const next: Job = { ...job, attempt: job.attempt + 1, checked: total };
    let chained = false;
    try {
      const r = await fetch(`${origin}/__continue`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-secret": env.WEBHOOK_SECRET ?? "" },
        body: JSON.stringify(next),
      });
      chained = r.ok;
    } catch (_) {
      chained = false;
    }
    if (!chained) {
      await tg(env, "editMessageText", {
        chat_id: job.chatId,
        message_id: job.messageId,
        parse_mode: "HTML",
        reply_markup: continueKb(job.length, job.source, dig),
        text: `🔎 Проверено ${total} — свободных пока нет.\nЖми, чтобы продолжить 👇`,
      });
    }
    return;
  }

  await tg(env, "editMessageText", {
    chat_id: job.chatId,
    message_id: job.messageId,
    parse_mode: "HTML",
    reply_markup: continueKb(job.length, job.source, dig),
    text: `😕 Проверил ${total} ников — свободных пока нет.\nПопробуй «с цифрами» или рандом — там свободных много 👇`,
  });
}

async function finalizeFound(env: Env, job: Job, found: string): Promise<void> {
  const [score, label] = liquidity(found);
  const dig = job.withDigits ? "dig" : "nodig";
  const srcLabel = job.source === "rand" ? "случайные буквы" : "реальные слова";
  await tg(env, "editMessageText", {
    chat_id: job.chatId,
    message_id: job.messageId,
    parse_mode: "HTML",
    reply_markup: resultKb(found, job.length, job.source, dig),
    text: `✅ <b>НИК НАЙДЕН!</b>\n\n┌ <code>@${found}</code>\n└ ${srcLabel} · ${found.length} симв.\n\n├ Ликвидность — ${score}/10\n├ Оценка — ${label}\n└ ⚡ Свободен`,
  });
}

async function handleMask(mask: string, chatId: number, env: Env): Promise<void> {
  let candidates = await wordsByMask(mask);
  if (!candidates.length) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "😕 По этой маске реальных слов не нашлось." });
    return;
  }
  candidates = shuffle(candidates).slice(0, PER_ROUND_DICT);
  const status = await tg(env, "sendMessage", { chat_id: chatId, text: "⏳ Проверяю слова по маске…" });
  const messageId = status?.result?.message_id;
  let found: string | null = null;
  for (let i = 0; i < candidates.length && !found; i += CHUNK) {
    const slice = candidates.slice(i, i + CHUNK);
    const results = await Promise.all(slice.map(async (c) => ({ c, free: await isFree(c, true) })));
    const hit = results.find((r) => r.free);
    if (hit) found = hit.c;
  }
  if (found) {
    const [score, label] = liquidity(found);
    await tg(env, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "HTML",
      reply_markup: resultKb(found, found.length, "dict", "nodig"),
      text: `✅ <b>НИК НАЙДЕН!</b>\n\n┌ <code>@${found}</code>\n└ по маске <code>${mask}</code>\n\n├ Ликвидность — ${score}/10\n└ Оценка — ${label}`,
    });
  } else {
    await tg(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: "😕 По этой маске свободных не нашлось." });
  }
}

async function handleTrap(msg: any, env: Env): Promise<void> {
  const chatId = msg.chat.id;
  const parts = (msg.text || "").split(/\s+/);
  if (parts.length < 2) {
    await tg(env, "sendMessage", { chat_id: chatId, parse_mode: "HTML", text: "Использование: <code>/trap username</code>" });
    return;
  }
  const username = parts[1].replace(/^@/, "").toLowerCase();
  await env.TRAPS.put(`trap:${chatId}:${username}`, JSON.stringify({ chatId, username, created: Date.now() }));
  await tg(env, "sendMessage", { chat_id: chatId, parse_mode: "HTML", text: `🔔 Ловушка на <code>@${username}</code> установлена. Проверяю каждые пару минут.` });
}

async function checkTraps(env: Env): Promise<void> {
  const list = await env.TRAPS.list({ prefix: "trap:" });
  for (const key of list.keys) {
    const raw = await env.TRAPS.get(key.name);
    if (!raw) continue;
    const t = JSON.parse(raw) as { chatId: number; username: string };
    if (await isFree(t.username)) {
      await tg(env, "sendMessage", { chat_id: t.chatId, parse_mode: "HTML", text: `⚡️ Ник <code>@${t.username}</code> освободился!` });
      await env.TRAPS.delete(key.name);
    }
  }
}
