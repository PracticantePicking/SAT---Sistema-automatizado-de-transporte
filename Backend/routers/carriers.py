import uuid
from fastapi import APIRouter, HTTPException
from models import CarrierCreate, CarrierUpdate, RamaCreate, RamaUpdate, AsignarCarrier
from config import load_config, save_config

router = APIRouter()

AUTO_COLS = {"Transportador", "MES", "ON TIME", "ON TIME (SI=1 Y NO=0)"}



#  CARRIERS

@router.get("/carriers")
def get_carriers():
    return load_config()


@router.post("/carriers", status_code=201)
def add_carrier(data: CarrierCreate):
    config   = load_config()
    carriers = config["carriers"]

    if any(c["name"].lower() == data.name.lower() for c in carriers):
        raise HTTPException(status_code=400, detail="Ya existe una transportadora con ese nombre")

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

    # Si se especifica rama, asignarla automáticamente
    if data.rama_id:
        rama = next((r for r in config["ramas"] if r["id"] == data.rama_id), None)
        if rama and new_carrier["id"] not in rama["carriers"]:
            rama["carriers"].append(new_carrier["id"])

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
        raise HTTPException(status_code=403, detail="No se puede eliminar una transportadora estática")

    config["carriers"] = [c for c in config["carriers"] if c["id"] != cid]
    save_config(config)   # ← esta línea es crítica
    return {"ok": True}


# ════════════════════════════════════════════════════
#  RAMAS
# ════════════════════════════════════════════════════

@router.get("/ramas")
def get_ramas():
    """
    Retorna las ramas con sus transportadoras expandidas
    (no solo los IDs sino el objeto completo).
    """
    config   = load_config()
    carriers = {c["id"]: c for c in config["carriers"]}

    ramas_expandidas = []
    for rama in config.get("ramas", []):
        ramas_expandidas.append({
            **rama,
            "carriers_detail": [
                carriers[cid]
                for cid in rama["carriers"]
                if cid in carriers
            ]
        })
    return ramas_expandidas


@router.post("/ramas", status_code=201)
def create_rama(data: RamaCreate):
    config = load_config()
    ramas  = config.get("ramas", [])

    if any(r["name"].lower() == data.name.lower() for r in ramas):
        raise HTTPException(status_code=400, detail="Ya existe una rama con ese nombre")

    nueva_rama = {
        "id":       f"rama_{uuid.uuid4().hex[:6]}",
        "name":     data.name,
        "carriers": []
    }
    ramas.append(nueva_rama)
    config["ramas"] = ramas
    save_config(config)
    return nueva_rama


@router.put("/ramas/{rid}")
def update_rama(rid: str, data: RamaUpdate):
    config = load_config()
    rama   = next((r for r in config.get("ramas", []) if r["id"] == rid), None)

    if not rama:
        raise HTTPException(status_code=404, detail="Rama no encontrada")

    if data.name is not None:
        rama["name"] = data.name
    if data.carriers is not None:
        rama["carriers"] = data.carriers

    save_config(config)
    return rama


@router.delete("/ramas/{rid}")
def delete_rama(rid: str):
    config = load_config()
    ramas_estaticas = {"disnal", "cedi", "rionegro"}

    if rid in ramas_estaticas:
        raise HTTPException(status_code=403, detail="No se puede eliminar una rama estática")

    config["ramas"] = [r for r in config.get("ramas", []) if r["id"] != rid]
    save_config(config)
    return {"ok": True}


@router.post("/ramas/{rid}/carriers")
def asignar_carrier_rama(rid: str, data: AsignarCarrier):
    """Asigna una transportadora existente a una rama."""
    config = load_config()
    rama   = next((r for r in config.get("ramas", []) if r["id"] == rid), None)

    if not rama:
        raise HTTPException(status_code=404, detail="Rama no encontrada")

    carrier = next((c for c in config["carriers"] if c["id"] == data.carrier_id), None)
    if not carrier:
        raise HTTPException(status_code=404, detail="Transportadora no encontrada")

    if data.carrier_id not in rama["carriers"]:
        rama["carriers"].append(data.carrier_id)
        save_config(config)

    return {"ok": True}


@router.delete("/ramas/{rid}/carriers/{cid}")
def quitar_carrier_rama(rid: str, cid: str):
    """Quita una transportadora de una rama sin eliminarla del sistema."""
    config = load_config()
    rama   = next((r for r in config.get("ramas", []) if r["id"] == rid), None)

    if not rama:
        raise HTTPException(status_code=404, detail="Rama no encontrada")

    rama["carriers"] = [c for c in rama["carriers"] if c != cid]
    save_config(config)
    return {"ok": True}