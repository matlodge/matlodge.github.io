# Matlodge application internals

This document describes how the Matlodge web explorer is built and how its files fit together. It is written for someone who knows HTML, CSS and JavaScript but is new to React and TypeScript.

## Architecture at a glance

Matlodge is a static single-page application. The browser loads HTML, JavaScript, CSS and a SQLite database from the same static site; there is no application backend and no HTTP API. React renders the interface, and SQLite-WASM (the `sql.js` library) reads the database inside the browser. Vite compiles the source and copies the deployable files into `dist/`. User-facing build instructions are in [README.md](../README.md).

The HTML entry point is [index.html](../index.html), which contains only a `<div id="root">` element. The browser bundle is created from [src/main.tsx](../src/main.tsx).

## React and TypeScript in this codebase

React is used as a component-based rendering library. A component is a function that returns JSX, which is an HTML-like syntax embedded in TypeScript. JSX is compiled into JavaScript function calls; it is not a separate template language. Components receive inputs through props and can remember values through hooks.

The important React concepts in this app are:

- **Components** are reusable functions that return UI. Examples are [SampleSelector](../src/components/SampleSelector.tsx), [SelectedSamples](../src/components/SelectedSamples.tsx) and [SampleDetails](../src/components/SampleDetails.tsx).
- **Props** are component inputs. For example, [OpticalPlotGrid](../src/components/OpticalPlotGrid.tsx) receives the selected samples and the log-axis flag as props from [App](../src/App.tsx).
- **State** is data React remembers between renders. Changing state causes React to re-run the affected component and update the page. The selected samples, material, sample, loading flags, error message and log-axis setting live in [App](../src/App.tsx).
- **`useEffect`** runs side effects after rendering. [App](../src/App.tsx) uses it to load the database and to refresh the sample list when the material changes. [PlotPanel](../src/components/PlotPanel.tsx) uses it to initialize and update Plotly.
- **`useMemo`** caches derived values. [OpticalPlotGrid](../src/components/OpticalPlotGrid.tsx) uses it to avoid rebuilding trace arrays on every render, and [PlotPanel](../src/components/PlotPanel.tsx) uses it to build the Plotly layout.
- **`useCallback`** keeps event-handler functions stable. [App](../src/App.tsx) uses it for adding and removing samples.
- **Controlled forms** are forms whose values come from state. The dropdowns in [SampleSelector](../src/components/SampleSelector.tsx) receive their current value through props and report changes through callback props.
- **`ref`** gives a component direct access to a DOM element. [PlotPanel](../src/components/PlotPanel.tsx) uses a ref because Plotly manages its own canvas/SVG DOM and is not a native React library.

TypeScript adds compile-time types on top of JavaScript. The types do not exist at runtime; they are checked during `npm run build` and then erased. Shared data shapes are defined in [src/types.ts](../src/types.ts), including `SampleSummary`, `DatasetSummary`, `Curve`, `SampleBundle` and `SelectedSample`. A function such as `fetchSampleBundle` in [src/lib/sqlite.ts](../src/lib/sqlite.ts) declares that it returns `Promise<SampleBundle>`, so the compiler can catch mismatches before the app runs.

There are three TypeScript declaration files. [src/vite-env.d.ts](../src/vite-env.d.ts) adds Vite's `import.meta.env` types, [src/plotly.d.ts](../src/plotly.d.ts) declares the untyped `plotly.js-dist-min` package, and [tsconfig.json](../tsconfig.json) configures TypeScript itself.

## Component tree

[src/main.tsx](../src/main.tsx) mounts the application into `#root` and wraps it in React's `StrictMode`. The component tree is:

```text
App
├── SampleSelector
├── SelectedSamples
├── OpticalPlotGrid
│   ├── PlotPanel  (n)
│   ├── PlotPanel  (k)
│   ├── PlotPanel  (Δn)
│   └── PlotPanel  (Δk)
├── SampleDetails
└── inline empty-state, notice and loading UI
```

[App](../src/App.tsx) is the owner of the application state and the only component that talks to the data layer. The other components are mostly presentational and receive data or callbacks through props. This is a deliberate one-directional data flow: state moves down as props, and events move up as callbacks.

## What each file does

### Application entry and composition

[index.html](../index.html) is the HTML shell. It declares the page metadata, favicon, `#root` element and module script that loads the application from [src/main.tsx](../src/main.tsx). The `<div id="root"></div>` is the only element React needs.

[src/main.tsx](../src/main.tsx) creates the React root with `createRoot`, imports the global stylesheet [src/styles.css](../src/styles.css), and renders `<App />` inside `<StrictMode>`.

[src/App.tsx](../src/App.tsx) is the main container. It owns the database initialization status, materials list, total sample count, selected material, sample list, selected sample ID, selected-sample array, notice/error state, log-axis state and x-axis unit state. It also defines the add/remove/clear logic and composes the page sections.

### Components

[src/components/SampleSelector.tsx](../src/components/SampleSelector.tsx) renders the material dropdown, the sample dropdown, the Add sample button and the currently selected source title. Each sample option is labelled with the id plus the amorphous/crystalline wavelength overlap from `SampleSummary`, so the extra text appears both in the list and in the closed control. It is a controlled component: values come from props, and changes call `onMaterialChange`, `onSampleChange` and `onAdd`.

[src/components/SelectedSamples.tsx](../src/components/SelectedSamples.tsx) renders the selected-sample chips, colour dots, remove buttons and Clear all action. It is a display component that reports removals and clearing through callbacks.

[src/components/OpticalPlotGrid.tsx](../src/components/OpticalPlotGrid.tsx) converts each selected sample into Plotly traces. It creates amorphous dashed traces and crystalline solid traces for n and k, and one Δn/Δk trace per sample. It maps the stored wavelength arrays onto the active x-axis unit (nm or eV), builds matching hover labels, and owns the shared x-axis range state so zooming one chart updates the other three. The range resets when the unit or log scale changes.

[src/components/PlotPanel.tsx](../src/components/PlotPanel.tsx) is the React wrapper around Plotly. Each card is a `.plot-card` with an HTML header (title `h3` plus an optional crystalline/amorphous line key) above the Plotly div, so charts cannot cover the key. It creates the Plotly layout, calls `Plotly.react` when traces or layout change, listens for `plotly_relayout` to keep x-axis ranges synchronized, handles resize events, and purges the chart on unmount. This is the main interoperability layer between React and a non-React DOM library.

[src/components/SampleDetails.tsx](../src/components/SampleDetails.tsx) renders the metadata cards for selected samples: source title, DOI link, extraction method, measurement method, fitting model, fitting-parameter availability, deposition method, thickness and capping layer. It also lists additional datasets that exist for a sample but are not plotted as the canonical phase pair.

### Data access and derived calculations

[src/lib/sqlite.ts](../src/lib/sqlite.ts) is the browser-side database layer. It initializes `sql.js` with the local WASM binary, fetches `data/matlodge.sqlite` with `fetch`, opens it read-only in memory, and exposes typed query functions: `fetchMaterials`, `fetchSampleCount`, `fetchSamples` and `fetchSampleBundle`. The database promise is cached so the file is downloaded only once per page session.

[src/lib/delta.ts](../src/lib/delta.ts) contains the pure delta calculation. Given an amorphous curve and a crystalline curve, it finds the overlapping wavelength range, chooses the denser measured grid, interpolates the other curve onto that grid, and calculates `Δn = n_crystalline − n_amorphous` and `Δk = k_crystalline − k_amorphous`. It does not extrapolate beyond measured ranges.

[src/lib/colors.ts](../src/lib/colors.ts) defines the eight-colour sample palette and `nextColor`, which picks the first unused palette colour when a sample is added.

[src/lib/units.ts](../src/lib/units.ts) holds the x-axis unit type (`"nm" | "eV"`), the `hc` constant used to convert wavelength to photon energy (`E = 1239.84 / λ`), and the axis titles and hover-label fragments for both units. It also provides `commonRange`, which intersects the amorphous and crystalline wavelength bounds, and `formatLambdaRange`, which renders a range for the sample dropdown.

[src/types.ts](../src/types.ts) defines the shared TypeScript contracts for materials, samples, datasets, curves, metadata and selected samples.

### Styling

[src/styles.css](../src/styles.css) is the single global stylesheet. It defines CSS variables, the page background, the dark header, cards, selector controls, chips, plot layout, metadata cards, loading/error screens and responsive breakpoints. The 2 × 2 plot matrix is implemented with CSS Grid in the `.plot-grid` rule; the mobile breakpoint collapses it to one column.

## Runtime flow

1. The browser loads [index.html](../index.html), then [src/main.tsx](../src/main.tsx).
2. [App](../src/App.tsx) mounts and uses `useEffect` to call `fetchMaterials` and `fetchSampleCount` from [src/lib/sqlite.ts](../src/lib/sqlite.ts).
3. `sql.js` loads the WASM binary and the browser downloads `public/data/matlodge.sqlite` through `fetch`. The database is generated by [scripts/build_database.py](../scripts/build_database.py) and is not committed to the repository.
4. The material dropdown is populated from the database.
5. When a material is selected, [App](../src/App.tsx) calls `fetchSamples` and fills the sample dropdown.
6. Clicking Add calls `fetchSampleBundle`, which queries the sample metadata, its datasets, and the optical points for the canonical amorphous and crystalline datasets.
7. `fetchSampleBundle` uses [src/lib/delta.ts](../src/lib/delta.ts) to compute the delta curves and returns a `SampleBundle`.
8. [App](../src/App.tsx) appends the bundle to the selected array with a colour from [src/lib/colors.ts](../src/lib/colors.ts).
9. React re-renders. [SelectedSamples](../src/components/SelectedSamples.tsx) renders the chips, [OpticalPlotGrid](../src/components/OpticalPlotGrid.tsx) rebuilds traces and [SampleDetails](../src/components/SampleDetails.tsx) renders the metadata cards.
10. Each [PlotPanel](../src/components/PlotPanel.tsx) updates its Plotly chart.

## Database and data pipeline

The database is generated from the raw files by [scripts/build_database.py](../scripts/build_database.py). It reads [data/pcms.csv](../data/pcms.csv) and the TSV files under [data/](../data/), applies the import policy, and writes `public/data/matlodge.sqlite` plus `build/db-report.json`.

The schema follows [doc/domain.puml](domain.puml) and contains tables for materials, sources, samples, capping layers, refractive-index datasets, optical data points, phases, extraction methods, measurement methods, fitting models, deposition methods and build information. The current strict import excludes metadata rows with ambiguous thickness values; the generated database currently contains 27 samples, 57 datasets and 118,633 data points.

The database builder is tested by [scripts/test_build_database.py](../scripts/test_build_database.py). It is not part of the browser bundle; it runs in development, CI or the static-host build step.

## Build and deployment

[package.json](../package.json) defines the npm commands. `npm run db:build` runs the Python database builder, `npm run dev` starts Vite, `npm run test:db` runs the Python tests, and `npm run build` validates TypeScript and creates the static site in `dist/`. The `predev` and `prebuild` hooks regenerate the database automatically.

[vite.config.ts](../vite.config.ts) configures Vite with relative asset paths, React support and separate chunks for Plotly and SQLite. Relative paths let the same build work at a site root or under a GitHub Pages repository subpath.

The GitHub Pages deployment workflow is [.github/workflows/deploy.yml](../.github/workflows/deploy.yml). It builds the database, runs the tests, builds the frontend and publishes `dist/` to the organization site `matlodge/matlodge.github.io` at `https://matlodge.github.io/`.

## Suggested reading order

For someone learning React and TypeScript in this project, read the files in this order:

1. [index.html](../index.html) and [src/main.tsx](../src/main.tsx) to see how React starts.
2. [src/App.tsx](../src/App.tsx) to understand state ownership and data flow.
3. [src/components/SampleSelector.tsx](../src/components/SampleSelector.tsx) and [src/components/SelectedSamples.tsx](../src/components/SelectedSamples.tsx) for basic props and events.
4. [src/components/OpticalPlotGrid.tsx](../src/components/OpticalPlotGrid.tsx) and [src/components/PlotPanel.tsx](../src/components/PlotPanel.tsx) for derived data and third-party DOM integration.
5. [src/components/SampleDetails.tsx](../src/components/SampleDetails.tsx) for presentational components.
6. [src/lib/sqlite.ts](../src/lib/sqlite.ts) and [src/lib/delta.ts](../src/lib/delta.ts) for the non-React data layer.
7. [scripts/build_database.py](../scripts/build_database.py) for how the data reaches the browser.
8. [src/styles.css](../src/styles.css) for the visual layout.
