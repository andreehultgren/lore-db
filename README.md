# Vector Knowledge Base (Python + React + MCP)

A local vector-based knowledge base with:
- Python backend for persistence, embeddings, REST API, and MCP tools
- React + TypeScript frontend using shadcn-style UI components
- SQLite storage for documents and vectors

## Architecture

- `backend/app/vector_store.py`
  - SQLite-backed document store
  - Hashing-based vector embedder
  - Cosine similarity search
- `backend/app/api.py`
  - FastAPI CRUD + search endpoints for GUI
- `backend/app/mcp_server.py`
  - MCP tools (`list_documents`, `get_document`, `create_document`, `update_document`, `delete_document`, `search_documents`)
- `frontend/`
  - Vite + React + TypeScript
  - Tailwind + shadcn-style component primitives under `src/components/ui`

## Quick Start (Docker Compose)

Runs everything behind one reverse-proxy port:
- GUI: `http://localhost:8080`
- API base: `http://localhost:8080/api`
- Health: `http://localhost:8080/health`

Start:

```bash
cd /Users/andreehultgren/personal_knowledge_base
docker compose up --build -d
```

Stop:

```bash
docker compose down
```

Persistent storage:
- SQLite DB is stored on host at:
  - `.localdata/backend/knowledge_base.db`
- `.localdata/` is gitignored.

## Run Backend (API)

```bash
cd /Users/andreehultgren/personal_knowledge_base/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.api:app --reload --host 0.0.0.0 --port 8000
```

Optional env vars:
- `KB_DB_PATH` (default: `backend/data/knowledge_base.db`)

## Run MCP Server

```bash
cd /Users/andreehultgren/personal_knowledge_base/backend
source .venv/bin/activate
python -m app.mcp_server
```

Example MCP client config:

```json
{
  "mcpServers": {
    "vector-kb": {
      "command": "/Users/andreehultgren/personal_knowledge_base/backend/.venv/bin/python",
      "args": ["-m", "app.mcp_server"],
      "cwd": "/Users/andreehultgren/personal_knowledge_base/backend"
    }
  }
}
```

If you run with Docker Compose and want MCP via the running container:

```json
{
  "mcpServers": {
    "vector-kb-docker": {
      "command": "docker",
      "args": [
        "compose",
        "-f",
        "/Users/andreehultgren/personal_knowledge_base/docker-compose.yml",
        "exec",
        "-T",
        "backend",
        "python",
        "-m",
        "app.mcp_server"
      ],
      "cwd": "/Users/andreehultgren/personal_knowledge_base"
    }
  }
}
```

If your GUI/API runs in Docker and MCP runs on host Python, prefer API proxy mode to avoid SQLite lock/corruption issues across host/container file access:

```json
{
  "mcpServers": {
    "localknowledgebase": {
      "command": "/Users/andreehultgren/personal_knowledge_base/backend/.venv/bin/python",
      "args": ["-m", "app.mcp_server"],
      "cwd": "/Users/andreehultgren/personal_knowledge_base/backend",
      "env": {
        "KB_API_BASE": "http://localhost:8080/api"
      }
    }
  }
}
```

## Run Frontend (React + TypeScript)

```bash
cd /Users/andreehultgren/personal_knowledge_base/frontend
npm install
npm run dev
```

Optional env vars:
- `VITE_API_BASE` (default: `http://localhost:8000`)

## API Endpoints

- `GET /health`
- `GET /documents`
- `GET /documents/{id}`
- `POST /documents`
- `PUT /documents/{id}`
- `DELETE /documents/{id}`
- `POST /search`
