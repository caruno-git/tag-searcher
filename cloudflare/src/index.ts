import { mainMenu, lengthMenu, sourceMenu, digitsMenu, continueKb, resultKb } from "./keyboards";
import { randBatch, dictBatch, wordsByMask, shuffle } from "./words";
import { isFree } from "./checker";
import { liquidity } from "./rating";

export interface Env {
  BOT_TOKEN: string;
  WEBHOOK_SECRET?: string;
  TRAPS: KVNamespace;
}

// Лимит внешних запросов Cloudflare (free ~50/вызов). Держимся под ним.
const CHUNK = 12;
const MAX_CHECKS_RAND = 35; // рандом: 1 запрос на ник
const MAX_CHECKS_DICT = 16; // словарь: до 2 запросов на ник

const START_TEXT =
  "👁 <b>Tag Searcher</b> — поиск свободных юзернеймов\n\n" +
  "Как работает:\n" +
  "1️⃣ Выбираешь длину (4–7)\n" +
  "2️⃣ Словарь 📖 или рандом букв 🎲\n" +
  "3️⃣ С цифрами или без\n" +
  "4️⃣ Бот крутит подбор, пока не найдёт свободный ник\n\n" +
  "Проверка: <b>Telegram</b> (t.me) + <b>Fragment</b>.\n" +
  "♾ Всё бесплатно и без лимитов.\n\n" +
  "Нажми «🔍 ПОИСК».";

const SEARCH_TEXT = "💎 <b>ПОИСК ЮЗЕРНЕЙМА</b>\n\n♾ Попыток: <b>безлимит</b>\n\nВыбери количество символов 👇";

async function tg(env: Env, method: string, payload: Record<string, unknown>): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (req.method === "GET") return new Response("tag-searcher worker OK");
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

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

    ctx.waitUntil(handleUpdate(update, env).catch((e) => console.error(e)));
    return new Response("OK");
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(checkTraps(env));
  },
};

async function handleUpdate(update: any, env: Env): Promise<void> {
  if (update.message) return handleMessage(update.message, env);
  if (update.callback_query) return handleCallback(update.callback_query, env);
}

async function handleMessage(msg: any, env: Env): Promise<void> {
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
      await tg(env, "sendMessage", { chat_id: chatId, text: `👥 Твоя реферальная ссылка:\nhttps://t.me/${un}?start=ref${msg.from.id}` });
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

async function handleCallback(cq: any, env: Env): Promise<void> {
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
    const length = parseInt(len, 10);
    const withDigits = digFlag === "dig";
    const status = await tg(env, "sendMessage", { chat_id: chatId, text: "⏳ Кручу подбор и проверяю Telegram…" });
    await runSearch(env, chatId, status?.result?.message_id, length, source, withDigits);
  }
}

async function handleMask(mask: string, chatId: number, env: Env): Promise<void> {
  let candidates = await wordsByMask(mask);
  if (!candidates.length) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "😕 По этой маске реальных слов не нашлось." });
    return;
  }
  candidates = shuffle(candidates).slice(0, MAX_CHECKS_DICT);
  const status = await tg(env, "sendMessage", { chat_id: chatId, text: "⏳ Проверяю реальные слова по маске…" });
  await runLoop(env, chatId, status?.result?.message_id, candidates, mask.length, "dict", false, true);
}

// Поиск по выбранным параметрам (длина/источник/цифры) пачками, пока не найдёт.
async function runSearch(env: Env, chatId: number, messageId: number, length: number, source: string, withDigits: boolean): Promise<void> {
  const isRand = source === "rand";
  const maxChecks = isRand ? MAX_CHECKS_RAND : MAX_CHECKS_DICT;
  const candidates: string[] = [];
  while (candidates.length < maxChecks) {
    const batch = isRand ? randBatch(length, withDigits, CHUNK) : await dictBatch(length, withDigits, CHUNK);
    if (!batch.length) break;
    for (const c of batch) {
      if (candidates.length >= maxChecks) break;
      if (!candidates.includes(c)) candidates.push(c);
    }
    if (!isRand && batch.length < CHUNK) break; // словарь исчерпан
  }
  await runLoop(env, chatId, messageId, candidates, length, source, withDigits, !isRand);
}

async function runLoop(env: Env, chatId: number, messageId: number, candidates: string[], length: number, source: string, withDigits: boolean, deepFragment: boolean): Promise<void> {
  const dig = withDigits ? "dig" : "nodig";
  let found: string | null = null;
  for (let i = 0; i < candidates.length; i++) {
    if (i === 0 || i % 8 === 0) {
      await tg(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML",
        text: `⏳ Проверяю: <code>@${candidates[i]}</code>\nПрогресс: ${i + 1}/${candidates.length}`,
      });
    }
    if (await isFree(candidates[i], deepFragment)) {
      found = candidates[i];
      break;
    }
  }

  if (found) {
    const [score, label] = liquidity(found);
    const srcLabel = source === "rand" ? "случайные буквы" : "реальные слова";
    await tg(env, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "HTML",
      reply_markup: resultKb(found, length, source, dig),
      text: `✅ <b>НИК НАЙДЕН!</b>\n\n┌ <code>@${found}</code>\n└ ${srcLabel} · ${found.length} симв.\n\n├ Ликвидность — ${score}/10\n├ Оценка — ${label}\n└ ⚡ Свободен`,
    });
  } else {
    await tg(env, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "HTML",
      reply_markup: continueKb(length, source, dig),
      text: `😕 За ${candidates.length} проверок свободного не нашлось.\nНажми «🔄 Продолжить поиск» — проверю следующую партию 👇`,
    });
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
