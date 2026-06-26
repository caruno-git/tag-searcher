from aiogram.types import (
    ReplyKeyboardMarkup, KeyboardButton,
    InlineKeyboardMarkup, InlineKeyboardButton,
)


def main_menu() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="🔍 ПОИСК"), KeyboardButton(text="💎 Премиум")],
            [KeyboardButton(text="👤 Профиль"), KeyboardButton(text="👥 Рефералы")],
            [KeyboardButton(text="🛟 Поддержка")],
        ],
        resize_keyboard=True,
    )


def search_sections() -> InlineKeyboardMarkup:
    # В копии всё разблокировано — замочки убраны
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="5 букв", callback_data="sec:5"),
            InlineKeyboardButton(text="6 букв", callback_data="sec:6"),
        ],
        [
            InlineKeyboardButton(text="🔎 Фильтр", callback_data="sec:filter"),
            InlineKeyboardButton(text="🔔 Ловушка", callback_data="sec:trap"),
        ],
        [InlineKeyboardButton(text="↩️ Назад", callback_data="sec:back")],
    ])


def digits_choice(length: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="Без цифр", callback_data=f"go:{length}:nodig"),
            InlineKeyboardButton(text="🔢 С цифрами", callback_data=f"go:{length}:dig"),
        ],
        [InlineKeyboardButton(text="↩️ Назад", callback_data="sec:open")],
    ])


def result_kb(username: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🔗 Открыть", url=f"https://t.me/{username}")],
        [
            InlineKeyboardButton(text="⏭ Пропустить", callback_data="go:again"),
            InlineKeyboardButton(text="✖️ Закрыть", callback_data="close"),
        ],
    ])
