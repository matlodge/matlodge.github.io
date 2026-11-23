import initSqlJs, { type Database, type SqlValue } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import type {
  Curve,
  DatasetSummary,
  DatasetWithCurve,
  MaterialSummary,
  SampleBundle,
  SampleMetadata,
  SampleSummary,
  WavelengthRange,
} from "../types";
import { computeDelta } from "./delta";

let databasePromise: Promise<Database> | null = null;

async function openDatabase(): Promise<Database> {
  const SQL = await initSqlJs({
    locateFile: () => wasmUrl,
    useOldExtensionFunctions: false,
  });
  const response = await fetch(`${import.meta.env.BASE_URL}data/matlodge.sqlite`);
  if (!response.ok) {
    throw new Error(
      `Could not load the Matlodge database (${response.status} ${response.statusText}).`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return new SQL.Database(bytes);
}

export function getDatabase(): Promise<Database> {
  if (!databasePromise) {
    databasePromise = openDatabase();
  }
  return databasePromise;
}

function queryRows<T extends Record<string, unknown>>(
  database: Database,
  sql: string,
  params: SqlValue[] = [],
): T[] {
  const statement = database.prepare(sql);
  try {
    if (params.length > 0) statement.bind(params);
    const rows: T[] = [];
    while (statement.step()) {
      rows.push(statement.getAsObject() as T);
    }
    return rows;
  } finally {
    statement.free();
  }
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function asNullableString(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : String(value);
}

function asNullableNumber(value: unknown): number | null {
  return value === null || value === undefined || value === "" ? null : asNumber(value);
}

function asNullableBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  return Boolean(value);
}

export async function fetchMaterials(): Promise<MaterialSummary[]> {
  const database = await getDatabase();
  return queryRows<{
    id: number;
    formulation: string;
    sample_count: number;
  }>(
    database,
    `
      SELECT m.id, m.formulation, COUNT(s.id) AS sample_count
      FROM materials m
      JOIN samples s ON s.material_id = m.id
      GROUP BY m.id, m.formulation
      ORDER BY m.formulation COLLATE NOCASE
    `,
  ).map((row) => ({
    id: asNumber(row.id),
    formulation: String(row.formulation),
    sampleCount: asNumber(row.sample_count),
  }));
}

export async function fetchSampleCount(): Promise<number> {
  const database = await getDatabase();
  const rows = queryRows<{ count: number }>(
    database,
    "SELECT COUNT(*) AS count FROM samples",
  );
  return rows.length > 0 ? asNumber(rows[0].count) : 0;
}

export async function fetchSamples(materialId: number): Promise<SampleSummary[]> {
  const database = await getDatabase();
  return queryRows<{
    id: string;
    material_id: number;
    formulation: string;
    number: number;
    source_doi: string;
    source_title: string;
    has_amorphous: number;
    has_crystalline: number;
    dataset_count: number;
    amor_min: number | null;
    amor_max: number | null;
    cryst_min: number | null;
    cryst_max: number | null;
  }>(
    database,
    `
      SELECT
        s.id,
        s.material_id,
        m.formulation,
        s.number,
        s.source_doi,
        src.title AS source_title,
        EXISTS(
          SELECT 1
          FROM refractive_index_datasets d
          JOIN phases p ON p.id = d.phase_id
          WHERE d.sample_id = s.id AND p.code = 'AMORPHOUS'
        ) AS has_amorphous,
        EXISTS(
          SELECT 1
          FROM refractive_index_datasets d
          JOIN phases p ON p.id = d.phase_id
          WHERE d.sample_id = s.id AND p.code = 'CRYSTALLINE'
        ) AS has_crystalline,
        (
          SELECT COUNT(*)
          FROM refractive_index_datasets d
          WHERE d.sample_id = s.id
        ) AS dataset_count,
        (
          SELECT MIN(o.lambda_nm)
          FROM optical_data_points o
          JOIN refractive_index_datasets d ON d.id = o.dataset_id
          JOIN phases p ON p.id = d.phase_id
          WHERE d.sample_id = s.id AND p.code = 'AMORPHOUS'
        ) AS amor_min,
        (
          SELECT MAX(o.lambda_nm)
          FROM optical_data_points o
          JOIN refractive_index_datasets d ON d.id = o.dataset_id
          JOIN phases p ON p.id = d.phase_id
          WHERE d.sample_id = s.id AND p.code = 'AMORPHOUS'
        ) AS amor_max,
        (
          SELECT MIN(o.lambda_nm)
          FROM optical_data_points o
          JOIN refractive_index_datasets d ON d.id = o.dataset_id
          JOIN phases p ON p.id = d.phase_id
          WHERE d.sample_id = s.id AND p.code = 'CRYSTALLINE'
        ) AS cryst_min,
        (
          SELECT MAX(o.lambda_nm)
          FROM optical_data_points o
          JOIN refractive_index_datasets d ON d.id = o.dataset_id
          JOIN phases p ON p.id = d.phase_id
          WHERE d.sample_id = s.id AND p.code = 'CRYSTALLINE'
        ) AS cryst_max
      FROM samples s
      JOIN materials m ON m.id = s.material_id
      JOIN sources src ON src.doi = s.source_doi
      WHERE s.material_id = ?
      ORDER BY s.number
    `,
    [materialId],
  ).map((row) => ({
    id: String(row.id),
    materialId: asNumber(row.material_id),
    material: String(row.formulation),
    number: asNumber(row.number),
    sourceDoi: String(row.source_doi),
    sourceTitle: String(row.source_title),
    hasAmorphous: Boolean(row.has_amorphous),
    hasCrystalline: Boolean(row.has_crystalline),
    datasetCount: asNumber(row.dataset_count),
    amorphousRange: toRange(row.amor_min, row.amor_max),
    crystallineRange: toRange(row.cryst_min, row.cryst_max),
  }));
}

function toRange(min: unknown, max: unknown): WavelengthRange | null {
  const low = asNullableNumber(min);
  const high = asNullableNumber(max);
  return low !== null && high !== null && high > low ? { min: low, max: high } : null;
}

function pickAmorphous(datasets: DatasetSummary[]): DatasetSummary | null {
  return (
    datasets.find(
      (dataset) => dataset.phase === "AMORPHOUS" && dataset.variant === "base",
    ) ??
    datasets.find((dataset) => dataset.phase === "AMORPHOUS") ??
    null
  );
}

function pickCrystalline(datasets: DatasetSummary[]): DatasetSummary | null {
  return (
    datasets.find(
      (dataset) => dataset.phase === "CRYSTALLINE" && dataset.variant === "base",
    ) ??
    datasets.find(
      (dataset) => dataset.phase === "CRYSTALLINE" && dataset.variant === "1",
    ) ??
    datasets.find((dataset) => dataset.phase === "CRYSTALLINE") ??
    null
  );
}

function loadCurves(
  database: Database,
  datasetIds: number[],
): Map<number, Curve> {
  const curves = new Map<number, Curve>();
  if (datasetIds.length === 0) return curves;

  const placeholders = datasetIds.map(() => "?").join(", ");
  const rows = queryRows<{
    dataset_id: number;
    lambda_nm: number;
    n: number;
    k: number;
  }>(
    database,
    `
      SELECT dataset_id, lambda_nm, n, k
      FROM optical_data_points
      WHERE dataset_id IN (${placeholders})
      ORDER BY dataset_id, lambda_nm
    `,
    datasetIds,
  );

  for (const row of rows) {
    const datasetId = asNumber(row.dataset_id);
    let curve = curves.get(datasetId);
    if (!curve) {
      curve = { lambda: [], n: [], k: [] };
      curves.set(datasetId, curve);
    }
    curve.lambda.push(asNumber(row.lambda_nm));
    curve.n.push(asNumber(row.n));
    curve.k.push(asNumber(row.k));
  }
  return curves;
}

export async function fetchSampleBundle(sampleId: string): Promise<SampleBundle> {
  const database = await getDatabase();
  const sampleRows = queryRows<{
    id: string;
    formulation: string;
    number: number;
    source_doi: string;
    source_title: string;
    source_link: string;
    pcm_thickness_nm: number | null;
    deposition_method: string | null;
    capping_material: string | null;
    capping_thickness_nm: number | null;
  }>(
    database,
    `
      SELECT
        s.id,
        m.formulation,
        s.number,
        s.source_doi,
        src.title AS source_title,
        src.doi_link AS source_link,
        s.pcm_thickness_nm,
        dm.name AS deposition_method,
        cl.material AS capping_material,
        cl.thickness_nm AS capping_thickness_nm
      FROM samples s
      JOIN materials m ON m.id = s.material_id
      JOIN sources src ON src.doi = s.source_doi
      LEFT JOIN deposition_methods dm ON dm.id = s.deposition_method_id
      LEFT JOIN capping_layers cl ON cl.sample_id = s.id
      WHERE s.id = ?
    `,
    [sampleId],
  );
  if (sampleRows.length === 0) {
    throw new Error(`Sample ${sampleId} was not found in the database.`);
  }
  const row = sampleRows[0];
  const sample: SampleMetadata = {
    id: String(row.id),
    material: String(row.formulation),
    number: asNumber(row.number),
    sourceDoi: String(row.source_doi),
    sourceTitle: String(row.source_title),
    sourceLink: String(row.source_link),
    pcmThicknessNm: asNullableNumber(row.pcm_thickness_nm),
    depositionMethod: asNullableString(row.deposition_method),
    cappingMaterial: asNullableString(row.capping_material),
    cappingThicknessNm: asNullableNumber(row.capping_thickness_nm),
  };

  const datasets = queryRows<{
    id: number;
    phase: string;
    variant: string;
    source_file: string;
    extraction_method: string;
    measurement_method: string | null;
    fitting_model: string | null;
    has_fitting_parameters: number | null;
  }>(
    database,
    `
      SELECT
        d.id,
        p.code AS phase,
        d.variant,
        d.source_file,
        em.code AS extraction_method,
        mm.name AS measurement_method,
        fm.name AS fitting_model,
        d.has_fitting_parameters
      FROM refractive_index_datasets d
      JOIN phases p ON p.id = d.phase_id
      JOIN extraction_methods em ON em.id = d.extraction_method_id
      LEFT JOIN measurement_methods mm ON mm.id = d.measurement_method_id
      LEFT JOIN fitting_models fm ON fm.id = d.fitting_model_id
      WHERE d.sample_id = ?
      ORDER BY p.code, d.variant, d.source_file
    `,
    [sampleId],
  ).map<DatasetSummary>((dataset) => ({
    id: asNumber(dataset.id),
    phase: dataset.phase === "CRYSTALLINE" ? "CRYSTALLINE" : "AMORPHOUS",
    variant: String(dataset.variant),
    sourceFile: String(dataset.source_file),
    extractionMethod: String(dataset.extraction_method),
    measurementMethod: asNullableString(dataset.measurement_method),
    fittingModel: asNullableString(dataset.fitting_model),
    hasFittingParameters: asNullableBoolean(dataset.has_fitting_parameters),
  }));

  const amorphousSummary = pickAmorphous(datasets);
  const crystallineSummary = pickCrystalline(datasets);
  const selectedDatasets = [amorphousSummary, crystallineSummary].filter(
    (dataset): dataset is DatasetSummary => dataset !== null,
  );
  const curves = loadCurves(
    database,
    selectedDatasets.map((dataset) => dataset.id),
  );

  const withCurve = (
    dataset: DatasetSummary | null,
  ): DatasetWithCurve | null => {
    if (!dataset) return null;
    const curve = curves.get(dataset.id);
    return curve ? { ...dataset, curve } : null;
  };

  const amorphous = withCurve(amorphousSummary);
  const crystalline = withCurve(crystallineSummary);
  const delta =
    amorphous && crystalline
      ? computeDelta(amorphous.curve, crystalline.curve)
      : null;

  const canonicalIds = new Set(selectedDatasets.map((dataset) => dataset.id));
  const alternates = datasets.filter((dataset) => !canonicalIds.has(dataset.id));

  return {
    sample,
    datasets,
    amorphous,
    crystalline,
    delta,
    alternates,
  };
}
