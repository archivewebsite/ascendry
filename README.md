# Ascendry

Ascendry is a local BConomy market, crafting, and progression workspace. It runs on your Windows computer and keeps its database there. Live data comes from the BConomy Data API when you connect or request a refresh.

Repository: [archivewebsite/ascendry](https://github.com/archivewebsite/ascendry).

## What it does

| Workspace | Purpose |
| --- | --- |
| Dashboard and Market | Inspect prices, changes, retained market snapshots, and watchlist alerts. |
| Craft Lab | Calculate direct or recursive recipes, compare crafting with buying, and estimate costs from market listings or manual prices. |
| Plans | Save, duplicate, and recalculate crafting plans locally. |
| Prestige | Manage reusable perk profiles for crafting calculations. |
| Players | Explore player profiles, inventory, pets, listings, and activity. |
| Profile tracker | Track up to two Ironman or Hardcore BcIDs and plan against their inventories with manual Depot price and stock quotes. |
| Calculators | Estimate ascension, boss damage, and booster effects. |
| Settings | Connect BConomy, change appearance and number formatting, inspect diagnostics, and export or import backups. |

Craft Lab models normal Market purchases. The Profile tracker uses restricted-profile inventories and manual Depot quotes instead. Large quantities and currency values use exact integer calculations; shortened display values retain an exact-value view.

## Requirements

- Windows 10 or later. Saving and decrypting an API key requires Windows DPAPI and the same Windows user account.
- Node.js 24 or later and npm (included with Node.js).
- Git to clone the repository.
- Internet access for dependency installation and live BConomy requests.

Ascendry uses Next.js 16, React 19, TypeScript, and Node's built-in SQLite support. A separate database server is unnecessary.

## Install and run

In PowerShell:

```powershell
git clone https://github.com/archivewebsite/ascendry.git
Set-Location ascendry
npm ci
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The application can start with its bundled item catalog before you connect an API key. Live market and player data require a connection.

For a production build running on your own computer:

```powershell
npm run build
npm start
```

The supplied development and production scripts bind to `127.0.0.1`. Ascendry is intended for local use; keep that binding when running it with personal credentials and data.

## Connect BConomy

1. Open **Settings** and find **Bconomy connection**.
2. Enter your own BConomy API key and select **Connect and sync**.
3. Use **Refresh market** to fetch another market snapshot. Player tools fetch data when you use their controls.
4. Use **Disconnect** in Settings to remove the saved credential.

The server validates the key and performs the initial catalog and market sync before saving it. The key is encrypted with DPAPI for the current Windows user in `data/credential.dpapi`. It is decrypted on the server as needed and is never returned in application responses. Do not put a key in source code, a README, an example file, or a `NEXT_PUBLIC_*` environment variable.

No API key is included in this repository. Each installation needs its own connection. Copying the encrypted credential to another Windows user or computer will not provide a working connection; enter the key through Settings again.

## Local storage and backups

| Location | Contents |
| --- | --- |
| `data/ascendry.sqlite` | Item catalog, market snapshots, cached API data, plans, alerts, and server settings. |
| `data/credential.dpapi` | Encrypted BConomy credential for the current Windows user. |
| Browser storage | Appearance preferences, prestige profiles, and other browser-local workspace state. |

Settings provides JSON backup export/import for saved plans, alerts, and market snapshots. These exports exclude the API credential and do not copy browser storage. Backups may contain personal plans and market history, so keep them private. Failed refreshes leave the last saved data available. Market snapshots are retained until you remove history; there is no background polling or OS notification service.

The root `.gitignore` and `data/.gitignore` exclude runtime data. Environment files, encrypted credentials, SQLite files, backup exports, dependency folders, build outputs, and generated test artifacts are also excluded. `package-lock.json` stays in Git so `npm ci` can reproduce the dependency versions.

Optional environment settings:

| Variable | Purpose | Default |
| --- | --- | --- |
| `ASCENDRY_DATA_DIR` | Choose another local runtime-data directory. | `data/` in the project directory |
| `ASCENDRY_NEXT_DIST_DIR` | Choose a separate Next.js output directory for an isolated run. | `.next` |
| `ASCENDRY_E2E_BASE_URL` | Override the Playwright target when running the test configuration directly. The normal E2E runner sets this itself. | `http://127.0.0.1:3210` |

For example, in the PowerShell session used to launch Ascendry:

```powershell
$env:ASCENDRY_DATA_DIR = Join-Path $env:LOCALAPPDATA 'Ascendry'
npm run dev
```

Keep custom runtime directories outside version control. Custom build directories beginning with `.next` are covered by the ignore rules; add an ignore rule if you choose another name.

## Development and verification

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server. |
| `npm run typecheck` | Check TypeScript without emitting JavaScript. |
| `npm run lint` | Check application code, tests, scripts, and configuration with ESLint. |
| `npm test` | Run unit, integration, and included audit regression tests. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run build` | Create a production build. |
| `npm start` | Serve the production build locally. |
| `npm run verify` | Run type checking, lint, tests, and a production build in order. |
| `npm run test:e2e` | Start an isolated local server and run Chromium browser tests. |

For full verification:

```powershell
npm run verify
npx playwright install chromium
npm run test:e2e
```

The E2E runner chooses an available local port, uses `.next-e2e` and `test-results/e2e-data`, and stops its server when finished. Tests use temporary databases and mock or dummy credentials; do not substitute a real key.

## Project layout

```text
src/app/                 Next.js pages and server API routes
src/components/          Workspace features and shared UI
src/lib/                 Calculations, schemas, types, and client helpers
src/lib/server/          SQLite persistence, BConomy requests, credential handling
src/data/                Bundled item catalog
scripts/                DPAPI bridge and isolated E2E runner
e2e/                    Playwright workspace tests
docs/                   Design notes, audit reports, and third-party notices
data/                   Private runtime data (ignored by Git)
```

Historical design and audit notes describe the project at the time they were written. See [the repair report](docs/audits/2026-10-03/REPAIRS.md) for the associated audit fixes. [AGENTS.md](AGENTS.md) provides optional project guidance for AI coding agents; it is not required to run Ascendry.

## Publishing changes to GitHub

Review what will be committed before pushing:

```powershell
git status --short
git add .
git diff --cached --stat
git diff --cached
git commit -m "Describe the change"
git push origin main
```

Check that no key, credential file, local database, environment secret, backup, or test artifact is staged. Ignore rules apply to untracked files; they do not remove a file that was already committed. If a live key is ever committed, revoke or rotate it with BConomy and remove it from Git history before sharing further.

## Component credits

Fluid Orb is by [Rare UI](https://rareui.com), copyright (c) 2026 Swami Malode. See [its license](docs/licenses/rare-ui.txt). Keep that notice when redistributing the component.
