// Проверка свободности ника без MTProto (Workers не умеют в Telethon):
//   1) t.me/<username> — есть ли публичный профиль/канал/бот
//   2) Fragment — выставлен ли на продажу/аукцион

const UA = "Mozilla/5.0 (compatible; tag-searcher/1.0)";

export async function checkTelegram(username: string): Promise<"free" | "taken"> {
  try {
    const res = await fetch(`{{https://t.me/${username}}}`, { headers: { "User-Agent": UA } });
    if (res.status === 404) return "free";
    const html = await res.text();
    // На занятом нике t.me рендерит блок профиля/канала.
    // Эти классы появляются только когда есть реальный аккаунт (CSS t.me внешний).
    const occupied =
      html.includes("tgme_page_title") ||
      html.includes("tgme_page_extra") ||
      html.includes("tgme_page_context_link");
    return occupied ? "taken" : "free";
  } catch (_) {
    // При ошибке сети не врём «свободен» — лучше пропустить.
    return "taken";
  }
}

export async function checkFragment(username: string): Promise<"free" | "sale" | "taken"> {
  try {
    const res = await fetch(`{{https://fragment.com/username/${username}}}`, { headers: { "User-Agent": UA } });
    const html = (await res.text()).toLowerCase();
    if (/(for sale|on auction|place a bid|buy now|highest bid)/.test(html)) return "sale";
    if (/(taken|sold|unavailable)/.test(html)) return "taken";
    return "free";
  } catch (_) {
    return "free";
  }
}

export async function isFree(username: string): Promise<boolean> {
  // Основной сигнал — Telegram. Fragment только отсекает выставленные на продажу.
  const tg = await checkTelegram(username);
  if (tg !== "free") return false;
  const fr = await checkFragment(username);
  return fr !== "sale" && fr !== "taken";
}
