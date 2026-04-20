import asyncio
import json
import logging
import os
import time
from functools import wraps
from pathlib import Path
from typing import Any


from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, render_template, request, make_response
from playwright.async_api import Error as PlaywrightError


import auth
from searcher import search_platform, scan_single


load_dotenv()


ADMIN_SECRET = os.getenv("ADMIN_SECRET", "changeme-set-in-env")
FINDS_FILE   = Path(__file__).parent / "data" / "finds.json"




_finds_backup_checked = False
def _load_finds():
    global _finds_backup_checked
    FINDS_FILE.parent.mkdir(exist_ok=True)
    if not _finds_backup_checked:
        _finds_backup_checked = True
        try:
            from backup import restore_if_empty
            restore_if_empty(FINDS_FILE, "sf_finds.json", [])
        except Exception:
            pass
    if not FINDS_FILE.exists():
        FINDS_FILE.write_text(json.dumps([]))
    return json.loads(FINDS_FILE.read_text())
