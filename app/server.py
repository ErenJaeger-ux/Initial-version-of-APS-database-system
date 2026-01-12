import os
import sqlite3
import json
from datetime import datetime
from flask import Flask, jsonify, request, render_template, send_file

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "aps.db")


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def _init_db() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS addresses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE
            );

            CREATE TABLE IF NOT EXISTS objects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE
            );

            CREATE TABLE IF NOT EXISTS records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,          -- YYYY-MM-DD
                time TEXT NOT NULL,          -- HH:MM
                key_number TEXT,
                address TEXT NOT NULL,
                object_name TEXT NOT NULL,

                is_false_alarm INTEGER NOT NULL DEFAULT 0,
                reimbursement_required INTEGER NOT NULL DEFAULT 0,
                letter_sent INTEGER NOT NULL DEFAULT 0,
                notes TEXT,

                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_records_date ON records(date);
            CREATE INDEX IF NOT EXISTS idx_records_object ON records(object_name);
            CREATE INDEX IF NOT EXISTS idx_records_address ON records(address);
            CREATE INDEX IF NOT EXISTS idx_records_key ON records(key_number);
            """
        )


def _upsert_dict(conn: sqlite3.Connection, table: str, value: str) -> None:
    value = (value or "").strip()
    if not value:
        return
    conn.execute(f"INSERT OR IGNORE INTO {table}(name) VALUES (?)", (value,))


def create_app() -> Flask:
    app = Flask(__name__)
    _init_db()

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/api/dicts")
    def get_dicts():
        with _connect() as conn:
            addresses = [r["name"] for r in conn.execute("SELECT name FROM addresses ORDER BY name").fetchall()]
            objects = [r["name"] for r in conn.execute("SELECT name FROM objects ORDER BY name").fetchall()]
        return jsonify({"addresses": addresses, "objects": objects})

    @app.get("/api/records")
    def list_records():
        with _connect() as conn:
            rows = conn.execute("SELECT * FROM records ORDER BY date DESC, time DESC, id DESC").fetchall()
        return jsonify([dict(r) for r in rows])

    @app.post("/api/records")
    def add_record():
        data = request.get_json(force=True, silent=True) or {}

        date = (data.get("date") or "").strip()
        time = (data.get("time") or "").strip()
        key_number = (data.get("key_number") or "").strip() or None
        address = (data.get("address") or "").strip()
        object_name = (data.get("object_name") or "").strip()

        is_false_alarm = 1 if bool(data.get("is_false_alarm")) else 0
        reimbursement_required = 1 if bool(data.get("reimbursement_required")) else 0
        letter_sent = 1 if bool(data.get("letter_sent")) else 0
        notes = (data.get("notes") or "").strip() or None

        if not date or not time or not address or not object_name:
            return jsonify({"error": "Заполните обязательные поля: дата, время, адрес, объект."}), 400

        created_at = datetime.now().isoformat(timespec="seconds")

        with _connect() as conn:
            _upsert_dict(conn, "addresses", address)
            _upsert_dict(conn, "objects", object_name)

            cur = conn.execute(
                """
                INSERT INTO records(
                    date, time, key_number, address, object_name,
                    is_false_alarm, reimbursement_required, letter_sent, notes, created_at
                )
                VALUES(?,?,?,?,?,?,?,?,?,?)
                """,
                (date, time, key_number, address, object_name,
                 is_false_alarm, reimbursement_required, letter_sent, notes, created_at),
            )
            rec_id = cur.lastrowid
            row = conn.execute("SELECT * FROM records WHERE id = ?", (rec_id,)).fetchone()

        return jsonify(dict(row)), 201

    @app.put("/api/records/<int:rec_id>")
    def update_record(rec_id: int):
        data = request.get_json(force=True, silent=True) or {}

        date = (data.get("date") or "").strip()
        time = (data.get("time") or "").strip()
        key_number = (data.get("key_number") or "").strip() or None
        address = (data.get("address") or "").strip()
        object_name = (data.get("object_name") or "").strip()

        is_false_alarm = 1 if bool(data.get("is_false_alarm")) else 0
        reimbursement_required = 1 if bool(data.get("reimbursement_required")) else 0
        letter_sent = 1 if bool(data.get("letter_sent")) else 0
        notes = (data.get("notes") or "").strip() or None

        if not date or not time or not address or not object_name:
            return jsonify({"error": "Заполните обязательные поля: дата, время, адрес, объект."}), 400

        with _connect() as conn:
            exists = conn.execute("SELECT 1 FROM records WHERE id = ?", (rec_id,)).fetchone()
            if not exists:
                return jsonify({"error": "Запись не найдена."}), 404

            _upsert_dict(conn, "addresses", address)
            _upsert_dict(conn, "objects", object_name)

            conn.execute(
                """
                UPDATE records
                   SET date = ?, time = ?, key_number = ?, address = ?, object_name = ?,
                       is_false_alarm = ?, reimbursement_required = ?, letter_sent = ?, notes = ?
                 WHERE id = ?
                """,
                (date, time, key_number, address, object_name,
                 is_false_alarm, reimbursement_required, letter_sent, notes, rec_id),
            )

            row = conn.execute("SELECT * FROM records WHERE id = ?", (rec_id,)).fetchone()

        return jsonify(dict(row))

    @app.delete("/api/records/<int:rec_id>")
    def delete_record(rec_id: int):
        with _connect() as conn:
            cur = conn.execute("DELETE FROM records WHERE id = ?", (rec_id,))
            if cur.rowcount == 0:
                return jsonify({"error": "Запись не найдена."}), 404
        return jsonify({"ok": True})

    @app.get("/api/export")
    def export_json():
        with _connect() as conn:
            records = [dict(r) for r in conn.execute("SELECT * FROM records ORDER BY date DESC, time DESC, id DESC").fetchall()]
            addresses = [r["name"] for r in conn.execute("SELECT name FROM addresses ORDER BY name").fetchall()]
            objects = [r["name"] for r in conn.execute("SELECT name FROM objects ORDER BY name").fetchall()]

        payload = {"records": records, "addresses": addresses, "objects": objects}

        export_dir = os.path.join(BASE_DIR, "backups")
        os.makedirs(export_dir, exist_ok=True)
        filename = f"aps_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        path = os.path.join(export_dir, filename)

        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

        return send_file(path, as_attachment=True, download_name=filename, mimetype="application/json")

    @app.post("/api/import")
    def import_json():
        data = request.get_json(force=True, silent=True)
        if not isinstance(data, dict):
            return jsonify({"error": "Неверный формат JSON."}), 400

        recs = data.get("records") or []
        if not isinstance(recs, list):
            return jsonify({"error": "records должен быть списком."}), 400

        with _connect() as conn:
            conn.execute("DELETE FROM records")
            conn.execute("DELETE FROM addresses")
            conn.execute("DELETE FROM objects")

            for r in recs:
                date = (r.get("date") or "").strip()
                time = (r.get("time") or "").strip()
                address = (r.get("address") or "").strip()
                object_name = (r.get("object_name") or r.get("object") or "").strip()
                if not (date and time and address and object_name):
                    continue

                key_number = (r.get("key_number") or r.get("keyNumber") or r.get("key") or "").strip() or None
                is_false_alarm = 1 if bool(r.get("is_false_alarm") or r.get("isFalseAlarm")) else 0
                reimbursement_required = 1 if bool(r.get("reimbursement_required") or r.get("reimbursementRequired")) else 0
                letter_sent = 1 if bool(r.get("letter_sent") or r.get("letterSent")) else 0
                notes = (r.get("notes") or "").strip() or None
                created_at = (r.get("created_at") or datetime.now().isoformat(timespec="seconds"))

                _upsert_dict(conn, "addresses", address)
                _upsert_dict(conn, "objects", object_name)

                conn.execute(
                    """
                    INSERT INTO records(
                        date, time, key_number, address, object_name,
                        is_false_alarm, reimbursement_required, letter_sent, notes, created_at
                    )
                    VALUES(?,?,?,?,?,?,?,?,?,?)
                    """,
                    (date, time, key_number, address, object_name,
                     is_false_alarm, reimbursement_required, letter_sent, notes, created_at),
                )

        return jsonify({"ok": True})

    return app
