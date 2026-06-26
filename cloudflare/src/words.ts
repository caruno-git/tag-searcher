// Источники ников: реальные слова (Datamuse API, без ключа) и случайные буквы.

const DATAMUSE = "https://api.datamuse.com/words";
const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

export const FALLBACK: Record<number, string[]> = {
  4: ["dark", "moon", "star", "fire", "wolf", "lion", "bear", "hawk", "crow", "gold", "iron", "rune", "nova", "echo", "void", "mist", "rain", "snow", "wave", "leaf", "rose", "jade", "onyx", "ruby", "sage", "tide", "dawn", "dusk", "peak", "reef", "lynx", "puma"],
  5: ["apple", "brave", "crane", "drift", "eagle", "flame", "ghost", "honey", "ivory", "jolly", "lemon", "mango", "noble", "ocean", "pearl", "raven", "storm", "tiger", "vivid", "whale", "amber", "cloud", "dream", "frost", "glide", "spark", "swift", "lunar", "pixel", "comet", "ninja", "blaze", "prism", "vapor", "zebra", "maple", "river", "solar", "orbit", "ember"],
  6: ["bright", "castle", "dragon", "falcon", "garden", "hunter", "island", "jungle", "knight", "legend", "marble", "nimble", "orchid", "pirate", "quartz", "rocket", "silver", "velvet", "wisdom", "zenith", "cosmic", "frozen", "golden", "hidden", "indigo", "meteor", "nebula", "oxygen", "photon", "quasar", "shadow", "temple", "violet", "winter", "cipher", "pulsar", "cobalt", "plasma", "ardent", "zephyr"],
  7: ["phoenix", "crystal", "thunder", "mystery", "emerald", "horizon", "journey", "glacier", "lantern", "harmony", "voyager", "gravity", "eclipse", "paradox", "wildcat", "vampire", "monarch", "kingdom", "diamond", "phantom", "cyclone", "stardom", "radiant", "serpent", "falconry"],
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
  return data.map((d) => (d.word || "").toLowerCase()).filter((w) => /^[a-z]+$/.test(w));
}

export async function wordsByLength(length: number): Promise<string[]> {
  try {
    const words = (await query("?".repeat(length))).filter((w) => w.length === length);
    if (words.length) return words;
  } catch (_) {
    // ignore
  }
  return FALLBACK[length] || FALLBACK[6];
}

export async function wordsByMask(mask: string): Promise<string[]> {
  try {
    return (await query(mask)).filter((w) => w.length === mask.length);
  } catch (_) {
    return [];
  }
}

// Случайные буквы (+ цифра в конце, если withDigits)
export function randomNick(length: number, withDigits: boolean): string {
  const n = withDigits ? Math.max(1, length - 1) : length;
  let s = "";
  for (let i = 0; i < n; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  if (withDigits) s += Math.floor(Math.random() * 10);
  return s;
}

export function randBatch(length: number, withDigits: boolean, count: number): string[] {
  const out: string[] = [];
  let guard = 0;
  while (out.length < count && guard < count * 5) {
    guard++;
    const w = randomNick(length, withDigits);
    if (!out.includes(w)) out.push(w);
  }
  return out;
}

// Реальные слова нужной длины (с цифрой => слово длины length-1 + цифра)
export async function dictBatch(length: number, withDigits: boolean, count: number): Promise<string[]> {
  if (withDigits) {
    const base = shuffle(await wordsByLength(Math.max(2, length - 1)));
    return base.slice(0, count).map((w) => w + Math.floor(Math.random() * 10));
  }
  return shuffle(await wordsByLength(length)).slice(0, count);
}
