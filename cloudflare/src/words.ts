// Источник реальных слов: бесплатный Datamuse API (без ключа) + локальный фолбэк.

const DATAMUSE = "https://api.datamuse.com/words";

export const FALLBACK: Record<number, string[]> = {
  4: ["wolf", "moon", "star", "fire", "gold", "king", "luck", "neon", "echo", "void", "lion", "rose", "snow", "rain", "wave", "jade"],
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
  const url = `${DATAMUSE}?sp=${encodeURIComponent(pattern)}&max=${maxN}&md=f`;
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

export async function sample(length: number, count: number, withDigits: boolean): Promise<string[]> {
  if (withDigits) {
    // реальное слово (length-1) + цифра => итоговая длина = length
    const base = shuffle(await wordsByLength(Math.max(4, length - 1)));
    return base.slice(0, count).map((w) => w + Math.floor(Math.random() * 10));
  }
  return shuffle(await wordsByLength(length)).slice(0, count);
}
