# Matlodge

Matlodge is a static web explorer for the optical properties of phase-change materials. Select a material and one or more samples to compare refractive index `n` and extinction coefficient `k` for amorphous and crystalline phases, plus their contrast values `Δn` and `Δk`.

The site has no application backend. The data is compiled into a SQLite database and loaded in the browser with SQLite-WASM (`sql.js`).

## Quick start

```bash
npm install
npm run db:build
npm run dev
```

`npm run dev` and `npm run build` also run `db:build` automatically.

Open the Vite URL shown in the terminal, then:

1. choose a material;
2. choose a sample;
3. click **Add sample**.

The default comparison is `Δ = crystalline − amorphous`.

## Production build

```bash
npm run build
npm run preview
```

The deployable static site is written to `dist/`. It contains:

- the React application;
- `dist/data/matlodge.sqlite`;
- the SQLite-WASM binary.

## Data pipeline

`scripts/build_database.py` reads:

- `data/pcms.csv` for sample, source and preparation metadata;
- `data/*.txt` for TSV optical data (`lambda`, `n`, `k`; lambda in nm).

It writes:

- `public/data/matlodge.sqlite` — the runtime database;
- `build/db-report.json` — import counts, skipped rows, warnings and parsed-file statistics.

Every metadata row is imported. A thickness that is a single value in nm is stored numerically; ambiguous values (`100 nm and 1 µm`, `600-750 nm`, atomic-layer films) keep their original text in `pcm_thickness_text` / `capping_layers.thickness_text`, so neither the sample nor its optical data is lost. With the current data that gives **80 samples** and **163 datasets**. Missing optional values are stored as `NULL`.

Run the database checks with:

```bash
npm run test:db
```

## Database schema

The schema follows `doc/domain.puml`:

- `materials`, `sources`, `samples`
- `capping_layers`
- `refractive_index_datasets` (phase, extraction method, measurement method, fitting model, fitting-parameter availability, variant, source file)
- `optical_data_points` (`dataset_id`, `lambda_nm`, `n`, `k`)
- reference tables for phases, extraction methods, measurement methods, fitting models and deposition methods
- `build_info` for schema version and build metadata

The browser opens the SQLite file read-only and computes Δ curves locally from the selected amorphous and crystalline datasets. No SQL endpoint or server-side database exists.

## Deployment

The repository is the GitHub Pages organization site `matlodge/matlodge.github.io`, published at `https://matlodge.github.io/`.

A workflow is included at `.github/workflows/deploy.yml`. Enable GitHub Pages and set the source to **GitHub Actions** in the repository settings. The workflow builds the database, runs the tests/build, and publishes `dist/`.

The Vite config uses relative asset paths, so the same build works at the organization site root and under a project subpath.

## Project layout

```text
data/                     raw metadata and TSV files
scripts/build_database.py metadata + TSV -> SQLite
scripts/test_build_database.py
public/                   static assets copied into the build
src/                      React application
  lib/sqlite.ts           SQLite-WASM initialization and queries
  lib/delta.ts            Δn / Δk interpolation
  components/             selector, plot grid and details
doc/domain.puml            domain model
```
