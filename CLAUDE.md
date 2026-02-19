# Instructions for Lore DB

## General Instructions

Any new feature starts with unit tests. These tests must be verified before work starts. Then we iterate against the tests to ensure that we are building a robust product.

## Knowledge Base Protocol (The "Brain")

The `knowledge-base` MCP is our **Living Source of Truth**. You are its caretaker.

### Available MCP Tools

| Tool | When to use |
|---|---|
| `search_documents(query, limit)` | Find relevant documents by meaning |
| `get_document(document_id)` | Fetch full content of a specific document |
| `list_documents()` | See all documents (no content) |
| `create_document(title, content)` | Add a new Brief |
| `update_document(document_id, title, content)` | Update an existing Brief |
| `delete_document(document_id)` | Remove a stale Brief |
| `reindex_documents()` | Re-embed all documents after embedder changes |

### 1. Retrieval (The "Search-then-Read" Pattern)

Search uses **real semantic embeddings** (`all-MiniLM-L6-v2`). Queries match by *meaning*, not just keywords — "hot reloading" finds "Dev Mode Setup", "stateless connections" finds the MCP transport doc, etc.

Your `search_documents` tool returns **only previews**. You cannot rely on previews for coding tasks.

**Step A: Search First**

- Before writing code or answering, perform a semantic search to find relevant document candidates.
- Use natural-language queries, not keyword strings. The embedder understands concepts.
- _Good:_ `search_documents(query="how does the MCP handle service restarts")`
- _Bad:_ `search_documents(query="MCP restart")`

**Step B: Evaluate & Read (Mandatory)**

- Look at the `content_preview` and `title` to identify the correct document.
- **IMMEDIATELY** call `get_document(document_id=...)` on the best match to get the full content.
- **Constraint:** **Never** write code based on the `content_preview` alone. It is truncated and incomplete.

### 2. Reindexing

Run `reindex_documents()` after:
- **Deploying for the first time** with the new sentence-transformers embedder (existing documents were embedded with the old hash trick and must be re-embedded).
- **Any time the embedding model changes** (e.g., switching to a larger model).

Do **not** run it routinely — it is only needed when the embedder itself changes. Normal create/update operations always embed with the current model automatically.

### 2. Maintenance (The "Boy Scout Rule")

- **Capture Novelty:** If you solve a problem, fix a bug, or explain a concept that was NOT found in the DB, you **MUST** create a new Brief or update an existing one immediately.
- **Refactor = Update:** If you change code logic (e.g., "Deployment now requires 2 approvals"), you must find the corresponding Brief (`deployment_policy`) and update it.
- **Prune Stale Data:** If you find a Brief that contradicts the current codebase, **delete** or **rewrite** it. Do not leave "zombie" knowledge.

## Knowledge Base Strategy (Document Management)

**Core Philosophy:** We organize knowledge into **Topic-Complete Briefs**. Each Brief is a single source of truth for a specific domain. Avoid fragmentation (tiny files) and bloat (massive generic files).

### 1. Scope & Sizing ("The Goldilocks Rule")

- **Target:** A Brief should be roughly **150 to 300 words** covering **one** concept. The embedding model (`all-MiniLM-L6-v2`) has a 256-token (~200 word) window — content beyond that is silently truncated and invisible to search.
- **The "Context" Rule:** A Brief must be self-contained. Do not write "See the other file." Include all necessary context (constants, environment variables, related CLI commands) in that one Brief so you don't need to open multiple files.
- **When to Split:** If `backend_api.md` grows too large and covers both "Database Schema" and "API Routes", split it into two focused Briefs.

### 2. Formatting for AI Readability

- **Descriptive Titles:** The first line must be an H1 title that clearly describes the content.
- ✅ `# Production Deployment Protocol v2`
- ❌ `# notes.txt`

- **Dense Headers:** Use `## H2` and `### H3` frequently. This helps the vector search chunk the content effectively.
- **Current State Only:** Do not keep "Version History" or old deprecated code at the bottom of the file. The DB reflects the **current** reality only.

### 3. Naming Conventions

- **Descriptive:** Filenames must predict the content.
- ✅ `deployment_procedures_v2.md`
- ❌ `procedures.md`

- **Categorization:** Use prefixes if helpful (`policy_vacation.md`, `policy_remote_work.md`).

## System Self-Correction

If you find yourself confused or hallucinating details because a document is missing, **STOP**.

1. Ask the user for the details.
2. Once the user answers, **create the missing Brief** so you don't have to ask again next time.
