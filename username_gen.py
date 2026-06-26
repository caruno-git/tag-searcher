import random
import string

VOWELS = "aeiou"
CONSONANTS = "bcdfghjklmnpqrstvwxyz"


def _pronounceable(length: int) -> str:
    """Генерирует «читаемый» ник, чередуя согласные/гласные."""
    out = []
    start_vowel = random.random() < 0.5
    for i in range(length):
        if (i % 2 == 0) ^ start_vowel:
            out.append(random.choice(CONSONANTS))
        else:
            out.append(random.choice(VOWELS))
    return "".join(out)


def generate(length: int, with_digits: bool = False, pronounceable: bool = True) -> str:
    # Telegram: ник должен начинаться с буквы
    if with_digits:
        first = random.choice(string.ascii_lowercase)
        rest_pool = string.ascii_lowercase + string.digits
        rest = "".join(random.choice(rest_pool) for _ in range(length - 1))
        return first + rest
    if pronounceable:
        return _pronounceable(length)
    return "".join(random.choice(string.ascii_lowercase) for _ in range(length))


def generate_batch(length: int, count: int, with_digits: bool = False) -> list[str]:
    seen, batch = set(), []
    while len(batch) < count:
        u = generate(length, with_digits)
        if u not in seen:
            seen.add(u)
            batch.append(u)
    return batch
