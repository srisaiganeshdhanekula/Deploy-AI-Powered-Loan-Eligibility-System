from sqlalchemy import create_engine, text
import os
from pathlib import Path
from dotenv import load_dotenv
import socket

# Load env from backend/.env explicitly (mirrors main.py behavior)
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

db_url = os.getenv("DATABASE_URL")
schema = os.getenv("DB_SCHEMA", "public")
hostaddr = os.getenv("SUPABASE_HOSTADDR")

if not db_url:
    print("❌ DATABASE_URL is not set. Create backend/.env or export DATABASE_URL.")
    raise SystemExit(1)

# Build connect_args similar to app.models.database
def _is_sqlite(url: str) -> bool:
    return url.startswith("sqlite")

connect_args = {}
if _is_sqlite(db_url):
    connect_args["check_same_thread"] = False
else:
    # Ensure Postgres uses intended schema and optionally bypass DNS
    connect_args["options"] = f"-c search_path={schema}"
    if hostaddr:
        connect_args["hostaddr"] = hostaddr

print("Attempting DB connection with driver derived from URL:", db_url.split(":")[0])
if not _is_sqlite(db_url):
    # Try resolving hostname to help debug DNS
    try:
        host = db_url.split("@")[1].split(":")[0]
        resolved = socket.gethostbyname_ex(host)
        print(f"DNS resolved {host} -> {resolved[2]}")
    except Exception as e:
        print("DNS resolution check failed:", e)

engine = create_engine(db_url, connect_args=connect_args, pool_pre_ping=True)
try:
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
        if not _is_sqlite(db_url):
            ver = conn.execute(text("SELECT version()"))
            print("Server version:", ver.scalar())
        print("✅ Connected successfully via SQLAlchemy!")
except Exception as e:
    print("❌ Connection failed:", e)

