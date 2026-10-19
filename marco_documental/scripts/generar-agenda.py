#!/usr/bin/env python3
"""scripts/generar-agenda.py — Genera la Agenda Diaria (tipo `agenda`) desde entradas manuales; RETIRADO en M10 D8 (2026-09-15).

Leía los expedientes de la carpeta de correo del despacho (06_gestion_correo), disuelta en M10 D4: los
documentos recibidos son hoy la serie REC del SGDP y las reuniones viven en OpenProject. Se conserva
como referencia del tipo documental; la agenda se escribe a mano sobre templates/agenda/contenido.tex.

Uso:
  scripts/generar-agenda.py [AAAA-MM-DD]        # por defecto: hoy
  scripts/generar-agenda.py 2026-08-18 --build  # ademas compila el PDF
"""
import sys, os, re, glob, datetime, subprocess, shutil

try:
    import yaml
except ImportError:
    sys.exit("Falta pyyaml.  pip install pyyaml")

MDD = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESPACHO = os.path.dirname(MDD)
EXPEDIENTES = os.path.join(DESPACHO, "06_gestion_correo", "02_expedientes")
AGENDAS = os.path.join(MDD, "documentos", "agendas")
TEMPLATE = os.path.join(MDD, "templates", "agenda", "agenda.tex")

DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
         "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
H_INI, H_FIN = 8, 19

PLANTILLA_ENTRADAS = """# Entradas MANUALES de la agenda (lo que NO viene del correo).
# Edite y vuelva a generar la agenda de este dia.
eventos: []          # - {hora: "09:00", titulo: "Reunion de equipo", lugar: "Oficina"}
pendientes: []       # - "Preparar carpeta para las sesiones de comision"
comunicaciones: []   # - "Recordar credenciales para el Palacio Legislativo"
actividades: []      # - "Atencion al publico (manana)"
"""


def esc(s):
    if s is None:
        return ""
    m = {"\\": r"\textbackslash{}", "&": r"\&", "%": r"\%", "$": r"\$",
         "#": r"\#", "_": r"\_", "{": r"\{", "}": r"\}",
         "~": r"\textasciitilde{}", "^": r"\textasciicircum{}"}
    return "".join(m.get(c, c) for c in str(s))


def limpia_md(t):
    t = re.sub(r"\*\*(.+?)\*\*", r"\1", t)
    t = re.sub(r"\[(.+?)\]\(.+?\)", r"\1", t)
    return t.strip()


def fecha_larga(d):
    return f"{DIAS[d.weekday()]} {d.day} de {MESES[d.month]} de {d.year}"


def isodate(v):
    return str(v)[:10] if v not in (None, "") else ""


def carga_expedientes():
    exps = []
    for f in sorted(glob.glob(os.path.join(EXPEDIENTES, "**", "00_RESUMEN.md"), recursive=True)):
        txt = open(f, encoding="utf-8").read()
        if not txt.startswith("---"):
            continue
        try:
            partes = txt.split("---", 2)
            d = yaml.safe_load(partes[1]) or {}
            d["_body"] = partes[2]
        except Exception:
            continue
        exps.append(d)
    return exps


def carga_manual(carpeta):
    p = os.path.join(carpeta, "entradas.yaml")
    if os.path.exists(p):
        try:
            return yaml.safe_load(open(p, encoding="utf-8")) or {}
        except Exception:
            return {}
    os.makedirs(carpeta, exist_ok=True)
    open(p, "w", encoding="utf-8").write(PLANTILLA_ENTRADAS)
    return {}


def acciones_dia(exp, iso):
    res = []
    for line in exp["_body"].splitlines():
        m = re.match(r"\s*-\s*\[ \]\s*(.+)", line)
        if not m or iso not in line:
            continue
        texto = limpia_md(m.group(1))
        texto = re.split(r"\s+—\s+", texto)[0].strip()
        res.append(texto)
    return res


def main():
    argv = sys.argv[1:]
    build = "--build" in argv
    pos = [a for a in argv if not a.startswith("--")]
    d = datetime.date.fromisoformat(pos[0]) if pos else datetime.date.today()
    iso = d.isoformat()
    carpeta = os.path.join(AGENDAS, iso)
    os.makedirs(carpeta, exist_ok=True)

    manual = carga_manual(carpeta)
    exps = carga_expedientes()

    eventos = []
    for e in exps:
        for ev in (e.get("eventos") or []):
            if isodate(ev.get("fecha")) == iso:
                eventos.append({"hora": str(ev.get("hora", "")), "titulo": ev.get("titulo", ""),
                                "lugar": ev.get("lugar", ""), "ref": e.get("exp", "")})
    for ev in (manual.get("eventos") or []):
        eventos.append({"hora": str(ev.get("hora", "")), "titulo": ev.get("titulo", ""),
                        "lugar": ev.get("lugar", ""), "ref": ev.get("ref", "manual")})
    eventos.sort(key=lambda x: x["hora"])

    pend_hoy = []
    for e in exps:
        for t in acciones_dia(e, iso):
            pend_hoy.append((t, e.get("exp", "")))

    cubiertos = {ev["ref"] for ev in eventos} | {x for _, x in pend_hoy}
    pelota = [(e.get("asunto", ""), e.get("exp", "")) for e in exps
              if e.get("estado") == "procesamiento" and e.get("pelota") == "nuestra"
              and e.get("exp") not in cubiertos]

    comu = []
    for e in exps:
        if e.get("categoria") == "comunicado":
            fr = isodate(e.get("fecha_recepcion"))
            if fr and 0 <= (d - datetime.date.fromisoformat(fr)).days <= 2:
                comu.append(e.get("asunto", ""))
    comu += list(manual.get("comunicaciones") or [])

    L = []
    porhora = {}
    for ev in eventos:
        porhora.setdefault(ev["hora"][:2], []).append(ev)
    L.append(r"\bloqueagenda{Cronograma del día}")
    L.append(r"\begin{cronograma}")
    for h in range(H_INI, H_FIN + 1):
        cont = ""
        for ev in porhora.get(f"{h:02d}", []):
            cont += r"\slotevento{%s}{%s}\quad " % (esc(ev["titulo"]), esc(ev["lugar"]))
        L.append(r"\slot{%02d:00}{%s}" % (h, cont))
    L.append(r"\end{cronograma}")

    L.append(r"\bloqueagenda{Reuniones y citaciones del día}")
    if eventos:
        for ev in eventos:
            L.append(r"\reunionbox{%s}{%s}{%s}{%s}" %
                     (esc(ev["hora"]), esc(ev["titulo"]), esc(ev["lugar"]), esc(ev["ref"])))
    else:
        L.append(r"\notabloque{Sin reuniones registradas para hoy.}")
        L.append(r"\rengloneslibres{3}")

    L.append(r"\bloqueagenda{Documentos y pendientes}")
    if pend_hoy:
        L.append(r"\notabloque{Vencen hoy. Marque conforme avance; anote responsable y estado.}")
        for t, exp in pend_hoy:
            L.append(r"\itempendiente{%s}{%s · vence hoy}" % (esc(t), esc(exp)))
    if pelota:
        L.append(r"\notabloque{Otros asuntos con la pelota en el despacho (en curso):}")
        for asunto, exp in pelota:
            L.append(r"\itempendiente{%s}{%s}" % (esc(asunto), esc(exp)))
    for p in (manual.get("pendientes") or []):
        L.append(r"\itempendiente{%s}{}" % esc(p))
    if not (pend_hoy or pelota or manual.get("pendientes")):
        L.append(r"\rengloneslibres{3}")

    L.append(r"\bloqueagenda{Comunicaciones importantes}")
    if comu:
        for c in comu:
            L.append(r"\itemcomunicacion{%s}" % esc(c))
    else:
        L.append(r"\rengloneslibres{2}")

    L.append(r"\bloqueagenda{Actividades del despacho}")
    for a in (manual.get("actividades") or []):
        L.append(r"\itemcomunicacion{%s}" % esc(a))
    L.append(r"\rengloneslibres{4}")

    L.append(r"\bloqueagenda{Registro de acuerdos y seguimiento}")
    L.append(r"\tablaacuerdos")
    L.append(r"\bloqueagenda{Notas y observaciones}")
    L.append(r"\rengloneslibres{6}")

    with open(os.path.join(carpeta, "contenido.tex"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")

    with open(os.path.join(carpeta, "metadata.tex"), "w", encoding="utf-8") as fh:
        fh.write("%% Generado por scripts/generar-agenda.py -- no editar a mano.\n")
        fh.write(r"\setmeta{fecha}{%s}" % fecha_larga(d) + "\n")
        fh.write(r"\setmeta{lugar}{Ayacucho}" + "\n")
        fh.write(r"\setmeta{nombrearchivo}{Agenda diaria %s}" % iso + "\n")

    shutil.copyfile(TEMPLATE, os.path.join(carpeta, "agenda.tex"))

    print("Agenda generada:", os.path.relpath(carpeta, MDD))
    print("  eventos=%d  pendientes_hoy=%d  en_curso=%d  comunicaciones=%d"
          % (len(eventos), len(pend_hoy), len(pelota), len(comu)))

    if build:
        master = os.path.relpath(os.path.join(carpeta, "agenda.tex"), MDD)
        subprocess.run(["bash", os.path.join(MDD, "scripts", "build.sh"), master],
                       cwd=MDD, check=False)


if __name__ == "__main__":
    main()
