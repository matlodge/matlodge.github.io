import { useEffect, useMemo, useRef } from "react";
import Plotly from "plotly.js-dist-min";
import type { Config, Data, Layout, PlotlyHTMLElement, PlotRelayoutEvent } from "plotly.js";

interface PlotPanelProps {
  title: string;
  yTitle: string;
  traces: Data[];
  logX: boolean;
  showZeroLine?: boolean;
  emptyMessage?: string;
  xRange: [number, number] | null;
  onRangeChange: (range: [number, number] | null) => void;
}

function traceExtent(traces: Data[]): [number, number] | null {
  let low = Infinity;
  let high = -Infinity;
  for (const trace of traces) {
    if (!("x" in trace) || !Array.isArray(trace.x)) continue;
    for (const value of trace.x) {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      low = Math.min(low, value);
      high = Math.max(high, value);
    }
  }
  return Number.isFinite(low) && Number.isFinite(high) && high > low
    ? [low, high]
    : null;
}

function logTickValues(low: number, high: number): number[] {
  if (!(low > 0) || !(high > low)) return [];
  const values: number[] = [];
  for (
    let exponent = Math.floor(Math.log10(low));
    exponent <= Math.ceil(Math.log10(high));
    exponent += 1
  ) {
    for (const mantissa of [1, 2, 5]) {
      const value = mantissa * 10 ** exponent;
      if (value >= low && value <= high) values.push(value);
    }
  }
  return values;
}

const plotConfig: Partial<Config> = {
  responsive: true,
  displaylogo: false,
  modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"],
};

export function PlotPanel({
  title,
  yTitle,
  traces,
  logX,
  showZeroLine = false,
  emptyMessage,
  xRange,
  onRangeChange,
}: PlotPanelProps) {
  const plotElement = useRef<HTMLDivElement>(null);

  const layout = useMemo<Partial<Layout>>(() => {
    const extent = xRange ?? traceExtent(traces);
    const logTicks = logX && extent ? logTickValues(extent[0], extent[1]) : undefined;
    return {
      autosize: true,
      margin: { l: 64, r: 18, t: 44, b: 50 },
      title: {
        text: title,
        x: 0,
        xanchor: "left",
        font: { size: 15, color: "#0f172a" },
      },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "#ffffff",
      font: {
        family:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        size: 12,
        color: "#475569",
      },
      xaxis: {
        title: { text: "λ (nm)", standoff: 12 },
        type: logX ? "log" : "linear",
        range: xRange ?? undefined,
        autorange: xRange === null,
        nticks: 6,
        tickvals: logTicks,
        gridcolor: "#e8edf3",
        zeroline: false,
        linecolor: "#cbd5e1",
        tickcolor: "#cbd5e1",
        ticks: "outside",
        showline: true,
      },
      yaxis: {
        title: { text: yTitle, standoff: 10 },
        gridcolor: "#e8edf3",
        zeroline: showZeroLine,
        zerolinecolor: "#94a3b8",
        zerolinewidth: 1,
        linecolor: "#cbd5e1",
        tickcolor: "#cbd5e1",
        ticks: "outside",
        showline: true,
      },
      hovermode: "closest",
      showlegend: false,
      annotations:
        traces.length === 0 && emptyMessage
          ? [
              {
                text: emptyMessage,
                xref: "paper",
                yref: "paper",
                x: 0.5,
                y: 0.5,
                showarrow: false,
                font: { size: 13, color: "#64748b" },
              },
            ]
          : [],
    };
  }, [emptyMessage, logX, showZeroLine, title, traces, xRange, yTitle]);

  useEffect(() => {
    const element = plotElement.current;
    if (!element) return;
    void Plotly.react(element, traces, layout, plotConfig);
  }, [layout, traces]);

  useEffect(() => {
    const element = plotElement.current;
    if (!element) return;
    const plotlyElement = element as unknown as PlotlyHTMLElement & {
      removeListener: (event: string, callback: (event: PlotRelayoutEvent) => void) => void;
    };
    const handleRelayout = (event: PlotRelayoutEvent) => {
      const record = event as Record<string, unknown>;
      if (record["xaxis.autorange"] === true) {
        if (xRange !== null) onRangeChange(null);
        return;
      }
      const start = record["xaxis.range[0]"];
      const end = record["xaxis.range[1]"];
      if (
        typeof start === "number" &&
        typeof end === "number" &&
        (xRange === null || start !== xRange[0] || end !== xRange[1])
      ) {
        onRangeChange([start, end]);
      }
    };
    plotlyElement.on("plotly_relayout", handleRelayout);
    return () => {
      plotlyElement.removeListener("plotly_relayout", handleRelayout);
    };
  }, [onRangeChange, xRange]);

  useEffect(() => {
    const element = plotElement.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      void Plotly.Plots.resize(element);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = plotElement.current;
    return () => {
      if (element) Plotly.purge(element);
    };
  }, []);

  return <div className="plot-panel" ref={plotElement} />;
}
