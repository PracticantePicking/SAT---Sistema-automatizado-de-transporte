import logging
import os
from logging.handlers import RotatingFileHandler

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_LOGS_DIR = os.path.join(_BASE_DIR, "logs")
os.makedirs(_LOGS_DIR, exist_ok=True)

_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)-22s | %(message)s"
_DATE   = "%Y-%m-%d %H:%M:%S"

_root_configured = False


def _configure_root() -> None:
    global _root_configured
    if _root_configured:
        return

    root = logging.getLogger("sat_prebel")
    root.setLevel(logging.DEBUG)

    console = logging.StreamHandler()
    console.setLevel(logging.INFO)
    console.setFormatter(logging.Formatter(_FORMAT, _DATE))

    rotating = RotatingFileHandler(
        os.path.join(_LOGS_DIR, "sat_prebel.log"),
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    rotating.setLevel(logging.DEBUG)
    rotating.setFormatter(logging.Formatter(_FORMAT, _DATE))

    root.addHandler(console)
    root.addHandler(rotating)
    root.propagate = False
    _root_configured = True


def get_logger(name: str) -> logging.Logger:
    _configure_root()
    return logging.getLogger(f"sat_prebel.{name}")
