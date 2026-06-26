import asyncio
import logging
import random

from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart
from aiogram.types import Message, CallbackQuery

import config
import keyboards as kb
from wordsource import WordSource
from rating import liquidity
from checker import UsernameChecker

logging.basicConfig(level=logging.INFO)

bot = Bot(token=config.BOT_TOKEN)
dp = Dispatcher()
checker = UsernameChecker()
words = WordSource()


# ---------------- /start ----------------
@dp.message(CommandStart())
async def cmd_start(msg: Message):
    await msg.answer(
        "\U0001F441 <b>Tag Searcher</b> — поиск свободных юзернеймов\n\n"
        "Ники подбираются из <b>реальных словарных слов</b> (Datamuse), а не случайных букв.\n\n"
        "Каждый найденный ник проходит двойную проверку:\n"
        "• <b>Telegram</b> — не занят профилем, каналом или ботом\n"
        "• <b>Fragment</b> — не выставлен на аукцион или продажу\n\n"
        "\u267E\uFE0F <b>Все функции бесплатны и без лимитов.</b>\n\n"
        "Нажми «\U0001F50D ПОИСК», чтобы начать.",
        reply_markup=kb.main_menu(),
        parse_mode="HTML",
    )


# ---------------- Меню ----------------
@dp.message(F.text == "\U0001F50D ПОИСК")
async def open_search(msg: Message):
    await msg.answer(
        "\U0001F48E <b>ПОИСК ЮЗЕРНЕЙМА</b>\n\n\u267E\uFE0F Попыток сегодня: <b>безлимит</b>\n\n"
        "Ники — из реальных слов словаря.\n\nВыберите раздел \U0001F447",
        reply_markup=kb.search_sections(),
        parse_mode="HTML",
    )


@dp.message(F.text == "\U0001F464 Профиль")
async def profile(msg: Message):
    await msg.answer(
        f"\U0001F464 <b>Профиль</b>\n\n"
        f"ID: <code>{msg.from_user.id}</code>\n"
        f"Статус: \u267E\uFE0F Безлимит (бесплатная сборка)\n"
        f"Премиум: не требуется \u2705",
        parse_mode="HTML",
    )


@dp.message(F.text == "\U0001F48E Премиум")
async def premium(msg: Message):
    await msg.answer("\U0001F48E В этой сборке все Premium-функции уже открыты бесплатно \U0001F389")


@dp.message(F.text == "\U0001F465 Рефералы")
async def referrals(msg: Message):
    me = await bot.get_me()
    await msg.answer(
        f"\U0001F465 Твоя реферальная ссылка:\n"
        f"https://t.me/{me.username}?start=ref{msg.from_user.id}"
    )


@dp.message(F.text == "\U0001F6DF Поддержка")
async def support(msg: Message):
    await msg.answer("\U0001F6DF Это open-source копия. Вопросы — в репозитории проекта.")


# ---------------- Inline: разделы ----------------
@dp.callback_query(F.data == "sec:open")
async def cb_open(cb: CallbackQuery):
    await cb.message.edit_text(
        "\U0001F48E <b>ПОИСК ЮЗЕРНЕЙМА</b>\n\nВыберите раздел \U0001F447",
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
        f"\U0001F48E Раздел: <b>{length} букв</b>\n\nНайти ник с цифрами или без?",
        reply_markup=kb.digits_choice(length),
        parse_mode="HTML",
    )
    await cb.answer()


@dp.callback_query(F.data == "sec:filter")
async def cb_filter(cb: CallbackQuery):
    await cb.message.answer(
        "\U0001F50E <b>Фильтр</b>\n\nОтправь маску, где <code>?</code> — любая буква.\n"
        "Пример: <code>a?b?c</code> — подберём реальные слова по маске.",
        parse_mode="HTML",
    )
    await cb.answer()


@dp.callback_query(F.data == "sec:trap")
async def cb_trap(cb: CallbackQuery):
    await cb.message.answer(
        "\U0001F514 <b>Ловушка</b>\n\nОтправь ник в формате <code>/trap username</code> — "
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

    await cb.answer("Запускаю поиск\u2026")
    status = await cb.message.answer("\u23F3 Подбираю слова и проверяю Telegram + Fragment\u2026")

    candidates = await words.sample(length, config.SEARCH_BATCH, with_digits)
    if not candidates:
        await status.edit_text("\u26A0\uFE0F Не удалось получить слова. Попробуй ещё раз позже.")
        return

    async def on_progress(i, total, username):
        try:
            await status.edit_text(
                f"\u23F3 Проверяю: <code>@{username}</code>\n"
                f"Telegram + Fragment\u2026\nПрогресс: {i}/{total}",
                parse_mode="HTML",
            )
        except Exception:
            pass

    found = await checker.find_free(candidates, on_progress=on_progress)

    if found:
        score, label = liquidity(found)
        await status.edit_text(
            f"\u2705 <b>НИК НАЙДЕН!</b>\n\n"
            f"\u250C <code>@{found}</code>\n"
            f"\u2514 {len(found)} букв \u00B7 реальное слово\n\n"
            f"\u251C Ликвидность — {score}/10\n"
            f"\u251C Оценка — {label}\n"
            f"\u2514 \u26A1 Свободен",
            reply_markup=kb.result_kb(found),
            parse_mode="HTML",
        )
    else:
        await status.edit_text(
            "\U0001F615 Свободных ников в этой партии не нашлось.\nПопробуй ещё раз \U0001F447",
            reply_markup=kb.digits_choice(length),
        )


@dp.callback_query(F.data == "close")
async def cb_close(cb: CallbackQuery):
    await cb.message.delete()
    await cb.answer()


# ---------------- Фильтр по маске ----------------
@dp.message(F.text.regexp(r"^[a-z?]{4,8}$"))
async def mask_search(msg: Message):
    mask = msg.text.lower()
    candidates = await words.words_by_mask(mask)
    if not candidates:
        await msg.answer("\U0001F615 По этой маске реальных слов не нашлось.")
        return
    random.shuffle(candidates)
    candidates = candidates[:config.SEARCH_BATCH]
    status = await msg.answer("\u23F3 Проверяю реальные слова по маске\u2026")
    found = await checker.find_free(candidates)
    if found:
        score, label = liquidity(found)
        await status.edit_text(
            f"\u2705 <b>НИК НАЙДЕН!</b>\n\n<code>@{found}</code>\n"
            f"Ликвидность — {score}/10 \u00B7 {label}",
            reply_markup=kb.result_kb(found),
            parse_mode="HTML",
        )
    else:
        await status.edit_text("\U0001F615 По этой маске свободных ников не нашлось.")


# ---------------- Ловушка ----------------
@dp.message(F.text.startswith("/trap"))
async def trap(msg: Message):
    parts = msg.text.split(maxsplit=1)
    if len(parts) < 2:
        await msg.answer("Использование: <code>/trap username</code>", parse_mode="HTML")
        return
    username = parts[1].lstrip("@")
    await msg.answer(f"\U0001F514 Ловушка на <code>@{username}</code> установлена.", parse_mode="HTML")
    asyncio.create_task(_trap_loop(msg.chat.id, username))


async def _trap_loop(chat_id: int, username: str):
    while True:
        free, _ = await checker.is_free(username)
        if free:
            await bot.send_message(
                chat_id,
                f"\u26A1\uFE0F Ник <code>@{username}</code> освободился!",
                parse_mode="HTML",
            )
            return
        await asyncio.sleep(60)  # проверка раз в минуту


# ---------------- main ----------------
async def main():
    await checker.start()
    await words.start()
    try:
        await dp.start_polling(bot)
    finally:
        await words.stop()
        await checker.stop()


if __name__ == "__main__":
    asyncio.run(main())
