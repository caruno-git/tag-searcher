import { mainMenu, searchSections, digitsChoice, resultKb } from "./keyboards";
import { sample, wordsByMask, shuffle } from "./words";
import { isFree } from "./checker";
import { liquidity } from "./rating";

export interface Env {
  BOT_TOKEN: string;
  WEBHOOK_SECRET?: string;
  TRAPS: KVNamespace;
}

const BATCH = 12;

const START_TEXT =
  "👁 <b>Tag Searcher</b> — поиск свободных юзернеймов\n\n" +
  "Ники подбираются из <b>реальных словарных слов</b> (Datamuse).\n\n" +
  "Каждый ник проверяется:\n" +
  "• <b>Telegram</b> (t.me) — не занят профилем/каналом/ботом\n" +
  "• <b>Fragment</b> — не выставлен на аукцион/продажу\n\n" +
  "♾️ <b>Все функции бесплатны и без лимитов.</b>\n\n" +
  "Нажми «🔍 ПОИСК», чтобы начать.";

const SEARCH_TEXT =
  "💎 <b>ПОИСК ЮЗЕРНЕЙМА</b>\n\n♾️ Попыток: <b>безлимит</b>\n\nВыберите раздел 👇";

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
      await tg(env, "sendMessage", { chat_id: chatId, parse_mode: "HTML", reply_markup: searchSections, text: SEARCH_TEXT });
      return;
    case "💎 Премиум":
      await tg(env, "sendMessage", { chat_id: chatId, text: "💎 В этой сборке все Premium-функции открыты бесплатно 🎉" });
      return;
    case "👤 Профиль":
      await tg(env, "sendMessage", { chat_id: chatId, parse_mode: "HTML", text: `👤 <b>Профиль</b>\nID: <code>${msg.from.id}</code>\nСтатус: ♾️ Безлимит` });
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
    await tg(env, "editMessageText", { chat_id: chatId, message_id: messageId, parse_mode: "HTML", reply_markup: searchSections, text: SEARCH_TEXT });
    return;
  }
  if (data === "sec:back" || data === "close") {
    await tg(env, "deleteMessage", { chat_id: chatId, message_id: messageId });
    return;
  }
  if (data === "sec:5" || data === "sec:6") {
    const length = parseInt(data.split(":")[1], 10);
    await tg(env, "editMessageText", { chat_id: chatId, message_id: messageId, parse_mode: "HTML", reply_markup: digitsChoice(length), text: `💎 Раздел: <b>${length} букв</b>\n\nНайти ник с цифрами или без?` });
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
    const parts = data.split(":");
    let length: number;
    let withDigits: boolean;
    if (parts[1] === "again") {
      length = 6;
      withDigits = false;
    } else {
      length = parseInt(parts[1], 10);
      withDigits = parts[2] === "dig";
    }
    const status = await tg(env, "sendMessage", { chat_id: chatId, text: "⏳ Подбираю слова и проверяю Telegram + Fragment…" });
    const mid = status?.result?.message_id;
    const candidates = await sample(length, BATCH, withDigits);
    if (!candidates.length) {
      await tg(env, "editMessageText", { chat_id: chatId, message_id: mid, text: "⚠️ Не удалось получить слова. Попробуй позже." });
      return;
    }
    await runSearch(env, chatId, mid, candidates, length);
  }
}

async function handleMask(mask: string, chatId: number, env: Env): Promise<void> {
  let candidates = await wordsByMask(mask);
  if (!candidates.length) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "😕 По этой маске реальных слов не нашлось." });
    return;
  }
  candidates = shuffle(candidates).slice(0, BATCH);
  const status = await tg(env, "sendMessage", { chat_id: chatId, text: "⏳ Проверяю реальные слова по маске…" });
  await runSearch(env, chatId, status?.result?.message_id, candidates, mask.length);
}

async function runSearch(env: Env, chatId: number, messageId: number, candidates: string[], length: number): Promise<void> {
  let found: string | null = null;
  for (let i = 0; i < candidates.length; i++) {
    await tg(env, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "HTML",
      text: `⏳ Проверяю: <code>@${candidates[i]}</code>\nTelegram + Fragment…\nПрогресс: ${i + 1}/${candidates.length}`,
    });
    if (await isFree(candidates[i])) {
      found = candidates[i];
      break;
    }
  }

  if (found) {
    const [score, label] = liquidity(found);
    await tg(env, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "HTML",
      reply_markup: resultKb(found),
      text: `✅ <b>НИК НАЙДЕН!</b>\n\n┌ <code>@${found}</code>\n└ ${found.length} букв · реальное слово\n\n├ Ликвидность — ${score}/10\n├ Оценка — ${label}\n└ ⚡ Свободен`,
    });
  } else {
    await tg(env, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "HTML",
      reply_markup: digitsChoice(length),
      text: "😕 Свободных ников в этой партии не нашлось.\nПопробуй ещё раз 👇",
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
