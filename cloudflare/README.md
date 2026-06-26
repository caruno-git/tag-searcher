# tag-searcher — Cloudflare Workers

Serverless-версия бота на **Cloudflare Workers** (без сервера и 24/7-процесса).

- Работает через **webhook** Telegram (не long-polling).
- Слова — из **Datamuse API**.
- «Ловушки» — в **KV** + проверка по **Cron Triggers**.

## ⚠️ Важное отличие от Python-версии
Workers не могут держать MTProto-сессию (Telethon — это Python с живым подключением).
Поэтому проверка Telegram идёт по HTTP:
- `t.me/<username>` — есть ли публичный профиль/канал/бот;
- `fragment.com/username/<username>` — выставлен ли на продажу/аукцион.

Это немного менее точно, чем MTProto (зарезервированные/забаненные ники могут проходить как «свободные»), но это единственный вариант, совместимый с serverless.
Если нужна MTProto-точность — используй Python-версию из корня репо на VPS/контейнере.

## Деплой
```bash
cd cloudflare
npm install

# 1) Создай KV и вставь id в wrangler.toml
npx wrangler kv namespace create TRAPS

# 2) Секреты
npx wrangler secret put BOT_TOKEN        # токен @BotFather
npx wrangler secret put WEBHOOK_SECRET   # любая случайная строка

# 3) Деплой
npx wrangler deploy
```

## Подключение webhook
После деплоя Worker получит URL вида `https://tag-searcher.<аккаунт>.workers.dev`.
Зарегистрируй его как webhook (с тем же WEBHOOK_SECRET):
```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://tag-searcher.<аккаунт>.workers.dev" \
  -d "secret_token=<WEBHOOK_SECRET>"
```

## Локальный запуск
```bash
npx wrangler dev
```

## Структура
- `src/index.ts` — webhook + scheduled (cron), роутинг апдейтов
- `src/telegram` (внутри index) — вызовы Bot API
- `src/words.ts` — Datamuse + фолбэк
- `src/checker.ts` — проверка t.me + Fragment
- `src/keyboards.ts` — клавиатуры
- `src/rating.ts` — оценка ликвидности
