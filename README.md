# tag-searcher

Бот для поиска свободных Telegram-юзернеймов с двойной проверкой **Telegram + Fragment**.

> Открытая сборка без Premium-подписки — все функции (5/6 букв, фильтр по маске, ловушка, безлимитный поиск) доступны бесплатно.

Ники подбираются из **реальных словарных слов** через бесплатный **Datamuse API**.

## Две версии

### 1. Python (VPS / Docker) — корень репо
Максимальная точность: проверка Telegram через **MTProto** (Telethon) + Fragment.
- `bot.py`, `checker.py`, `wordsource.py`, `rating.py`, `keyboards.py`, `config.py`
- Запуск: `pip install -r requirements.txt && python bot.py` (см. ниже).

### 2. Cloudflare Workers (serverless) — папка [`cloudflare/`](cloudflare/)
Без сервера: webhook + KV + Cron. Проверка Telegram через HTTP (`t.me` + Fragment), т.к. MTProto в Workers недоступен.
См. [`cloudflare/README.md`](cloudflare/README.md).

## Принцип работы
- **Словарь** — Datamuse API (`sp=?????` по длине, `sp=a?b?c` по маске). Без ключа, до 100k запросов/день.
- **Telegram** — MTProto (Python) или `t.me` (Cloudflare).
- **Fragment** — парсинг `fragment.com/username/<ник>`.

## Установка (Python)
```bash
pip install -r requirements.txt
cp .env.example .env   # заполни BOT_TOKEN, API_ID, API_HASH
python bot.py
```

1. Токен бота — у [@BotFather](https://t.me/BotFather)
2. `API_ID` и `API_HASH` — на https://my.telegram.org
3. При первом запуске Telethon попросит номер телефона и код.

## ⚠️ Важно
- Telegram ограничивает частоту запросов (FloodWait).
- Datamuse с 1 января 2027 потребует API-ключ; до этого работает без ключа.
- Fragment/t.me парсинг зависит от вёрстки; при изменениях поправь ключевые слова в `checker`.
