// Клавиатуры в формате Telegram Bot API (reply_markup)

export const mainMenu = {
  keyboard: [
    [{ text: "🔍 ПОИСК" }, { text: "💎 Премиум" }],
    [{ text: "👤 Профиль" }, { text: "👥 Рефералы" }],
    [{ text: "🛟 Поддержка" }],
  ],
  resize_keyboard: true,
};

export const searchSections = {
  inline_keyboard: [
    [
      { text: "5 букв", callback_data: "sec:5" },
      { text: "6 букв", callback_data: "sec:6" },
    ],
    [
      { text: "🔎 Фильтр", callback_data: "sec:filter" },
      { text: "🔔 Ловушка", callback_data: "sec:trap" },
    ],
    [{ text: "↩️ Назад", callback_data: "sec:back" }],
  ],
};

export function digitsChoice(length: number) {
  return {
    inline_keyboard: [
      [
        { text: "Без цифр", callback_data: `go:${length}:nodig` },
        { text: "🔢 С цифрами", callback_data: `go:${length}:dig` },
      ],
      [{ text: "↩️ Назад", callback_data: "sec:open" }],
    ],
  };
}

export function resultKb(username: string) {
  return {
    inline_keyboard: [
      [{ text: "🔗 Открыть", url: `https://t.me/${username}` }],
      [
        { text: "⏭ Пропустить", callback_data: "go:again" },
        { text: "✖️ Закрыть", callback_data: "close" },
      ],
    ],
  };
}
