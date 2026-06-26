// Проверка свободности ника без MTProto (Workers не умеют в Telethon):
//   1) t.me/<username> — есть ли публичный профиль/канал/бот
//   2) Fragment — выставлен ли на продажу/аукцион (только для глубокой проверки)

const UA = "Mozilla/5.0 (compatible; tag-searcher/1.0)";

export async function checkTelegram(username: string): Promise<"free" | "taken"> {
  try {
    const res = await fetch(`https://t.me/${username}`, { headers: { "User-Agent": UA } });
    if (res.status === 404) return "free";
    const html = await res.text();
    // Эти классы рендерятся только когда есть реальный аккаунт (CSS t.me внешний).
    const occupied =
      html.includes("tgme_page_title") ||
      html.includes("tgme_page_extra") ||
      html.includes("tgme_page_context_link");
    return occupied ? "taken" : "free";
  } catch (_) {
    return "taken";
  }
}

export async function checkFragment(username: string): Promise<"free" | "sale" | "taken"> {
  try {
    const res = await fetch(`https://fragment.com/username/${username}`, { headers: { "User-Agent": UA } });
    const html = (await res.text()).toLowerCase();
    if (/(for sale|on auction|place a bid|buy now|highest bid)/.test(html)) return "sale";
    if (/(taken|sold|unavailable)/.test(html)) return "taken";
    return "free";
  } catch (_) {
    return "free";
  }
}

// deepFragment=false экономит запросы (для рандомных строк Fragment не нужен).
export async function isFree(username: string, deepFragment = true): Promise<boolean> {
  const tg = await checkTelegram(username);
  if (tg !== "free") return false;
  if (!deepFragment) return true;
  const fr = await checkFragment(username);
  return fr !== "sale" && fr !== "taken";
}
