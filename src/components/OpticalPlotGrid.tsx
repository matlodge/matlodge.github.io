import { useEffect, useMemo, useState } from "react";
import type { Data } from "plotly.js";
import type { DatasetWithCurve, SelectedSample } from "../types";
import { X_UNIT_HOVER, toXValues, type XUnit } from "../lib/units";
import { PlotPanel } from "./PlotPanel";

interface OpticalPlotGridProps {
  selected: SelectedSample[];
  logX: boolean;
  xUnit: XUnit;
}

type CurveKey = "n" | "k";

function lineTrace(
  sample: SelectedSample,
  dataset: DatasetWithCurve,
  key: CurveKey,
  dash: "solid" | "dash",
  label: string,
  xUnit: XUnit,
): Data {
  const curve = dataset.curve;
  return {
    x: toXValues(curve.lambda, xUnit),
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
      `${label} · ${X_UNIT_HOVER[xUnit]}<br>` +
      `${key}: %{y:.4f}<extra></extra>`,
  };
}

function deltaTrace(sample: SelectedSample, xUnit: XUnit): Data | null {
  if (!sample.bundle.delta) return null;
  const delta = sample.bundle.delta;
  return {
    x: toXValues(delta.lambda, xUnit),
    y: delta.n,
    type: "scattergl",
    mode: "lines",
    name: `${sample.summary.id} · Δn`,
    line: { color: sample.color, width: 2.1, dash: "solid" },
    connectgaps: false,
    hovertemplate:
      `<b>${sample.summary.id}</b><br>` +
      `Δn · ${X_UNIT_HOVER[xUnit]}<br>` +
      `Δn: %{y:.4f}<extra></extra>`,
  };
}

function deltaTraceK(sample: SelectedSample, xUnit: XUnit): Data | null {
  if (!sample.bundle.delta) return null;
  const delta = sample.bundle.delta;
  return {
    x: toXValues(delta.lambda, xUnit),
    y: delta.k,
    type: "scattergl",
    mode: "lines",
    name: `${sample.summary.id} · Δk`,
    line: { color: sample.color, width: 2.1, dash: "solid" },
    connectgaps: false,
    hovertemplate:
      `<b>${sample.summary.id}</b><br>` +
      `Δk · ${X_UNIT_HOVER[xUnit]}<br>` +
      `Δk: %{y:.4f}<extra></extra>`,
  };
}

function tracesForPhase(
  selected: SelectedSample[],
  key: CurveKey,
  xUnit: XUnit,
): Data[] {
  const traces: Data[] = [];
  for (const sample of selected) {
    const { amorphous, crystalline } = sample.bundle;
    if (amorphous) {
      traces.push(
        lineTrace(sample, amorphous, key, "dash", "amorphous", xUnit),
      );
    }
    if (crystalline) {
      traces.push(
        lineTrace(sample, crystalline, key, "solid", "crystalline", xUnit),
      );
    }
  }
  return traces;
}

export function OpticalPlotGrid({
  selected,
  logX,
  xUnit,
}: OpticalPlotGridProps) {
  const [xRange, setXRange] = useState<[number, number] | null>(null);

  useEffect(() => {
    setXRange(null);
  }, [logX, xUnit]);

  const nTraces = useMemo(
    () => tracesForPhase(selected, "n", xUnit),
    [selected, xUnit],
  );
  const kTraces = useMemo(
    () => tracesForPhase(selected, "k", xUnit),
    [selected, xUnit],
  );
  const deltaNTraces = useMemo(
    () =>
      selected
        .map((sample) => deltaTrace(sample, xUnit))
        .filter((trace): trace is Data => trace !== null),
    [selected, xUnit],
  );
  const deltaKTraces = useMemo(
    () =>
      selected
        .map((sample) => deltaTraceK(sample, xUnit))
        .filter((trace): trace is Data => trace !== null),
    [selected, xUnit],
  );
  const hasDelta = selected.some((sample) => sample.bundle.delta !== null);

  return (
    <div className="plot-grid">
      <PlotPanel
        title="Refractive index n"
        yTitle="n"
        traces={nTraces}
        logX={logX}
        xUnit={xUnit}
        keyType="phase"
        xRange={xRange}
        onRangeChange={setXRange}
        emptyMessage="No n data for the selected samples"
      />
      <PlotPanel
        title="Extinction coefficient k"
        yTitle="k"
        traces={kTraces}
        logX={logX}
        xUnit={xUnit}
        keyType="phase"
        xRange={xRange}
        onRangeChange={setXRange}
        emptyMessage="No k data for the selected samples"
      />
      <PlotPanel
        title="Refractive-index contrast Δn"
        yTitle="Δn (cryst − amor)"
        traces={deltaNTraces}
        logX={logX}
        xUnit={xUnit}
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
        xUnit={xUnit}
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
