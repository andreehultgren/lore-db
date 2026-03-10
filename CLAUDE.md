# Instructions for Lore DB

## General Instructions

Any new feature starts with unit tests. These tests must be verified before work starts. Then we iterate against the tests to ensure that we are building a robust product.

## Knowledge Base Protocol (The "Brain")

The `knowledge-base` MCP is our **Living Source of Truth** and the **primary source for all project knowledge**. You are its caretaker.

**CRITICAL RULE: Search the knowledge base FIRST, before every task.** Do not rely on your training data, memory, or assumptions about this project. The KB contains project-specific decisions, patterns, conventions, and context that override general knowledge. If you skip this step, you risk contradicting established decisions or duplicating solved problems.

### When to Search (Always)

You **MUST** search the knowledge base at the start of **every** task, including but not limited to:

- **Before writing or modifying code** — search for relevant architecture decisions, patterns, or conventions
- **Before answering questions** about the project — the KB may already have the answer
- **Before debugging** — search for known issues, past fixes, or related context
- **Before designing a feature** — search for prior design decisions or constraints
- **Before refactoring** — search for documented reasons behind the current structure
- **When encountering unfamiliar code** — search for explanations or context

Run **multiple searches** with different queries if your first search doesn't cover the full scope of the task. Cast a wide net — it's better to search too much than too little.

### Available MCP Tools

| Tool | When to use |
|---|---|
| `search_documents(query, limit)` | Find relevant documents by meaning |
| `get_document(document_id)` | Fetch full content of a specific document |
| `create_document(title, content)` | Add a new Brief |
| `update_document(document_id, title, content)` | Update an existing Brief |
| `delete_document(document_id)` | Remove a stale Brief |
| `verify_document(document_id)` | Confirm a document is still accurate (bumps freshness) |
| `get_stale_documents(days_threshold)` | Find documents that may be outdated |
| `reindex_documents()` | Re-embed all documents after embedder changes |

### 1. Retrieval (The "Search-then-Read" Pattern)

Search uses **real semantic embeddings** (`all-MiniLM-L6-v2`). Queries match by *meaning*, not just keywords — "hot reloading" finds "Dev Mode Setup", "stateless connections" finds the MCP transport doc, etc.

Your `search_documents` tool returns **only previews**. You cannot rely on previews for coding tasks.

**Step A: Search First**

- Before writing code or answering, perform a semantic search to find relevant document candidates.
- Use natural-language queries, not keyword strings. The embedder understands concepts.
- Run **multiple queries** from different angles to maximize coverage.
- _Good:_ `search_documents(query="how does the MCP handle service restarts")`
- _Bad:_ `search_documents(query="MCP restart")`

**Step B: Evaluate & Read (Mandatory)**

- Look at the `content_preview` and `title` to identify the correct document.
- **IMMEDIATELY** call `get_document(document_id=...)` on **every** match with a score above ~0.1 to get the full content.
- **Constraint:** **Never** write code or make decisions based on the `content_preview` alone. It is truncated and incomplete.

### 2. Reindexing

Run `reindex_documents()` after:
- **Deploying for the first time** with the new sentence-transformers embedder (existing documents were embedded with the old hash trick and must be re-embedded).
- **Any time the embedding model changes** (e.g., switching to a larger model).

Do **not** run it routinely — it is only needed when the embedder itself changes. Normal create/update operations always embed with the current model automatically.

### 3. Freshness Management (Data Drift Prevention)

The KB uses **confidence decay**: search scores are multiplied by a freshness factor based on `verified_at`. Fresh documents rank higher; stale ones sink. This is automatic but requires active verification.

**At the start of every session:**
- Call `get_stale_documents(days_threshold=30)` to check for documents needing review.
- For each stale document: call `get_document` to read it, then either:
  - `verify_document(document_id)` — if the content is still accurate (bumps freshness, no content change)
  - `update_document(...)` — if the content needs correction
  - `delete_document(...)` — if the document is obsolete

**When reading documents during a task:**
- Search results include `days_since_verified`. Documents older than 30 days deserve extra scrutiny.
- After reading a document and confirming it's correct, call `verify_document` to keep it fresh.
- If you notice the document is outdated, update or delete it immediately.

### 4. Maintenance (The "Boy Scout Rule")

Every conversation should **leave the KB better than you found it**. This is not optional.

- **Capture Novelty:** If you solve a problem, fix a bug, or explain a concept that was NOT found in the DB, you **MUST** create a new Brief or update an existing one immediately — before the conversation ends.
- **Refactor = Update:** If you change code logic (e.g., "Deployment now requires 2 approvals"), you must find the corresponding Brief and update it in the same response.
- **Prune Stale Data:** If you find a Brief that contradicts the current codebase, **delete** or **rewrite** it. Do not leave "zombie" knowledge.
- **Verify on Read:** If you read a document and confirm it's still accurate, call `verify_document` to refresh its timestamp.
- **After completing a task:** Ask yourself — "Did I learn anything that future sessions should know?" If yes, write it to the KB.

## Knowledge Base Strategy (Document Management)

**Core Philosophy:** We organize knowledge into **Topic-Complete Briefs**. Each Brief is a single source of truth for a specific domain. Avoid fragmentation (tiny files) and bloat (massive generic files).

### 1. Scope & Sizing ("The Goldilocks Rule")

- **Target:** A Brief should cover **one** concept. Documents are automatically split into overlapping chunks (~200 words each) for embedding, so longer documents are fully searchable. However, focused documents still produce better search results than sprawling ones.
- **Preferred size:** 150–500 words. Short enough to stay focused, long enough to be self-contained.
- **The "Context" Rule:** A Brief must be self-contained. Do not write "See the other file." Include all necessary context (constants, environment variables, related CLI commands) in that one Brief so you don't need to open multiple files.
- **When to Split:** If a Brief covers multiple unrelated topics, split it into separate focused Briefs.

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
