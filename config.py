import os
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
API_ID = int(os.getenv("API_ID", "0"))
API_HASH = os.getenv("API_HASH")
SESSION_NAME = os.getenv("SESSION_NAME", "checker_session")

# Сколько ников генерировать и проверять за одну попытку «ПОИСК»
SEARCH_BATCH = 12

# Пауза между запросами к Telegram, чтобы не словить FloodWait (в секундах)
CHECK_DELAY = 1.2

# В отличие от оригинала — без премиума и без лимитов
UNLIMITED = True
DAILY_FREE_ATTEMPTS = 9999
