"""Tests for extract_error_message in server/jobs/worker.py."""

import pytest

from server.jobs.worker import extract_error_message, _process_vector_dataset


class TestExtractErrorMessage:
    def test_json_detail_extraction(self):
        err = Exception('{"detail": "Something went wrong"}')
        assert extract_error_message(err) == "Something went wrong"

    def test_json_detail_in_larger_string(self):
        err = Exception('Error occurred: {"detail": "Bad request"} end')
        assert extract_error_message(err) == "Bad request"

    def test_plain_string_passthrough(self):
        err = Exception("Just a normal error")
        assert extract_error_message(err) == "Just a normal error"

    def test_no_lidar_tiles_pattern(self):
        err = Exception("No lidar tiles intersect the bounding box")
        assert "LiDAR" in extract_error_message(err)

    def test_no_buildings_pattern(self):
        err = Exception("No buildings found in the area")
        assert "building" in extract_error_message(err).lower()

    def test_no_building_singular(self):
        err = Exception("No building data available")
        assert "building" in extract_error_message(err).lower()

    def test_404_pattern(self):
        err = Exception("HTTP 404 Not Found")
        assert "not found" in extract_error_message(err).lower()

    def test_timeout_pattern(self):
        err = Exception("Connection timeout occurred")
        assert "timed out" in extract_error_message(err).lower()

    def test_connection_pattern(self):
        err = Exception("Connection refused by host")
        assert "connection" in extract_error_message(err).lower()

    def test_truncation(self):
        long_msg = "x" * 300
        err = Exception(long_msg)
        result = extract_error_message(err)
        assert len(result) <= 204  # 200 + "..."
        assert result.endswith("...")


class TestProcessVectorDatasetFailurePath:
    def test_corrupt_geojson_raises_cleaned_message(self, tmp_path):
        # If the except branch in _process_vector_dataset logged with
        # error(...) instead of warning(...), the (raising) mocked logger
        # would raise RuntimeError containing the traceback dump before the
        # intended `raise RuntimeError(f"Error reading dataset: {e}")` is
        # ever reached, and this match would fail.
        geojson_path = tmp_path / "corrupt.geojson"
        geojson_path.write_text("{not valid json", encoding="utf-8")

        with pytest.raises(RuntimeError, match="Error reading dataset"):
            _process_vector_dataset(
                dataset_name="test-dataset",
                params={"bounds": [0, 0, 1, 1]},
                geojson_path=geojson_path,
                on_progress=None,
            )
