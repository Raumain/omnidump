# OMNIDUMP - AI SYSTEM INSTRUCTIONS

## 1. THE FOUNDATION (Immutable Tech Stack)
- **Runtime:** Bun (Use `Bun.spawn`, `Bun.file` instead of heavy Node modules).
- **Frontend:** `@tanstack/react-start`, `@tanstack/react-router` and `@tanstack/react-query`.
- **Backend/DB:** `@tanstack/react-start`,Kysely (Strictly typed SQL builder). Never use raw strings for queries if Kysely can handle it.
- **Styling:** Tailwind CSS + shadcn/ui.
- **Aesthetic:** "Neobrutalism / Hardware" (Heavy `border-2 border-black`, `rounded-none`, `shadow-hardware`, `font-mono` for data, high contrast).

## 2. ARCHITECTURAL RULES (Strict Boundaries)
- **Separation of Concerns:** Keep UI components dumb. All database connections, SSH logic, and child processes MUST live in `src/server/` or API routes. Do NOT leak Node/Bun modules into the frontend browser bundle.
- **State Persistence:** Critical UI state (like `activeConnection`) must survive F5 refreshes via `localStorage`.
- **Fail Loudly:** No duct tape. No silent `try/catch` that swallows errors. If SSH or DB fails, throw the explicit raw error to the frontend so the user sees it.
- **Tunneling:** SSH Tunnels (`ssh2`) must NEVER be kept open globally. They must be created per-request via a wrapper (`withTunnel`) and destroyed in a `finally` block.

## 3. CURRENT FOCUS (Update this section regularly)
[2026-03]
- **Current Goal:** Auditing and fixing the state persistence (LocalStorage) and standardizing the DB/SSH connection test flow.
- **Known Issues:** The frontend is losing credentials on refresh. The SSH connection is dropping errors because of malformed private keys or missing logic.
- **Directive:** Refactor existing code to match the rules above before writing new features.