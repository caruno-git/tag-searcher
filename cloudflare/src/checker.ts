// Проверка свободности ника без MTProto (Workers не умеют в Telethon):
//   1) t.me/<username> — есть ли публичный профиль/канал/бот
//   2) Fragment — выставлен ли на продажу/аукцион (только для глубокой проверки)

const UA = "Mozilla/5.0 (compatible; tag-searcher/1.0)";
const TME = "https://t.me/";
const FRAGMENT = "https://fragment.com/username/";

// Сканируем только начало страницы — маркеры в шапке. Это резко снижает CPU
// (на free-плане лимит 10ms процессорного времени на вызов; перебор = фатальная 1102).
const SCAN = 6000;

export async function checkTelegram(username: string): Promise<"free" | "taken"> {
  try {
    const res = await fetch(TME + username, { headers: { "User-Agent": UA } });
    if (res.status === 404) return "free";
    const html = (await res.text()).slice(0, SCAN);
    // Эти классы рендерятся только когда есть реальный аккаунт.
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
    const res = await fetch(FRAGMENT + username, { headers: { "User-Agent": UA } });
    const html = (await res.text()).slice(0, SCAN);
    // Регэксп с флагом i — без toLowerCase() по всей странице (экономия CPU).
    if (/for sale|on auction|place a bid|buy now|highest bid/i.test(html)) return "sale";
    if (/taken|sold|unavailable/i.test(html)) return "taken";
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
