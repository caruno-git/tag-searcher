import re

COMMON_WORDS = {
    "love", "game", "king", "best", "cool", "dark", "fire", "gold",
    "luck", "star", "moon", "wolf", "lion", "neon", "void", "echo",
}


def liquidity(username: str) -> tuple[int, str]:
    """
    Эвристическая оценка «ликвидности» ника 1..10 + текстовая метка.
    Чем короче, читаемее и без цифр — тем выше.
    """
    u = username.lower()
    score = 5

    # Длина
    score += {3: 4, 4: 3, 5: 2, 6: 1}.get(len(u), 0)

    # Цифры снижают
    if any(c.isdigit() for c in u):
        score -= 3
    # Повторяющиеся подряд буквы снижают
    if re.search(r"(.)\1{2,}", u):
        score -= 2
    # Словарное слово / часть слова повышает
    if u in COMMON_WORDS or any(w in u for w in COMMON_WORDS):
        score += 2
    # Хорошее соотношение гласных
    vowels = sum(c in "aeiou" for c in u)
    if 0 < vowels < len(u):
        score += 1

    score = max(1, min(10, score))

    if score >= 9:
        label = "🏆 Легенда"
    elif score >= 7:
        label = "💎 Редкий"
    elif score >= 5:
        label = "🔥 Хороший"
    else:
        label = "📦 Обычный"
    return score, label
