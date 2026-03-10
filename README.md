# Lore DB

A local, vector-based knowledge base with semantic search, a web UI, and an MCP server for use with Claude and other AI tools.

- **Python backend** — FastAPI REST API, sentence-transformer embeddings, SQLite storage
- **React frontend** — document management, semantic search, analytics dashboard
- **MCP server** — eight tools (`get`, `search`, `create`, `update`, `delete`, `verify`, `stale`, `reindex`) over HTTP or stdio
- **Multi-namespace** — isolate knowledge bases per project using the `X-KB-Namespace` header or `KB_NAMESPACE` env var
- **Analytics** — tracks MCP tool usage (searches, views, creates) in a separate SQLite database

## Architecture

```
proxy (nginx :8765)
  ├── /api/         → backend (FastAPI :8000)
  ├── /mcp/         → mcp    (FastMCP :8000, streamable-http)
  └── /             → frontend (nginx :80, React SPA)
```

| Module                        | Description                                                    |
| ----------------------------- | -------------------------------------------------------------- |
| `backend/app/vector_store.py` | SQLite document store + `all-MiniLM-L6-v2` semantic embeddings |
| `backend/app/api.py`          | FastAPI CRUD, search, reindex, analytics, namespace endpoints  |
| `backend/app/mcp_server.py`   | MCP tools (stdio, SSE, streamable-http transports)             |
| `backend/app/service.py`      | Per-namespace KB instances with LRU caching                    |
| `backend/app/analytics.py`    | MCP event logging in a global `analytics.db`                   |
| `frontend/`                   | Vite + React + TypeScript, TanStack Router, Tailwind           |

## Quick Start

### Production

```bash
npm run start
```

Runs `docker compose up --build -d`. The app is available at **http://localhost:8765**.

```bash
npm run stop      # docker compose down
npm run restart   # down + up --build -d
```

### Development (hot reload)

```bash
npm run dev
```

Runs `docker compose -f docker-compose.dev.yml up --build`. The app is available at **http://localhost:8766**.

- Backend restarts on Python file changes (`--reload`)
- Frontend uses the Vite dev server with full HMR
- Uses a separate database at `.localdata/backend-dev/` so dev never touches prod data

## Persistent Storage

SQLite databases are stored on the host and are gitignored:

| Path                                    | Contents                                |
| --------------------------------------- | --------------------------------------- |
| `.localdata/backend/knowledge_base*.db` | Document store (one file per namespace) |
| `.localdata/backend/analytics.db`       | MCP event log                           |

## MCP Configuration

The MCP server is exposed at `http://localhost:8765/mcp/` using the streamable-http transport.

Add a `.mcp.json` in the directory where you start Claude:

```json
{
  "mcpServers": {
    "knowledge-base": {
      "type": "http",
      "url": "http://localhost:8765/mcp/",
      "headers": {
        "X-KB-Namespace": "my-project"
      }
    }
  }
}
```

Set `X-KB-Namespace` to any alphanumeric slug. Each unique namespace gets its own isolated database.

### Available MCP Tools

| Tool                                      | Description                                                      |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `get_document(document_id)`               | Fetch full document content                                      |
| `search_documents(query, limit)`          | Semantic + lexical search with freshness decay                   |
| `create_document(title, content)`         | Add a new document                                               |
| `update_document(document_id, ...)`       | Update title and/or content                                      |
| `delete_document(document_id)`            | Remove a document                                                |
| `verify_document(document_id)`            | Confirm a document is still accurate (bumps freshness timestamp) |
| `get_stale_documents(days_threshold)`     | Find documents that may be outdated                              |
| `reindex_documents`                       | Re-embed all documents (run after first deploy or model changes) |

### Stdio fallback

For direct CLI invocation without the HTTP server:

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
        "KB_NAMESPACE=my-project",
        "backend",
        "python",
        "-m",
        "app.mcp_server"
      ]
    }
  }
}
```

## Reindexing

Run `reindex_documents()` via MCP tool, the Settings page, or curl after:

- First deploy switching from the old hash embedder to `all-MiniLM-L6-v2`
- Upgrading to a different embedding model

```bash
curl -X POST http://localhost:8765/api/reindex -H "X-Kb-Namespace: my-project"
```

Normal `create` and `update` operations always auto-embed — no manual reindex needed.

## Running Tests

```bash
cd backend
python -m pytest tests/ -v
```
