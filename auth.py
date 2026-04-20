import json
import hashlib
import os
import secrets
import time
from pathlib import Path

DATA_FILE = Path(__file__).parent / "data" / "users.json"
_DEFAULT_DATA = {"requests": [], "approved": []}
_backup_checked = False


def _load():
    global _backup_checked
    DATA_FILE.parent.mkdir(exist_ok=True)
    if not _backup_checked:
        _backup_checked = True
        try:
            from backup import restore_if_empty
            restore_if_empty(DATA_FILE, "sf_users.json", _DEFAULT_DATA)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("Backup restore failed: %s", e)
    if not DATA_FILE.exists():
        DATA_FILE.write_text(json.dumps(_DEFAULT_DATA))
    return json.loads(DATA_FILE.read_text())


def _save(data):
    DATA_FILE.parent.mkdir(exist_ok=True)
    DATA_FILE.write_text(json.dumps(data, indent=2))
    try:
        from backup import push_backup
        push_backup("sf_users.json", data)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Backup push failed: %s", e)


def get_admin_data():
    return _load()
