import asyncio
import logging

from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart
from aiogram.types import Message, CallbackQuery

import config
import keyboards as kb
from username_gen import generate_batch
from rating import liquidity
from checker import UsernameChecker

logging.basicConfig(level=logging.INFO)

bot = Bot(token=config.BOT_TOKEN)
dp = Dispatcher()
checker = UsernameChecker()


# ---------------- /start ----------------
@dp.message(CommandStart())
async def cmd_start(msg: Message):
    await msg.answer(
        "👁 <b>Tag Searcher</b> — поиск свободных юзернеймов\n\n"
        "Каждый найденный ник проходит двойную проверку:\n"
        "• <b>Telegram</b> — не занят профилем, каналом или ботом\n"
        "• <b>Fragment</b> — не выставлен на аукцион или продажу\n\n"
        "♾️ <b>Все функции бесплатны и без лимитов.</b>\n\n"
        "Нажми «🔍 ПОИСК», чтобы начать.",
        reply_markup=kb.main_menu(),
        parse_mode="HTML",
    )


# ---------------- Меню ----------------
@dp.message(F.text == "🔍 ПОИСК")
async def open_search(msg: Message):
    await msg.answer(
        "💎 <b>ПОИСК ЮЗЕРНЕЙМА</b>\n\n♾️ Попыток сегодня: <b>безлимит</b>\n\nВыберите раздел 👇",
        reply_markup=kb.search_sections(),
        parse_mode="HTML",
    )


@dp.message(F.text == "👤 Профиль")
async def profile(msg: Message):
    await msg.answer(
        f"👤 <b>Профиль</b>\n\n"
        f"ID: <code>{msg.from_user.id}</code>\n"
        f"Статус: ♾️ Безлимит (бесплатная сборка)\n"
        f"Премиум: не требуется ✅",
        parse_mode="HTML",
    )


@dp.message(F.text == "💎 Премиум")
async def premium(msg: Message):
    await msg.answer("💎 В этой сборке все Premium-функции уже открыты бесплатно 🎉")


@dp.message(F.text == "👥 Рефералы")
async def referrals(msg: Message):
    me = await bot.get_me()
    await msg.answer(
        f"👥 Твоя реферальная ссылка:\n"
        f"https://t.me/{me.username}?start=ref{msg.from_user.id}"
    )


@dp.message(F.text == "🛟 Поддержка")
async def support(msg: Message):
    await msg.answer("🛟 Это open-source копия. Вопросы — в репозитории проекта.")


# ---------------- Inline: разделы ----------------
@dp.callback_query(F.data == "sec:open")
async def cb_open(cb: CallbackQuery):
    await cb.message.edit_text(
        "💎 <b>ПОИСК ЮЗЕРНЕЙМА</b>\n\nВыберите раздел 👇",
        reply_markup=kb.search_sections(),
        parse_mode="HTML",
    )
    await cb.answer()


@dp.callback_query(F.data == "sec:back")
async def cb_back(cb: CallbackQuery):
    await cb.message.delete()
    await cb.answer("Главное меню")


@dp.callback_query(F.data.in_({"sec:5", "sec:6"}))
async def cb_section_len(cb: CallbackQuery):
    length = int(cb.data.split(":")[1])
    await cb.message.edit_text(
        f"💎 Раздел: <b>{length} букв</b>\n\nНайти ник с цифрами или без?",
        reply_markup=kb.digits_choice(length),
        parse_mode="HTML",
    )
    await cb.answer()


@dp.callback_query(F.data == "sec:filter")
async def cb_filter(cb: CallbackQuery):
    await cb.message.answer(
        "🔎 <b>Фильтр</b>\n\nОтправь маску, где <code>?</code> — любая буква.\n"
        "Пример: <code>a?b?c</code>",
        parse_mode="HTML",
    )
    await cb.answer()


@dp.callback_query(F.data == "sec:trap")
async def cb_trap(cb: CallbackQuery):
    await cb.message.answer(
        "🔔 <b>Ловушка</b>\n\nОтправь ник в формате <code>/trap username</code> — "
        "бот будет проверять его и пришлёт уведомление, как только он освободится.",
        parse_mode="HTML",
    )
    await cb.answer()


# ---------------- Запуск поиска ----------------
@dp.callback_query(F.data.startswith("go:"))
async def cb_go(cb: CallbackQuery):
    parts = cb.data.split(":")

    if parts[1] == "again":
        length, with_digits = 6, False
    else:
        length = int(parts[1])
        with_digits = parts[2] == "dig"

    await cb.answer("Запускаю поиск…")
    status = await cb.message.answer("⏳ Проверяю Telegram + Fragment…\nПрогресс: 0/0")

    candidates = generate_batch(length, config.SEARCH_BATCH, with_digits)

    async def on_progress(i, total, username):
        try:
            await status.edit_text(
                f"⏳ Проверяю: <code>@{username}</code>\n"
                f"Telegram + Fragment…\nПрогресс: {i}/{total}",
                parse_mode="HTML",
            )
        except Exception:
            pass

    found = await checker.find_free(candidates, on_progress=on_progress)

    if found:
        score, label = liquidity(found)
        await status.edit_text(
            f"✅ <b>НИК НАЙДЕН!</b>\n\n"
            f"┌ <code>@{found}</code>\n"
            f"└ {len(found)} букв\n\n"
            f"├ Ликвидность — {score}/10\n"
            f"├ Оценка — {label}\n"
            f"└ ⚡ Свободен",
            reply_markup=kb.result_kb(found),
            parse_mode="HTML",
        )
    else:
        await status.edit_text(
            "😕 Свободных ников в этой партии не нашлось.\nПопробуй ещё раз 👇",
            reply_markup=kb.digits_choice(length),
        )


@dp.callback_query(F.data == "close")
async def cb_close(cb: CallbackQuery):
    await cb.message.delete()
    await cb.answer()


# ---------------- Фильтр по маске ----------------
@dp.message(F.text.regexp(r"^[a-z?]{4,8}$"))
async def mask_search(msg: Message):
    import random, string
    mask = msg.text.lower()
    candidates = []
    for _ in range(config.SEARCH_BATCH):
        candidates.append("".join(
            random.choice(string.ascii_lowercase) if c == "?" else c for c in mask
        ))
    status = await msg.answer("⏳ Проверяю по маске…")
    found = await checker.find_free(candidates)
    if found:
        score, label = liquidity(found)
        await status.edit_text(
            f"✅ <b>НИК НАЙДЕН!</b>\n\n<code>@{found}</code>\n"
            f"Ликвидность — {score}/10 · {label}",
            reply_markup=kb.result_kb(found),
            parse_mode="HTML",
        )
    else:
        await status.edit_text("😕 По этой маске свободных ников не нашлось.")


# ---------------- Ловушка ----------------
@dp.message(F.text.startswith("/trap"))
async def trap(msg: Message):
    parts = msg.text.split(maxsplit=1)
    if len(parts) < 2:
        await msg.answer("Использование: <code>/trap username</code>", parse_mode="HTML")
        return
    username = parts[1].lstrip("@")
    await msg.answer(f"🔔 Ловушка на <code>@{username}</code> установлена.", parse_mode="HTML")
    asyncio.create_task(_trap_loop(msg.chat.id, username))


async def _trap_loop(chat_id: int, username: str):
    while True:
        free, _ = await checker.is_free(username)
        if free:
            await bot.send_message(
                chat_id,
                f"⚡️ Ник <code>@{username}</code> освободился!",
                parse_mode="HTML",
            )
            return
        await asyncio.sleep(60)  # проверка раз в минуту


# ---------------- main ----------------
async def main():
    await checker.start()
    try:
        await dp.start_polling(bot)
    finally:
        await checker.stop()


if __name__ == "__main__":
    asyncio.run(main())
