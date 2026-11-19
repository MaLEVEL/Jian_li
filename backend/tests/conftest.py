import os

# FastAPI TestClient uses the synthetic "testserver" Host. Production defaults do
# not include it; this fixture keeps host-guard tests deterministic in CI.
os.environ.setdefault("YUNFAN_ALLOWED_HOSTS", "127.0.0.1,localhost,::1,testserver")