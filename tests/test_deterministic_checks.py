"""Unit tests for deterministic quality pre-checks."""

from server.upload.deterministic_checks import check_candidate, check_all_candidates


def _make_candidate(
    name="test-dataset",
    metadata=None,
    warnings=None,
):
    """Build a minimal candidate dict for testing."""
    return {
        "id": "cand-1",
        "name": name,
        "title": name.replace("-", " ").title(),
        "inferred_type": "vector",
        "metadata": metadata or {},
        "warnings": warnings or [],
    }


# -- EMPTY_DATASET ----------------------------------------------------------


def test_empty_dataset_count_zero():
    c = _make_candidate(metadata={"count": 0})
    result = check_candidate(c, [])
    assert result["verdict"] == "fail"
    codes = [i["code"] for i in result["issues"]]
    assert "EMPTY_DATASET" in codes


def test_empty_dataset_warning():
    c = _make_candidate(metadata={}, warnings=["No features found, empty file"])
    result = check_candidate(c, [])
    assert result["verdict"] == "fail"
    codes = [i["code"] for i in result["issues"]]
    assert "EMPTY_DATASET" in codes


# -- MISSING_CRS ------------------------------------------------------------


def test_missing_crs_none():
    c = _make_candidate(metadata={"count": 100, "crs": None})
    result = check_candidate(c, [])
    assert result["verdict"] == "warn"
    codes = [i["code"] for i in result["issues"]]
    assert "MISSING_CRS" in codes


def test_missing_crs_empty():
    c = _make_candidate(metadata={"count": 100, "crs": ""})
    result = check_candidate(c, [])
    codes = [i["code"] for i in result["issues"]]
    assert "MISSING_CRS" in codes


# -- BOUNDS_OFFWORLD --------------------------------------------------------


def test_bounds_offworld_longitude():
    c = _make_candidate(
        metadata={
            "count": 50,
            "crs": "EPSG:4326",
            "bounds": [200, 10, 210, 20],
        }
    )
    result = check_candidate(c, [])
    assert result["verdict"] == "fail"
    codes = [i["code"] for i in result["issues"]]
    assert "BOUNDS_OFFWORLD" in codes


def test_bounds_offworld_latitude():
    c = _make_candidate(
        metadata={
            "count": 50,
            "crs": "EPSG:4326",
            "bounds": [10, -100, 20, 10],
        }
    )
    result = check_candidate(c, [])
    assert result["verdict"] == "fail"
    codes = [i["code"] for i in result["issues"]]
    assert "BOUNDS_OFFWORLD" in codes


def test_bounds_offworld_not_triggered_for_projected():
    """Offworld check should only fire for EPSG:4326."""
    c = _make_candidate(
        metadata={
            "count": 50,
            "crs": "EPSG:3006",
            "bounds": [300000, 6200000, 400000, 6300000],
        }
    )
    result = check_candidate(c, [])
    codes = [i["code"] for i in result["issues"]]
    assert "BOUNDS_OFFWORLD" not in codes


# -- BOUNDS_DEGENERATE -------------------------------------------------------


def test_bounds_degenerate_zero_width():
    c = _make_candidate(
        metadata={
            "count": 50,
            "crs": "EPSG:3006",
            "bounds": [100000, 6200000, 100000, 6300000],
        }
    )
    result = check_candidate(c, [])
    codes = [i["code"] for i in result["issues"]]
    assert "BOUNDS_DEGENERATE" in codes
    assert result["verdict"] == "warn"


def test_bounds_degenerate_zero_height():
    c = _make_candidate(
        metadata={
            "count": 50,
            "crs": "EPSG:4326",
            "bounds": [10, 55, 20, 55],
        }
    )
    result = check_candidate(c, [])
    codes = [i["code"] for i in result["issues"]]
    assert "BOUNDS_DEGENERATE" in codes


# -- LOW_FEATURES ------------------------------------------------------------


def test_low_features():
    c = _make_candidate(metadata={"count": 2, "crs": "EPSG:4326"})
    result = check_candidate(c, [])
    codes = [i["code"] for i in result["issues"]]
    assert "LOW_FEATURES" in codes
    assert result["verdict"] == "warn"


def test_low_features_not_triggered_at_five():
    c = _make_candidate(
        metadata={"count": 5, "crs": "EPSG:4326", "bounds": [10, 55, 20, 60]}
    )
    result = check_candidate(c, [])
    codes = [i["code"] for i in result["issues"]]
    assert "LOW_FEATURES" not in codes


# -- EXACT_DUPLICATE ---------------------------------------------------------


def test_exact_duplicate():
    c = _make_candidate(metadata={"sha256": "abc123", "count": 50, "crs": "EPSG:4326"})
    existing = [{"dataset_name": "old-data", "sha256_list": ["abc123", "def456"]}]
    result = check_candidate(c, existing)
    codes = [i["code"] for i in result["issues"]]
    assert "EXACT_DUPLICATE" in codes


def test_no_duplicate_when_no_match():
    c = _make_candidate(metadata={"sha256": "xyz789", "count": 50, "crs": "EPSG:4326"})
    existing = [{"dataset_name": "old-data", "sha256_list": ["abc123"]}]
    result = check_candidate(c, existing)
    codes = [i["code"] for i in result["issues"]]
    assert "EXACT_DUPLICATE" not in codes


# -- CRS_MISMATCH -----------------------------------------------------------


def test_crs_mismatch_4326_with_large_coords():
    c = _make_candidate(
        metadata={
            "count": 50,
            "crs": "EPSG:4326",
            "bounds": [300000, 6200000, 400000, 6300000],
        }
    )
    result = check_candidate(c, [])
    codes = [i["code"] for i in result["issues"]]
    assert "CRS_MISMATCH" in codes


def test_crs_mismatch_projected_with_small_coords():
    c = _make_candidate(
        metadata={
            "count": 50,
            "crs": "EPSG:3006",
            "bounds": [11.5, 55.5, 12.5, 56.5],
        }
    )
    result = check_candidate(c, [])
    codes = [i["code"] for i in result["issues"]]
    assert "CRS_MISMATCH" in codes


# -- GEOMETRY_ERRORS ---------------------------------------------------------


def test_geometry_errors_from_warnings():
    c = _make_candidate(
        metadata={"count": 50, "crs": "EPSG:4326"},
        warnings=["Self-intersecting polygon detected"],
    )
    result = check_candidate(c, [])
    codes = [i["code"] for i in result["issues"]]
    assert "GEOMETRY_ERRORS" in codes


def test_no_geometry_errors_for_unrelated_warnings():
    c = _make_candidate(
        metadata={"count": 50, "crs": "EPSG:4326"},
        warnings=["File uses legacy format"],
    )
    result = check_candidate(c, [])
    codes = [i["code"] for i in result["issues"]]
    assert "GEOMETRY_ERRORS" not in codes


# -- PASS verdict -----------------------------------------------------------


def test_good_dataset_passes():
    """A well-formed 50-feature dataset should get a clean pass."""
    c = _make_candidate(
        metadata={
            "count": 50,
            "crs": "EPSG:4326",
            "bounds": [11.5, 55.5, 12.5, 56.5],
        }
    )
    result = check_candidate(c, [])
    assert result["verdict"] == "pass"
    assert result["issues"] == []


# -- check_all_candidates ---------------------------------------------------


def test_check_all_candidates():
    candidates = [
        _make_candidate(name="good", metadata={"count": 50, "crs": "EPSG:4326", "bounds": [10, 50, 20, 60]}),
        _make_candidate(name="bad", metadata={"count": 0}),
    ]
    results = check_all_candidates(candidates, [])
    assert len(results) == 2
    assert results[0]["name"] == "good"
    assert results[0]["verdict"] == "pass"
    assert results[1]["name"] == "bad"
    assert results[1]["verdict"] == "fail"


# -- Summary -----------------------------------------------------------------


def test_summary_includes_codes():
    c = _make_candidate(metadata={"count": 2, "crs": ""})
    result = check_candidate(c, [])
    assert "MISSING_CRS" in result["summary"]
    assert "LOW_FEATURES" in result["summary"]


def test_pass_summary():
    c = _make_candidate(
        metadata={"count": 50, "crs": "EPSG:4326", "bounds": [10, 50, 20, 60]}
    )
    result = check_candidate(c, [])
    assert "passed" in result["summary"].lower()
