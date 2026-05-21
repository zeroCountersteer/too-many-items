# zeroCountersteer Inventory

Static, GitHub-backed electronics inventory for parts, storage locations, and project BOM planning.

The app runs entirely in the browser. The canonical inventory data is the committed SQLite file at `data/inventory.db`; JSON is available only as a snapshot import/export format.

## Workflows

- **Inventory:** add or edit parts, stock rows, package/footprint data, manufacturer/MPN, notes, and category-specific specs.
- **Bulk add:** enter spreadsheet-style rows, clone row patterns, generate E-series resistor sets, preview rows, then merge or import into the SQLite inventory.
- **Locations:** model rooms, worksites, cabinets, drawers, bins, boxes, shelves, and LED-aware storage nodes with hierarchy, capacity, coordinates, color, and highlight target metadata.
- **Projects / BOM:** paste a KiCad default BOM CSV to create a stored project, auto-match rows against known parts, manually edit/unlink/delete rows, reserve available stock, release reservations, or consume reserved stock.
- **Stats / DB:** inspect stock totals, category distribution, storage occupancy, project counts, validation health, and local database state.
- **Settings / Sync:** set GitHub owner/repo/branch/path and a session-only fine-grained token with Contents read/write permission, then load or commit `inventory.db`.

## Data Model

The SQLite schema lives in `schemas/inventory.sql` and is embedded in `js/00-config.js` for browser-side database export. The JSON snapshot schema lives in `schemas/inventory.schema.json`.

Core tables:

- `categories`, `parts`, `stock`, component spec tables, and free-form `attributes`
- hierarchical `locations` with optional storage/LED metadata
- `projects`, `project_bom`, `part_aliases`, `project_reservations`, and `activity_log`

## Local QA

Install dev tooling once:

```sh
npm install
```

Run static checks:

```sh
npm run check
```

Run the app locally:

```sh
npm run serve
```

Run browser smoke tests:

```sh
npm run test:smoke
```

## Deployment

This repo is deployable as static files, including GitHub Pages. Keep `data/inventory.db`, `index.html`, `style.css`, `sw.js`, `js/`, `schemas/`, and `themes/` committed. After app code changes, bump the script query string and service-worker cache version together.
