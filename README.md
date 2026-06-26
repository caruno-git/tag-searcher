# tag-searcher

Бот для поиска свободных Telegram-юзернеймов с двойной проверкой **Telegram + Fragment**.

> Открытая сборка без Premium-подписки — все функции (5/6 букв, фильтр по маске, ловушка, безлимитный поиск) доступны бесплатно.

## Возможности
- 🔍 Поиск свободных ников 5 и 6 букв (с цифрами / без)
- 🔎 Фильтр по маске (`a?b?c`)
- 🔔 Ловушка на ник (`/trap username`)
- 📊 Оценка ликвидности ника 1..10

## Принцип работы
- **Telegram** — MTProto-метод `contacts.ResolveUsername` через Telethon (`UsernameNotOccupiedError` → свободен).
- **Fragment** — парсинг страницы `fragment.com/username/<ник>` (не выставлен ли на аукцион/продажу).

## Установка
```bash
pip install -r requirements.txt
cp .env.example .env   # заполни BOT_TOKEN, API_ID, API_HASH
python bot.py
```

1. Токен бота — у [@BotFather](https://t.me/BotFather)
2. `API_ID` и `API_HASH` — на https://my.telegram.org
3. При первом запуске Telethon попросит номер телефона и код (нужен user-аккаунт для проверки ников).

## ⚠️ Важно
- Telegram ограничивает частоту `ResolveUsername` (FloodWait) — не ставь маленький `CHECK_DELAY`.
- Fragment-парсинг зависит от вёрстки сайта; при изменениях поправь ключевые слова в `checker.py`.
