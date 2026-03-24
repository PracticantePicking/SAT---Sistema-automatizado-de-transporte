import uuid
from fastapi import APIRouter, HTTPException
from models import CarrierCreate, CarrierUpdate
from config import load_config, save_config

router = APIRouter()


@router.get("/carriers")
def get_carriers():
    return load_config()


@router.post("/carriers", status_code=201)
def add_carrier(data: CarrierCreate):
    config   = load_config()
    carriers = config["carriers"]

    if any(c["name"].lower() == data.name.lower() for c in carriers):
        raise HTTPException(status_code=400, detail="Ya existe una transportadora con ese nombre")

    AUTO_COLS = {"Transportador", "MES", "ON TIME", "ON TIME (SI=1 Y NO=0)"}

    new_carrier = {
        "id":       f"carrier_{uuid.uuid4().hex[:8]}",
        "name":     data.name,
        "color":    data.color,
        "isStatic": False,
        "mapping":  {
            col: ""
            for col in config["finalCols"]
            if col not in AUTO_COLS
        }
    }

    carriers.append(new_carrier)
    save_config(config)
    return new_carrier


@router.put("/carriers/{cid}")
def update_carrier(cid: str, data: CarrierUpdate):
    config  = load_config()
    carrier = next((c for c in config["carriers"] if c["id"] == cid), None)

    if not carrier:
        raise HTTPException(status_code=404, detail="Transportadora no encontrada")

    if data.mapping is not None:
        carrier["mapping"].update(data.mapping)
    if data.color is not None:
        carrier["color"] = data.color

    save_config(config)
    return carrier


@router.delete("/carriers/{cid}")
def delete_carrier(cid: str):
    config  = load_config()
    carrier = next((c for c in config["carriers"] if c["id"] == cid), None)

    if not carrier:
        raise HTTPException(status_code=404, detail="Transportadora no encontrada")

    if carrier.get("isStatic"):
        raise HTTPException(
            status_code=403,
            detail="No se puede eliminar una transportadora estática"
        )

    config["carriers"] = [c for c in config["carriers"] if c["id"] != cid]
    save_config(config)
    return {"ok": True}