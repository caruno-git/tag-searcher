const COMMON_WORDS = new Set([
  "love", "game", "king", "best", "cool", "dark", "fire", "gold",
  "luck", "star", "moon", "wolf", "lion", "neon", "void", "echo",
]);

export function liquidity(username: string): [number, string] {
  const u = username.toLowerCase();
  let score = 5;

  const byLen: Record<number, number> = { 3: 4, 4: 3, 5: 2, 6: 1 };
  score += byLen[u.length] ?? 0;

  if (/[0-9]/.test(u)) score -= 3;
  if (/(.)\1{2,}/.test(u)) score -= 2;
  if (COMMON_WORDS.has(u) || [...COMMON_WORDS].some((w) => u.includes(w))) score += 2;

  const vowels = [...u].filter((c) => "aeiou".includes(c)).length;
  if (vowels > 0 && vowels < u.length) score += 1;

  score = Math.max(1, Math.min(10, score));

  let label: string;
  if (score >= 9) label = "🏆 Легенда";
  else if (score >= 7) label = "💎 Редкий";
  else if (score >= 5) label = "🔥 Хороший";
  else label = "📦 Обычный";

  return [score, label];
}
