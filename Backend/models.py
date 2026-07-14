from pydantic import BaseModel
from typing import Optional


#  CARRIERS 
class CarrierCreate(BaseModel):
    name:    str
    color:   str = "#4f6ef7"
    rama_id: Optional[str] = None  # si se crea desde una rama específica


class CarrierUpdate(BaseModel):
    mapping: Optional[dict] = None
    color:   Optional[str]  = None


# RAMAS
class RamaCreate(BaseModel):
    name: str


class RamaUpdate(BaseModel):
    name:     Optional[str]       = None
    carriers: Optional[list[str]] = None  # lista de carrier ids


class AsignarCarrier(BaseModel):
    carrier_id: str


#  PROCESS 
class ProcessJob(BaseModel):
    carrier_id: str
    files:      list[str]


class ProcessRequest(BaseModel):
    jobs:    list[ProcessJob]
    rama_id: str = ""        
