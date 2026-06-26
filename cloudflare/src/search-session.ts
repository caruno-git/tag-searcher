// Durable Object — движок автопоиска (надёжный фон через Alarms).
//
// Уроки, оплаченные кровью:
//  • «Воркер вызывает сам себя» ограничен 32 вызовами — поэтому Durable Object + Alarms.
//  • Free-план: 10ms CPU на вызов; перебор = фатальная ошибка 1102. Поэтому круги МАЛЕНЬКИЕ
//    и HTML сканируется частично (см. checker.ts).
//  • alarm() ретраится только 6 раз и сдаётся — поэтому ловим ошибки и сами планируем следующий круг.
//  • Каждый поиск — свой объект (ключ чат:сообщение), параллельные поиски не мешают друг другу.

import { DurableObject } from "cloudflare:workers";
import { randBatch, dictBatch } from "./words";
import { isFree } from "./checker";
import { liquidity } from "./rating";
import { continueKb, resultKb } from "./keyboards";

const API = "https://api.telegram.org/bot";

// Маленький круг = мало CPU и запросов на одно срабатывание alarm.
const PER_ROUND_RAND = 14; // рандом = 1 запрос/ник
const PER_ROUND_DICT = 8; // словарь = до 2 запросов/ник (t.me + Fragment)
const CHUNK = 4;
const MAX_ROUNDS = 800; // alarm'ы надёжны — можно много маленьких кругов

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
  // Старт новой сессии поиска.
  async start(job: Job): Promise<void> {
    await this.ctx.storage.put("job", job);
    await this.ctx.storage.setAlarm(Date.now() + 50);
  }

  // Срабатывание будильника: один круг. Обёрнуто в try/catch, чтобы разовая
  // сетевая ошибка не убивала поиск (просто планируем следующий круг).
  async alarm(): Promise<void> {
    const job = await this.ctx.storage.get<Job>("job");
    if (!job) return;
    try {
      await this.runRound(job);
    } catch (_) {
      if (job.attempt < MAX_ROUNDS) {
        const next: Job = { ...job, attempt: job.attempt + 1 };
        await this.ctx.storage.put("job", next);
        await this.ctx.storage.setAlarm(Date.now() + 2000);
      } else {
        await this.ctx.storage.deleteAll();
      }
    }
  }

  private async runRound(job: Job): Promise<void> {
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
        text: `🔎 <b>Автопоиск</b> · ${srcLabel}\n\n⏳ Проверяю: <code>@${batch[0]}</code> …\nВсего проверено: <b>${job.checked}</b>`,
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

    // Не нашли — следующий круг через будильник.
    if (job.attempt < MAX_ROUNDS && batch.length > 0) {
      const next: Job = { ...job, attempt: job.attempt + 1, checked: total };
      await this.ctx.storage.put("job", next);
      await this.ctx.storage.setAlarm(Date.now() + 300);
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
