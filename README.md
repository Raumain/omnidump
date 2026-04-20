# 🐘 OmniDump

OmniDump is a lightning-fast, self-hosted database management and ETL (Extract, Transform, Load) DevTool. Built with **Bun**, **React**, and **TanStack Start**, it provides a seamless interface to manage, dump, and restore your databases directly from your browser.

## ✨ Why OmniDump?

* **📦 Zero Host Dependencies:** The Docker image ships with native `pg_dump`, `mysql`, `sqlite3`, and `openssh-client` binaries. It works out of the box, regardless of your host OS.
* **🔒 Native SSH Tunneling:** Securely connect to remote, firewalled databases through built-in SSH tunneling without opening public ports.
* **⚡ Blazing Fast SSR:** Powered by Bun and a highly optimized React Server-Side Rendered frontend for instant interactions.
* **🗄️ Self-Hosted & Private:** Your database credentials and dumps never leave your infrastructure.
* **📤 Flexible CSV Exports:** Export a single table as CSV or export the full database as a ZIP that contains one CSV per table.
* **📈 Data Visualization (Table Explorer):** Browse real table rows with server-side sorting, filtering, and pagination.

---

## 🚀 Quick Start (Recommended)

The cleanest and most reliable way to run OmniDump is using **Docker Compose**. 

Create a `compose.yml` file:

```yaml
services:
  omnidump:
    image: your-dockerhub-username/omnidump:latest
    container_name: omnidump
    init: true
    ports:
      - "5555:3000"
    volumes:
      - omnidump_data:/app/data
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped

volumes:
  omnidump_data:
```

Then, start the application:
```bash
docker compose up -d
```
Access the dashboard at `http://localhost:5555`.

---

## 📈 Data Visualization (Large-Data Safe)

OmniDump includes a **Visualization** page built for high-volume databases:

* Displays the **actual stored table rows** with their real columns.
* Uses **server-side filtering and sorting** (query logic runs on the server, not in the browser).
* Uses **server-side pagination** with strict page-size limits to keep large tables responsive.

This keeps browser memory and rendering stable even when underlying tables are very large.

---

## 🛠️ Standalone Docker Run

If you prefer using the Docker CLI directly, use the following command:

```bash
docker run -d \
  --name omnidump \
  -p 3000:3000 \
  -v omnidump_data:/app/data \
  --add-host=host.docker.internal:host-gateway \
  your-dockerhub-username/omnidump:latest
```

---

## 🧠 Understanding the Configuration

To keep the application robust and secure, we enforce a few specific Docker parameters. Here is exactly why they are required:

### 1. The Data Volume (`-v omnidump_data:/app/data`)
OmniDump uses an embedded SQLite database to save your configuration, connection strings, and UI preferences. 
* **Why it's needed:** Docker containers are ephemeral by nature. Without mounting this volume, every time you update or restart the container, all your saved database connections would be permanently deleted.

### 2. The Network Bridge (`--add-host=host.docker.internal:host-gateway`)
* **Why it's needed:** If you are testing OmniDump with a local database hosted directly on your machine (e.g., a local Postgres running on port 5432), the container cannot reach it using `localhost` (which refers to the container's own internal network). This flag creates a bridge, allowing OmniDump to securely communicate with your host machine using the `host.docker.internal` URL.

### 3. The Init Flag (`init: true` in Compose)
* **Why it's needed:** Node and Bun environments running as PID 1 in Docker do not inherently process system shutdown signals (`SIGINT`/`SIGTERM`). The `init` flag wraps the process in a lightweight signal handler. This ensures that when you hit `CTRL+C` or run `docker stop`, OmniDump instantly and gracefully closes its database connections, preventing SQLite corruption.
