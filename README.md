# Lore DB (Python + React + MCP)

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

The entire project is buildable with docker compose.

```bash
docker compose up -d
```

Persistent storage:

- SQLite DB is stored on host at:
  - `.localdata/backend/knowledge_base.db`
- `.localdata/` is gitignored.

## Quick Start (npm)

```bash
npm install
npm run start
```

## Dev mode (npm)

```bash
npm install
npm run dev
```

## Initialize MCP server

### Claude

Make sure the services are running (`docker compose up -d`).

Then add a `.mcp.json` in the same directory as where you start Claude.

```json
{
  "mcpServers": {
    "knowledge-base": {
      "type": "stdio",
      "command": "docker",
      "args": [
        "compose",
        "exec",
        "-T",
        "-e",
        "KB_NAMESPACE=lore-db",
        "backend",
        "python",
        "-m",
        "app.mcp_server"
      ]
    }
  }
}
```
