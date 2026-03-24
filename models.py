from pydantic import BaseModel
from typing import Optional


class CarrierCreate(BaseModel):
    name:  str
    color: str = "#4f6ef7"


class CarrierUpdate(BaseModel):
    mapping: Optional[dict] = None
    color:   Optional[str]  = None


class ProcessJob(BaseModel):
    carrier_id: str
    files:      list[str]


class ProcessRequest(BaseModel):
    jobs: list[ProcessJob]


class WatchRequest(BaseModel):
    activo:  bool
    carpeta: str = ""
    espera:  int = 3