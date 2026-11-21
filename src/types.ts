export type Phase = "AMORPHOUS" | "CRYSTALLINE";

export interface MaterialSummary {
  id: number;
  formulation: string;
  sampleCount: number;
}

export interface SampleSummary {
  id: string;
  materialId: number;
  material: string;
  number: number;
  sourceDoi: string;
  sourceTitle: string;
  hasAmorphous: boolean;
  hasCrystalline: boolean;
  datasetCount: number;
}

export interface DatasetSummary {
  id: number;
  phase: Phase;
  variant: string;
  sourceFile: string;
  extractionMethod: string;
  measurementMethod: string | null;
  fittingModel: string | null;
  hasFittingParameters: boolean | null;
}

export interface Curve {
  lambda: number[];
  n: number[];
  k: number[];
}

export interface DeltaCurve {
  lambda: number[];
  n: number[];
  k: number[];
}

export interface DatasetWithCurve extends DatasetSummary {
  curve: Curve;
}

export interface SampleMetadata {
  id: string;
  material: string;
  number: number;
  sourceDoi: string;
  sourceTitle: string;
  sourceLink: string;
  pcmThicknessNm: number | null;
  depositionMethod: string | null;
  cappingMaterial: string | null;
  cappingThicknessNm: number | null;
}

export interface SampleBundle {
  sample: SampleMetadata;
  datasets: DatasetSummary[];
  amorphous: DatasetWithCurve | null;
  crystalline: DatasetWithCurve | null;
  delta: DeltaCurve | null;
  alternates: DatasetSummary[];
}

export interface CatalogSummary {
  materials: MaterialSummary[];
  sampleCount: number;
}

export interface SelectedSample {
  summary: SampleSummary;
  bundle: SampleBundle;
  color: string;
}
