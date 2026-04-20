import os, json, logging
from pathlib import Path

logger = logging.getLogger(__name__)
DB_URL = os.getenv("DATABASE_URL", "")
_tables_created = False

def _get_conn():
    import psycopg2
    if DB_URL:
        return psycopg2.connect(DB_URL)
    raise Exception("No DATABASE_URL set")

def _ensure_tables():
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("""CREATE TABLE IF NOT EXISTS sf_data (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW()
        )""")
        conn.commit()
        cur.close(); conn.close()
        logger.info("DB tables ready")
    except Exception as e:
        logger.warning("DB table create failed: %s", e)

def read(key, default=None):
    global _tables_created
    if DB_URL:
        if not _tables_created:
            _ensure_tables()
            _tables_created = True
        try:
            conn = _get_conn()
            cur = conn.cursor()
            cur.execute("SELECT value FROM sf_data WHERE key=%s", (key,))
            row = cur.fetchone()
            cur.close(); conn.close()
            return json.loads(row[0]) if row else default
        except Exception as e:
            logger.warning("DB read failed (%s): %s", key, e)
            return default
    logger.warning("No DATABASE_URL — using local file for %s", key)
    path = Path(__file__).parent / "data" / f"{key}.json"
    path.parent.mkdir(exist_ok=True)
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text())
    except:
        return default

def write(key, value):
    global _tables_created
    if DB_URL:
        if not _tables_created:
            _ensure_tables()
            _tables_created = True
        try:
            conn = _get_conn()
            cur = conn.cursor()
            cur.execute("""INSERT INTO sf_data (key, value, updated_at)
                VALUES (%s, %s, NOW())
                ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()""",
                (key, json.dumps(value, indent=2)))
            conn.commit()
            cur.close(); conn.close()
            logger.info("DB write: %s", key)
            return True
        except Exception as e:
            logger.warning("DB write failed (%s): %s", key, e)
            return False
    logger.warning("No DATABASE_URL — using local file for %s", key)
    path = Path(__file__).parent / "data" / f"{key}.json"
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(value, indent=2))
    return True
