import type { DatasetSummary, SelectedSample } from "../types";
import { sourceCitation } from "../lib/citation";
import { formatFormula } from "../lib/formula";

interface SampleDetailsProps {
  selected: SelectedSample[];
}

const EXTRACTION_LABELS: Record<string, string> = {
  DIGITIZED: "Digitized",
  REPOSITORY: "Repository",
  FROM_AUTHOR: "From author",
  GENERATED_FROM_MODEL: "Generated from model",
  SUPPLEMENTARY_MATERIAL: "Supplementary material",
};

function valueOrFallback(value: string | null | undefined): string {
  return value && value.trim() ? value : "Not reported";
}

function extractionLabel(value: string | null | undefined): string {
  if (!value) return "Not reported";
  return EXTRACTION_LABELS[value] ?? value;
}

function thickness(value: number | null, text: string | null): string {
  if (value !== null) return `${value} nm`;
  return text ?? "Not reported";
}

function cappingLayer(sample: SelectedSample["bundle"]["sample"]): string {
  if (!sample.cappingMaterial) return "None / not reported";
  if (sample.cappingThicknessNm !== null) {
    return `${sample.cappingThicknessNm} nm ${sample.cappingMaterial}`;
  }
  const text = sample.cappingThicknessText;
  if (!text) return sample.cappingMaterial;
  // The raw text often already names the material ("100-atomic-layer Al2O3 film").
  return text.toLowerCase().includes(sample.cappingMaterial.toLowerCase())
    ? text
    : `${text} ${sample.cappingMaterial}`;
}

function phaseLabel(dataset: DatasetSummary): string {
  return dataset.phase === "AMORPHOUS" ? "amorphous" : "crystalline";
}

function detailValue(sample: SelectedSample): {
  extraction: string;
  measurement: string;
  fittingModel: string;
  fittingParameters: string;
  deposition: string;
} {
  const primary = sample.bundle.amorphous ?? sample.bundle.crystalline;
  const fitting = primary?.fittingModel ?? null;
  const hasParameters = primary?.hasFittingParameters;
  return {
    extraction: extractionLabel(primary?.extractionMethod),
    measurement: valueOrFallback(primary?.measurementMethod),
    fittingModel: valueOrFallback(fitting),
    fittingParameters:
      hasParameters === null
        ? "Not reported"
        : hasParameters
          ? "Available"
          : "Not available",
    deposition: valueOrFallback(sample.bundle.sample.depositionMethod),
  };
}

export function SampleDetails({ selected }: SampleDetailsProps) {
  if (selected.length === 0) return null;

  return (
    <section className="details-section" aria-labelledby="details-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Provenance</p>
          <h2 id="details-heading">Selected sample details</h2>
        </div>
      </div>
      <div className="details-grid">
        {selected.map((sample) => {
          const values = detailValue(sample);
          const alternates = sample.bundle.alternates;
          return (
            <article className="detail-card" key={sample.summary.id}>
              <div className="detail-card-header">
                <i
                  className="color-dot"
                  style={{ backgroundColor: sample.color }}
                  aria-hidden="true"
                />
                <div>
                  <h3>{sample.summary.id}</h3>
                  <p>{formatFormula(sample.summary.material)}</p>
                </div>
              </div>

              <p className="source-title">
                {sample.bundle.sample.sourceTitle}
                {(() => {
                  const citation = sourceCitation(
                    sample.bundle.sample.firstAuthor,
                    sample.bundle.sample.publicationYear,
                  );
                  return citation ? ` · ${citation}` : null;
                })()}
              </p>
              <a
                className="doi-link"
                href={sample.bundle.sample.sourceLink}
                target="_blank"
                rel="noreferrer"
              >
                {sample.bundle.sample.sourceDoi} ↗
              </a>

              <dl className="detail-list">
                <div>
                  <dt>Extraction</dt>
                  <dd>{values.extraction}</dd>
                </div>
                <div>
                  <dt>Measurement</dt>
                  <dd>{values.measurement}</dd>
                </div>
                <div>
                  <dt>Fitting model</dt>
                  <dd>{values.fittingModel}</dd>
                </div>
                <div>
                  <dt>Fitting parameters</dt>
                  <dd>{values.fittingParameters}</dd>
                </div>
                <div>
                  <dt>Deposition</dt>
                  <dd>{values.deposition}</dd>
                </div>
                <div>
                  <dt>PCM thickness</dt>
                  <dd>
                    {thickness(
                      sample.bundle.sample.pcmThicknessNm,
                      sample.bundle.sample.pcmThicknessText,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Capping layer</dt>
                  <dd>{cappingLayer(sample.bundle.sample)}</dd>
                </div>
              </dl>

              {alternates.length > 0 && (
                <p className="alternate-note">
                  {alternates.length} additional dataset
                  {alternates.length === 1 ? "" : "s"} in the database:{" "}
                  {alternates
                    .map(
                      (dataset) =>
                        `${phaseLabel(dataset)}${
                          dataset.variant === "base"
                            ? ""
                            : ` ${dataset.variant}`
                        }`,
                    )
                    .join(", ")}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
