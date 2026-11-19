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
            db.execute(
                'CREATE TABLE IF NOT EXISTS boss_jobs ('
                'id TEXT PRIMARY KEY, source TEXT NOT NULL, source_job_id TEXT NOT NULL, '
                'payload TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, '
                'UNIQUE(source, source_job_id))'
            )
            db.execute(
                'CREATE INDEX IF NOT EXISTS idx_boss_jobs_updated_at '
                'ON boss_jobs (updated_at DESC)'
            )
            db.execute(
                'CREATE TABLE IF NOT EXISTS workspace_state ('
                'singleton INTEGER PRIMARY KEY CHECK(singleton=1), '
                'state TEXT NOT NULL, updated_at TEXT NOT NULL, '
                'revision INTEGER NOT NULL CHECK(revision>=1))'
            )

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

    @staticmethod
    def _merge_boss_job_payload(existing: dict, incoming: dict) -> dict:
        """Merge one BOSS capture without erasing fields the newer capture omitted.

        Existing values are the base. Empty strings, whitespace-only strings, and
        empty lists are treated as missing evidence. A non-empty incoming value
        replaces the old value, so a later summary or detail capture can refresh a
        real field while a sparse capture only fills previously missing fields.
        """
        merged = dict(existing)
        for field, value in incoming.items():
            if value is None:
                continue
            if isinstance(value, str) and not value.strip():
                continue
            if isinstance(value, list) and not value:
                continue
            merged[field] = value
        return merged

    def upsert_boss_jobs(self, jobs: list[dict]) -> dict[str, int]:
        imported = 0
        updated = 0
        with self.connection() as db:
            # Hold the SQLite write reservation for the complete select/upsert
            # batch so concurrent importers cannot invent competing identities.
            db.execute('BEGIN IMMEDIATE')
            for job in jobs:
                existing = db.execute(
                    'SELECT id, created_at, payload FROM boss_jobs WHERE source=? AND source_job_id=?',
                    (job['source'], job['source_job_id']),
                ).fetchone()
                timestamp = now_iso()
                if existing:
                    job_id, created_at, existing_payload = existing
                    content_payload = self._merge_boss_job_payload(
                        json.loads(existing_payload),
                        job,
                    )
                    updated += 1
                else:
                    job_id = uuid4().hex
                    created_at = timestamp
                    content_payload = dict(job)
                    imported += 1
                payload = {**content_payload, 'id': job_id, 'created_at': created_at, 'updated_at': timestamp}
                db.execute(
                    'INSERT INTO boss_jobs (id, source, source_job_id, payload, created_at, updated_at) '
                    'VALUES (?, ?, ?, ?, ?, ?) '
                    'ON CONFLICT(source, source_job_id) DO UPDATE SET '
                    'payload=excluded.payload, updated_at=excluded.updated_at',
                    (
                        job_id,
                        job['source'],
                        job['source_job_id'],
                        json.dumps(payload, ensure_ascii=False),
                        created_at,
                        timestamp,
                    ),
                )
                canonical = db.execute(
                    'SELECT id, created_at FROM boss_jobs WHERE source=? AND source_job_id=?',
                    (job['source'], job['source_job_id']),
                ).fetchone()
                if canonical is None:
                    raise RuntimeError('BOSS job upsert did not produce a persistent row')
                canonical_id, canonical_created_at = canonical
                canonical_payload = {
                    **content_payload,
                    'id': canonical_id,
                    'created_at': canonical_created_at,
                    'updated_at': timestamp,
                }
                if canonical_id != job_id or canonical_created_at != created_at:
                    db.execute(
                        'UPDATE boss_jobs SET payload=?, updated_at=? '
                        'WHERE source=? AND source_job_id=?',
                        (
                            json.dumps(canonical_payload, ensure_ascii=False),
                            timestamp,
                            job['source'],
                            job['source_job_id'],
                        ),
                    )
        return {'imported': imported, 'updated': updated, 'total': len(jobs)}

    def boss_jobs(self, limit: int = 50, offset: int = 0) -> list[dict]:
        with self.connection() as db:
            rows = db.execute(
                'SELECT payload FROM boss_jobs ORDER BY updated_at DESC, rowid DESC LIMIT ? OFFSET ?',
                (limit, offset),
            )
            return [json.loads(row[0]) for row in rows]

    def boss_job(self, job_id: str) -> dict | None:
        with self.connection() as db:
            row = db.execute('SELECT payload FROM boss_jobs WHERE id=?', (job_id,)).fetchone()
            return json.loads(row[0]) if row else None

    def delete_boss_job(self, job_id: str) -> bool:
        with self.connection() as db:
            return db.execute('DELETE FROM boss_jobs WHERE id=?', (job_id,)).rowcount > 0

    def boss_job_count(self) -> int:
        with self.connection() as db:
            return int(db.execute('SELECT COUNT(*) FROM boss_jobs').fetchone()[0])

    def workspace_state(self) -> dict | None:
        with self.connection() as db:
            row = db.execute(
                'SELECT state, updated_at, revision FROM workspace_state WHERE singleton=1'
            ).fetchone()
            if not row:
                return None
            return {'state': json.loads(row[0]), 'updated_at': row[1], 'revision': row[2]}

    def save_workspace_state(
        self,
        state: dict,
        expected_revision: int | None,
    ) -> tuple[bool, dict | None]:
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute(
                'SELECT state, updated_at, revision FROM workspace_state WHERE singleton=1'
            ).fetchone()
            if row:
                current = {'state': json.loads(row[0]), 'updated_at': row[1], 'revision': row[2]}
                if expected_revision != current['revision']:
                    return False, current
                revision = current['revision'] + 1
                timestamp = now_iso()
                db.execute(
                    'UPDATE workspace_state SET state=?, updated_at=?, revision=? WHERE singleton=1',
                    (json.dumps(state, ensure_ascii=False, separators=(',', ':')), timestamp, revision),
                )
            else:
                if expected_revision is not None:
                    return False, None
                revision = 1
                timestamp = now_iso()
                db.execute(
                    'INSERT INTO workspace_state (singleton, state, updated_at, revision) VALUES (1, ?, ?, ?)',
                    (json.dumps(state, ensure_ascii=False, separators=(',', ':')), timestamp, revision),
                )
            return True, {'state': state, 'updated_at': timestamp, 'revision': revision}
