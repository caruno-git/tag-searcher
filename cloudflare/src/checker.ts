// Проверка свободности ника без MTProto (Workers не умеют в Telethon):
//   1) Fragment — выставлен ли на продажу/аукцион
//   2) t.me/<username> — есть ли публичный профиль/канал/бот

const UA = "Mozilla/5.0 (compatible; tag-searcher/1.0)";

export async function checkFragment(username: string): Promise<"free" | "sale" | "taken"> {
  try {
    const res = await fetch(`https://fragment.com/username/${username}`, { headers: { "User-Agent": UA } });
    const html = (await res.text()).toLowerCase();
    if (/(for sale|on auction|place a bid|buy now|highest bid)/.test(html)) return "sale";
    if (html.includes("available")) return "free";
    if (/(taken|sold|unavailable)/.test(html)) return "taken";
    return "free";
  } catch (_) {
    return "free";
  }
}

export async function checkTelegram(username: string): Promise<"free" | "taken"> {
  try {
    const res = await fetch(`https://t.me/${username}`, { headers: { "User-Agent": UA } });
    const html = await res.text();
    // На занятом нике t.me отдаёт блок профиля/канала.
    if (html.includes("tgme_page_title") || html.includes("tgme_page_photo") || html.includes("tgme_page_extra")) {
      return "taken";
    }
    return "free";
  } catch (_) {
    return "free";
  }
}

export async function isFree(username: string): Promise<boolean> {
  const tg = await checkTelegram(username);
  if (tg !== "free") return false;
  const fr = await checkFragment(username);
  return fr === "free";
}
