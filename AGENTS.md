# Agent guide for Ascendry

This file explains how to configure, operate, and maintain Ascendry. It is guidance for AI coding agents and is not required to run the application. Use the sections relevant to the user's task; the detail below does not require reading every subsystem before a small edit. [README.md](README.md) is the shorter user-facing setup guide. Current source takes precedence over historical design and audit notes.

## Essential operating rules

- Ascendry is a Windows-local BConomy workspace. Keep its server bound to `127.0.0.1`, keep credentials on the server, and preserve local-host/origin checks on writes.
- A request to connect, replace, or remove a BConomy connection authorizes that matching credential operation. A request to edit documentation or run tests does not itself authorize using a live key. Existing authorization in the conversation remains valid; do not ask again for an already authorized operation.
- Use a user-provided credential through the supported connection flow. Never invent a key, extract one from unrelated files, print a key or credential blob, include one in a tool argument or committed file, or send one to a service other than the intended local application and its BConomy upstream.
- Keep production data private. Use a separate data directory for tests and experiments; do not reset the user's database, browser storage, connection, or plans during unrelated work.
- Quantities and currency use exact integer/string arithmetic. Preserve missing-price, insufficient-supply, and incomplete-plan states rather than presenting a known subtotal as a complete price.
- Normal Market crafting and restricted Ironman/Hardcore inventory planning are separate systems. Do not substitute Market listings for Depot stock or restricted-profile resources.
- Match existing code style, preserve third-party notices, and keep changes within the requested scope. Publish when authorized, and do not overwrite unrelated work or rewrite shared Git history without authorization.

## Find the relevant system

| Task | Section |
| --- | --- |
| Install or start the project | [Runtime and first launch](#runtime-and-first-launch) |
| Add, replace, verify, or remove a key | [BConomy connection and credentials](#bconomy-connection-and-credentials) |
| Choose storage, ports, or build outputs | [Runtime configuration](#runtime-configuration) |
| Understand server/client boundaries | [Application architecture and request safety](#application-architecture-and-request-safety) |
| Change persistence or backups | [Database, storage, and backups](#database-storage-and-backups) |
| Understand BConomy requests and caches | [Upstream data, refreshes, and cache behavior](#upstream-data-refreshes-and-cache-behavior) |
| Configure or modify a feature | [Workspace systems and their settings](#workspace-systems-and-their-settings) |
| Change numeric calculations | [Exact amounts and schemas](#exact-amounts-and-schemas) |
| Verify a change | [Tests, builds, and isolation](#tests-builds-and-isolation) |
| Diagnose setup failures | [Troubleshooting](#troubleshooting) |
| Commit or upload | [Source control and completion](#source-control-and-completion) |

## Runtime and first launch

### Requirements and their purpose

| Requirement | Why it is needed |
| --- | --- |
| Windows 10 or later, with a loaded user profile | Credentials use Windows DPAPI with `CurrentUser` protection. A headless, impersonated, or service account without its profile loaded can fail even on Windows. |
| Node.js 24 or later | The server uses Node's built-in `node:sqlite` module and the application's declared engine range. |
| npm | Installs the locked dependencies and runs the project scripts. |
| Git | Connects the checkout to `https://github.com/archivewebsite/ascendry.git`. |
| A writable local data directory | SQLite, cache entries, plans, diagnostics, and the protected credential are persisted locally. |
| Network access for installation and live features | Dependency installation contacts the package registry; live game requests contact BConomy. Local calculations and previously saved data have different requirements. |

No separate SQLite server, database password, OAuth application, cloud account, or environment secret is needed to start Ascendry. A valid BConomy key is needed for live upstream requests. The repository does not issue or retrieve that key; the user must obtain their own credential through BConomy's supported account process.

Work from the repository root because the data-directory default, DPAPI script path, and Next.js commands are relative to the current working directory.

```powershell
node --version
npm --version
npm ci
npm run dev
```

For an existing installation, inspect the installed dependencies and task requirements before rerunning `npm ci`, which replaces `node_modules`. Prefer the lockfile over an unnecessary dependency upgrade. Open `http://127.0.0.1:3000`; an empty database is initialized and populated from the bundled catalog as database-backed routes are used. It is normal for the UI to show **Local catalog · API not connected** on a new checkout.

For a local production run:

```powershell
npm run build
npm start
```

Production requires a successful build first. Keep the build and start processes configured for the same Next.js output directory. There is no deployment step required for ordinary local use.

## BConomy connection and credentials

### Supported source of the API key

The application loads the key from `credential.dpapi` in the active runtime-data directory. It does **not** read `BCONOMY_API_KEY`, `API_KEY`, or a `NEXT_PUBLIC_*` variable. Putting a key in `.env.local` will not connect this implementation. Do not add an environment-key shortcut, hardcode a default key, or change the persistence format merely to configure an installation.

The source of truth is [credential.ts](src/lib/server/credential.ts), the [DPAPI bridge](scripts/dpapi.ps1), and the [connection route](src/app/api/connection/route.ts). `saveApiKey()` encrypts a trimmed key for the Windows user running the server. `loadApiKey()` decrypts it in the server process; a missing file returns `null`. `clearApiKey()` removes the saved file. Encrypted blobs must remain private even though they are not plaintext.

### Preferred setup: the Settings interface

1. Start the application under the Windows account that will use it, with the intended `ASCENDRY_DATA_DIR` set before launch if applicable.
2. Open `http://127.0.0.1:3000/settings`, or the corresponding local address if a different port was explicitly configured.
3. Find **Bconomy connection** and the password-style **API key** field. Let the user enter a missing key privately. Do not ask them to paste a real key into an ordinary agent chat or put it in a recorded command. If the user already supplied an authorized secret through a suitable private mechanism, use that mechanism without echoing the value.
4. Select **Connect and sync**. If already connected, the button is **Replace connection** and performs the same validation/save sequence with the replacement key.
5. Wait for a successful connection response. The UI should show **Connected**, clear the input field, and update diagnostics. Verify connection status without inspecting or decrypting the saved file manually.
6. Report whether connection and initial sync succeeded, the runtime-data location if relevant, and any sanitized error. Do not include the submitted value in the report.

Connecting changes local state: it refreshes the catalog and market snapshot and saves a credential. It does not create a BConomy key, change the user's BConomy account, or execute an in-game trade.

### What happens during a connection

`POST /api/connection` accepts JSON containing one `apiKey` string, trims it, and validates a length of 10–500 characters. This is input validation, not evidence that an arbitrary string is a valid key. The server then:

1. Requests upstream `misc/itemData` and `market/preview` using the supplied key.
2. Parses the results with the server schemas and saves the catalog/market data through `storeSync()`.
3. Encrypts the key with DPAPI and writes `credential.dpapi.tmp`, then renames it to `credential.dpapi`.
4. Returns connection status, sync metadata, and diagnostics without returning the key.

The data sync and credential file save are separate operations. If DPAPI saving fails after the upstream requests and database sync succeed, new data may already be present while the new credential is not usable. Inspect connection status and the displayed error instead of assuming that all steps rolled back together. Avoid simultaneous connection/replacement requests: the current credential writer uses a shared temporary filename.

### Local HTTP interface for authorized automation

Prefer the Settings UI when the user can enter the key there. For a requested setup script or an authorized tool with private secret input, use the same local HTTP interface rather than writing a credential file yourself.

| Request | Purpose | Input and result |
| --- | --- | --- |
| `GET /api/connection` | Inspect status and diagnostics. | No key input. Returns `connected`, optional `credentialError`, and diagnostics. Status checking decrypts on the server; it does not return the plaintext. |
| `POST /api/connection` | Validate, sync, and save or replace the key. | JSON object with the privately supplied `apiKey`. Success returns `connected: true`, `sync`, and diagnostics. |
| `DELETE /api/connection` | Remove the local connection. | No JSON body is required. Success returns `connected: false`; market data and plans remain. |
| `POST /api/sync` | Refresh catalog and market data using the saved key. | No replacement key or JSON body is required. Missing credentials return 401. |

For JSON writes, use `Content-Type: application/json`. Use a loopback base URL and an `Origin` matching its scheme, hostname, and port exactly. For example, `http://127.0.0.1:3000` and `http://localhost:3000` are different origins. Do not remove the origin checks or add permissive CORS rules to get a setup request through.

This PowerShell example is for a **private, user-operated interactive terminal** with the application already running. It prompts without recording the actual key in command history, submits it in memory, and prints only the connection boolean. Do not run it through an agent tool that cannot accept private interactive input. If transcripts, tracing, or request-body logging are enabled, use the password field in Settings instead.

```powershell
$ascendryBaseUrl = 'http://127.0.0.1:3000'
$ascendrySecret = Read-Host 'Enter the BConomy API key privately' -AsSecureString
$ascendryBstr = [IntPtr]::Zero

try {
    $ascendryBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ascendrySecret)
    $ascendryPlainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ascendryBstr)
    $ascendryRequestBody = @{ apiKey = $ascendryPlainKey } | ConvertTo-Json -Compress
    $ascendryConnection = Invoke-RestMethod `
        -Uri "$ascendryBaseUrl/api/connection" `
        -Method Post `
        -Headers @{ Origin = $ascendryBaseUrl } `
        -ContentType 'application/json' `
        -Body $ascendryRequestBody `
        -ErrorAction Stop
    Write-Output "Connected: $($ascendryConnection.connected)"
}
catch {
    Write-Error 'Connection failed. Inspect Settings for the connection error without logging the key or request body.'
}
finally {
    if ($ascendryBstr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ascendryBstr)
    }
    $ascendrySecret.Dispose()
    Remove-Variable ascendryPlainKey, ascendryRequestBody, ascendryConnection, ascendrySecret, ascendryBstr -ErrorAction SilentlyContinue
}
```

The unmanaged BSTR is cleared and freed; removing variables does not guarantee immediate erasure of immutable managed strings. Keep the process and terminal private, minimize copies, and never print the request body. A setup agent should preserve these properties if adapting the example.

### Verify, replace, disconnect, and recover

Read status without exposing the key:

```powershell
$ascendryBaseUrl = 'http://127.0.0.1:3000'
Invoke-RestMethod -Uri "$ascendryBaseUrl/api/connection" |
    Select-Object connected, credentialError
```

`connected: true` means the saved credential could be loaded and decrypted. It is not a fresh upstream authorization test: a formerly valid key may since have been revoked. A successful connection POST or requested refresh establishes that the corresponding upstream requests succeeded at that time. Do not add repeated live validation requests to unrelated tasks.

To replace a key, enter the replacement in Settings and use **Replace connection**. Do not print or recover the previous key. To disconnect, use **Disconnect**, which prompts in the UI. For an already authorized scripted disconnect:

```powershell
Invoke-RestMethod -Uri "$ascendryBaseUrl/api/connection" -Method Delete `
    -Headers @{ Origin = $ascendryBaseUrl } |
    Select-Object connected
```

Disconnect removes the local saved credential; it does not revoke the credential at BConomy. Reconnect through Settings after changing Windows users or moving to another computer. Treat the blob as bound to the original user/machine context. If the credential is damaged or cannot be decrypted, replace it through Settings; preserve unrelated database and browser data.

## Runtime configuration

All application-specific environment settings below are optional. Set them in the shell that launches the process, or in a private local configuration loaded by that process, and restart the server after a change. Do not assume changing an agent's shell changes a server already running in another process.

| Setting | Default | What it controls and when to change it |
| --- | --- | --- |
| `ASCENDRY_DATA_DIR` | `<repository root>/data` | Location of SQLite and `credential.dpapi`. Use a private location outside the checkout for a persistent installation, or an isolated ignored directory for experiments. Relative paths are resolved from the process working directory; absolute paths avoid ambiguity. The directory is created automatically. |
| `ASCENDRY_NEXT_DIST_DIR` | `.next` | Next.js development/build output. Use a separate directory such as `.next-agent-check` to avoid colliding with another development or build process. Use the same value for a production build and its subsequent start. |
| `ASCENDRY_E2E_BASE_URL` | `http://127.0.0.1:3210` in the Playwright configuration | Target for direct Playwright runs. The normal E2E runner chooses a free port and supplies its own value; it also supplies isolated data and build directories. This variable does not change the ordinary development server port. |
| Development host/port | `127.0.0.1:3000` | Defined by the `dev` script in `package.json`. Keep the host local. If a port is occupied, identify the process before changing or stopping it. |
| Production host/port | Host `127.0.0.1`, default port 3000 | Defined by the `start` script and Next.js CLI. An explicit `--port` can select another local port. |

Configure a persistent private data location before launch:

```powershell
$env:ASCENDRY_DATA_DIR = Join-Path $env:LOCALAPPDATA 'Ascendry'
npm run dev
```

Configure an isolated agent development session:

```powershell
$env:ASCENDRY_DATA_DIR = Join-Path (Get-Location).Path 'test-results/agent-data'
$env:ASCENDRY_NEXT_DIST_DIR = '.next-agent-check'
node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3001
```

Start a production build on a different local port:

```powershell
npm run build
npm start -- --port 3001
```

Changing `ASCENDRY_DATA_DIR` selects another installation's data; it does not migrate the old database or credential. A new empty directory produces a new local catalog and disconnected state. To return to the default in the current shell, use `Remove-Item Env:ASCENDRY_DATA_DIR -ErrorAction SilentlyContinue` and restart. Restore task-specific environment overrides after experiments if the shell will be reused.

An ignored `.env.local` can hold non-secret runtime paths when Next.js loads that file, but plain `node` scripts do not necessarily load it. Shell variables are explicit and work for the commands above. Do not store the API key there. Confirm ignore coverage for a custom directory name: `.next*` outputs and `test-results/` are already ignored, while an arbitrary new directory may require a new rule.

The current [Next.js configuration](next.config.ts) enables strict React behavior and typed routes, disables the development indicator and powered-by header, and allows remote images from `https://cdn.jsdelivr.net`. `highs`, `json-bigint`, and `z3-solver` are server external packages. Preserve these server runtime boundaries; the optimizer and database do not belong in an Edge route or client bundle.

## Application architecture and request safety

### Layers and responsibilities

| Layer | Main location | Responsibility |
| --- | --- | --- |
| Pages and layout | [src/app](src/app) | Next.js App Router entry points, global CSS, layout, error and not-found presentation. |
| Feature components | [src/components](src/components) | User inputs, React Query reads/mutations, loading/errors, and workspace presentation. |
| Shared UI | [src/components/ui](src/components/ui) | Reusable controls, exact-value displays, and orb visuals. |
| Domain logic | [src/lib](src/lib) | Exact quantity parsing, market math, crafting, calculators, validation, themes, and tracker planning. |
| Server-only services | [src/lib/server](src/lib/server) | BConomy HTTP requests, DPAPI credential access, SQLite, caches, and optimization runtimes. |
| HTTP routes | [src/app/api](src/app/api) | Input validation, local write checks, service orchestration, and JSON response/error contracts. |
| Browser persistence | [src/lib/client](src/lib/client) and feature components | Appearance, Prestige profiles, and other browser-local state. |

[Providers.tsx](src/components/Providers.tsx) supplies React Query, Radix tooltips, icon context, and appearance state. Default React Query settings use a 15-second stale time, one retry, and no focus refetch, but individual features can override them. A query's freshness setting is separate from a server-side SQLite cache's expiry.

The typical feature path is: component input → local API route → schema validation → local calculation/database or server-side BConomy call → JSON response → rendered result. The browser submits the key only to the local connection route when connecting; ordinary features use the saved server credential. Retain `server-only` imports in credential, database, upstream, and optimizer modules.

### Write validation and error reporting

Use [http.ts](src/lib/server/http.ts) for `assertMutationRequest()`, `readJsonRequest()`, and `jsonError()`. The write guard accepts loopback hosts, checks any supplied Origin against the target origin, and rejects cross-site fetch metadata. The effective HTTP Host matters, including the port. There is no multi-user login layer; loopback binding is part of the application's privacy model.

JSON mutations must use the proper content type and valid JSON. Preserve the distinction between input errors (400), invalid local/cross-origin writes (403), unsupported content types (415), schema failures (422), upstream authorization failures (401), upstream rate limits (429), upstream service failures (502), and other local failures (500). Individual routes may return their own 404 or missing-connection errors. Check `response.ok` in clients before treating a mutation as successful, and show meaningful errors without including secrets.

## Database, storage, and backups

### Server persistence

[db.ts](src/lib/server/db.ts) opens `ascendry.sqlite` under the directory returned by [paths.ts](src/lib/server/paths.ts). It maintains a process-local database singleton, initializes schema on opening, and seeds the bundled validated catalog only when the item table is empty. SQLite uses WAL journaling, foreign keys, and a busy timeout. Companion `-wal` and `-shm` files are normal runtime data and must stay private.

| Table | Meaning |
| --- | --- |
| `schema_migrations` | Records applied schema version metadata. |
| `app_settings` | Internal diagnostic/catalog settings such as catalog source and last sync success/error. It is not an API-key store. |
| `items` and `recipes` | Current validated catalog, attributes, base values, weapon metadata, and ingredient relationships. |
| `market_snapshots` and `market_prices` | Retained manual market-sync snapshots and their prices/deltas. |
| `external_cache` | JSON upstream responses with fetch/expiry timestamps. |
| `plans` | Saved calculation inputs and results with names and creation/update times. |
| `alerts` | Enabled/disabled watch thresholds and their last triggered price/time. |

Use existing database functions and transaction boundaries for application writes. Do not edit live rows merely to configure a key or appearance setting. Most integer amounts are TEXT so exact values survive SQLite/JSON round trips. A failed sync should preserve previously usable market data; do not delete a database to resolve a network error.

### Browser persistence

Browser state belongs to the browser profile **and origin**. Switching between `localhost` and `127.0.0.1`, changing the port, using another browser profile, or clearing site data can make preferences/profiles appear absent even while the SQLite database remains unchanged.

| Storage key | Meaning |
| --- | --- |
| `ascendry.appearance` | `adaptive`, `light`, or `dark` display mode. |
| `ascendry.palette` | Theme palette key, default `ground-plane`. |
| `ascendry.orbDesign` | Orb variant, default `halo`. |
| `ascendry.orbMotion` | Animation enabled unless stored as `false`. |
| `ascendry.numberFormat` | `compact`, `words`, or `exact`, default `compact`. |
| `ascendry.sidebarCollapsed` | Sidebar collapse preference. |
| `ascendry.prestigeProfiles` | Up to three validated local perk profiles. |
| `ascendry.restrictedTracker.v1` | Up to two restricted-profile snapshots, previous snapshots, goals, and manual Depot quotes. |

Use existing storage helpers and normalizers. If storage is unavailable, retain usable in-tab state and present the existing persistence warning. Avoid a blanket `localStorage.clear()` during debugging because it removes user preferences and profiles.

### Backup and recovery semantics

Settings exports a version-1 JSON backup through `GET /api/backup`. It includes saved plans, alerts, snapshots, and snapshot prices. It excludes the API credential, browser storage, item catalog tables, internal app settings, and external caches. Consequently, importing a backup does not restore a BConomy connection, Prestige profiles, or Profile tracker state.

`POST /api/backup` validates using [backup-schema.ts](src/lib/server/backup-schema.ts) and imports transactionally. Matching plan and alert IDs can be replaced; snapshots are matched by upstream timestamp and imported prices are associated with the resulting local snapshot IDs. This is not a complete raw-database restore. Respect the UI's import confirmation and keep backup files private.

Settings **Remove history** clears market snapshots and external caches while preserving plans and alerts. It is a destructive local operation that should only be performed when requested or already authorized. Disconnecting has different effects and does not clear history. Prefer application backup/export for ordinary support work; do not copy only the live `.sqlite` file while assuming WAL contents are included.

## Upstream data, refreshes, and cache behavior

[bconomy.ts](src/lib/server/bconomy.ts) sends JSON POST requests to the BConomy Data API at `https://bconomy.net/api/data`. The saved credential is supplied as the `x-api-key` header. The request body identifies the data operation; this wrapper is for reading game data and does not perform trading/crafting actions in the game.

The wrapper queues at most four concurrent requests, applies a 15-second timeout to an attempt, and makes up to three attempts for retryable failures. Authorization failures stop without retrying; 429 and server failures can retry. Responses use `json-bigint` with large integer values stored as strings to avoid JSON precision loss. Schema-validated market/catalog payloads and more flexible player payloads intentionally have different parsing strategies; do not silently narrow unversioned player fields in a way that loses newly returned data.

Catalog/market synchronization happens on **Connect and sync** or **Refresh market**. Each distinct upstream timestamp becomes one retained snapshot; repeating a timestamp can refresh catalog/diagnostics without inserting a duplicate snapshot. Snapshot selection uses upstream time, so receiving an older snapshot must not displace the newer market state. Enabled alerts are evaluated against an inserted snapshot when it is the latest one.

There is no background market-sync polling service or OS notification service. Opening a player, item, or calculator feature can still trigger its own route-specific reads, and some React Query features refetch on focus or input changes. Do not describe every navigation as offline or assume a server cache guarantees no upstream call after expiry.

Current item-market cache lifetimes in [the item market route](src/app/api/items/[idName]/market/route.ts):

| Data | Cache lifetime |
| --- | --- |
| Listings/order books | 60 seconds |
| Recent transactions | 5 minutes |
| Upstream price history | 6 hours |
| Upstream volume history | 6 hours |

History requests default to 90 days and validate a 1–400 day range. Craft Lab and booster pricing also use 60-second listing caches. A manual-price override or valid complete cache can remove the need to load a credential for a particular calculation. Preserve deferred credential loading: a fully manual or fully cached calculation should not fail solely because an irrelevant credential cannot decrypt. Cached listings represent observations, not a guarantee that current market stock remains available.

## Workspace systems and their settings

### Dashboard, Market, and item details

Routes: `/`, `/market`, and `/items/<idName>`. Main components: [Dashboard](src/components/dashboard/Dashboard.tsx), [MarketTable](src/components/market/MarketTable.tsx), and [ItemDetail](src/components/items/ItemDetail.tsx).

These views combine the local catalog with the latest retained market snapshot and, for item details, live/cached listings, transactions, and history. A new installation can display catalog information without a connection, but a base value is not automatically a live market ask. Connect and sync to populate market snapshots; use Refresh market to update them. Item details merge upstream and retained local price history through [history.ts](src/lib/history.ts).

Watchlist alerts need an item, a direction (`below` or `above`), an exact nonnegative threshold, and an enabled state. They are stored in SQLite and evaluated on relevant new sync snapshots. They do not run a continuous price-monitoring worker. Changing a rule clears a previous trigger when the rule's meaning changes. Distinguish a missing price from zero and distinguish snapshot time from the time the application fetched it.

### Craft Lab and the optimizer

Route: `/craft`. Main files: [CraftLab](src/components/craft/CraftLab.tsx), [calculate route](src/app/api/craft/calculate/route.ts), [crafting.ts](src/lib/crafting.ts), [market-math.ts](src/lib/market-math.ts), [optimized-crafting.ts](src/lib/server/optimized-crafting.ts), and [crafting-optimizer.ts](src/lib/server/crafting-optimizer.ts).

Required calculation inputs are a catalog item, a target mode, a positive quantity or positive budget, recipe mode, price mode, and a valid Prestige profile. Optional inputs are manual unit-price overrides and a sale price. The route parses supported quantity expressions and captures the profile used for the result. Use item `idName` identifiers consistently; display names and numeric upstream IDs serve other purposes.

| Setting | Meaning |
| --- | --- |
| Target `quantity` | Calculate the resources/cost for a specified positive amount. |
| Target `budget` | Find an affordable quantity subject to known prices and available depth. An unknown or unbounded path cannot be reported as a finite guaranteed maximum. |
| Recipe `direct` | Work with the selected item's immediate recipe ingredients. |
| Recipe `recursive` | Expand craftable ingredients through their recipe dependencies. |
| Recipe `optimized` | Compare buying and crafting across dependencies, allowing mixed acquisition decisions where appropriate. |
| Price `lowest` | Use observed lowest/snapshot unit prices or manual overrides; this does not establish sufficient listing depth. |
| Price `orderbook` | Fill actual cached/live listing quantities in ascending price order and preserve unfilled quantities. |
| Manual price overrides | Supply exact nonnegative unit prices keyed by item `idName`; the result is marked as custom. Zero is an explicit price, not a missing price. |
| Sale price | Estimate proceeds, fees, profit, break-even price, and sell eligibility. It is an estimate and does not post a listing. |

The optimized order-book engine uses HiGHS for suitable safely bounded values, validates the resulting quantities/costs, and falls back to Z3 for exact arbitrary-precision solving or rejected numerical results. Both runtimes belong on the server and are installed through npm. Preserve cycle detection, shared ingredient/supply constraints, exact budget checks, and partial-fill reporting. Do not replace this system with a floating-point greedy estimate while retaining claims of exact optimality.

Manual or cached plans can work without a fresh live request. Uncached order-book requirements need a connected key. Saved data can be stale, and a known subtotal can exclude unknown/unfilled inputs: retain `complete`, missing-price, and market-depth details when explaining a result.

### Plans and imports

Route: `/plans`. Main files: [PlansWorkspace](src/components/plans/PlansWorkspace.tsx), [plans API](src/app/api/plans/route.ts), and [plan-schema.ts](src/lib/plan-schema.ts).

A saved plan records a name, normalized inputs, the captured Prestige profile, market snapshot context, and calculation result. It is persisted in SQLite so it survives a browser reload. Saving a plan stores an estimate; it does not reserve resources, buy ingredients, or execute a craft. Select up to four plans for the comparison rail. **Duplicate** creates another saved copy. **Current perks** recalculates using the matching current browser Prestige profile, or the first profile if the original no longer exists, and saves a new plan with a `current perks` name suffix. These explicit actions should report HTTP failures and preserve the original plan.

Plan import accepts supported saved-plan/calculation structures and validates that result and input describe the same target quantity, item, recipe mode, and price mode. Preserve version checks and whole-import validation. Recalculation can change prices and results; do not silently replace a previously saved profile or pretend an old snapshot is current.

### Prestige profiles

Route: `/prestige`. Main files: [PrestigeProfiles](src/components/prestige/PrestigeProfiles.tsx), [profile storage](src/lib/client/prestige-profiles.ts), and [prestige.ts](src/lib/prestige.ts).

The browser starts with **Main profile**, with every perk level set to zero. Users can keep up to three profiles and must keep at least one. Configure a named profile by entering the user's actual whole perk levels and saving; levels must be within each perk's declared maximum. These are local calculation settings, not modifications to the user's game account and not credentials.

`Insider` controls the normal Market sale fee, from a 25% base down by 0.5 percentage points per level to a 2.5% floor; valid levels are 0–45. `Mercantilist` controls normal Market sell unlock eligibility; valid levels are 0–61 and item unlocks come from the local mapping. Other perks remain available as reference/profile data; do not assume every listed perk affects Craft Lab. `Nepotism` and `Anointment` are separately used in ascension estimates. Browser profiles are not automatically restored by the server JSON backup.

### Player Explorer

Route: `/players`. Main files: [PlayerExplorer](src/components/players/PlayerExplorer.tsx), [player API routes](src/app/api/players), and [player-route.ts](src/lib/server/player-route.ts).

The user selects a player through search or a valid positive BcID. Server routes load the saved key through `requireApiKey()` and provide overview, inventory, pets, listings, activity, and other supported player data. BcID is a player identifier, not an API key. Validate it with the existing parser; do not accept arbitrary numeric conversions or negative/unsafe IDs. Search and pagination values also have route-specific limits.

Player views can provide inputs to calculators. Preserve flexible, lossless handling of the upstream payload and show a missing-connection or unavailable-data error rather than fabricating a profile. Query caches in the browser should not be confused with persistent tracker snapshots.

### Ironman/Hardcore Profile tracker and Depot planning

Route: `/tracker`. Main files: [RestrictedTracker](src/components/tracker/RestrictedTracker.tsx), [tracker domain logic](src/lib/restricted-tracker.ts), and [tracker API](src/app/api/players/[bcId]/tracker/route.ts).

With a connection available, enter an Ironman or Hardcore BcID and add it to monitoring. The route reads user, inventory, statistics, and trophies and checks the profile mode, using a profile lookup if needed. A normal profile is rejected with 422. Monitor at most two distinct profiles; change or remove one before adding another.

The browser stores the latest and previous snapshots for each profile, along with a crafting goal and manual Depot quotes. This supports exact progression deltas for resources/statistics without a background polling process. A goal needs an item and positive quantity. Planning consumes owned inventory first, expands recipes, and reports missing resources/loot sources. Shared inventory must not be spent twice across branches.

Depot quotes need an item-specific price and stock quantity entered by the user. Missing values mean unknown availability/cost; they must not become free unlimited supply. This implementation has no automatic Depot-stock feed. Keep quotes scoped to their monitored profile, distinguish shortages from known stock, and never use normal Market listings to fill an Ironman/Hardcore plan. Tracker state is browser-local and is not included in the server backup export.

### Ascension calculator

Route: `/calculators/ascension`. Main files: [AscensionCalculator](src/components/calculators/AscensionCalculator.tsx), [ascension.ts](src/lib/ascension.ts), and [ascension API](src/app/api/calculators/ascension/route.ts).

Configure the current tier/rank, BC balance, and `Nepotism`/`Anointment` levels. Choose a target tier/rank to estimate a route, or the maximum-affordable mode to calculate progress within the balance. The API validates tiers from 0–100,000, ranks from 1–58, nonnegative integer-string balance, and those two perk levels from 0–20. Preserve the rank/ascension transition sequence and exact per-step rounding in the domain code.

Manual calculation works without a live key. An optional BcID context can prefill player information, and market-sale analysis can use live item data and sale-fee/unlock inputs. Those extra reads need their own connection/data. A sale estimate does not actually sell inventory; report incomplete market-depth information instead of assuming all items can be sold at a displayed unit price.

### Boss damage calculator

Route: `/calculators/boss-damage`. Main files: [BossDamageCalculator](src/components/calculators/BossDamageCalculator.tsx), [boss-damage.ts](src/lib/boss-damage.ts), and [boss damage API](src/app/api/calculators/boss-damage/route.ts).

Configure the goal (`kill-boss`, `target-bounties`, or `max-bounties`), weapon selection, boss HP/desired reward count, positive damage multiplier, weakpoint state, buddy level, and acquisition pricing mode (`market`, `direct`, `recursive`, or `base`). An optional BcID supplies owned inventory so cost covers the additional weapons needed. Multipliers cross the API as basis points; use the existing exact damage and ceiling-quantity functions.

The reference route supplies local weapon metadata and attempts live boss status/game constants if a key is available. Defaults/local references remain usable when those live reads fail, and the result must identify its constants source. Refreshing the status and choosing **Use shown HP** are explicit controls. The shown boss status is an observation with a timestamp; do not present it as guaranteed current HP. Acquisition plans can have incomplete pricing and supply, and must retain those flags.

### Booster calculator

Route: `/calculators/boosters`. Main files: [BoosterCalculator](src/components/calculators/BoosterCalculator.tsx), [boosters.ts](src/lib/boosters.ts), and [boosters API](src/app/api/calculators/boosters/route.ts).

Select an action and enter item counts by tier, or enter a target duration and time unit to estimate required counts. Duration arithmetic is local; acquisition prices come from selected booster/ingredient listing books. Tier/action mappings are defined in the domain module and validated by the API. Target-duration counts round up so the plan covers the requested time.

The API reuses valid 60-second listing caches and can avoid credential loading when all required books are cached. An explicit refresh bypasses those caches. Directly purchasable and craftable boosters have different acquisition inputs; mixed basket quotes must share market stock instead of reusing the same listing supply for multiple lines. Keep a lowest-ask estimate visually distinct from a fully filled cost, retain known subtotals/shortages, and do not prevent local duration calculations merely because live pricing is unavailable.

### Settings and diagnostics

Route: `/settings`. Main file: [SettingsWorkspace](src/components/settings/SettingsWorkspace.tsx). This page groups connection setup, appearance/number preferences, local-data controls, and diagnostics. Configure a BConomy key here when live features are needed; theme and display choices are optional and already have defaults. Backup import, history removal, and disconnect are different operations with different effects as described above.

The diagnostics panel reads the server database through `/api/connection` and exposes the following fields:

| Diagnostic | How to interpret it |
| --- | --- |
| Items and recipe lines | Counts in the current local catalog. These can be populated by the bundled seed before any connection. Recipe lines count ingredient relationships, not necessarily distinct craftable items. |
| Snapshots | Number of retained market snapshots, not the number of refresh-button clicks. Duplicate upstream timestamps do not add snapshots. |
| Plans and alerts | Current server-side saved records. These counts do not include browser Prestige profiles or tracker entries. |
| Last refresh / `lastSyncSuccess` | Local time of a successful catalog/market sync. It is distinct from a snapshot's upstream market timestamp. |
| Last error / `lastSyncError` | The most recently recorded connection/sync error, cleared after a successful sync. An unrelated player/calculator route failure does not necessarily update this field. |
| Catalog source / `catalogSource` | Whether the current catalog came from the bundled validated snapshot or the BConomy Data API. It is not a separate manual setting. |

Diagnostics may initialize the database if it has not opened yet. Checking them does not replace a live upstream authorization test. Use the connection badge/error plus the relevant feature's response to assess setup; do not edit diagnostic rows to make a failing installation appear connected.

### Appearance, number display, orb, and shortcuts

Routes: `/settings` and `/design-guide`, with global controls in the shell. Main files: [AppearanceProvider](src/components/appearance/AppearanceProvider.tsx), [themes.ts](src/lib/themes.ts), [orb-designs.ts](src/lib/orb-designs.ts), [NumberValue](src/components/ui/NumberValue.tsx), [AppShell](src/components/shell/AppShell.tsx), and [ShortcutProvider](src/components/shortcuts/ShortcutProvider.tsx).

Settings allows adaptive/system, light, or dark display mode; palette selection; one of the Liquid/Halo/Eclipse/Orbit designs; and compact, words, or exact number formatting. Orb motion can be paused/resumed from the shell. These are browser-local preferences and need no key. Adaptive mode follows system dark-mode changes; palette and light/dark mode are independent. Preserve CSS token-based theming, reduced-motion handling in the visuals, and exact-value access on shortened numbers.

Shortened numbers are rounded for display. Hover/focus/tap on the shared number display exposes the exact amount; calculation/export values remain exact. `Ctrl+Enter` invokes a registered calculation action, `Ctrl+Shift+S` invokes a registered save action, `Shift+R` refreshes the market when enabled, and `?` opens the shortcut guide. Navigation shortcuts are defined in the provider. Preserve typing-field checks, disabled states, keyboard access, and registration cleanup when changing shortcuts or page controls.

## Exact amounts and schemas

[quantity.ts](src/lib/quantity.ts) parses expressions with integer-backed rational arithmetic. Supported amount inputs include grouped whole numbers, decimals that evaluate to a whole result, scientific notation, named scales/suffixes such as `2.5m`, and arithmetic with parentheses. A final negative or fractional result is rejected, and zero is allowed only where the caller explicitly permits it. Not every calculator uses the expression parser; some accept only whole-number strings. Preserve each form's declared input contract.

Use `bigint` in domain arithmetic and decimal strings at JSON/storage boundaries. JSON cannot directly serialize `bigint`. `normalizeDecimalString()` rejects unsafe numeric values rather than guessing lost digits. Use the existing basis-point conventions for percentage calculations and the existing per-operation floor/ceiling rules. JavaScript `Number` is appropriate for bounded UI indices/levels and display percentages when already designed that way, but not for large exact balances, costs, or counts.

[server schemas](src/lib/server/schemas.ts), [plan-schema.ts](src/lib/plan-schema.ts), [input.ts](src/lib/input.ts), and the backup/tracker schemas enforce external boundaries. Retain timestamp normalization, supported-version checks, duplicate-ID checks, and relationships between saved input/result values. Do not turn a malformed upstream response into a valid-looking zero price or empty successful plan.

## Tests, builds, and isolation

| Command | What it verifies |
| --- | --- |
| `npm run typecheck` | TypeScript types without emitting application JavaScript. |
| `npm run lint` | Application code, E2E tests, scripts, and listed configuration files. |
| `npm test` | Vitest unit/integration tests and the audit regression test file included by the current config. |
| `npm run test:watch` | Interactive Vitest watch mode for development. |
| `npm run build` | A Next.js production build, including its compilation/type checks. |
| `npm run verify` | Typecheck, lint, unit/integration tests, then build, stopping on the first failure. |
| `npm run test:e2e` | Chromium browser workflows against an isolated local server. |

Tests use temporary databases and mock/dummy credentials. The DPAPI integration test can accept the specific unloaded-user-profile failure in an impersonated Windows environment; that passing test does not establish that a real DPAPI round trip worked there. Do not substitute a user's key to make a test pass.

The [E2E runner](scripts/run-e2e.mjs) chooses a free loopback port, supplies `ASCENDRY_DATA_DIR=test-results/e2e-data`, uses `.next-e2e`, runs Playwright, and stops its server tree afterward. Install Chromium with `npx playwright install chromium` when browser testing is needed and the browser is absent. A direct Playwright invocation requires an already running server at its configured base URL; it does not automatically inherit the runner's isolation setup.

On a fresh checkout, Next's generated type declarations and `next-env.d.ts` may not exist until development/build has run. Generate them through the normal Next.js workflow before diagnosing missing generated-type errors, rather than committing generated artifacts. Custom output runs can cause Next to adjust generated type imports and TypeScript include paths; inspect the diff afterward and retain only intentional configuration changes.

Choose verification according to the actual change. Documentation/ignore-rule edits need accurate references, valid examples, link/path checks, and diff checks. Application changes need the relevant tests plus typecheck/lint; changes affecting production behavior need a build; changed browser workflows need appropriate E2E coverage. Expand testing when new failures or unresolved risks justify it. Match evidence to the claim: a successful build does not prove a live key, network connection, or private browser profile was configured.

## Troubleshooting

| Symptom | What to check and how to recover |
| --- | --- |
| New checkout is disconnected | Expected. Start the application and connect the user's valid key through Settings. No default key is shipped. |
| Adding `BCONOMY_API_KEY` to an environment file changes nothing | This implementation does not read it. Use the supported connection route/UI and remove the unused secret from the file. |
| Key cannot be decrypted | Verify the server's Windows user, loaded profile, and active data directory. Reconnect through Settings under the intended account; do not dump the blob or switch to plaintext. |
| DPAPI reports a missing/unloaded user profile | Run the app in the intended user's ordinary Windows session, or configure the authorized service account's profile correctly. An impersonated test environment may lack DPAPI support. |
| BConomy rejects the key | Check the sanitized 401/403 authorization failure and have the user supply a valid replacement. Do not loop indefinitely or search for another person's key. |
| 429, timeout, or upstream service failure | The request wrapper already performs bounded retries where appropriate. Preserve last-good data and retry on a relevant user action. Do not reset local persistence. |
| Connection POST updates data but reports a local failure | The sync may have succeeded before DPAPI saving failed. Check status and the Windows/data-path conditions, then reconnect if authorized. |
| Write returns 403 or 415 | Use a loopback URL, matching Origin, and JSON content type for JSON requests. Keep request guards intact. |
| Key or plans seem to have vanished | Confirm `ASCENDRY_DATA_DIR`, working directory, and the running process's inherited settings before modifying files. A different directory selects different data. |
| Appearance/Prestige/tracker state seems missing | Check browser profile and exact scheme/hostname/port. Server backup import does not restore this browser storage. |
| Database is locked | Check for competing instances and outstanding transactions. Respect the WAL/lock behavior; stop only a process owned by the task or one the user authorized stopping. Avoid deleting WAL files. |
| Port already in use or Next dev lock exists | Inspect the existing listener/output directory. Reuse an appropriate server or choose a free local port and separate `.next-*` directory. Do not terminate unrelated servers. |
| Cost is absent or marked incomplete | Inspect missing prices, unfilled listings, manual overrides, and chosen price/recipe mode. Unknown supply/cost is a valid result, not zero cost. |
| Restricted tracker rejects a BcID | Verify the positive BcID and that the upstream profile is Ironman/Hardcore. A normal profile cannot use restricted planning. |
| Backup import fails | Check version and validation details, matching result/input structures, and snapshot references. Validate privately and preserve existing data after rejection. |
| Images fail while local pages work | Verify the allowed `cdn.jsdelivr.net` image host and network availability. Do not weaken image allowlists without a reason tied to the requested change. |
| Browser tests cannot launch Chromium | Install the required browser when authorized; report missing prerequisites rather than claiming that browser verification passed. |

## Source control and completion

The remote is `https://github.com/archivewebsite/ascendry.git`, with `main` as the repository branch. Inspect current status/remotes before publishing so unrelated user changes remain intact. Prior user authorization to publish the ongoing work remains valid; otherwise follow the user's requested scope. Use normal commits/pushes, preserve remote history, and resolve a rejected non-fast-forward push without silently force-pushing.

The root [.gitignore](.gitignore) and [data/.gitignore](data/.gitignore) exclude runtime data, DPAPI files and temporary blobs, SQLite files, environment files, backup exports, dependencies, Next/build output, incremental typecheck files, and generated test artifacts. `data/.gitignore` itself and `package-lock.json` are versioned. Example environment files, if added, must contain placeholders/non-secret paths only.

Before an authorized upload, inspect the staged paths and diff and check ignore coverage for new runtime locations. Do not print credential values as part of verification. Ignore rules do not untrack an already committed file. If a live key was committed, remove it from the uploaded content, arrange revocation/rotation, and address history under the appropriate authorization; do not assume encrypting it or deleting only its latest copy resolves exposure.

Report the changed files, settings actually configured, checks performed, and any remaining failures or missing prerequisite. When changing this guide, keep source paths, UI labels, command examples, and behavior explanations synchronized with the implementation. Preserve notices in [docs/licenses](docs/licenses), including [the Rare UI license](docs/licenses/rare-ui.txt). Historical [design notes](docs/superpowers) and [audit reports](docs/audits) provide context, but may describe a previous implementation and do not establish current successful verification.
