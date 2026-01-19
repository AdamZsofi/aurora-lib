# Aurora Web UI (React + Vite + TypeScript)

Quick start:

```bash
cd web-ui
npm install
npm run dev
```

Notes:
- Tabs are stored in localStorage, which is scoped to the exact origin (scheme + host + port).
- If Vite auto-selects a new port or you switch between localhost and 127.0.0.1, storage appears empty.
- The dev server is configured with a fixed port (5173). Always use the same URL.