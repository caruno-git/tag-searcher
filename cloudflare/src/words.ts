// Источник реальных слов: бесплатный Datamuse API (без ключа) + локальный фолбэк.
//
// ВАЖНО: одиночные словарные слова из 5–6 букв на Telegram заняты почти все.
// Поэтому для «без цифр» мы генерируем СОСТАВНЫЕ ники из двух коротких слов
// (darkfox, moonwolf), а для «с цифрами» — слово + цифры. Такие чаще свободны.

const DATAMUSE = "https://api.datamuse.com/words";

export const FALLBACK: Record<number, string[]> = {
  3: ["sky", "sun", "sea", "fox", "cat", "owl", "ace", "zen", "jet", "ray", "oak", "elm", "ice", "red", "neo", "orb", "fox", "bit"],
  4: ["dark", "moon", "star", "fire", "wolf", "lion", "bear", "hawk", "crow", "gold", "iron", "rune", "nova", "echo", "void", "mist", "rain", "snow", "wave", "leaf", "rose", "jade", "onyx", "ruby", "sage", "tide", "dawn", "dusk", "peak", "reef", "frog", "deer", "swan", "lynx", "puma"],
  5: ["apple", "brave", "crane", "drift", "eagle", "flame", "ghost", "honey", "ivory", "jolly", "lemon", "mango", "noble", "ocean", "pearl", "raven", "storm", "tiger", "vivid", "whale", "amber", "cloud", "dream", "frost", "glide", "spark", "swift", "lunar", "pixel", "comet", "ninja", "blaze", "prism", "vapor", "zebra", "maple", "river", "solar", "orbit", "ember"],
  6: ["bright", "castle", "dragon", "falcon", "garden", "hunter", "island", "jungle", "knight", "legend", "marble", "nimble", "orchid", "pirate", "quartz", "rocket", "silver", "velvet", "wisdom", "zenith", "cosmic", "frozen", "golden", "hidden", "indigo", "meteor", "nebula", "oxygen", "photon", "quasar", "shadow", "temple", "violet", "winter", "cipher", "pulsar", "cobalt", "plasma", "ardent", "zephyr"],
};

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function query(pattern: string, maxN = 1000): Promise<string[]> {
  const url = `${DATAMUSE}?sp=${encodeURIComponent(pattern)}&max=${maxN}`;
  const res = await fetch(url, { headers: { "User-Agent": "tag-searcher" } });
  if (!res.ok) throw new Error(`datamuse ${res.status}`);
  const data = (await res.json()) as Array<{ word?: string }>;
  return data
    .map((d) => (d.word || "").toLowerCase())
    .filter((w) => /^[a-z]+$/.test(w));
}

export async function wordsByLength(length: number): Promise<string[]> {
  try {
    const words = (await query("?".repeat(length))).filter((w) => w.length === length);
    if (words.length) return words;
  } catch (_) {
    // ignore
  }
  return FALLBACK[length] || [];
}

export async function wordsByMask(mask: string): Promise<string[]> {
  try {
    return (await query(mask)).filter((w) => w.length === mask.length);
  } catch (_) {
    return [];
  }
}

// Короткие слова (3–4 буквы) для составных ников
async function shortWords(): Promise<string[]> {
  const w3 = await wordsByLength(3);
  const w4 = await wordsByLength(4);
  const pool = [...w3, ...w4];
  return pool.length ? pool : [...FALLBACK[3], ...FALLBACK[4]];
}

// Составные ники: слово + слово (darkfox, moonwolf, icewave)
export async function sampleCompound(count: number): Promise<string[]> {
  const w = shuffle(await shortWords());
  const out: string[] = [];
  for (let i = 0; i + 1 < w.length && out.length < count; i += 1) {
    const combo = w[i] + w[(i + 3) % w.length];
    if (combo.length >= 6 && combo.length <= 11 && !out.includes(combo)) out.push(combo);
  }
  return out;
}

// Слово + цифры (dragon42, raven7)
export async function sampleWithDigits(length: number, count: number): Promise<string[]> {
  const base = shuffle(await wordsByLength(Math.max(3, length - 1)));
  return base.slice(0, count).map((w) => {
    const digits = Math.random() < 0.5 ? `${Math.floor(Math.random() * 10)}` : `${10 + Math.floor(Math.random() * 90)}`;
    return w + digits;
  });
}

export async function sample(length: number, count: number, withDigits: boolean): Promise<string[]> {
  if (withDigits) {
    return sampleWithDigits(length, count);
  }
  // «Без цифр»: преимущественно составные слова (чаще свободны) +
  // немного одиночных слов нужной длины (вдруг повезёт).
  const compounds = await sampleCompound(Math.ceil(count * 0.75));
  const singles = shuffle(await wordsByLength(length)).slice(0, Math.max(0, count - compounds.length));
  return shuffle([...compounds, ...singles]);
}
