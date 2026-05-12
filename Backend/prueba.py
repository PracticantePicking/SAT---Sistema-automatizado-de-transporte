import pandas as pd
import requests
import sqlite3
import datetime

def parse_fecha(v):
    if isinstance(v, (datetime.datetime, pd.Timestamp)):
        return v.strftime('%Y-%m-%d')
    if isinstance(v, str):
        try:
            return pd.to_datetime(v, dayfirst=True).strftime('%Y-%m-%d')
        except:
            return ''
    return ''

def to_float(val):
    try:
        s = str(val).strip().replace(',', '.')
        partes = s.split('.')
        if len(partes) > 2:
            s = partes[0] + '.' + ''.join(partes[1:])
        return float(s)
    except:
        return 0.0

df = pd.read_excel(
    u'Z:\\An\u00e1lisis ingreso de lineas por semana\\KPIS Operatividad\\Indicador_-_Operador_LIMPIO.xlsx',
    sheet_name='DB', engine='openpyxl'
)
df.columns = df.columns.str.strip()
df['fecha_str'] = df['Fecha'].apply(parse_fecha)

col_l = 'Líneas' if 'Líneas' in df.columns else 'Lineas'

print(f'Total filas Excel:    {len(df)}')
print(f'Total unidades Excel: {df["Unidades confirmadas"].sum():.0f}')
print(f'Total líneas Excel:   {df[col_l].sum():.0f}')

registros = []
for _, row in df.iterrows():
    if pd.isna(row.get('Operario')): continue
    registros.append({
        'fecha':      row['fecha_str'],
        'operario':   str(row.get('Operario','')).strip().upper(),
        'tiempo_act': str(row.get('Tiempo de actividad * Hora','')),
        'unidades':   to_float(row.get('Unidades confirmadas',0)),
        'lineas':     to_float(row.get(col_l,0)),
        'u_hora':     to_float(row.get('Unidades / Hora',0)),
        'l_hora':     to_float(row.get('Líneas / Hora', row.get('Lineas / Hora',0))),
        'horas':      to_float(row.get('Total tiempo',0)),
        'u_hora_real':to_float(row.get('Unidades * Hora',0)),
        'l_hora_real':to_float(row.get('Lineas*Hora',0)),
        'dia':        int(row.get('DD',0) or 0),
        'mes_num':    int(row.get('MM',0) or 0),
        'ano':        int(row.get('AA',0) or 0),
        'meta':       to_float(row.get('Meta 500u',500)),
        'meta_proy':  to_float(row.get('Meta proyeccion/Unidades',0)),
        'desempeno':  str(row.get('Desempeño', row.get('Desempeno','')) or '').strip(),
        'nombre_mes': str(row.get('Nombre Mes','') or ''),
    })

# Limpiar BD completamente y recargar
conn = sqlite3.connect('historial.db')
conn.execute('DELETE FROM sbl2_registros')
conn.commit()
conn.close()
print('BD limpia ✓')

res = requests.post(
    'http://localhost:5000/api/sbl2/ingest',
    json={'registros': registros},
    timeout=60
)
r = res.json()
print(f"Insertados: {r['insertados']} | Duplicados: {r['duplicados']}")

# Verificar
conn = sqlite3.connect('historial.db')
total    = conn.execute('SELECT COUNT(*) FROM sbl2_registros').fetchone()[0]
unidades = conn.execute('SELECT SUM(unidades) FROM sbl2_registros').fetchone()[0]
lineas   = conn.execute('SELECT SUM(lineas) FROM sbl2_registros').fetchone()[0]
conn.close()
print(f'BD: {total} registros | Unidades: {unidades:.0f} | Líneas: {lineas:.0f}')
print(f'Excel coincide: {"✅" if abs(unidades - df["Unidades confirmadas"].sum()) < 1 else "❌"}')