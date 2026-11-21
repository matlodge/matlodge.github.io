import { useCallback, useEffect, useMemo, useState } from "react";
import { OpticalPlotGrid } from "./components/OpticalPlotGrid";
import { SampleDetails } from "./components/SampleDetails";
import { SampleSelector } from "./components/SampleSelector";
import { SelectedSamples } from "./components/SelectedSamples";
import { fetchMaterials, fetchSampleBundle, fetchSampleCount, fetchSamples } from "./lib/sqlite";
import { nextColor } from "./lib/colors";
import type { MaterialSummary, SampleSummary, SelectedSample } from "./types";

const MAX_SAMPLES = 8;
const LOGO_URL = `${import.meta.env.BASE_URL}favicon.svg`;

type AppStatus = "loading" | "ready" | "error";

export default function App() {
  const [status, setStatus] = useState<AppStatus>("loading");
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [materials, setMaterials] = useState<MaterialSummary[]>([]);
  const [totalSamples, setTotalSamples] = useState(0);
  const [materialId, setMaterialId] = useState<number | null>(null);
  const [samples, setSamples] = useState<SampleSummary[]>([]);
  const [samplesLoading, setSamplesLoading] = useState(false);
  const [sampleId, setSampleId] = useState("");

  const [selected, setSelected] = useState<SelectedSample[]>([]);
  const [adding, setAdding] = useState(false);
  const [logX, setLogX] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [materialList, sampleCount] = await Promise.all([
          fetchMaterials(),
          fetchSampleCount(),
        ]);
        if (cancelled) return;
        setMaterials(materialList);
        setTotalSamples(sampleCount);
        setMaterialId((current) => current ?? materialList[0]?.id ?? null);
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        setFatalError(
          error instanceof Error ? error.message : "Could not initialise the database.",
        );
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (materialId === null) return;
    let cancelled = false;
    setSamplesLoading(true);
    fetchSamples(materialId)
      .then((sampleList) => {
        if (cancelled) return;
        setSamples(sampleList);
        setSampleId(sampleList[0]?.id ?? "");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setNotice(
          error instanceof Error ? error.message : "Could not load the sample list.",
        );
      })
      .finally(() => {
        if (!cancelled) setSamplesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [materialId]);

  const selectedIds = useMemo(
    () => new Set(selected.map((item) => item.summary.id)),
    [selected],
  );
  const canAdd =
    Boolean(sampleId) &&
    !selectedIds.has(sampleId) &&
    selected.length < MAX_SAMPLES &&
    !samplesLoading &&
    !adding;

  const handleAdd = useCallback(async () => {
    const summary = samples.find((sample) => sample.id === sampleId);
    if (!summary || selectedIds.has(summary.id) || selected.length >= MAX_SAMPLES) {
      return;
    }
    setAdding(true);
    setNotice(null);
    try {
      const bundle = await fetchSampleBundle(summary.id);
      setSelected((current) => {
        if (current.some((item) => item.summary.id === summary.id)) return current;
        if (current.length >= MAX_SAMPLES) return current;
        return [
          ...current,
          {
            summary,
            bundle,
            color: nextColor(current.map((item) => item.color)),
          },
        ];
      });
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not load this sample.",
      );
    } finally {
      setAdding(false);
    }
  }, [selected.length, selectedIds, sampleId, samples]);

  const removeSample = useCallback((id: string) => {
    setSelected((current) =>
      current.filter((sample) => sample.summary.id !== id),
    );
  }, []);

  if (status === "loading") {
    return (
      <div className="loading-screen">
        <img
          className="brand-mark"
          src={LOGO_URL}
          alt=""
          aria-hidden="true"
        />
        <p>Loading the Matlodge database…</p>
        <span>The SQLite file is being opened locally in your browser.</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="loading-screen error-screen">
        <div className="loading-mark">!</div>
        <h1>Matlodge could not start</h1>
        <p>{fatalError}</p>
        <span>
          If you are running the project locally, run <code>npm run db:build</code>{" "}
          first.
        </span>
      </div>
    );
  }

  const materialName =
    materials.find((material) => material.id === materialId)?.formulation ?? "";
  const sampleCountForMaterial = samples.length;

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="brand">
          <img
            className="brand-mark"
            src={LOGO_URL}
            alt=""
            aria-hidden="true"
          />
          <div>
            <p className="brand-kicker">Optical materials database</p>
            <h1>Matlodge</h1>
            <p className="brand-subtitle">
              Refractive-index explorer for phase-change materials
            </p>
          </div>
        </div>
        <div className="header-stats" aria-label="Database summary">
          <div>
            <strong>{materials.length}</strong>
            <span>materials</span>
          </div>
          <div>
            <strong>{totalSamples}</strong>
            <span>samples with data</span>
          </div>
          <div>
            <strong>SQLite</strong>
            <span>loaded locally</span>
          </div>
        </div>
      </header>

      <main>
        <SampleSelector
          materials={materials}
          samples={samples}
          materialId={materialId}
          sampleId={sampleId}
          samplesLoading={samplesLoading}
          adding={adding}
          canAdd={canAdd}
          onMaterialChange={(id) => {
            setMaterialId(id);
            setSampleId("");
          }}
          onSampleChange={setSampleId}
          onAdd={handleAdd}
        />

        {notice && (
          <div className="notice" role="alert">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        <SelectedSamples
          selected={selected}
          maxSamples={MAX_SAMPLES}
          onRemove={removeSample}
          onClear={() => setSelected([])}
        />

        <section className="explorer-section" aria-labelledby="explorer-heading">
          <div className="section-heading explorer-heading">
            <div>
              <p className="eyebrow">Phase response</p>
              <h2 id="explorer-heading">Optical properties</h2>
              {materialName && selected.length > 0 && (
                <p className="section-note">
                  Comparing {selected.length} sample
                  {selected.length === 1 ? "" : "s"} across the database
                  {sampleCountForMaterial > 0
                    ? ` · ${sampleCountForMaterial} ${materialName} samples available`
                    : ""}
                </p>
              )}
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={logX}
                onChange={(event) => setLogX(event.target.checked)}
              />
              <span className="toggle-track" aria-hidden="true" />
              Log λ axis
            </label>
          </div>

          {selected.length === 0 ? (
            <div className="empty-state">
              <div className="empty-art" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
              <div>
                <h3>Select a sample to begin</h3>
                <p>
                  Choose a material and sample above, then add it. A comparison
                  will appear as four linked plots: n, k, Δn and Δk.
                </p>
                <p className="empty-hint">
                  Solid lines show crystalline data; dashed lines show amorphous
                  data. Add more samples to overlay additional colours.
                </p>
              </div>
            </div>
          ) : (
            <OpticalPlotGrid selected={selected} logX={logX} />
          )}
        </section>

        <SampleDetails selected={selected} />
      </main>

      <footer className="site-footer">
        <p>
          Matlodge · phase-change material optical properties. Source databases
          are cited in each sample card.
        </p>
        <p>
          Data is served as a same-origin SQLite file and queried locally with
          SQLite-WASM.
        </p>
      </footer>
    </div>
  );
}
