import pandas as pd, requests

def to_float(val):
    try:
        s = str(val).strip().replace(',', '.')
        # Si tiene más de un punto, quitar el primero
        partes = s.split('.')
        if len(partes) > 2:
            s = partes[0] + '.' + ''.join(partes[1:])
        return float(s)
    except:
        return 0.0

df = pd.read_excel(u'Z:\\An\u00e1lisis ingreso de lineas por semana\\KPIS Operatividad\\Indicador_-_Operador_LIMPIO.xlsx', sheet_name='DB', engine='openpyxl')
df.columns = df.columns.str.strip()
df['Fecha'] = pd.to_datetime(df['Fecha'], errors='coerce')

registros = []
for _, row in df.iterrows():
    if pd.isna(row.get('Operario')): continue
    registros.append({
        'fecha':      str(row['Fecha'].strftime('%Y-%m-%d')) if pd.notna(row['Fecha']) else '',
        'operario':   str(row.get('Operario','')).strip().upper(),
        'unidades':   to_float(row.get('Unidades confirmadas',0)),
        'lineas':     to_float(row.get('Lineas', row.get('Líneas',0))),
        'u_hora':     to_float(row.get('Unidades / Hora',0)),
        'l_hora':     to_float(row.get('Lineas / Hora', row.get('Líneas / Hora',0))),
        'horas':      to_float(row.get('Total tiempo',0)),
        'dia':        int(row.get('DD',0) or 0),
        'mes_num':    int(row.get('MM',0) or 0),
        'ano':        int(row.get('AA',0) or 0),
        'meta':       to_float(row.get('Meta 500u',500)),
        'desempeno':  str(row.get('Desempeno', row.get('Desempeño','')) or '').strip(),
        'nombre_mes': str(row.get('Nombre Mes','') or ''),
    })

print(f'Registros: {len(registros)}')
res = requests.post('http://localhost:5000/api/sbl2/ingest', json={'registros': registros}, timeout=60)
print(res.json())