import json
import socket
import sqlite3
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import aiosqlite
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse

DB_PATH = Path(__file__).parent / "expense_splitter.db"
STATIC_DIR = Path(__file__).parent / "static"


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL DEFAULT '',
                data TEXT NOT NULL DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(lifespan=lifespan)


def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip


# --- API Routes ---

@app.post("/api/projects")
async def create_project(payload: dict):
    project_id = str(uuid.uuid4())[:8]
    data = payload.get("data", {})
    name = data.get("name", "")

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO projects (id, name, data) VALUES (?, ?, ?)",
            (project_id, name, json.dumps(data, ensure_ascii=False)),
        )
        await db.commit()

    return {"success": True, "id": project_id}


@app.get("/api/projects/{project_id}")
async def get_project(project_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT data, updated_at FROM projects WHERE id = ?", (project_id,)
        )
        row = await cursor.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Project not found")

    return {"data": json.loads(row["data"]), "updated_at": row["updated_at"]}


@app.put("/api/projects/{project_id}")
async def update_project(project_id: str, payload: dict):
    data = payload.get("data", {})
    name = data.get("name", "")

    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT id FROM projects WHERE id = ?", (project_id,))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Project not found")

        await db.execute(
            "UPDATE projects SET name = ?, data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (name, json.dumps(data, ensure_ascii=False), project_id),
        )
        await db.commit()

    return {"success": True, "id": project_id}


@app.get("/api/ip")
async def get_ip():
    return {"ip": get_local_ip()}


# --- Static Files ---

@app.get("/")
async def serve_index():
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/", StaticFiles(directory=STATIC_DIR), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
