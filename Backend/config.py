import json
import os

from procesador import CARRIERS_DEFAULT

BASE_DIR      = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
RESULT_FOLDER = os.path.join(BASE_DIR, "resultado")
CONFIG_FILE   = os.path.join(BASE_DIR, "carriers_config.json")

for _dir in (UPLOAD_FOLDER, RESULT_FOLDER):
    os.makedirs(_dir, exist_ok=True)

# Ramas por defecto
RAMAS_DEFAULT = [
    {
        "id":       "disnal",
        "name":     "DISNAL",
        "carriers": ["solistica", "coordinadora", "internacional"]
    },
    {
        "id":       "cedi",
        "name":     "CEDI",
        "carriers": []
    },
    {
        "id":       "rionegro",
        "name":     "Rionegro",
        "carriers": []
    },
]


def load_config() -> dict:
    if os.path.exists(CONFIG_FILE):
        config = json.load(open(CONFIG_FILE, "r", encoding="utf-8"))
        # Migración: agregar ramas si no existen en config antigua
        if "ramas" not in config:
            config["ramas"] = RAMAS_DEFAULT
            save_config(config)
        return config

    config = CARRIERS_DEFAULT.copy()
    config["ramas"] = RAMAS_DEFAULT
    return config


def save_config(config: dict):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)