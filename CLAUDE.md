# Instructions for Lore DB

## General instructions

Any new feature starts with unit tests. These tests must be verified before work starts. Then we iterate against the tests to ensure that we are building a robust product.

## Knowledge Base Protocol (Read & Write)

The `knowledge-base` MCP is our **Living Source of Truth**. You are its caretaker.

### 1. Retrieval (Mandatory First Step)

- **Search First:** Before generating code or answers, perform a vector search in `knowledge-base` to find existing patterns or solutions.
- **Strict Constraint:** Do NOT list files. Use specific semantic queries to minimize token usage.

### 2. Maintenance (Continuous Update)

- **Capture Novelty:** If you generate a solution, fix a bug, or explain a concept that was NOT found in the knowledge base, you **MUST** add it to the knowledge base immediately.
- **Refactor & Update:** If you change code logic that contradicts existing knowledge base entries, you must update those entries to reflect the new reality.
- **Goal:** The knowledge base must always reflect the current state of the project. Never leave it stale.
