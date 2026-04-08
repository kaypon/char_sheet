# D&D Tracker

A simple Next.js app for tracking one Dungeons & Dragons character on a single page. It is built for quick in-session edits, with browser autosave and a local JSON copy on disk.

## What It Does

- Edits core identity details, combat stats, abilities, attacks, equipment, coins, traits, feats, and notes
- Autosaves changes in the browser with `localStorage`
- Persists the same sheet to a local server-side JSON file
- Restores the newer copy if the browser draft and JSON file differ

## Run It

From the project folder:

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

For a production check:

```bash
npm run lint
npm run build
```

## Where Data Lives

- Browser draft: `localStorage` in your browser
- Server copy: [`data/character.json`](/Users/kevinvanderpoll/Development/DND/char_sheet/data/character.json)

The app loads both copies on startup and uses the one with the newest `meta.updatedAt` timestamp.

## How Autosave Works

1. The page fetches the current character from `GET /api/character`.
2. It reads any browser draft from `localStorage`.
3. It picks the newer version.
4. Every edit updates the UI immediately.
5. The browser draft is written right away.
6. A debounced `PUT /api/character` writes the sheet back to disk.
7. The save indicator shows `Saving`, `Saved`, or `Save issue`.

If the server write fails, your browser draft still remains available locally.

## Current Scope

- One character only
- No login or accounts
- Local machine use only
- Full-document save API only
- Notes are intentionally small in v1

## Project Structure

- [`src/app/page.tsx`](/Users/kevinvanderpoll/Development/DND/char_sheet/src/app/page.tsx): main single-page tracker UI
- [`src/app/api/character/route.ts`](/Users/kevinvanderpoll/Development/DND/char_sheet/src/app/api/character/route.ts): local JSON persistence API
- [`src/lib/character-sheet.ts`](/Users/kevinvanderpoll/Development/DND/char_sheet/src/lib/character-sheet.ts): shared types and validation
- [`data/character.json`](/Users/kevinvanderpoll/Development/DND/char_sheet/data/character.json): initial and persisted character data

## Good Next Steps

- Add a larger campaign notes view
- Add multiple characters with a selector
- Add export/import for backup
- Add quick action buttons for HP, rests, and currency changes
