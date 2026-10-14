# Okafor-Lindqvist 2025 workpaper (prototype)

A web-native tax workpaper. Plain HTML, CSS and JavaScript with no build step and no server code.
It loads `okafor_lindqvist_2025_packet.json` exactly as delivered.

## Run locally
    python3 -m http.server 8000      # from this folder
    open http://localhost:8000

## Publish as a link (pick one)
- **Netlify Drop:** drag this folder onto https://app.netlify.com/drop
- **GitHub Pages:** push this folder to a repo, then Settings → Pages → deploy from the main branch, root folder.
- **Vercel:** `npx vercel` in this folder.

## Using it
- Use "Signed in as" (top right) to switch roles: preparer, reviewer, partner, firm administrator, quality reviewer, or client (Ngozi or Erik).
- Open two tabs as different people: their changes appear live in each other's tab.
- Work is saved as an append-only event log in the browser. Firm → Saved work can export, import or clear it.

## Files
- `core.js`: packet index, event store, derived state, independent checks
- `ui1.js` / `ui2.js`: views
- `main.js`: actions, forms, search, startup
