"""
Источник реальных слов для генерации ников.

Использует бесплатный Datamuse API (без ключа, до 100k запросов/день):
  - https://api.datamuse.com/words?sp=?????      -> слова заданной длины
  - https://api.datamuse.com/words?sp=a?b?c       -> слова по маске (? = любая буква)
  - параметр md=f добавляет частотность слова

Если API недоступен — берём слова из локального фолбэка (username_gen.FALLBACK_WORDS).
"""
import random
import httpx

from username_gen import FALLBACK_WORDS, with_digit

DATAMUSE_URL = "https://api.datamuse.com/words"


class WordSource:
    def __init__(self):
        self._http: httpx.AsyncClient | None = None
        self._cache: dict[int, list[str]] = {}

    async def start(self):
        self._http = httpx.AsyncClient(
            timeout=15,
            headers={"User-Agent": "tag-searcher"},
        )

    async def stop(self):
        if self._http:
            await self._http.aclose()

    # ---------- низкоуровневый запрос к Datamuse ----------
    async def _query(self, pattern: str, max_n: int = 1000) -> list[str]:
        params = {"sp": pattern, "max": str(max_n), "md": "f"}
        r = await self._http.get(DATAMUSE_URL, params=params)
        r.raise_for_status()
        data = r.json()
        words = []
        for item in data:
            w = item.get("word", "").lower()
            # только латиница без пробелов/дефисов/апострофов — годится для юзернейма
            if w.isascii() and w.isalpha():
                words.append(w)
        return words

    # ---------- слова заданной длины (с кэшем) ----------
    async def words_by_length(self, length: int) -> list[str]:
        if length in self._cache:
            return self._cache[length]
        try:
            words = await self._query("?" * length)
        except Exception:
            words = []
        # фильтр строго по длине + фолбэк
        words = [w for w in words if len(w) == length]
        if not words:
            words = list(FALLBACK_WORDS.get(length, []))
        self._cache[length] = words
        return words

    # ---------- слова по маске (a?b?c) ----------
    async def words_by_mask(self, mask: str) -> list[str]:
        try:
            words = await self._query(mask)
        except Exception:
            words = []
        target = len(mask)
        return [w for w in words if len(w) == target]

    # ---------- выборка кандидатов для проверки ----------
    async def sample(self, length: int, count: int, with_digits: bool = False) -> list[str]:
        if with_digits:
            # реальное слово (length-1) + цифра => итоговая длина = length
            base = list(await self.words_by_length(max(4, length - 1)))
            random.shuffle(base)
            return [with_digit(w) for w in base[:count]]
        words = list(await self.words_by_length(length))
        random.shuffle(words)
        return words[:count]
