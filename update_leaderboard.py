import requests
import json
import time
import logging
import os

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")

API_KEY = os.getenv("API_KEY")
COMMUNITY_ID = "1951903018464772103"
BASE_URL = f"https://api.socialdata.tools/twitter/community/{COMMUNITY_ID}/tweets"
HEADERS = {"Authorization": f"Bearer {API_KEY}"}

TWEETS_FILE = "all_tweets.json"
LEADERBOARD_FILE = "leaderboard.json"

def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return []

def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def fetch_tweets(cursor=None, limit=50):
    params = {"type": "Latest", "limit": limit}
    if cursor:
        params["cursor"] = cursor
    r = requests.get(BASE_URL, headers=HEADERS, params=params)
    r.raise_for_status()
    return r.json()

def collect_all_tweets():
    all_tweets = []
    seen_ids = set()

    cursor = None
    total_new = 0
    while True:
        data = fetch_tweets(cursor)
        tweets = data.get("tweets", [])
        cursor = data.get("next_cursor")

        if not tweets:
            break

        # Фильтрация по ID для избежания дубликатов в рамках одного запуска
        new_tweets = [t for t in tweets if t["id_str"] not in seen_ids]
        if not new_tweets:
            logging.info("Нет новых твитов для добавления, остановка сбора.")
            break

        all_tweets.extend(new_tweets)
        seen_ids.update(t["id_str"] for t in new_tweets)
        total_new += len(new_tweets)

        logging.info(f"✅ Загружено {len(new_tweets)} новых твитов (всего: {len(all_tweets)})")

        if not cursor:
            break

        time.sleep(3)

    # Сохраняем ВСЕ собранные твиты (как на rialo-club-leaderboard.xyz)
    save_json(TWEETS_FILE, all_tweets)
    logging.info(f"Сбор завершён. Всего твитов: {len(all_tweets)}")
    return all_tweets

def build_leaderboard(tweets):
    leaderboard = {}

    for t in tweets: # Обрабатываем все твиты из all_tweets.json (как на
