"""
Локальные резервные списки реальных слов (фолбэк, если Datamuse недоступен)
+ небольшие утилиты для генерации ников из слов.
"""
import random

# Резервные словари на случай, если API недоступен или вернул пусто
FALLBACK_WORDS = {
    4: [
        "wolf", "moon", "star", "fire", "gold", "king", "luck", "neon",
        "echo", "void", "lion", "rose", "snow", "rain", "wave", "jade",
    ],
    5: [
        "apple", "brave", "crane", "drift", "eagle", "flame", "ghost", "honey",
        "ivory", "jolly", "lemon", "mango", "noble", "ocean", "pearl", "raven",
        "storm", "tiger", "vivid", "whale", "amber", "cloud", "dream", "frost",
        "glide", "spark", "swift", "lunar", "pixel", "comet", "ninja", "blaze",
        "prism", "vapor", "zebra", "maple", "river", "solar", "orbit", "ember",
    ],
    6: [
        "bright", "castle", "dragon", "falcon", "garden", "hunter", "island", "jungle",
        "knight", "legend", "marble", "nimble", "orchid", "pirate", "quartz", "rocket",
        "silver", "velvet", "wisdom", "zenith", "cosmic", "frozen", "golden", "hidden",
        "indigo", "meteor", "nebula", "oxygen", "photon", "quasar", "shadow", "temple",
        "violet", "winter", "cipher", "pulsar", "cobalt", "plasma", "ardent", "zephyr",
    ],
}


def with_digit(word: str) -> str:
    """Добавляет одну случайную цифру в конец слова (для режима «с цифрами»)."""
    return word + str(random.randint(0, 9))
