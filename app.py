import asyncio
import logging
import os
from typing import Any

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from playwright.async_api import Error as PlaywrightError

from searcher import search_platform

load_dotenv()


def create_app() -> Flask:
    app = Flask(__name__)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

    @app.get("/")
    def home():
        return render_template("index.html")

    @app.post("/search")
    def search() -> tuple[Any, int]:
        payload    = request.get_json(silent=True) or {}
        query      = (payload.get("query")      or "").strip()
        brand      = (payload.get("brand")      or "").strip()
        platform   = (payload.get("platform")   or "baidu").strip().lower()
        mode       = (payload.get("mode")        or "supplier").strip().lower()
        deep_scan  = bool(payload.get("deep_scan", False))
        page_num   = max(1, int(payload.get("page_num", 1)))
        variation  = max(0, int(payload.get("variation", 0)))
        seen_links = list(payload.get("seen_links") or [])

        if not query:
            return jsonify({"error": "Please enter a search query."}), 400
        if mode not in {"supplier", "ff"}:
            return jsonify({"error": "Invalid mode."}), 400

        app.logger.info("Search | mode=%s platform=%s page=%d var=%d deep=%s", mode, platform, page_num, variation, deep_scan)

        try:
            results = asyncio.run(search_platform(
                query, brand=brand, platform=platform, mode=mode,
                deep_scan=deep_scan, page_num=page_num,
                variation=variation, seen_links=seen_links,
            ))
            return jsonify({
                "query": query, "brand": brand, "platform": platform,
                "mode": mode, "deep_scan": deep_scan,
                "page_num": page_num, "variation": variation,
                "results": results,
            }), 200
        except PlaywrightError as exc:
            msg = str(exc)
            if "Executable doesn't exist" in msg:
                return jsonify({"error": "Run: python3 -m playwright install chromium"}), 500
            if "Timeout" in msg:
                return jsonify({"error": "Search timed out. Try again."}), 500
            return jsonify({"error": "Browser error. Try again."}), 500
        except Exception as exc:
            app.logger.exception("Search failed: %s", exc)
            return jsonify({"error": "Something went wrong. Try again."}), 500

    return app


app = create_app()

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG", "false").lower() == "true")
