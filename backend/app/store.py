import json
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


class Store:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.execute('CREATE TABLE IF NOT EXISTS materials (id TEXT PRIMARY KEY, payload TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS analyses (id TEXT PRIMARY KEY, payload TEXT NOT NULL)')
            db.execute(
                'CREATE TABLE IF NOT EXISTS skill_runs '
                '(id TEXT PRIMARY KEY, analysis_id TEXT NOT NULL, payload TEXT NOT NULL)'
            )
            db.execute('CREATE INDEX IF NOT EXISTS idx_skill_runs_analysis ON skill_runs (analysis_id)')

    @contextmanager
    def connection(self):
        with sqlite3.connect(self.path, timeout=15) as db:
            db.execute('PRAGMA journal_mode=WAL')
            yield db

    def add_material(self, data: dict) -> dict:
        result = {**data, 'id': uuid4().hex, 'created_at': now_iso()}
        with self.connection() as db:
            db.execute('INSERT INTO materials VALUES (?, ?)', (result['id'], json.dumps(result, ensure_ascii=False)))
        return result

    def materials(self) -> list[dict]:
        with self.connection() as db:
            rows = db.execute('SELECT payload FROM materials ORDER BY rowid DESC')
            return [json.loads(row[0]) for row in rows]

    def delete_material(self, material_id: str) -> bool:
        with self.connection() as db:
            return db.execute('DELETE FROM materials WHERE id=?', (material_id,)).rowcount > 0

    def save_analysis(self, report: dict) -> None:
        with self.connection() as db:
            db.execute('INSERT INTO analyses VALUES (?, ?)', (report['id'], json.dumps(report, ensure_ascii=False)))

    def history(self, limit: int = 100) -> list[dict]:
        with self.connection() as db:
            rows = db.execute('SELECT payload FROM analyses ORDER BY rowid DESC LIMIT ?', (limit,))
            return [json.loads(row[0]) for row in rows]

    def analysis(self, analysis_id: str) -> dict | None:
        with self.connection() as db:
            row = db.execute('SELECT payload FROM analyses WHERE id=?', (analysis_id,)).fetchone()
            return json.loads(row[0]) if row else None

    def save_skill_run(self, result: dict) -> None:
        with self.connection() as db:
            db.execute(
                'INSERT INTO skill_runs VALUES (?, ?, ?)',
                (result['id'], result['analysis_id'], json.dumps(result, ensure_ascii=False)),
            )

    def skill_runs(self, analysis_id: str, limit: int = 100) -> list[dict]:
        with self.connection() as db:
            rows = db.execute(
                'SELECT payload FROM skill_runs WHERE analysis_id=? ORDER BY rowid DESC LIMIT ?',
                (analysis_id, limit),
            )
            return [json.loads(row[0]) for row in rows]

    def skill_run(self, run_id: str) -> dict | None:
        with self.connection() as db:
            row = db.execute('SELECT payload FROM skill_runs WHERE id=?', (run_id,)).fetchone()
            return json.loads(row[0]) if row else None
