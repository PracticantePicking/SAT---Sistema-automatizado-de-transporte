import requests

datos = {
    "fecha": "2026-06-20",
    "factura2": "TEST-001",
    "nombre_cliente": "CLIENTE PRUEBA",
    "novedad": "FALTANTE",
    "usuario": "JGARCIA",
    "canal": "PRUEBA",
    "valor": 50000,
    "referencia": "REF-TEST",
    "unidades": 5,
}

r = requests.post("http://localhost:5000/api/control-reclamo/registrar", json=datos)
print("Status:", r.status_code)
print("Respuesta:", r.json())