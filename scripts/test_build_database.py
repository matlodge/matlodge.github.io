import sqlite3
import tempfile
import unittest
from pathlib import Path

import build_database as db


class MetadataParsingTests(unittest.TestCase):
    def test_single_nm_thickness(self):
        self.assertEqual(db.parse_thickness("100 nm"), (100.0, None))
        self.assertEqual(db.parse_thickness("40nm"), (40.0, None))
        self.assertEqual(db.parse_thickness("97.1 nm"), (97.1, None))
        self.assertEqual(db.parse_thickness(" 100 nm "), (100.0, None))

    def test_missing_thickness_is_allowed(self):
        self.assertEqual(db.parse_thickness("not specified"), (None, None))
        self.assertEqual(db.parse_thickness("—"), (None, None))

    def test_ambiguous_thickness_is_kept_as_text(self):
        for value in ("100 nm and 1 µm", "137 and 183 nm", "600-750 nm"):
            nm, text = db.parse_thickness(value)
            self.assertIsNone(nm)
            self.assertEqual(text, value)

    def test_capping_layer(self):
        self.assertEqual(
            db.parse_capping_layer("10 nm ITO"),
            (
                {"material": "ITO", "thickness_nm": 10.0, "thickness_text": None},
                [],
            ),
        )
        self.assertEqual(db.parse_capping_layer("none"), (None, []))
        layer, warnings = db.parse_capping_layer("100-atomic-layer Al2O3 film")
        self.assertEqual(
            layer,
            {
                "material": "Al2O3",
                "thickness_nm": None,
                "thickness_text": "100-atomic-layer Al2O3 film",
            },
        )
        self.assertTrue(warnings)

    def test_doi_normalization(self):
        self.assertEqual(
            db.normalize_doi("dx.doi.org/10.1021/cm301809g"),
            "10.1021/cm301809g",
        )
        self.assertEqual(
            db.normalize_doi("https://doi.org/10.1000/example"),
            "10.1000/example",
        )

    def test_boolean_and_sample_id(self):
        self.assertEqual(db.parse_bool("available"), 1)
        self.assertEqual(db.parse_bool("avialable"), 1)
        self.assertIsNone(db.parse_bool("not specified"))
        self.assertEqual(db.parse_sample_id("Sb2S3_12"), ("Sb2S3", 12))
        self.assertEqual(db.parse_sample_id("Ge2.5SnSb2Te2.5Se4_1"), (
            "Ge2.5SnSb2Te2.5Se4",
            1,
        ))


class CurrentDataBuildTests(unittest.TestCase):
    def test_current_data_produces_expected_database(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "matlodge.sqlite"
            report = Path(directory) / "db-report.json"
            result = db.build(db.DEFAULT_DATA_DIR, output, report)
            self.assertTrue(output.exists())
            self.assertGreater(result["samples"], 0)
            self.assertGreaterEqual(result["datasets"], result["samples"])
            self.assertGreater(result["points"], 0)
            # Ambiguous thicknesses must keep their rows and optical data.
            self.assertEqual(result["skippedMetadata"], [])
            self.assertGreater(len(result["thicknessTextRows"]), 0)
            thickness_text = {
                item["sampleId"]: item["thickness"]
                for item in result["thicknessTextRows"]
            }
            self.assertEqual(thickness_text["Sb2S3_2"], "100 nm and 1 µm")

            with sqlite3.connect(output) as connection:
                stored = connection.execute(
                    "SELECT pcm_thickness_nm, pcm_thickness_text FROM samples WHERE id = 'Sb2S3_2'"
                ).fetchone()
                points = connection.execute(
                    """
                    SELECT COUNT(*)
                    FROM optical_data_points o
                    JOIN refractive_index_datasets d ON d.id = o.dataset_id
                    WHERE d.sample_id = 'Sb2S3_2'
                    """
                ).fetchone()
                source = connection.execute(
                    "SELECT first_author, publication_year FROM sources WHERE doi = '10.1002/adom.202002049'"
                ).fetchone()
            self.assertEqual(stored, (None, "100 nm and 1 µm"))
            self.assertGreater(points[0], 0)
            self.assertEqual(source, ("Fang et al.", 2021))


class OpticalFileParsingTests(unittest.TestCase):
    def test_headerless_file_with_blank_lines_and_trailing_column(self):
        content = "\n\n400\t2.5\t0.1\t\n410\t2.6\t0.2\t\n\n"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "Sb2S3_1_m_amorph.txt"
            path.write_text(content, encoding="utf-8")
            dataset, warnings, _ = db.parse_optical_file(path)
        self.assertIsNotNone(dataset)
        self.assertEqual(dataset.sample_id, "Sb2S3_1")
        self.assertEqual(dataset.phase, "AMORPHOUS")
        self.assertEqual(dataset.variant, "base")
        self.assertEqual(dataset.lambda_nm, [400.0, 410.0])
        self.assertEqual(warnings, [])

    def test_header_invalid_rows_and_deduplication(self):
        content = (
            "lambda\tn\tk\n"
            "400\t2.5\t0.1\n"
            "400\t9.9\t9.9\n"
            "410\tNaN\t0.2\n"
            "420\t2.7\t0.3\n"
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "RuSbTe_1_cryst.txt"
            path.write_text(content, encoding="utf-8")
            dataset, warnings, _ = db.parse_optical_file(path)
        self.assertIsNotNone(dataset)
        self.assertEqual(dataset.sample_id, "RuSbTe_1")
        self.assertEqual(dataset.phase, "CRYSTALLINE")
        self.assertEqual(dataset.lambda_nm, [400.0, 420.0])
        self.assertEqual(dataset.n, [2.5, 2.7])
        self.assertTrue(any("invalid numeric" in warning for warning in warnings))


if __name__ == "__main__":
    unittest.main()
