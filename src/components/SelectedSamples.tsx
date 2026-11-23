import type { SelectedSample } from "../types";

interface SelectedSamplesProps {
  selected: SelectedSample[];
  maxSamples: number;
  onRemove: (sampleId: string) => void;
  onClear: () => void;
}

export function SelectedSamples({
  selected,
  maxSamples,
  onRemove,
  onClear,
}: SelectedSamplesProps) {
  return (
    <section className="selected-section" aria-labelledby="selected-heading">
      <div className="selected-header">
        <div>
          <h2 id="selected-heading">Selected samples</h2>
          <p className="selected-count">
            {selected.length} / {maxSamples} in this comparison
          </p>
        </div>
        {selected.length > 0 && (
          <button className="text-button" type="button" onClick={onClear}>
            Clear all
          </button>
        )}
      </div>

      {selected.length === 0 ? (
        <p className="empty-selection">
          No samples selected yet. Add one above to populate the four plots.
        </p>
      ) : (
        <div className="chip-row">
          {selected.map((sample) => (
            <span className="sample-chip" key={sample.summary.id}>
              <i
                className="color-dot"
                style={{ backgroundColor: sample.color }}
                aria-hidden="true"
              />
              <span className="chip-text">
                <strong>{sample.summary.id}</strong>
                <small>{sample.summary.material}</small>
              </span>
              <button
                type="button"
                className="chip-remove"
                aria-label={`Remove ${sample.summary.id}`}
                onClick={() => onRemove(sample.summary.id)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
