# OmniDump - Copilot Instructions

## Build, Test, and Lint Commands

```bash
bun run dev          # Start dev server on port 3000
bun run build        # Production build
bun run start        # Run production build

bun run test         # Run all tests (vitest)
bun run test <file>  # Run single test file

bun run lint         # Lint with Biome
bun run format       # Format with Biome (--write --unsafe)
bun run check        # Biome check + auto-fix
bun run typecheck    # TypeScript type checking (tsc --noEmit)
```

## Architecture

### Runtime & Database Layer

- **Bun-only runtime**: Uses `bun:sql` (`import { SQL } from "bun"`) for all database connections. Never install npm database drivers (`pg`, `mysql2`, `sqlite3`).
- **Kysely as query builder only**: Kysely generates SQL strings and handles schema introspection (`information_schema`, `sqlite_master`). The generated SQL is passed to `bun:sql` for execution.
- Supported databases: PostgreSQL, MySQL, SQLite

### Full-Stack Framework

- **TanStack Start** (`@tanstack/react-start`) unifies frontend and backend
- Server functions (`createServerFn`) replace traditional REST APIs
- Routes live in `src/routes/`; the router auto-generates `src/routeTree.gen.ts`

### Server/Client Boundary

- All database connections, SSH tunneling, and child processes **must** live in `src/server/`
- Never import Node/Bun modules into frontend components (browser bundle pollution)
- Use `@tanstack/react-start/server-only` imports to enforce this boundary

### SSH Tunneling

- SSH tunnels use native `ssh` via `Bun.spawn`, not `ssh2` library
- Tunnels are pooled with idle timeout (10s default) and reused across requests
- `withTunnel(credentials, action)` is the main interface—creates tunnel, runs action, handles cleanup
- Tunnels must never be kept open globally; they auto-close after idle timeout

### State Management

- TanStack Query for server state (`@tanstack/react-query`)
- Critical UI state (e.g., `activeConnection`) persists via `localStorage`
- Query keys defined in `src/lib/query-keys.ts`

### Large File Processing

- CSV imports use Node Streams or `ReadableStream` with `csv-parse`
- Process in chunks (1000-5000 rows) to avoid memory exhaustion on large dumps

## Key Conventions

### Error Handling

Fail loudly. Never silently swallow errors. Throw explicit errors to the frontend so users see what failed:

```typescript
// BAD
try { ... } catch { /* silent */ }

// GOOD
try { ... } catch (error) {
  throw new Error(`SSH connection failed: ${error.message}`);
}
```

### Styling

- Tailwind CSS + shadcn/ui components (in `src/components/ui/`)
- **Neobrutalism aesthetic**: `border-2 border-black`, `rounded-none`, `shadow-hardware`, `font-mono` for data
- Use `components.json` for shadcn configuration

### Code Formatting

- Biome for linting and formatting (not ESLint/Prettier)
- Tabs for indentation, double quotes for strings
- Auto-organize imports enabled

### Path Aliases

Import from `#/` for `src/` paths:

```typescript
import { db } from "#/server/internal-db";
```

### Server Functions Pattern

```typescript
export const myServerFn = createServerFn({ method: "POST" })
  .inputValidator((input: InputType) => input)
  .handler(async ({ data }): Promise<ResultType> => {
    // Server-side logic
  });
```

### Testing

- Bun's built-in test runner (`bun:test`)
- Tests in `tests/` directory
- Use dependency injection for testability (see `__setTunnelRuntimeForTests` pattern in `ssh-tunnel.ts`)
