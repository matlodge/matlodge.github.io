# AGENTS.md

Quick-start context for a new coding session on Matlodge.

## Project summary

Matlodge is a static single-page web explorer for the optical properties of phase-change materials. Users choose a material and one or more samples, then compare refractive index `n`, extinction coefficient `k`, and their contrast values `Δn` and `Δk` for amorphous and crystalline phases.

There is no application backend and no HTTP API. The site ships a read-only SQLite database as a static asset and queries it in the browser with `sql.js` (SQLite-WASM).

The current user-facing documentation is [README.md](README.md) and the detailed code walkthrough is [doc/app_internals_description.md](doc/app_internals_description.md). Treat the code, tests and these documents as the source of truth.

## Quick start

```bash
npm install
npm run db:build
npm run dev
```

`npm run dev` and `npm run build` run `db:build` automatically via npm `predev` and `prebuild` hooks.

Useful commands:

```bash
npm run db:build      # data/ -> public/data/matlodge.sqlite
npm run dev           # Vite development server
npm run test:db       # Python parser/import tests
npm run build         # TypeScript check + Vite production build
npm run preview       # Preview dist/
```

The production site is written to `dist/`. Node 24 is used locally; Vite 7 requires Node 20.19+ or 22.12+. The data builder uses Python 3.12 and only the standard library.

## Current expected state

- Database: **27 samples**, **57 datasets**, **118,633 optical points**, about **4.2 MiB**.
- Materials with optical data: `Ge2Sb2Te5`, `RuSbTe`, `Sb2S3`, `Sb2Se3`.
- `Sb2S3_2` and `Sb2S3_14` are intentionally excluded because their thickness values are ambiguous.
- Metadata-only samples are not inserted because the domain model requires each sample to have datasets.
- The generated database is `public/data/matlodge.sqlite`. It is gitignored and must be regenerated, not hand-edited.
- The build report is `build/db-report.json`; it is also gitignored and is not served to the browser.
- The database build currently succeeds and `npm run test:db` runs 9 passing tests.

## Architecture

```text
data/pcms.csv + data/*.txt
        │
        ▼
scripts/build_database.py
        │
        ▼
public/data/matlodge.sqlite
        │
        ▼
React + TypeScript + Vite
        │
        └── sql.js reads the database in the browser
        │
        ▼
GitHub Pages
```

Key architectural rules:

- Keep the application static. Do not introduce a server, API, serverless functions, or a runtime database dependency without an explicit product decision.
- Keep the database same-origin. The browser fetches `data/matlodge.sqlite`; do not move it to a third-party origin.
- The browser opens the database read-only and loads the complete file into memory. At the current size this is intentional.
- Delta curves are derived in the browser from the amorphous and crystalline datasets; they are not stored in SQLite.
- The database is rebuilt from scratch on every `db:build`; there are no migrations.

## Repository map

| Path | Responsibility |
| --- | --- |
| [index.html](index.html) | HTML shell and `#root` element |
| [src/main.tsx](src/main.tsx) | Mounts React and imports global CSS |
| [src/App.tsx](src/App.tsx) | Owns application state, data loading, add/remove logic and page composition |
| [src/components/SampleSelector.tsx](src/components/SampleSelector.tsx) | Material/sample dropdowns and Add button |
| [src/components/SelectedSamples.tsx](src/components/SelectedSamples.tsx) | Selected-sample chips, colours and clear/remove actions |
| [src/components/OpticalPlotGrid.tsx](src/components/OpticalPlotGrid.tsx) | Builds Plotly traces and shared x-axis state |
| [src/components/PlotPanel.tsx](src/components/PlotPanel.tsx) | React wrapper around one Plotly chart |
| [src/components/SampleDetails.tsx](src/components/SampleDetails.tsx) | Source and sample-preparation metadata cards |
| [src/lib/sqlite.ts](src/lib/sqlite.ts) | SQLite-WASM initialization, queries and row-to-TypeScript mapping |
| [src/lib/delta.ts](src/lib/delta.ts) | Δn/Δk interpolation and calculation |
| [src/lib/units.ts](src/lib/units.ts) | X-axis nm ↔ eV conversion, axis titles and hover labels |
| [src/lib/formula.ts](src/lib/formula.ts) | Chemical-formula display formatting with Unicode subscript digits |
| [src/lib/colors.ts](src/lib/colors.ts) | MATLAB `increasing_color3` palette for the selected lines |
| [src/types.ts](src/types.ts) | Shared TypeScript types |
| [src/styles.css](src/styles.css) | Global styling and responsive plot grid |
| [scripts/build_database.py](scripts/build_database.py) | CSV/TSV -> SQLite import pipeline |
| [scripts/test_build_database.py](scripts/test_build_database.py) | Parser and current-data build tests |
| [data/](data/) | Raw metadata and TSV optical files |
| [doc/domain.puml](doc/domain.puml) | Domain model |
| [.github/workflows/deploy.yml](.github/workflows/deploy.yml) | GitHub Pages build/deploy workflow |
| [public/miciu-aei.jpg](public/miciu-aei.jpg) | Funding logos (MICIU + AEI) shown in the site footer |

## Frontend behavior

- The app is one screen; there is no router and no URL state persistence.
- Material and sample selection use native `<select>` controls, not searchable comboboxes.
- Each sample option is labelled with its id and the wavelength window shared by
  its amorphous and crystalline data (e.g. `Sb2S3_8 · 400–900 nm`), which is the
  domain used by the Δ plots. Samples without an overlap fall back to the single
  phase's range; disjoint ranges show the id only.
- A sample can be added only once; the selected-sample limit is 8.
- Material formulations are shown with Unicode subscript digits (`Ge₂Sb₂Te₅`)
  via `formatFormula`; native `<select>` options cannot hold `<sub>` markup, so
  stored ASCII values are converted only at display time.
- Samples can come from the same or different materials.
- Colours come from [src/lib/colors.ts](src/lib/colors.ts), a port of the MATLAB `increasing_color3(n)` helper: the palette is computed from the current number of selected samples, so every line is recoloured when a sample is added or removed. One colour per sample is reused across all four plots.
- Crystalline lines are solid; amorphous lines are dashed. The line-style key is
  shown in the n and k plot cards; the Δ cards carry only their title.
- Δ plots are one line per sample and use `Δ = crystalline − amorphous`, with a zero line.
- The x-axis is λ in nm by default and can be switched to photon energy E (eV)
  using the `nm` / `eV` control; either unit can be toggled between linear and
  logarithmic.
- X-axis zoom is shared across the four charts; each chart is a separate Plotly instance.
- The sample details cards show source DOI/title, extraction method, measurement method, fitting model, parameter availability, deposition method, thickness and capping layer.
- The footer carries the funding acknowledgment: "Proyecto PID2025-169188NA-I00
  financiado por" followed by `public/miciu-aei.jpg` (a downscaled derivative of
  the original MICIU/AEI logo; do not ship the full-resolution source).
- Additional crystalline or reamorphized datasets are stored and noted in the details card, but the plots use the canonical pair: base amorphous and base crystalline, falling back to `_cryst_1` when no base crystalline file exists.

## Data pipeline

The builder reads [data/pcms.csv](data/pcms.csv) and all `data/*.txt` files. The `.txt` files are tab-separated optical data with `lambda`, `n`, `k`; lambda is in nm.

Important current input quirks:

- Some files have a `lambda	 n	 k` header; most do not.
- Some files have a trailing fourth empty column.
- Some files have blank lines and one contains `NaN` values.
- Filenames include `_m_amorph`, `_m_cryst`, `_m_cryst_1`, `_m_cryst_2`, `_m_reamorph`, and the non-`_m` variant `RuSbTe_1_cryst.txt`.
- The parser ignores trailing empty columns, drops invalid rows, sorts by lambda, and deduplicates wavelengths.

Strict metadata policy:

- Single numeric thickness in nm is imported.
- Missing thickness becomes `NULL`.
- Thickness with two values, a range, µm, or non-nm units causes the metadata row and its optical datasets to be skipped.
- Current consequence: `Sb2S3_2` and `Sb2S3_14` are excluded; the build report lists them.
- `source_model_has_parameters` accepts `available` and the existing typo `avialable` as true.
- `capping_layer = none` produces no capping-layer row.
- Unparseable capping thickness keeps the sample and stores the capping material with a `NULL` thickness.
- Missing optional values are stored as `NULL`, not as text markers.

The schema is defined in [scripts/build_database.py](scripts/build_database.py) and follows [doc/domain.puml](doc/domain.puml). Main tables: `materials`, `sources`, `samples`, `capping_layers`, `refractive_index_datasets`, `optical_data_points`, reference vocabulary tables and `build_info`.

## Where to make common changes

- **Add/modify a plot**: [src/components/OpticalPlotGrid.tsx](src/components/OpticalPlotGrid.tsx) for traces and chart assignment; [src/components/PlotPanel.tsx](src/components/PlotPanel.tsx) for Plotly layout and interaction.
- **Change selection behavior**: [src/App.tsx](src/App.tsx), then [src/components/SampleSelector.tsx](src/components/SampleSelector.tsx) or [src/components/SelectedSamples.tsx](src/components/SelectedSamples.tsx).
- **Change database queries or add query helpers**: [src/lib/sqlite.ts](src/lib/sqlite.ts); update shared types in [src/types.ts](src/types.ts).
- **Change delta sign or interpolation**: [src/lib/delta.ts](src/lib/delta.ts); keep axis labels and tooltip text consistent.
- **Change metadata cards**: [src/components/SampleDetails.tsx](src/components/SampleDetails.tsx).
- **Change visual layout**: [src/styles.css](src/styles.css).
- **Change import rules, schema or sample counts**: [scripts/build_database.py](scripts/build_database.py), then update tests, [README.md](README.md), [doc/app_internals_description.md](doc/app_internals_description.md) and this file as needed.
- **Change deployment**: [vite.config.ts](vite.config.ts) and [.github/workflows/deploy.yml](.github/workflows/deploy.yml).

## Verification

Run before finishing a change:

```bash
npm run test:db
npm run build
```

The UI has been smoke-tested with headless Chromium at desktop and mobile sizes, including adding/removing samples and checking for horizontal overflow. There is currently no committed React unit, component or Playwright E2E test suite; do not assume those commands exist. If you add one, add the corresponding dependency, configuration, npm script and CI step.

External metadata validation, if available:

```bash
frictionless validate data/datapackage.json
csvwvalidate data/pcms.csv-metadata.json
```

## Gotchas

- Do not assume older design notes match the current code. Verify behavior against the source, tests and current documentation.
- `src/components/PlotPanel.tsx` intentionally uses a direct Plotly DOM API because Plotly is not a React library. Preserve its resize, relayout and cleanup behavior.
- The Plotly bundle is large and is split into a separate Vite chunk. Do not import another full Plotly build unless necessary.
- `vite.config.ts` uses `base: "./"` and DB/WASM paths rely on relative resolution. Keep relative paths when changing deployment.
- `public/data/matlodge.sqlite` is ignored by Git. A missing database is fixed with `npm run db:build`, not by editing JSON or checking in a binary by accident.
- The app intentionally uses native selectors because the sample count is small. If you add search, preserve keyboard accessibility and the existing controlled-component data flow.
- No React state library, router, Tailwind or CSS Modules are used. Styling is one global stylesheet.
- The application is deployed through GitHub Actions to GitHub Pages. The repository is the organization site `matlodge/matlodge.github.io`, served at `https://matlodge.github.io/`; Pages must use **GitHub Actions** as its source.
