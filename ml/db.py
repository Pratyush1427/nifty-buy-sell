"""Postgres connection for the pipeline."""
import psycopg

from .config import DATABASE_URL


def connect():
    if not DATABASE_URL:
        raise SystemExit("DATABASE_URL is not set (see .env.example).")
    return psycopg.connect(DATABASE_URL)
