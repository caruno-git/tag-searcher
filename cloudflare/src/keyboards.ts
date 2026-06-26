// Клавиатуры в формате Telegram Bot API (reply_markup)

export const mainMenu = {
  keyboard: [
    [{ text: "🔍 ПОИСК" }, { text: "💎 Премиум" }],
    [{ text: "👤 Профиль" }, { text: "👥 Рефералы" }],
    [{ text: "🛟 Поддержка" }],
  ],
  resize_keyboard: true,
};

// Шаг 1 — выбор количества символов
export const lengthMenu = {
  inline_keyboard: [
    [
      { text: "4", callback_data: "len:4" },
      { text: "5", callback_data: "len:5" },
      { text: "6", callback_data: "len:6" },
      { text: "7", callback_data: "len:7" },
    ],
    [
      { text: "🔎 Фильтр", callback_data: "sec:filter" },
      { text: "🔔 Ловушка", callback_data: "sec:trap" },
    ],
    [{ text: "↩️ Назад", callback_data: "sec:back" }],
  ],
};

// Шаг 2 — словарь или рандом букв
export function sourceMenu(length: number) {
  return {
    inline_keyboard: [
      [
        { text: "📖 Словарь", callback_data: `src:${length}:dict` },
        { text: "🎲 Рандом букв", callback_data: `src:${length}:rand` },
      ],
      [{ text: "↩️ Назад", callback_data: "sec:open" }],
    ],
  };
}

// Шаг 3 — с цифрами или без
export function digitsMenu(length: number, source: string) {
  return {
    inline_keyboard: [
      [
        { text: "Без цифр", callback_data: `go:${length}:${source}:nodig` },
        { text: "🔢 С цифрами", callback_data: `go:${length}:${source}:dig` },
      ],
      [{ text: "↩️ Назад", callback_data: `len:${length}` }],
    ],
  };
}

export function continueKb(length: number, source: string, dig: string) {
  return {
    inline_keyboard: [
      [{ text: "🔄 Продолжить поиск", callback_data: `go:${length}:${source}:${dig}` }],
      [{ text: "↩️ В меню", callback_data: "sec:open" }],
    ],
  };
}

export function resultKb(username: string, length: number, source: string, dig: string) {
  return {
    inline_keyboard: [
      [{ text: "🔗 Открыть", url: `https://t.me/${username}` }],
      [
        { text: "⏭ Ещё", callback_data: `go:${length}:${source}:${dig}` },
        { text: "✖️ Закрыть", callback_data: "close" },
      ],
    ],
  };
}
