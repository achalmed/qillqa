"""Contactos del directorio (2026-10-13, servicios/contactos.py): leer el .vcf del celular y el .csv
de Google Contacts, hallar duplicados (mismo celular, correo o nombre), fusionar sin pisar datos,
exportar a vCard y proponer el remitente de la mesa virtual. Pruebas puras, con datos ficticios."""

from app.servicios import contactos as c

VCF_GOOGLE = (
    "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Rosa María Quispe Huamán\r\nN:Quispe Huamán;Rosa María;;;\r\n"
    "TEL;TYPE=CELL:+51 987 654 321\r\nTEL;TYPE=WORK:(01) 311-7777\r\nEMAIL;TYPE=INTERNET:rosa.quispe@ejemplo.pe\r\n"
    "EMAIL;TYPE=INTERNET:rosamq@correo.test\r\nORG:Gobierno Regional de Prueba;Gerencia de Desarrollo Social\r\n"
    "TITLE:Gerenta regional\r\nCATEGORIES:Gobierno regional,myContacts\r\nNOTE:Conocida en la sesión\\, del 5 de octubre\r\n"
    "END:VCARD\r\n"
    "BEGIN:VCARD\r\nVERSION:3.0\r\nN:Pérez;Juan;;;\r\nitem1.TEL:987-111-222\r\nitem1.X-ABLabel:Móvil\r\nEND:VCARD\r\n"
)

VCF_ANDROID_21 = (
    "BEGIN:VCARD\nVERSION:2.1\nN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Ram=C3=ADrez;Luc=C3=ADa;;;\n"
    "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Luc=C3=ADa Ram=C3=ADrez\nTEL;CELL;PREF:0051966555444\n"
    "TEL;HOME:066-312233\nEND:VCARD\n"
)

CSV_GOOGLE = (
    "First Name,Middle Name,Last Name,Organization Name,Organization Title,Notes,Labels,E-mail 1 - Label,E-mail 1 - Value,"
    "Phone 1 - Label,Phone 1 - Value,Phone 2 - Label,Phone 2 - Value\n"
    "Carlos,,Mamani Ccori,Radio de Prueba,Periodista,,* starred ::: Prensa ::: * myContacts,* Work,carlos@radio.test,"
    "Mobile,+51 955 444 333 ::: 944 000 111,Work,066 555 000\n"
    ",,,Sin Nombre SAC,,,,,,,,,\n"
)


def test_vcard_de_google_lee_nombre_telefonos_correos_y_grupos():
    lista = c.leer_vcard(VCF_GOOGLE)
    assert len(lista) == 2
    r = lista[0]
    assert r["nombre"] == "Rosa María Quispe Huamán"
    assert r["celular"] == "987654321" and r["telefono"] == "(01) 311-7777"
    assert r["email"] == "rosa.quispe@ejemplo.pe" and r["email_alterno"] == "rosamq@correo.test"
    assert r["institucion"] == "Gobierno Regional de Prueba" and r["area"] == "Gerencia de Desarrollo Social"
    assert r["cargo"] == "Gerenta regional"
    assert r["etiquetas"] == ["Gobierno regional"]  # «myContacts» es del sistema de Google
    assert r["notas"] == "Conocida en la sesión, del 5 de octubre"
    # Sin FN: el nombre sale de N; el teléfono con prefijo itemN también se lee.
    assert lista[1]["nombre"] == "Juan Pérez" and lista[1]["celular"] == "987111222"


def test_vcard_21_de_android_con_quoted_printable():
    (r,) = c.leer_vcard(VCF_ANDROID_21)
    assert r["nombre"] == "Lucía Ramírez"
    assert r["celular"] == "966555444" and r["telefono"] == "066-312233"


def test_csv_de_google_con_estrella_y_varios_valores():
    lista = c.leer_csv(CSV_GOOGLE)
    assert [x["nombre"] for x in lista] == ["Carlos Mamani Ccori", "Sin Nombre SAC"]
    r = lista[0]
    assert r["celular"] == "955444333" and r["telefono"] == "944000111"  # el segundo número no se pierde
    assert r["email"] == "carlos@radio.test" and r["cargo"] == "Periodista" and r["institucion"] == "Radio de Prueba"
    assert r["favorito"] is True and r["etiquetas"] == ["Prensa"]


def test_leer_archivo_decide_por_el_contenido():
    assert len(c.leer_archivo("contactos.txt", VCF_GOOGLE.encode())) == 2
    assert len(c.leer_archivo("google.csv", ("﻿" + CSV_GOOGLE).encode("utf-8"))) == 2
    for malo in (b"", b"hola mundo"):
        try:
            c.leer_archivo("x.pdf", malo)
        except ValueError:
            pass
        else:
            raise AssertionError("debió rechazarse")


def test_celulares_y_claves():
    assert c.normalizar_celular("+51 987 654 321") == "987654321"
    assert c.normalizar_celular("0051987654321") == "987654321"
    assert c.normalizar_celular("+1 (555) 123-4567") == "+1 (555) 123-4567"
    assert c.clave_telefono("+51 987 654 321") == c.clave_telefono("987654321")
    assert c.clave_nombre("Pérez Quispe, Juan") == c.clave_nombre("juan perez quispe")
    assert c.clave_nombre("Juan") == ""  # un nombre suelto no basta


DIRECTORIO = [
    {"id": 1, "nombre": "Rosa María Quispe Huamán", "cargo": "Gerenta", "celular": "", "telefono": "", "email": "rosa.quispe@ejemplo.pe", "email_alterno": "", "notas": "", "etiquetas": []},
    {"id": 2, "nombre": "Pedro Condori", "cargo": "", "celular": "987 111 222", "telefono": "", "email": "", "email_alterno": "", "notas": "", "etiquetas": ["Prensa"]},
    {"id": 3, "nombre": "Ana Torres Lima", "cargo": "", "celular": "", "telefono": "", "email": "", "email_alterno": "", "notas": "", "etiquetas": []},
]


def test_previa_marca_duplicados_por_celular_correo_y_nombre():
    leidos = [
        {**c.contacto_vacio(), "nombre": "R. Quispe", "email": "ROSA.QUISPE@ejemplo.pe"},
        {**c.contacto_vacio(), "nombre": "Juan Pérez", "celular": "+51987111222"},
        {**c.contacto_vacio(), "nombre": "Torres Lima Ana"},
        {**c.contacto_vacio(), "nombre": "Nueva Persona", "celular": "955000111"},
        {**c.contacto_vacio(), "nombre": "Otra Vez", "celular": "955 000 111"},
    ]
    filas = c.previa(leidos, DIRECTORIO)
    assert [f["accion"] for f in filas] == ["fusionar", "fusionar", "fusionar", "crear", "omitir"]
    assert filas[0]["duplicado"]["persona_id"] == 1 and filas[0]["duplicado"]["motivo"] == "mismo correo"
    assert filas[1]["duplicado"]["persona_id"] == 2 and filas[1]["duplicado"]["motivo"] == "mismo celular"
    assert filas[2]["duplicado"]["motivo"] == "mismo nombre"
    assert filas[4]["repetido_de"] == 3  # repetido dentro del mismo archivo


def test_fusionar_solo_rellena_lo_vacio_y_respeta_lo_protegido():
    p = DIRECTORIO[1]
    cambios = c.fusionar(p, {"celular": "944333222", "email": "pedro@radio.test", "cargo": "Editor", "notas": "Llamar en la tarde", "etiquetas": ["prensa", "Radio"]})
    assert "celular" not in cambios and cambios["telefono"] == "944333222"  # el celular nuevo va al fijo libre
    assert cambios["email"] == "pedro@radio.test" and cambios["cargo"] == "Editor"
    assert cambios["notas"] == "Llamar en la tarde"
    assert cambios["etiquetas"] == ["Prensa", "Radio"]  # sin repetir «prensa»
    assert c.fusionar(p, {"cargo": "Editor"}, protegidos={"cargo"}) == {}
    # Un dato que ya tiene no se pisa ni se duplica.
    assert c.fusionar(DIRECTORIO[0], {"email": "rosa.quispe@ejemplo.pe", "cargo": "Otra"}) == {}


def test_institucion_por_nombre_o_siglas_sin_adivinar():
    insts = [{"id": 1, "nombre": "Gobierno Regional de Prueba", "siglas": "GRP"}, {"id": 2, "nombre": "Municipalidad X", "siglas": ""},
             {"id": 3, "nombre": "Municipalidad X", "siglas": ""}]
    assert c.institucion_por_nombre("gobierno regional de prueba", insts)["id"] == 1
    assert c.institucion_por_nombre("GRP", insts)["id"] == 1
    assert c.institucion_por_nombre("Municipalidad X", insts) is None  # dos iguales: no se adivina
    assert c.institucion_por_nombre("", insts) is None


def test_exportar_vcard_y_volver_a_leerlo():
    texto = c.a_vcard([{"nombre": "Rosa María Quispe; Huamán", "cargo": "Gerenta, regional", "institucion_nombre": "Gobierno Regional de Prueba",
                        "celular": "987654321", "telefono": "066312233", "anexo": "12", "email": "rosa@ejemplo.pe", "etiquetas": ["Gobierno regional"],
                        "notas": "Línea uno\nLínea dos " + "x" * 120}])
    assert "TEL;TYPE=CELL:+51987654321" in texto and "\r\n" in texto
    assert all(len(linea.encode()) <= 75 for linea in texto.split("\r\n"))
    (r,) = c.leer_vcard(texto)
    assert r["nombre"] == "Rosa María Quispe; Huamán" and r["cargo"] == "Gerenta, regional"
    assert r["celular"] == "987654321" and r["email"] == "rosa@ejemplo.pe" and r["etiquetas"] == ["Gobierno regional"]
    assert r["notas"].startswith("Línea uno\nLínea dos")
    assert c.a_vcard([]) == ""


def test_propuesta_del_remitente_de_la_mesa_virtual():
    natural = c.propuesta_remitente({"tipo_persona": "natural", "nombre": "Ana Torres Lima", "telefono": "+51955000111", "correo": "ANA@correo.test",
                                     "doc_numero": "12345678"})
    assert natural["institucion"] is None
    assert natural["persona"] == {"nombre": "Ana Torres Lima", "cargo": "", "celular": "955000111", "email": "ana@correo.test", "etiquetas": ["Mesa de Partes"]}
    juridica = c.propuesta_remitente({"tipo_persona": "juridica", "nombre": "Asociación de Prueba", "doc_numero": "20123456789", "representante": "Luis Soto",
                                      "cargo": "Presidente", "telefono": "966111222", "correo": "", "direccion": "Jr. Falso 123"})
    assert juridica["institucion"]["ruc"] == "20123456789" and juridica["institucion"]["direccion"] == "Jr. Falso 123"
    assert juridica["persona"]["nombre"] == "Luis Soto" and juridica["persona"]["cargo"] == "Presidente"
    # El documento de identidad no pasa al directorio.
    assert "12345678" not in str(natural)
    # La persona propuesta se halla en el directorio por el mismo índice de la importación.
    assert c.Indice(DIRECTORIO).buscar(natural["persona"]) == (3, "nombre")
