#!/usr/bin/env python3
"""Build the Matlodge SQLite database from the raw data folder.

The generated database is a static asset: the browser loads it with sql.js.
Only Python's standard library is required.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import re
import sqlite3
import sys
from collections import OrderedDict, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA_DIR = ROOT / "data"
DEFAULT_OUTPUT = ROOT / "public" / "data" / "matlodge.sqlite"
DEFAULT_REPORT = ROOT / "build" / "db-report.json"
MAX_DB_BYTES = 100 * 1024 * 1024  # conservative GitHub Pages file limit

NULL_MARKERS = {"", "not specified", "—", "-"}
EXTRACTION_METHODS = {
    "digitalized": "DIGITIZED",
    "generated from model": "GENERATED_FROM_MODEL",
    "repository": "REPOSITORY",
    "from author": "FROM_AUTHOR",
    "supplementary material": "SUPPLEMENTARY_MATERIAL",
}
PHASES = ("AMORPHOUS", "CRYSTALLINE")
TRUE_MARKERS = {"available", "avialable"}

THICKNESS_RE = re.compile(r"^(\d+(?:\.\d+)?)\s*nm$", re.IGNORECASE)
CAPPING_RE = re.compile(r"^(\d+(?:\.\d+)?)\s*nm\s+(.+)$", re.IGNORECASE)
ATOMIC_LAYER_RE = re.compile(
    r"^[\d.-]+\s*atomic-layer\s+(.+?)(?:\s+film)?$", re.IGNORECASE
)
FILE_WITH_M_RE = re.compile(
    r"^(?P<sample>.+)_m_(?P<phase>amorph|cryst|reamorph)(?:_(?P<variant>\d+))?$"
)
FILE_WITHOUT_M_RE = re.compile(
    r"^(?P<sample>.+)_(?P<phase>amorph|cryst|reamorph)(?:_(?P<variant>\d+))?$"
)
SAMPLE_ID_RE = re.compile(r"^(?P<material>.+)_(?P<number>\d+)$")


@dataclass
class Dataset:
    sample_id: str
    phase: str
    variant: str
    source_file: str
    lambda_nm: list[float]
    n: list[float]
    k: list[float]
    malformed_rows: int = 0
    duplicate_rows: int = 0


@dataclass
class MetadataRow:
    sample_id: str
    material: str
    number: int
    source_doi: str
    source_title: str
    extraction_method: str
    measurement_method: str | None
    fitting_model: str | None
    has_fitting_parameters: int | None
    deposition_method: str | None
    thickness_nm: float | None
    capping_layer: dict[str, str | float | None] | None
    thickness_text: str | None = None
    first_author: str | None = None
    publication_year: int | None = None
    warnings: list[str] = field(default_factory=list)


@dataclass
class BuildState:
    report: dict
    warnings: list[str] = field(default_factory=list)
    skipped_metadata: list[dict] = field(default_factory=list)
    skipped_files: list[dict] = field(default_factory=list)
    thickness_text_rows: list[dict] = field(default_factory=list)


def clean(value: str | None) -> str:
    return (value or "").strip()


def optional(value: str | None) -> str | None:
    value = clean(value)
    return None if value.lower() in NULL_MARKERS else value


def parse_sample_id(sample_id: str) -> tuple[str, int] | None:
    match = SAMPLE_ID_RE.fullmatch(sample_id)
    if not match:
        return None
    return match.group("material"), int(match.group("number"))


def parse_thickness(value: str) -> tuple[float | None, str | None]:
    """Return (thickness in nm, original text).

    A single numeric nm value becomes a number. Anything else (ranges, mixed
    units, "100 nm and 1 µm") keeps the original text so the sample and its
    optical data are still imported and the uncertainty is not lost.
    """
    value = optional(value)
    if value is None:
        return None, None
    match = THICKNESS_RE.fullmatch(value)
    if not match:
        return None, value
    return float(match.group(1)), None


def parse_capping_layer(
    value: str,
) -> tuple[dict[str, str | float | None] | None, list[str]]:
    """Return (capping layer, warnings).

    ``none`` and missing values produce no capping layer. A capping layer whose
    thickness cannot be expressed in nm is retained with its original text.
    """
    value = optional(value)
    if value is None or value.lower() == "none":
        return None, []
    match = CAPPING_RE.fullmatch(value)
    if match:
        return {
            "material": match.group(2).strip(),
            "thickness_nm": float(match.group(1)),
            "thickness_text": None,
        }, []
    match = ATOMIC_LAYER_RE.fullmatch(value)
    if match:
        return {
            "material": match.group(1).strip(),
            "thickness_nm": None,
            "thickness_text": value,
        }, [f"capping layer thickness kept as text: {value!r}"]
    return {
        "material": value,
        "thickness_nm": None,
        "thickness_text": value,
    }, [f"capping layer kept as text: {value!r}"]


def normalize_doi(value: str) -> str:
    doi = clean(value)
    doi = re.sub(r"^(?:https?://)?(?:dx\.)?doi\.org/", "", doi, flags=re.IGNORECASE)
    doi = re.sub(r"^doi:\s*", "", doi, flags=re.IGNORECASE)
    return doi


def map_extraction_method(value: str) -> str | None:
    key = clean(value).lower()
    return EXTRACTION_METHODS.get(key)


def parse_bool(value: str) -> int | None:
    value = optional(value)
    if value is None:
        return None
    return 1 if value.lower() in TRUE_MARKERS else None


def parse_publication_year(
    value: str, source_doi: str, state: BuildState
) -> int | None:
    text = optional(value)
    if text is None:
        return None
    if text.isdigit() and len(text) == 4:
        return int(text)
    state.warnings.append(
        f"source {source_doi}: unparseable publication year {text!r}; storing NULL"
    )
    return None


def load_metadata(
    path: Path, state: BuildState
) -> tuple[OrderedDict[str, MetadataRow], dict[str, str]]:
    rows: OrderedDict[str, MetadataRow] = OrderedDict()
    source_titles: dict[str, str] = {}
    source_authors: dict[str, str | None] = {}
    source_years: dict[str, int | None] = {}
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle, delimiter=";")
        for line_number, raw in enumerate(reader, start=2):
            sample_id = clean(raw.get("sample_id"))
            material = clean(raw.get("material"))
            if not sample_id or not material:
                state.skipped_metadata.append(
                    {
                        "line": line_number,
                        "sampleId": sample_id,
                        "reason": "missing sample_id or material",
                    }
                )
                continue

            parsed_id = parse_sample_id(sample_id)
            if parsed_id is None or parsed_id[0] != material:
                state.skipped_metadata.append(
                    {
                        "line": line_number,
                        "sampleId": sample_id,
                        "reason": f"sample_id does not match material {material!r}",
                    }
                )
                continue
            if sample_id in rows:
                state.skipped_metadata.append(
                    {
                        "line": line_number,
                        "sampleId": sample_id,
                        "reason": "duplicate sample_id",
                    }
                )
                continue

            thickness_nm, thickness_text = parse_thickness(raw.get("thickness"))
            if thickness_text is not None:
                state.thickness_text_rows.append(
                    {"sampleId": sample_id, "thickness": thickness_text}
                )
                state.warnings.append(
                    f"{sample_id}: thickness kept as text: {thickness_text!r}"
                )

            source_doi = normalize_doi(raw.get("source_doi"))
            source_title = clean(raw.get("source_title"))
            if not source_doi or not source_title:
                state.skipped_metadata.append(
                    {
                        "line": line_number,
                        "sampleId": sample_id,
                        "reason": "missing source DOI or title",
                    }
                )
                continue

            extraction_method = map_extraction_method(raw.get("data_extraction_method"))
            if extraction_method is None:
                state.skipped_metadata.append(
                    {
                        "line": line_number,
                        "sampleId": sample_id,
                        "reason": "missing or unknown data_extraction_method",
                    }
                )
                continue

            capping_layer, capping_warnings = parse_capping_layer(
                raw.get("capping_layer")
            )
            for warning in capping_warnings:
                state.warnings.append(f"{sample_id}: {warning}")

            existing_title = source_titles.get(source_doi)
            if existing_title is not None and existing_title != source_title:
                state.warnings.append(
                    f"source {source_doi}: multiple titles; keeping the first one"
                )
            else:
                source_titles.setdefault(source_doi, source_title)

            first_author = optional(raw.get("first_author"))
            existing_author = source_authors.get(source_doi)
            if (
                existing_author is not None
                and first_author is not None
                and existing_author != first_author
            ):
                state.warnings.append(
                    f"source {source_doi}: multiple first authors; keeping the first one"
                )
                first_author = existing_author
            else:
                source_authors.setdefault(source_doi, first_author)

            publication_year = parse_publication_year(
                raw.get("publication_year"), source_doi, state
            )
            existing_year = source_years.get(source_doi)
            if (
                existing_year is not None
                and publication_year is not None
                and existing_year != publication_year
            ):
                state.warnings.append(
                    f"source {source_doi}: multiple publication years; keeping the first one"
                )
                publication_year = existing_year
            else:
                source_years.setdefault(source_doi, publication_year)

            rows[sample_id] = MetadataRow(
                sample_id=sample_id,
                material=material,
                number=parsed_id[1],
                source_doi=source_doi,
                source_title=source_titles[source_doi],
                extraction_method=extraction_method,
                measurement_method=optional(raw.get("ri_measurement_method")),
                fitting_model=optional(raw.get("source_model")),
                has_fitting_parameters=parse_bool(
                    raw.get("source_model_has_parameters")
                ),
                deposition_method=optional(raw.get("deposition_method")),
                thickness_nm=thickness_nm,
                thickness_text=thickness_text,
                capping_layer=capping_layer,
                first_author=source_authors.get(source_doi),
                publication_year=source_years.get(source_doi),
            )
    return rows, source_titles


def parse_optical_file(path: Path) -> tuple[Dataset | None, list[str], dict]:
    match = FILE_WITH_M_RE.fullmatch(path.stem)
    if match is None:
        match = FILE_WITHOUT_M_RE.fullmatch(path.stem)
    if match is None:
        return None, [f"unrecognised optical filename: {path.name}"], {}

    sample_id = match.group("sample")
    phase_code = match.group("phase")
    variant = match.group("variant") or "base"
    if phase_code == "reamorph":
        phase = "AMORPHOUS"
        variant = "reamorph"
    else:
        phase = "AMORPHOUS" if phase_code == "amorph" else "CRYSTALLINE"

    values: dict[float, tuple[float, float]] = {}
    malformed = 0
    duplicates = 0
    warnings: list[str] = []
    try:
        lines = path.read_text(encoding="utf-8-sig").splitlines()
    except UnicodeDecodeError as error:
        return None, [f"{path.name}: cannot decode as UTF-8: {error}"], {}

    for line_number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        parts = line.rstrip("\r").split("\t")
        if len(parts) < 3:
            malformed += 1
            warnings.append(f"{path.name}:{line_number}: fewer than three columns")
            continue
        if clean(parts[0]).lower() == "lambda":
            continue
        if len(parts) > 3 and any(clean(part) for part in parts[3:]):
            warnings.append(f"{path.name}:{line_number}: extra columns ignored")
        try:
            lambda_nm = float(clean(parts[0]))
            n = float(clean(parts[1]))
            k = float(clean(parts[2]))
        except ValueError:
            malformed += 1
            warnings.append(f"{path.name}:{line_number}: non-numeric value")
            continue
        if (
            not math.isfinite(lambda_nm)
            or not math.isfinite(n)
            or not math.isfinite(k)
            or lambda_nm <= 0
        ):
            malformed += 1
            warnings.append(f"{path.name}:{line_number}: invalid numeric value")
            continue
        if lambda_nm in values:
            duplicates += 1
            continue
        values[lambda_nm] = (n, k)

    if len(values) < 2:
        warnings.append(f"{path.name}: fewer than two valid rows")
        return None, warnings, {
            "file": path.name,
            "validRows": len(values),
            "malformedRows": malformed,
        }

    ordered = sorted(values.items())
    dataset = Dataset(
        sample_id=sample_id,
        phase=phase,
        variant=variant,
        source_file=path.name,
        lambda_nm=[item[0] for item in ordered],
        n=[item[1][0] for item in ordered],
        k=[item[1][1] for item in ordered],
        malformed_rows=malformed,
        duplicate_rows=duplicates,
    )
    stats = {
        "file": path.name,
        "sampleId": sample_id,
        "phase": phase,
        "variant": variant,
        "validRows": len(values),
        "malformedRows": malformed,
    }
    return dataset, warnings, stats


def discover_optical_files(data_dir: Path) -> list[Path]:
    return sorted(data_dir.glob("*.txt"))


def create_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        PRAGMA foreign_keys = ON;

        CREATE TABLE materials (
            id INTEGER PRIMARY KEY,
            formulation TEXT NOT NULL UNIQUE
        );

        CREATE TABLE sources (
            doi TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            doi_link TEXT NOT NULL,
            first_author TEXT,
            publication_year INTEGER
        );

        CREATE TABLE phases (
            id INTEGER PRIMARY KEY,
            code TEXT NOT NULL UNIQUE
        );

        CREATE TABLE extraction_methods (
            id INTEGER PRIMARY KEY,
            code TEXT NOT NULL UNIQUE
        );

        CREATE TABLE measurement_methods (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE
        );

        CREATE TABLE fitting_models (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            description TEXT
        );

        CREATE TABLE deposition_methods (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE
        );

        CREATE TABLE samples (
            id TEXT PRIMARY KEY,
            material_id INTEGER NOT NULL REFERENCES materials(id),
            number INTEGER NOT NULL,
            source_doi TEXT NOT NULL REFERENCES sources(doi),
            pcm_thickness_nm REAL,
            pcm_thickness_text TEXT,
            deposition_method_id INTEGER REFERENCES deposition_methods(id),
            UNIQUE (material_id, number)
        );

        CREATE TABLE capping_layers (
            sample_id TEXT PRIMARY KEY REFERENCES samples(id) ON DELETE CASCADE,
            material TEXT NOT NULL,
            thickness_nm REAL,
            thickness_text TEXT
        );

        CREATE TABLE refractive_index_datasets (
            id INTEGER PRIMARY KEY,
            sample_id TEXT NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
            phase_id INTEGER NOT NULL REFERENCES phases(id),
            extraction_method_id INTEGER NOT NULL REFERENCES extraction_methods(id),
            measurement_method_id INTEGER REFERENCES measurement_methods(id),
            fitting_model_id INTEGER REFERENCES fitting_models(id),
            has_fitting_parameters INTEGER CHECK (
                has_fitting_parameters IS NULL OR has_fitting_parameters IN (0, 1)
            ),
            variant TEXT NOT NULL,
            source_file TEXT NOT NULL,
            UNIQUE (sample_id, phase_id, variant)
        );

        CREATE TABLE optical_data_points (
            dataset_id INTEGER NOT NULL REFERENCES refractive_index_datasets(id)
                ON DELETE CASCADE,
            lambda_nm REAL NOT NULL,
            n REAL NOT NULL,
            k REAL NOT NULL,
            PRIMARY KEY (dataset_id, lambda_nm)
        ) WITHOUT ROWID;

        CREATE TABLE build_info (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE INDEX idx_samples_material ON samples(material_id, number);
        CREATE INDEX idx_datasets_sample ON refractive_index_datasets(sample_id, phase_id);
        CREATE INDEX idx_points_dataset ON optical_data_points(dataset_id, lambda_nm);
        """
    )
    connection.executemany(
        "INSERT INTO phases (id, code) VALUES (?, ?)",
        [(1, "AMORPHOUS"), (2, "CRYSTALLINE")],
    )
    connection.executemany(
        "INSERT INTO extraction_methods (id, code) VALUES (?, ?)",
        [
            (1, "SUPPLEMENTARY_MATERIAL"),
            (2, "DIGITIZED"),
            (3, "REPOSITORY"),
            (4, "FROM_AUTHOR"),
            (5, "GENERATED_FROM_MODEL"),
        ],
    )


class IdLookup:
    def __init__(self, connection: sqlite3.Connection, table: str, key: str, value: str):
        self.connection = connection
        self.table = table
        self.key = key
        self.value = value
        self.cache: dict[str, int] = {}

    def get(self, name: str | None) -> int | None:
        name = optional(name)
        if name is None:
            return None
        if name in self.cache:
            return self.cache[name]
        row = self.connection.execute(
            f"SELECT {self.key} FROM {self.table} WHERE {self.value} = ?", (name,)
        ).fetchone()
        if row is None:
            cursor = self.connection.execute(
                f"INSERT INTO {self.table} ({self.value}) VALUES (?)", (name,)
            )
            identifier = int(cursor.lastrowid)
        else:
            identifier = int(row[0])
        self.cache[name] = identifier
        return identifier


def write_database(
    output: Path,
    metadata: OrderedDict[str, MetadataRow],
    datasets_by_sample: dict[str, list[Dataset]],
    state: BuildState,
) -> dict:
    output.parent.mkdir(parents=True, exist_ok=True)
    temp_output = output.with_suffix(".sqlite.tmp")
    if temp_output.exists():
        temp_output.unlink()

    connection = sqlite3.connect(temp_output)
    try:
        connection.execute("PRAGMA journal_mode = OFF")
        connection.execute("PRAGMA synchronous = OFF")
        connection.execute("PRAGMA temp_store = MEMORY")
        connection.execute("PRAGMA foreign_keys = ON")
        create_schema(connection)

        material_ids = IdLookup(connection, "materials", "id", "formulation")
        deposition_ids = IdLookup(
            connection, "deposition_methods", "id", "name"
        )
        measurement_ids = IdLookup(
            connection, "measurement_methods", "id", "name"
        )
        fitting_ids = IdLookup(connection, "fitting_models", "id", "name")
        phase_ids = {"AMORPHOUS": 1, "CRYSTALLINE": 2}
        extraction_ids = {
            row[0]: row[1]
            for row in connection.execute(
                "SELECT code, id FROM extraction_methods"
            ).fetchall()
        }

        sample_count = 0
        dataset_count = 0
        point_count = 0
        imported_samples: list[str] = []

        for sample_id, row in metadata.items():
            sample_datasets = datasets_by_sample.get(sample_id, [])
            if not sample_datasets:
                continue

            material_id = material_ids.get(row.material)
            assert material_id is not None
            connection.execute(
                """
                INSERT INTO sources (doi, title, doi_link, first_author, publication_year)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(doi) DO NOTHING
                """,
                (
                    row.source_doi,
                    row.source_title,
                    f"https://doi.org/{row.source_doi}",
                    row.first_author,
                    row.publication_year,
                ),
            )
            connection.execute(
                """
                INSERT INTO samples (
                    id, material_id, number, source_doi, pcm_thickness_nm,
                    pcm_thickness_text, deposition_method_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    sample_id,
                    material_id,
                    row.number,
                    row.source_doi,
                    row.thickness_nm,
                    row.thickness_text,
                    deposition_ids.get(row.deposition_method),
                ),
            )
            sample_count += 1
            imported_samples.append(sample_id)

            if row.capping_layer is not None:
                connection.execute(
                    """
                    INSERT INTO capping_layers (
                        sample_id, material, thickness_nm, thickness_text
                    ) VALUES (?, ?, ?, ?)
                    """,
                    (
                        sample_id,
                        row.capping_layer["material"],
                        row.capping_layer["thickness_nm"],
                        row.capping_layer["thickness_text"],
                    ),
                )

            for dataset in sorted(
                sample_datasets,
                key=lambda item: (
                    item.phase,
                    item.variant,
                    item.source_file,
                ),
            ):
                cursor = connection.execute(
                    """
                    INSERT INTO refractive_index_datasets (
                        sample_id, phase_id, extraction_method_id,
                        measurement_method_id, fitting_model_id,
                        has_fitting_parameters, variant, source_file
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        sample_id,
                        phase_ids[dataset.phase],
                        extraction_ids[row.extraction_method],
                        measurement_ids.get(row.measurement_method),
                        fitting_ids.get(row.fitting_model),
                        row.has_fitting_parameters,
                        dataset.variant,
                        dataset.source_file,
                    ),
                )
                dataset_id = int(cursor.lastrowid)
                dataset_count += 1
                connection.executemany(
                    """
                    INSERT INTO optical_data_points (dataset_id, lambda_nm, n, k)
                    VALUES (?, ?, ?, ?)
                    """,
                    (
                        (dataset_id, lambda_nm, n, k)
                        for lambda_nm, n, k in zip(
                            dataset.lambda_nm, dataset.n, dataset.k
                        )
                    ),
                )
                point_count += len(dataset.lambda_nm)

        generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        build_info = {
            "schema_version": "1",
            "generated_at": generated_at,
            "sample_count": str(sample_count),
            "dataset_count": str(dataset_count),
            "point_count": str(point_count),
        }
        connection.executemany(
            "INSERT INTO build_info (key, value) VALUES (?, ?)",
            build_info.items(),
        )
        connection.execute("PRAGMA user_version = 1")
        connection.commit()

        foreign_key_errors = connection.execute("PRAGMA foreign_key_check").fetchall()
        if foreign_key_errors:
            raise RuntimeError(f"foreign key check failed: {foreign_key_errors}")
        integrity = connection.execute("PRAGMA integrity_check").fetchone()
        if integrity is None or integrity[0] != "ok":
            raise RuntimeError(f"integrity check failed: {integrity}")
        connection.execute("ANALYZE")
        connection.execute("VACUUM")
        connection.commit()
    finally:
        connection.close()

    os.replace(temp_output, output)
    size = output.stat().st_size
    if size > MAX_DB_BYTES:
        raise RuntimeError(
            f"database is {size} bytes, over the 100 MB GitHub Pages limit"
        )

    try:
        display_path = str(output.relative_to(ROOT))
    except ValueError:
        display_path = str(output)

    return {
        "path": display_path,
        "bytes": size,
        "samples": sample_count,
        "datasets": dataset_count,
        "points": point_count,
        "importedSamples": imported_samples,
        "buildInfo": build_info,
    }


def build(data_dir: Path, output: Path, report_path: Path, dry_run: bool = False) -> dict:
    state = BuildState(report={})
    metadata, source_titles = load_metadata(data_dir / "pcms.csv", state)
    files = discover_optical_files(data_dir)

    datasets_by_sample: dict[str, list[Dataset]] = defaultdict(list)
    parsed_files = 0
    for path in files:
        dataset, warnings, stats = parse_optical_file(path)
        state.warnings.extend(warnings)
        if dataset is None:
            state.skipped_files.append(
                {
                    "file": path.name,
                    "reason": "could not parse optical data",
                    "stats": stats,
                }
            )
            continue
        parsed_files += 1
        if dataset.sample_id not in metadata:
            state.skipped_files.append(
                {
                    "file": path.name,
                    "reason": f"no valid metadata row for {dataset.sample_id}",
                    "stats": stats,
                }
            )
            continue
        datasets_by_sample[dataset.sample_id].append(dataset)

    metadata_with_data = {
        sample_id: row
        for sample_id, row in metadata.items()
        if datasets_by_sample.get(sample_id)
    }
    metadata_without_data = [
        sample_id for sample_id in metadata if sample_id not in metadata_with_data
    ]

    with (data_dir / "pcms.csv").open(
        newline="", encoding="utf-8-sig"
    ) as metadata_handle:
        metadata_row_count = sum(
            1 for _ in csv.DictReader(metadata_handle, delimiter=";")
        )

    result = {
        "dataDir": str(data_dir),
        "metadataRows": metadata_row_count,
        "validMetadataRows": len(metadata),
        "samplesWithData": len(metadata_with_data),
        "metadataWithoutData": len(metadata_without_data),
        "metadataWithoutDataSampleIds": metadata_without_data,
        "opticalFilesDiscovered": len(files),
        "opticalFilesParsed": parsed_files,
        "skippedMetadata": state.skipped_metadata,
        "skippedFiles": state.skipped_files,
        "thicknessTextRows": state.thickness_text_rows,
        "warnings": state.warnings,
        "sourceCount": len(source_titles),
    }

    if dry_run:
        result["dryRun"] = True
        return result

    db_result = write_database(
        output, metadata_with_data, datasets_by_sample, state
    )
    result.update(db_result)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return result


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    try:
        result = build(args.data_dir, args.output, args.report, args.dry_run)
    except Exception as error:  # noqa: BLE001 - surface a useful build failure
        print(f"Database build failed: {error}", file=sys.stderr)
        return 1

    if args.dry_run:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print(
            "Built {path}: {samples} samples, {datasets} datasets, "
            "{points} points ({bytes} bytes)".format(**result)
        )
        if result["skippedMetadata"]:
            print(
                f"Skipped {len(result['skippedMetadata'])} inconsistent metadata rows",
                file=sys.stderr,
            )
        if result["skippedFiles"]:
            print(
                f"Skipped {len(result['skippedFiles'])} optical files",
                file=sys.stderr,
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
