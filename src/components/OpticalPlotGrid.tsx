import { useEffect, useMemo, useState } from "react";
import type { Data } from "plotly.js";
import type { DatasetWithCurve, SelectedSample } from "../types";
import { PlotPanel } from "./PlotPanel";

interface OpticalPlotGridProps {
  selected: SelectedSample[];
  logX: boolean;
}

type CurveKey = "n" | "k";

function lineTrace(
  sample: SelectedSample,
  dataset: DatasetWithCurve,
  key: CurveKey,
  dash: "solid" | "dash",
  label: string,
): Data {
  const curve = dataset.curve;
  return {
    x: curve.lambda,
    y: curve[key],
    type: "scattergl",
    mode: "lines",
    name: `${sample.summary.id} · ${label}`,
    line: {
      color: sample.color,
      width: dash === "dash" ? 1.45 : 1.8,
      dash,
    },
    connectgaps: false,
    hovertemplate:
      `<b>${sample.summary.id}</b><br>` +
      `${label} · λ %{x:.2f} nm<br>` +
      `${key}: %{y:.4f}<extra></extra>`,
  };
}

function deltaTrace(sample: SelectedSample): Data | null {
  if (!sample.bundle.delta) return null;
  const delta = sample.bundle.delta;
  return {
    x: delta.lambda,
    y: delta.n,
    type: "scattergl",
    mode: "lines",
    name: `${sample.summary.id} · Δn`,
    line: { color: sample.color, width: 2.1, dash: "solid" },
    connectgaps: false,
    hovertemplate:
      `<b>${sample.summary.id}</b><br>` +
      `Δn · λ %{x:.2f} nm<br>` +
      `Δn: %{y:.4f}<extra></extra>`,
  };
}

function deltaTraceK(sample: SelectedSample): Data | null {
  if (!sample.bundle.delta) return null;
  const delta = sample.bundle.delta;
  return {
    x: delta.lambda,
    y: delta.k,
    type: "scattergl",
    mode: "lines",
    name: `${sample.summary.id} · Δk`,
    line: { color: sample.color, width: 2.1, dash: "solid" },
    connectgaps: false,
    hovertemplate:
      `<b>${sample.summary.id}</b><br>` +
      `Δk · λ %{x:.2f} nm<br>` +
      `Δk: %{y:.4f}<extra></extra>`,
  };
}

function tracesForPhase(
  selected: SelectedSample[],
  key: CurveKey,
): Data[] {
  const traces: Data[] = [];
  for (const sample of selected) {
    const { amorphous, crystalline } = sample.bundle;
    if (amorphous) {
      traces.push(lineTrace(sample, amorphous, key, "dash", "amorphous"));
    }
    if (crystalline) {
      traces.push(lineTrace(sample, crystalline, key, "solid", "crystalline"));
    }
  }
  return traces;
}

export function OpticalPlotGrid({ selected, logX }: OpticalPlotGridProps) {
  const [xRange, setXRange] = useState<[number, number] | null>(null);

  useEffect(() => {
    setXRange(null);
  }, [logX]);

  const nTraces = useMemo(() => tracesForPhase(selected, "n"), [selected]);
  const kTraces = useMemo(() => tracesForPhase(selected, "k"), [selected]);
  const deltaNTraces = useMemo(
    () =>
      selected
        .map(deltaTrace)
        .filter((trace): trace is Data => trace !== null),
    [selected],
  );
  const deltaKTraces = useMemo(
    () =>
      selected
        .map(deltaTraceK)
        .filter((trace): trace is Data => trace !== null),
    [selected],
  );
  const hasDelta = selected.some((sample) => sample.bundle.delta !== null);

  return (
    <div className="plot-grid">
      <PlotPanel
        title="Refractive index n"
        yTitle="n"
        traces={nTraces}
        logX={logX}
        xRange={xRange}
        onRangeChange={setXRange}
        emptyMessage="No n data for the selected samples"
      />
      <PlotPanel
        title="Extinction coefficient k"
        yTitle="k"
        traces={kTraces}
        logX={logX}
        xRange={xRange}
        onRangeChange={setXRange}
        emptyMessage="No k data for the selected samples"
      />
      <PlotPanel
        title="Refractive-index contrast Δn"
        yTitle="Δn (cryst − amor)"
        traces={deltaNTraces}
        logX={logX}
        showZeroLine
        xRange={xRange}
        onRangeChange={setXRange}
        emptyMessage={
          hasDelta
            ? undefined
            : "No overlapping amorphous / crystalline data"
        }
      />
      <PlotPanel
        title="Extinction-coefficient contrast Δk"
        yTitle="Δk (cryst − amor)"
        traces={deltaKTraces}
        logX={logX}
        showZeroLine
        xRange={xRange}
        onRangeChange={setXRange}
        emptyMessage={
          hasDelta
            ? undefined
            : "No overlapping amorphous / crystalline data"
        }
      />
    </div>
  );
}
