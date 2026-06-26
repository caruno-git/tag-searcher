// Durable Object — движок автопоиска.
// Почему так: Cloudflare ограничивает «воркер вызывает сам себя» 32 вызовами на одну
// изначальную сессию — после этого цепочка падает. Durable Object + Alarms лишён этого
// ограничения: объект делает порцию проверок, ставит себе будильник и просыпается снова.
// У alarm'ов гарантия выполнения (at-least-once) и авто-ретраи.
// Каждый поиск — свой отдельный объект (ключ чат:сообщение), поэтому параллельные
// поиски не делят состояние и не мешают друг другу.

import { DurableObject } from "cloudflare:workers";
import { randBatch, dictBatch } from "./words";
import { isFree } from "./checker";
import { liquidity } from "./rating";
import { continueKb, resultKb } from "./keyboards";

const API = "https://api.telegram.org/bot";

// Размер одного круга (держим под лимитом запросов на одно срабатывание alarm).
const PER_ROUND_RAND = 36; // рандом = 1 запрос/ник
const PER_ROUND_DICT = 18; // словарь = 2 запроса/ник (t.me + Fragment)
const CHUNK = 6;
const MAX_ROUNDS = 400; // теперь можно много — alarm'ы надёжны

export type Job = {
  chatId: number;
  messageId: number;
  length: number;
  source: string; // "dict" | "rand"
  withDigits: boolean;
  attempt: number;
  checked: number;
};

export interface DoEnv {
  BOT_TOKEN: string;
  WEBHOOK_SECRET?: string;
  TRAPS: KVNamespace;
  SEARCH: DurableObjectNamespace<SearchSession>;
}

async function tg(token: string, method: string, payload: Record<string, unknown>): Promise<any> {
  try {
    const res = await fetch(API + token + "/" + method, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (_) {
    return null;
  }
}

export class SearchSession extends DurableObject<DoEnv> {
  // Старт новой сессии поиска: сохраняем задание и взводим будильник.
  async start(job: Job): Promise<void> {
    await this.ctx.storage.put("job", job);
    await this.ctx.storage.setAlarm(Date.now() + 50);
  }

  // Один круг поиска.
  async alarm(): Promise<void> {
    const job = await this.ctx.storage.get<Job>("job");
    if (!job) return;
    const token = this.env.BOT_TOKEN;

    const isRand = job.source === "rand";
    const deep = !isRand;
    const perRound = isRand ? PER_ROUND_RAND : PER_ROUND_DICT;
    const batch = isRand
      ? randBatch(job.length, job.withDigits, perRound)
      : await dictBatch(job.length, job.withDigits, perRound);

    const srcLabel = isRand ? "🎲 рандом" : "📖 словарь";

    // ОДИН апдейт прогресса на круг — чтобы не ловить Telegram 429 при параллельных поисках.
    if (batch.length > 0) {
      await tg(token, "editMessageText", {
        chat_id: job.chatId,
        message_id: job.messageId,
        parse_mode: "HTML",
        text: `🔎 <b>Автопоиск</b> · ${srcLabel}\n\n⏳ Проверяю партию: <code>@${batch[0]}</code> …\nВсего проверено: <b>${job.checked}</b>`,
      });
    }

    let found: string | null = null;
    let localChecked = 0;
    for (let i = 0; i < batch.length && !found; i += CHUNK) {
      const slice = batch.slice(i, i + CHUNK);
      const results = await Promise.all(
        slice.map(async (c) => ({ c, free: await isFree(c, deep) })),
      );
      localChecked += slice.length;
      const hit = results.find((r) => r.free);
      if (hit) found = hit.c;
    }
    const total = job.checked + localChecked;
    const dig = job.withDigits ? "dig" : "nodig";

    // Нашли свободный — финализируем и гасим сессию.
    if (found) {
      const [score, label] = liquidity(found);
      const srcFull = isRand ? "случайные буквы" : "реальные слова";
      await tg(token, "editMessageText", {
        chat_id: job.chatId,
        message_id: job.messageId,
        parse_mode: "HTML",
        reply_markup: resultKb(found, job.length, job.source, dig),
        text: `✅ <b>НИК НАЙДЕН!</b>\n\n┌ <code>@${found}</code>\n└ ${srcFull} · ${found.length} симв.\n\n├ Ликвидность — ${score}/10\n├ Оценка — ${label}\n└ ⚡ Свободен · проверено ${total}`,
      });
      await this.ctx.storage.deleteAll();
      return;
    }

    // Не нашли — ставим следующий круг через будильник.
    if (job.attempt < MAX_ROUNDS && batch.length > 0) {
      const next: Job = { ...job, attempt: job.attempt + 1, checked: total };
      await this.ctx.storage.put("job", next);
      await this.ctx.storage.setAlarm(Date.now() + 400);
      return;
    }

    // Исчерпали лимит кругов.
    await tg(token, "editMessageText", {
      chat_id: job.chatId,
      message_id: job.messageId,
      parse_mode: "HTML",
      reply_markup: continueKb(job.length, job.source, dig),
      text: `😕 Проверил ${total} ников — свободных пока нет.\nПопробуй «с цифрами» или рандом — там свободных много 👇`,
    });
    await this.ctx.storage.deleteAll();
  }
}
