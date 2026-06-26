import asyncio
import httpx
from telethon import TelegramClient, functions, errors

import config


class UsernameChecker:
    def __init__(self):
        self.client = TelegramClient(config.SESSION_NAME, config.API_ID, config.API_HASH)
        self._http: httpx.AsyncClient | None = None

    async def start(self):
        await self.client.start()
        self._http = httpx.AsyncClient(
            timeout=15,
            headers={"User-Agent": "Mozilla/5.0 (tag-searcher)"},
        )

    async def stop(self):
        if self._http:
            await self._http.aclose()
        await self.client.disconnect()

    # ---------- Telegram (MTProto) ----------
    async def check_telegram(self, username: str) -> str:
        """'free' | 'taken' | 'invalid' | 'flood'"""
        try:
            await self.client(functions.contacts.ResolveUsernameRequest(username=username))
            return "taken"
        except errors.UsernameNotOccupiedError:
            return "free"
        except (errors.UsernameInvalidError, errors.UsernameNotModifiedError):
            return "invalid"
        except errors.FloodWaitError:
            return "flood"
        except Exception:
            # ник без сущности тоже трактуем как потенциально свободный
            return "free"

    # ---------- Fragment ----------
    async def check_fragment(self, username: str) -> str:
        """
        'sale'  — выставлен на аукцион/продажу (НЕ свободен)
        'free'  — на Fragment не торгуется
        'taken' — занят/продан
        """
        url = f"https://fragment.com/username/{username}"
        try:
            r = await self._http.get(url)
        except Exception:
            return "free"

        html = r.text.lower()
        if "available" in html and "auction" not in html:
            return "free"
        if any(k in html for k in ("for sale", "on auction", "place bid", "buy now")):
            return "sale"
        if "taken" in html or "sold" in html or "unavailable" in html:
            return "taken"
        return "free"

    # ---------- Итоговая проверка ----------
    async def is_free(self, username: str) -> tuple[bool, str]:
        tg = await self.check_telegram(username)
        if tg == "flood":
            return False, "flood"
        if tg != "free":
            return False, f"telegram:{tg}"

        fr = await self.check_fragment(username)
        if fr != "free":
            return False, f"fragment:{fr}"

        return True, "ok"

    async def find_free(self, candidates: list[str], on_progress=None) -> str | None:
        total = len(candidates)
        for i, username in enumerate(candidates, 1):
            if on_progress:
                await on_progress(i, total, username)
            free, reason = await self.is_free(username)
            if reason == "flood":
                await asyncio.sleep(5)
                continue
            if free:
                return username
            await asyncio.sleep(config.CHECK_DELAY)
        return None
