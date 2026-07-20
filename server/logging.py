from dtcc_core import get_logger

# NOTE: dtcc-core's error() and critical() log AND raise RuntimeError(message)
# (legacy DTCC API). Only debug/info/warning return normally.
debug, info, warning, error, critical = get_logger("dtcc-atlas")
