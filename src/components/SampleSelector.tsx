import type { MaterialSummary, SampleSummary } from "../types";
import { commonRange, formatLambdaRange } from "../lib/units";

interface SampleSelectorProps {
  materials: MaterialSummary[];
  samples: SampleSummary[];
  materialId: number | null;
  sampleId: string;
  samplesLoading: boolean;
  adding: boolean;
  canAdd: boolean;
  onMaterialChange: (materialId: number) => void;
  onSampleChange: (sampleId: string) => void;
  onAdd: () => void;
}

export function SampleSelector({
  materials,
  samples,
  materialId,
  sampleId,
  samplesLoading,
  adding,
  canAdd,
  onMaterialChange,
  onSampleChange,
  onAdd,
}: SampleSelectorProps) {
  return (
    <section className="selector-card" aria-labelledby="selector-heading">
      <div className="selector-heading">
        <div>
          <p className="eyebrow">Phase comparison</p>
          <h2 id="selector-heading">Build a sample set</h2>
        </div>
        <p className="selector-help">
          Choose a material and sample, then add it to the comparison. Add as
          many samples as you need.
        </p>
      </div>

      <div className="selector-controls">
        <label className="field">
          <span className="field-label">Material</span>
          <select
            value={materialId ?? ""}
            onChange={(event) => onMaterialChange(Number(event.target.value))}
            disabled={materials.length === 0}
          >
            {materials.map((material) => (
              <option key={material.id} value={material.id}>
                {material.formulation} ({material.sampleCount})
              </option>
            ))}
          </select>
        </label>

        <label className="field field-sample">
          <span className="field-label">Sample</span>
          <select
            value={sampleId}
            onChange={(event) => onSampleChange(event.target.value)}
            disabled={samplesLoading || samples.length === 0}
          >
            {samples.map((sample) => {
              const range = formatLambdaRange(
                commonRange(sample.amorphousRange, sample.crystallineRange),
              );
              return (
                <option key={sample.id} value={sample.id}>
                  {range ? `${sample.id} · ${range}` : sample.id}
                </option>
              );
            })}
          </select>
        </label>

        <button
          className="add-button"
          type="button"
          onClick={onAdd}
          disabled={!canAdd || adding}
        >
          {adding ? "Adding…" : "Add sample"}
        </button>
      </div>

      {sampleId && (
        <p className="selected-source">
          <span>Source</span>
          {samples.find((sample) => sample.id === sampleId)?.sourceTitle ??
            "Unknown source"}
        </p>
      )}
    </section>
  );
}
