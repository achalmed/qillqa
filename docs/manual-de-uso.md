---
tipo: doc
titulo: "Manual de uso de Qillqa: operación (encender, compartir, cuentas, respaldos) y uso diario"
estado: activo
---
# Manual de uso de Qillqa

Dos partes: **A. Operación**, para quien administra el sistema en la laptop-servidor, y **B. Uso
diario**, para el equipo del despacho (puede copiarse desde ahí y enviarse). Los comandos son los
del README (`README.md` §Uso); este manual dice cuándo y por qué se usan. Nada aquí es de un
despacho concreto: las cuentas, el enlace y la dirección del servidor viven en
`<despacho>/operaciones/qillqa/README.md`.

## Parte A — Operación

### 1. Qué es

Una página web para que el equipo del despacho genere los documentos oficiales (oficios,
memorandos, informes, solicitudes, actas) desde el navegador, **sin tocar LaTeX**. El formato
(membrete, sello, firma) lo pone el Marco Documental (`../qillqasqa/marco_documental/`) con el perfil del
despacho (`MDD_PERFIL`); las personas solo escriben el contenido.

### 2. Requisitos (una sola vez)

- **Docker** (para la base de datos): `sudo apt install docker.io docker-compose-v2 && sudo usermod -aG docker $USER`
  (cerrar sesión y volver a entrar).
- **Node.js** (nvm) y **Python 3** para la web y la API.
- **TeX Live** con LuaLaTeX en el host (modo laptop) o la imagen `latex/` (modo completo).
- Un `.env` a partir de `.env.example` con las claves y las rutas del despacho (`MDD_RUTA`,
  `MDD_PERFIL`, `MDD_DOCUMENTOS`, `BOOKMARKS_RUTA`, `JWT_SECRET`, `VITE_NOMBRE_DESPACHO`,
  `ADMIN_USUARIO`). La API crea esa cuenta administradora al arrancar si no existe, con el
  usuario como clave inicial: entrar y cambiarla es lo primero.

### 3. Encender y apagar

`./iniciar.sh` levanta base de datos, API y web y al final imprime las direcciones (en esta
laptop, `http://localhost:5173`; en la misma red WiFi, `http://<IP-de-la-laptop>:5173`, IP que
puede cambiar al reconectar). La primera vez tarda más (instala dependencias). `./detener.sh`
apaga API y web; `./detener.sh --todo` apaga también la base de datos. Si la laptop se suspende,
API y web mueren: volver a `./iniciar.sh` (idempotente).

### 4. Compartir con el equipo (enlace permanente)

`./instalar_enlace_fijo.sh`, una sola vez: instala Tailscale, conecta la laptop a la cuenta del
despacho, publica el sistema con Funnel en una dirección **fija** `https://<laptop>.<red>.ts.net`
y deja el arranque automático (`qillqa.service`, ver `sistema/README.md`). Desde entonces el enlace
es siempre el mismo, se manda una vez, se publica solo al encender la laptop y vuelve a responder
solo cuando vuelve el internet. Con la laptop apagada, nadie entra. Todo va cifrado (HTTPS), sin
abrir puertos del router y detrás de usuario y contraseña. Detalle y aviso opcional por Telegram
(`TELEGRAM_TOKEN`, `TELEGRAM_CHAT` en `.env`): `docs/acceso-permanente.md`.

| Para… | Comando |
|---|---|
| Ver cuál es el enlace | `./enlace.sh --ver` |
| Publicar a mano | `./enlace.sh` |
| Dejar de publicar (el enlace queda reservado) | `./enlace.sh --apagar` |
| Ver si el arranque automático está bien | `systemctl --user status qillqa.service` |
| Túnel temporal de respaldo (enlace nuevo cada vez) | `./compartir.sh` |

### 5. Cuentas y contraseñas

Cada persona tiene una **cuenta propia** con su cargo; del cargo salen los permisos
(`../qillqasqa/qillqasqa/flujo.py`): **Administrador**, todo (eliminar, convertir documentos del archivo,
gestionar cuentas y directorio); **Diputado** y **Asesor**, revisar, observar y aprobar;
**Secretaría**, redactar, generar, enviar y registrar cargos. «Administrador del sistema» es una
casilla aparte, no un cargo.

- **Crear una cuenta** (Administración): nombres, apellidos, DNI y cargo. El sistema genera el
  correo institucional (inicial del primer nombre + primer apellido + dominio del Congreso) y el
  usuario (parte local del correo); todo se puede escribir a mano. La **contraseña inicial es el
  DNI** (o el usuario, si no hay DNI) y sirve una sola vez: al primer ingreso el sistema obliga a
  elegir una propia (mínimo 8 caracteres, distinta del DNI y del usuario).
- **Repartir el primer acceso**: al crear la cuenta (o con el ícono **Compartir** de su fila) sale el
  mensaje listo para pegar en WhatsApp o Telegram: saludo, enlace, usuario, contraseña temporal y los
  pasos. Si prefiere mandar la contraseña por otro canal, use «Solo la contraseña». Al entrar, la persona elige la suya
  y nadie más —ni el administrador— la conoce. Un chip «clave temporal» marca a quien aún no lo
  hizo. **Si alguien la olvida**, se restablece con la misma llave.
- **Datos al primer ingreso**: después de elegir su contraseña, la persona confirma nombres, celular,
  correo y cargo (paso 2 de 2) y recién entra; el chip «datos pendientes» marca a quien le falta. No se
  pide a los cargos marcados en Administración → Cuentas → «Datos al primer ingreso» (de fábrica,
  Diputado). Al editar una cuenta, «Pedirle que confirme sus datos al entrar» lo vuelve a pedir.
- **Módulos** (Administración → Módulos): cada uno se apaga con su interruptor y su mensaje. Apagado,
  sale del menú de todos y su página muestra el mensaje; se enciende en el mismo lugar. Gestión
  documental, Directorio y Administración no se apagan.
- **La propia contraseña** se cambia pulsando el nombre en la barra superior. Cambiar la del
  administrador nada más instalar: con el enlace público es lo primero que alguien probaría.

### 6. Mantenimiento

- **Respaldos**: `./respaldar.sh` guarda un volcado de la base en `respaldos/` (enlace a
  `<despacho>/operaciones/qillqa/respaldos/`). Los PDF y `.tex` viven en el archivo documental
  (`MDD_DOCUMENTOS`): copiarlo también a un disco externo cada cierto tiempo. La instalación del
  despacho programa `respaldar.sh` a diario (`cron`, con rotación; lo documenta el README de su
  carpeta operaciones/qillqa),
  pero el destino sigue en la misma laptop: el respaldo fuera de la máquina está pendiente
  (`docs/decisiones.md` §Pendientes).
- **Registros**: `api.log` (en `logs/`) (API), `web.log` (en `logs/`) y `web-build.log` (en `logs/`) (web), `colab.log` (en `logs/`) (edición
  simultánea), `arranque.log` (en `logs/`) (arranque automático); hasta la ola 9 estaban en la raíz del repo.
- **Actualizar**: detener, traer los cambios (`git pull`), volver a `./iniciar.sh`. No reiniciar
  en horario de trabajo sin avisar (las pestañas abiertas deben recargar).

### 7. Problemas comunes

| Síntoma | Solución |
|---|---|
| «No se pudieron cargar los documentos», chips en rojo | La API o la BD no están corriendo: `./iniciar.sh` de nuevo. |
| El equipo no puede entrar | `./enlace.sh --ver`; la laptop debe estar encendida (no suspendida) y con internet. Si aún no se instaló el enlace fijo, `./instalar_enlace_fijo.sh`. |
| «Failed to fetch» al pulsar Ingresar | Es un fallo de red (servidor caído), no de contraseña: la pantalla la sirvió el modo sin conexión. |
| El PDF tarda ~15 segundos | Normal: LaTeX arma el documento con el membrete real. |
| «El enlace no es una dirección web válida» | Una dirección tenía caracteres no permitidos; usar una `http(s)` normal. |
| Se cerró la laptop y todo se apagó | `./iniciar.sh`. Los datos no se pierden (BD y disco). |
| La web no sube tras encender | Mirar `web-build.log` (en `logs/`) (suele ser `npm` fuera del PATH del servicio). |
| La aplicación se queda en la pantalla de carga (vino, con la hoja) | Esperar: a los 15 s ofrece «Reintentar». Si sigue igual y hay internet, «Reparar la aplicación» vuelve a bajarla (no borra datos ni lo pendiente de enviar). Una publicación ya no deja la aplicación en blanco (`docs/arquitectura.md` §31). |
| «Edición simultánea no disponible» en un proyecto | El servidor de colaboración no corre: mirar `colab.log` y `./iniciar.sh`. Mientras tanto se escribe por turnos y nada se pierde; la página vuelve sola al modo compartido. |

### Aviso a todos (antes y después de una actualización)

Una actualización en horario de trabajo va en este orden (Edison 2026-10-05):

1. **Avisar que guarden**: `scripts/aviso.sh "En 3 minutos se actualizará el sistema. Por favor GUARDE AHORA lo que
   está editando y no cierre la pestaña." --accion entendido`.
2. **Esperar** esos minutos (`tail -f` sobre `api.log` en `logs/` muestra los guardados que siguen llegando).
3. **Publicar**: la web con `( cd frontend && npm run build )` y la API reiniciándola
   (`kill $(pgrep -f "[u]vicorn app.main:app") && ./iniciar.sh`); comprobar `/api/health`.
4. **Pedir que recarguen**: el aviso con `--accion recargar` (abajo), que reemplaza al del paso 1.

Si alguien no alcanzó a guardar, el editor de documentos conserva una copia en su navegador y las partes del
proyecto de ley se guardan solas y reintentan al volver el servidor.

Publicar no deja a nadie en blanco: quien tenga el sistema abierto sigue trabajando con la versión anterior y
quien lo abre recibe la nueva; el celular la guarda entera para abrir sin red. Si se cambió `frontend/vite.config.ts`
o `frontend/vite.publicacion.ts`, además hay que reiniciar la web (`./iniciar.sh`).

Después de publicar una versión, las pestañas abiertas siguen con la anterior hasta recargar. Para pedírselo
a todos: en **Administración → Avisos**, botón «Recargar ahora», o desde la terminal
`scripts/aviso.sh "Llegó una actualización: recargue la página." --accion recargar`. Sale en el centro de la
pantalla de cada persona; con `--accion entendido` es un aviso que solo se lee. Uno vigente a la vez (publicar
otro retira el anterior), vence a las 24 h; `scripts/aviso.sh --retirar` lo quita antes.

## Parte B — Uso diario

> Copie desde aquí para enviarlo al equipo.

### Cómo entrar

1. Abra el navegador (Chrome) y vaya al **enlace del despacho** (el enlace permanente
   `https://<laptop>.<red>.ts.net` que le pasaron una sola vez). Funciona desde cualquier
   lugar con internet.
2. Escriba su **usuario** (o su correo institucional) y su **contraseña** y pulse
   **Ingresar**. La primera vez la contraseña es temporal (la entrega quien administra el
   sistema): al pulsar Ingresar se abre sola la pantalla «Elija su contraseña», con la
   temporal ya escrita; basta escribir la nueva dos veces. Si Chrome muestra un aviso de
   «contraseña insegura» o «filtrada», se refiere a la temporal: ciérrelo y siga.
3. Se abre el **menú principal** (Inicio): cada módulo —Gestión documental, Proyectos de ley,
   Semana de representación, Directorio— con sus accesos directos, y arriba lo que le toca.
   - **☰** (arriba a la izquierda) abre el menú con todos los módulos desde cualquier pantalla.
   - Debajo de la barra están las **opciones del módulo** en el que está (en la gestión
     documental: Bandeja, En revisión, Por firmar, Nuevo documento…); dentro de un proyecto,
     sus pestañas (Texto, Ficha y equipo, Fases y tareas…).
   - Sus iniciales (arriba a la derecha) llevan a «Cambiar mi contraseña» y «Salir».
   - **En el celular** abajo hay una barra con Inicio · Documentos · Mesa de Partes · Chat · Agenda · Más.
     En un documento o un proyecto, arriba sale un conmutador (Redactar / Vista PDF; Partes /
     parte / PDF). Si el teléfono no muestra el PDF dentro de la página, pulse **Abrir PDF**.
   - **En el celular y la tableta** las opciones del módulo no van en pestañas: el **botón redondo
     de abajo a la derecha** (el mismo del chat) abre una hoja con las secciones (círculos vino) y
     las acciones (círculos dorados: Nuevo documento, Nueva tarea…); la sección en la que está lleva
     un anillo. Arriba se lee dónde está: «Documentos · Bandeja». En el Chat ese botón es
     «Nueva conversación». En la computadora las pestañas siguen bajo la barra.
   - Los diálogos salen en el celular como **hoja desde abajo**, a lo ancho; las ayudas («?»),
     igual, en pocas líneas.

### Proyectos de ley: título y estructura

- Al abrir una parte se queda en modo escribir sola (si nadie más la tiene).
- **Título de la ley**: elija su forma («Ley que modifica…», «Ley de…», «Ley Orgánica de…»…) y
  escriba lo que sigue; debajo se ve cómo saldrá. Ese título es el del PDF y el del proyecto.
- Las partes del articulado y de las disposiciones traen su **estructura base**: complete lo que
  está [entre corchetes]. **Estructura** agrega Libro, Sección, Título, Capítulo, Subcapítulo,
  Artículo o Disposición con su número, y **Renumerar todo** rehace la numeración.
- **Eliminar** (papelera en la cabecera): el administrador, o el responsable mientras el proyecto
  está en borrador. El proyecto se retira de las listas; sus versiones y archivos se conservan.

### Cómo crear un documento

> Arriba de la bandeja están las **etapas** (Borradores, En revisión, Observados, Por firmar, Por
> enviar, Enviados y **A mi cargo**): un toque muestra solo esos. Dentro de un documento, el recuadro
> **«Siguiente paso»** dice qué toca ahora y trae su botón, y el índice (Seguimiento · Datos · Cuerpo ·
> Anexos · Archivos y firmado) lleva a cada parte del formulario.

1. En **Gestión documental** pulse **«Nuevo documento»** y elija el tipo (Oficio, Oficio múltiple,
   Carta, Memorando, Informe, Solicitud o Acta).
2. Llene los datos del formulario a la izquierda (destinatario, asunto,
   etc.). La **fecha** ya viene con la de hoy; puede cambiarla. Para enviar: el botón **«Mesa de
   partes»** de la barra (cuando el documento ya tiene número; también en «Más acciones») muestra la
   mesa de partes de cada destinatario: «Abrir mesa de partes» y copiar el enlace; si la institución no
   la tiene, «Añadir» la guarda en el directorio para todos (la lupa la busca en la web). Desde la
   lista, el ícono de bandeja de «Institución destino» (o «⋮ → Mesa de partes del destinatario» en el
   celular) la abre sin abrir el documento; en el Directorio, «⋮ → Mesas de partes que faltan» lista
   las que aún no están, con los documentos que van a ellas.
3. Escriba el **cuerpo** en el editor, como en Word: hay botones para
   **negrita**, cursiva, subrayado, viñetas, listas numeradas y **alfabéticas** (a), b), c); Tab
   dentro de una lista crea una sublista), sangría, enlaces, notas al pie y **tablas** (clic
   derecho sobre una tabla: alinear, filas, columnas; dentro de una celda funcionan los mismos
   botones). En «⋯»: alineación, tipo de sangría, títulos y **salto de página**. Es la misma barra
   en los oficios, cartas, informes y en las partes de un proyecto de ley.
   - Puede **copiar y pegar desde Word o Excel** (incluso tablas): se
     acomodan solas.
4. **Se guarda solo**: a los pocos segundos de dejar de escribir, el sistema guarda y la vista
   previa (el PDF de la derecha) se pone al día; no hay que pulsar nada. **Guardar** (o Ctrl+S)
   lo hace al instante. En un documento firmado no se guarda solo: guardar anularía la firma y
   eso se decide con Guardar.

### Si el documento se hizo en Word (sistema caído)

Si el sistema no estuvo disponible y el oficio se redactó y numeró en Word,
no hay que volver a escribirlo: **«Nuevo documento» → «Incorporar documento
elaborado fuera del sistema…»**.

1. Elija el tipo y escriba el **número impreso** en el documento. El
   sistema le dice qué número espera (el siguiente de la serie): si el suyo
   no es ese, es porque falta uno antes —incorpórelo primero— o porque ya
   existe.
2. Si un número **se saltó** (nadie lo usó), marque «Este número NO se
   utilizó» y escriba el motivo: queda reservado y archivado, y la
   numeración sigue sin huecos.
3. Elija el **PDF** (exportado desde Word) y transcriba destinatario, asunto
   y fecha tal como figuran en el papel: son los datos de la bandeja; el PDF
   no se toca.
4. **Incorporar**. El documento entra ya numerado y pendiente de firma:
   desde ahí se carga el firmado, el cargo de recepción y el registro en el
   STD como con cualquier otro.

Su contenido no se edita en la plataforma. Si hay que corregirlo, corríjalo
en Word y use **«Reemplazar PDF»** en el documento (si ya estaba firmado,
habrá que firmarlo de nuevo). Sus datos de bandeja sí se corrigen con
«Guardar datos».

### Guardar, generar y enviar

- **Guardar**: guarda un borrador para seguir después (no le asigna
  número).
- **Generar oficial**: le pone el **número oficial** correlativo y arma
  el PDF definitivo. *Esto no se puede deshacer* (el número queda
  reservado), así que revise bien antes.
- **Descargar**: baja el PDF para imprimir o enviar.

No hace falta que aprenda LaTeX, ni Markdown, ni nada técnico. Todo el
formato (membrete, sello, firma) lo pone el sistema.

**Enviar.** El botón «Enviar» abre la mesa de partes del destinatario (con la extensión, el panel con
los datos aparece dentro) para hacer el envío; el documento pasa a **enviado** cuando se sube el cargo de
recepción. En un documento interno del Congreso, «Enviar» abre el STD de la intranet (el administrador
fija el enlace en Administración) y pasa a enviado al registrar el n.º del STD; no lleva cargo.

**Enviar a revisión.** Abre una ventana para elegir quién revisa y dejarle una nota; esa persona recibe
el aviso y el documento queda a su cargo.

**Formato.** En «Formato general», si el sistema tuvo que apretar algo para que la firma no quedara sola,
el valor que usó sale en rojo junto al control («En el PDF: 10,5 pt»). Para que mande lo elegido:
«Si la firma queda sola» → «No tocar».

**La extensión aprende.** Al enviar un formulario en una mesa de partes, si llevaba usuario y
clave y no coinciden con lo guardado, en Contraseñas aparece «La extensión vio un ingreso…» con
«Guardar la clave» o «Descartar» (solo el administrador). Lo que se escribió a mano en el
formulario queda aprendido para esa mesa: el siguiente «Autocompletar formulario» lo usa.

**Firmados que vuelven en el USB.** Si el firmador deja «…[R].pdf» junto a los originales en la carpeta
sincronizada, al pulsar «Sincronizar ahora» esos firmados se incorporan solos a sus documentos y se
apartan a la carpeta *.qillqa-importados*; lo que no se pudo identificar queda donde estaba, con el motivo.

**Varios documentos.** En la bandeja, al marcar varios: «Qué bajar» elige PDF, firmados, cargos o
expedientes, y «Comparar» los muestra lado a lado (hasta cuatro).

### Si cambia un documento ya firmado o uno de sus adjuntos

- **Editar el texto, la fecha o el formato** de un documento firmado anula
  la firma: el sistema lo avisa antes («Este cambio anula la firma…») y, si
  acepta, el firmado pasa a «anulados», el documento vuelve a «pendiente de
  firma» y hay que volver a firmarlo. Los cargos de recepción y el registro
  en el STD de la versión anulada se conservan como historia, pero **ya no
  cuentan**: hay que volver a entregarlo y a registrarlo.
- **Cambiar el nombre de un adjunto, agregar o quitar uno** también anula la
  firma: ese nombre sale en la línea «Adj.» del documento firmado.
- **Reemplazar el archivo de un adjunto** (otra versión del mismo informe,
  botón «Reemplazar archivo» en Anexos) **no** anula la firma, pero el
  expediente queda «desactualizado»: vuelva a armarlo antes de enviarlo.
- Cargar el archivo de un adjunto que estaba escrito «solo en papel», con el
  mismo nombre, no anula nada.
- Si ve «Expediente desactualizado: vuelva a armarlo», el sistema dice por
  qué (se quitó, se agregó o cambió un adjunto; la firma se anuló). Pulse
  «Volver a armar».

### Qué significa cada cosa en el seguimiento

**La ruta (pasos 1 a 8)** es el orden del trámite y es la única numeración del
sistema: 1 Redactar y guardar · 2 Vista previa (opcional, punteado) · 3 Enviar
a revisión · 4 Generar oficial · 5 Firmar · 6 Enviar · 7 Cargo de recepción ·
8 Registrar en el STD. Los campos del formulario son sub-numerales del paso 1
(1.1 Destinatario, 1.2 Asunto, …, 1.6 Cuerpo, 1.7 Anexos). El círculo relleno
es el paso que toca; el check, lo hecho. «Redactar» se da por hecho solo cuando
el documento GUARDADO tiene asunto y texto.

**El estado** dice en qué punto del ciclo está el documento. Lo mueve el
sistema con las acciones o el botón de estado de la barra:

| Estado | Qué significa | Cómo se llega |
|---|---|---|
| Borrador | Se está redactando | Al crear; o al devolverlo el revisor |
| En revisión | El diputado o un asesor lo revisa | «Enviar a revisión», o solo al abrirlo el revisor |
| Observado | Hay correcciones pendientes (antes de numerar) | Al registrar una observación; vuelve a «En revisión» al atenderlas todas |
| Aprobado | Tiene número y espera firma | «Generar oficial» |
| Firmado | Firmado, listo para salir | Al subir el documento firmado |
| Enviado | Salió del despacho | Solo, con firmado + cargo (o STD si es interno); o a mano |
| Observado posterior | Observación surgida después de enviado | Al registrar una observación; vuelve a «Enviado» al atenderla |
| Archivado | Trámite cerrado | A mano; un documento numerado nunca se borra |

**Responsable** es quién tiene el documento en mano (a quién se le encargó).
«Sin asignar» = nadie lo tiene encargado. No cambia el estado: dice quién debe
dar el siguiente paso.

**Interno / externo**: si va a una oficina del Congreso circula por el STD y
no lleva cargo de recepción; si va a una entidad de fuera, sí.

**Observaciones**: se escriben junto al campo o sección que hay que corregir
(icono de comentario al lado). Una observación pone el documento en
«Observado» y avisa al responsable (campana de la barra). Quien corrige marca
«subsanada»: el documento vuelve a revisión y quien observó recibe el aviso
para revisar la nueva versión y decir «Conforme» o «Sigue pendiente» (esto
último la reabre). Todo queda en el historial.

**Copias**: se ordenan solas según el orden institucional (Oficialía Mayor →
Mesa Directiva → comisión → grupo parlamentario → oficina de enlace →
Defensoría). **Expediente**: el documento principal es el firmado; si aún no
hay, el archivo queda marcado «(SIN FIRMA)».

**Documentos recibidos y relacionados**: *Internos* son otros documentos del
despacho ligados a este (se vinculan solos al citarlos en 1.3 Referencia; el
despacho no se responde a sí mismo). En 1.3 Referencia se busca como en el cuerpo: «Oficio 95», «Ley
27795», «@persona» o palabras del asunto, con la lista de normas, documentos, proyectos y personas; si lo
elegido es un **documento recibido**, aparece «¿Este documento le responde?» y **«Sí, le responde»** lo
vincula como «Responde a» con un clic (nunca se marca solo). *Externos* son los de otras entidades:
«Respondido por» = la entidad contestó este documento; «Responde a» = este
documento contesta a uno recibido.

### Cosas útiles

- La **bandeja** (pantalla principal) lista todos los documentos. Puede
  **buscar** por número, asunto o destinatario, y **filtrar** por tipo y
  por estado.
- El **estado** de cada documento (Borrador, En revisión, Aprobado,
  Firmado, Enviado, Archivado) se cambia con el botón de estado dentro
  del documento.
- El **historial** (icono de reloj) muestra quién hizo qué y cuándo; la columna
  **Procesado por** de la bandeja dice quién creó cada documento (todos los roles la ven,
  salvo el invitado).
- **Seguimiento** es la segunda columna de la bandeja (icono de lista con check): abre
  observaciones, encargo y ruta del trámite sin entrar al documento. Con pendientes se
  enciende y lleva el número.
- **Equipo en línea**: en la barra superior, junto a la campana, las iniciales de quienes
  están trabajando ahora (punto verde = en línea, ámbar = ausente). Un clic muestra a todo el
  equipo, qué documento tiene abierto cada uno y cuándo se le vio por última vez. Dentro de un
  documento, «También aquí: …» avisa que otra persona lo tiene abierto: guarden por turnos.
- **Inicio** reúne lo de cada persona: arriba, **Mis tareas** (las tareas de proyectos a su cargo y
  las partes que redacta y aún no se aprueban, con su plazo; un clic abre el proyecto). La tarjeta
  **Informes de representación** muestra cada semana y la versión vigente de su informe (a dos
  columnas y a una, para el teléfono); la edición interna no se publica por la web.
- **Vista previa de un proyecto de ley**, como en los documentos: en la pestaña «Texto», a la derecha.
  Mientras escribe una parte, «Vista previa» muestra cómo queda con lo que lleva, aunque no lo haya
  guardado; «Guardar» crea la versión y refresca la vista. La vista previa no numera ni queda
  registrada: el PDF que se conserva es el de «Generar PDF», que también se ve ahí mismo. El título
  de la ley sale de su parte «Título de la ley».
- **Informes de representación**: se leen a la derecha de la lista, dentro del sistema.
- **Semana de representación, de punta a punta** (2026-10-02): todo el trabajo de la semana se hace en
  el módulo, en este orden: **Nueva semana** (tema y periodo; el sistema copia la plantilla del
  despacho) → **Datos de la semana** (ámbito, equipo, oficios de convocatoria y los días del
  recorrido) → **Actividades** por día (lugar, horas, participantes, hallazgos) → **Pedidos** (con su
  actividad, entidades del directorio, prioridad, responsable y plazo) → **Fotos** (se suben al banco
  de la semana; la estrella elige las que van al informe) → **Textos del informe** (presentación,
  una crónica por día, compromisos, conclusiones) → **Generar informe**. Las cifras no se escriben:
  el informe las calcula de lo registrado. «Generar borrador» tarda menos de un minuto y deja las
  dos versiones (revista y celular); «Aprobar versión…» (diputado o administrador) genera la versión
  limpia y la registra en la gestión documental como el ISR de la semana, donde se firma, se carga
  el cargo de entrega y se registra en el STD.
- **Vista previa del informe** (en «Textos del informe»): a la derecha, como en los proyectos de ley,
  el informe tal como va —con lo escrito aunque no esté guardado—; tarda menos de un minuto y avisa
  cuando quedó atrás. No numera ni crea versión: el PDF que queda es el de «Generar informe». En el
  celular, «Redactar | Ver el informe». Lo que la semana ya sabe no se vuelve a escribir: días,
  título, periodo y ámbito salen de «Datos de la semana»; el equipo, de la semana anterior.
- **Desde una actividad**, «Pedido de esta actividad» abre el pedido con la actividad puesta.
- **Derivar un pedido**: en el pedido, «Derivar con oficio» crea el oficio en borrador con el pedido
  ya escrito y lo deja enlazado (el pedido pasa a «derivado»); «Oficio existente» enlaza uno que ya se
  emitió (p. ej. OF-0100). El pedido muestra el número del oficio cuando se genera.
- **El ISR ya no está en «Nuevo documento»** de la gestión documental: nunca pudo redactarse allí. Se
  numera y se registra desde su semana; la bandeja lo sigue mostrando para la firma, la entrega y la
  trazabilidad. Las semanas hechas antes con los YAML se traen al sistema con «Traer al sistema»
  (administrador); desde entonces sus YAML se reescriben al generar desde la web.
- **Cómo sale el PDF de un proyecto de ley** (revisión 2026-10-01): letra un punto menor que los
  oficios, párrafos sin sangría, incisos (a), 1., i)) con sangría completa, título en bloque
  justificado como en el proyecto presentado, la exposición de motivos en hoja nueva y numerada
  como la numera el texto (I.17, II, III…), el lugar de las firmas en blanco (sin nombres ni
  rótulos), las tablas repartidas según su contenido y las direcciones web de las notas cortadas
  dentro del margen. En el editor, «Título de artículo, disposición o apartado» (en «⋯») marca
  esos títulos.
- **Al entrar a un proyecto de ley el PDF ya está a la vista** (como en los documentos): el último
  generado si sigue al día con el texto; si no, la vista previa se compone sola. A la derecha, tres
  pestañas: *Vista previa*, *Generado* y *Firmado*.
- **Proyecto firmado**: botón «Firmado» del visor; solo PDF. Cada firmado queda como versión (nunca
  reemplaza al anterior), con su huella SHA-256, y la cabecera avisa si el texto cambió después de
  firmar («Firmado desactualizado»).
- **Ficha del proyecto**: se elige, no se escribe. Autor (viene del perfil del despacho), grupo
  parlamentario, cámara, comisiones (las 16 ordinarias de la Cámara de Diputados) y firmas de
  respaldo (diputados del directorio) son desplegables; los documentos de Qillqa se vinculan con un
  buscador. Si falta una opción, se puede escribir.
- **Edición simultánea**: el interruptor está en la cabecera del proyecto y dice su estado
  («Encendida» en verde / «Apagada»).
- **Encargos con aviso**: al asignar una parte, una fase o una tarea (cada tarea tiene su
  «Responsable»), la persona oye un tono, ve el aviso arriba a la derecha y, al pulsar «Abrir», llega
  directo a esa parte o tarea. «Mis tareas» en Inicio también lleva al lugar exacto.
- **Edición simultánea en un proyecto** (como Google Docs): en la pestaña «Texto», el interruptor
  «Edición simultánea» de arriba a la izquierda. Encendido, varias personas escriben a la vez en la
  misma parte, sin «Escribir» ni candado, y cada una ve el cursor y el nombre de las demás. Lo que se
  escribe se conserva solo (un punto naranja junto a la parte avisa que hay texto sin versionar);
  «Guardar versión» crea la versión con nota, como siempre. La vista previa muestra lo de todos; el
  PDF generado, solo lo guardado como versión. Para apagarlo hay que guardar antes cada parte con
  punto naranja. Restaurar una versión reemplaza el texto de todos (pide confirmación).
- **Edición simultánea en un documento** (oficio, memorando, informe…): botón «Editar en simultáneo»
  arriba del formulario, junto a «Última edición». Guarda lo que haya en la pestaña y, desde ahí,
  quienes abran el documento escriben a la vez el cuerpo y los datos (asunto, destinatario, fecha…),
  con el cursor y el nombre de cada una; la marca «En vivo · con …» dice quién está. «Guardar» guarda
  lo de todos y regenera el PDF. Solo en borradores y numerados sin firmar: al firmar o enviar vuelve
  sola a la edición por turnos. Las figuras y tablas de anexos no se ven en vivo: se comparten al
  guardar. «Apagar» guarda y vuelve a los turnos. Si el servidor compartido no responde, la pestaña
  sigue por turnos sin perder nada y ofrece «Reintentar en simultáneo».
- **Fuentes enlazadas** de un proyecto: **Buscar en Zotero** (título, autor o año; `#etiqueta`;
  `@clave`) llena la referencia con la que formatea Zotero y la enlaza por `zotero:<clave>`; si Zotero
  tiene el archivo en la biblioteca Calibre, la fuente muestra `calibre:N` (dónde está el archivo). En
  «Referencia» también puede escribir una clave — `zotero:ABCD1234` (una obra de Zotero),
  `calibre:10086` (un archivo de la biblioteca), `datafw:estudio@v1#indicador` (un paquete de datos),
  `qillqa:doc:272` (un documento del sistema)— y el proyecto muestra su título real. Zotero debe estar
  abierto en el servidor para que formatee él; cerrado, se lee una copia de su base y el buscador lo
  avisa. Si nada de eso está en el equipo, se ve la clave tal cual.
- **Aviso de llegadas (solo el administrador)**: un tono suave y el mensaje «Entró a Qillqa: …»
  cuando alguien abre el sistema (tarda hasta un minuto). Se apaga o se prueba en la ventana del
  equipo («Avisarme cuando alguien entre» · «Probar»). Nadie más lo oye ni lo ve. El navegador
  solo deja sonar después de un primer clic en la página; con la pestaña oculta y el permiso
  concedido, llega además como notificación del escritorio.
- Un **borrador vacío** (que abrió y no llenó) desaparece solo; no se
  preocupe por dejar basura.

#### El formato: general y de cada parte

**Formato general** (panel encima de la vista previa) es lo que afecta al documento
**completo**. Desplegado es una **cinta como la de Word**: grupos uno al lado del otro, cada
control con su icono, el valor que rige y un rótulo corto (el detalle sale al pasar el ratón;
«PDF: …» en rojo cuando el ajuste automático usó otro valor). Cinco grupos: *Texto* (letra del documento, interlineado, espacio entre
párrafos, sangría, letra de las tablas), *Espacios entre partes* (entre las partes de la
cabecera, del asunto al primer párrafo, del saludo al primer párrafo), *Página y pie*
(márgenes, folio, adjuntos y copias en lista o en una línea) y *Firma y sello*. Plegado, dice
en una línea lo que rige («11 pt · interlineado 1,15 · párrafos 4 pt»).

**Formato de una parte**: junto a destinatario, asunto, copias y cuerpo hay un icono pequeño
de ajustes. Abre un globo con **solo** esa parte (tamaño de letra en puntos, interlineado,
ubicación de las copias, sangría del asunto). Lo que se fija ahí **manda** sobre el formato
general; si no se fija, la parte lo hereda y lo dice («Igual al documento · 11 pt»). Cada
propiedad vive en un solo lugar: el interlineado y la sangría son del documento, no del cuerpo.

**Letra del documento (10 a 12 pt, de medio en medio punto)**: cambia todo en proporción
(cuerpo, asunto, tablas y notas al pie); el pie de página y las partes con tamaño propio, como
las copias, se quedan como están. Por legibilidad no hay nada por debajo de 10 pt. Párrafos y
listas usan el mismo espacio entre párrafos.

**La firma nunca queda sola en una hoja**: si al compilar el cierre («Atentamente» y la firma)
cae solo o casi solo en la última hoja, el sistema prueba —sin tocar lo que usted guardó— a
subir la firma (hasta 2 cm, lo que pide la firma digital), quitar aire de la cabecera y entre
párrafos, poner interlineado 1,0 y bajar la letra hasta 10 pt; si aun así no cabe, acorta un
poco la primera hoja para que la firma vaya acompañada de texto. Un aviso dice qué ajuste usó.

#### Enviar por Mesa de Partes: la extensión de Qillqa

Con la extensión instalada (una vez por computadora: Directorio → Mesas de partes → «Descargar
la extensión» y sus cuatro pasos), **«Abrir mesa de partes»** de un documento abre la página de
la entidad y el panel de Qillqa **aparece solo dentro de ella**: «Autocompletar formulario» llena
los campos que reconoce (con borde dorado, sin enviar nada), «Autocompletar ingreso» pone el
usuario y la clave, cada dato se copia con un clic y se puede descargar el firmado para
adjuntarlo. El panel se mueve arrastrando su cabecera, se minimiza con «—» y se cierra con «✕».

#### Enviar por Mesa de Partes: la ventana de apoyo

En «Mesa de partes» de un documento, **Ventana de apoyo** abre una ventana pequeña que queda
**encima de todo** mientras llena el formulario de la entidad (en Chrome y Edge; en otros
navegadores es una ventana aparte). Cada dato se copia con un clic: tipo, número, asunto,
fecha, folios y destinatario del documento; del titular, apellidos y nombres por separado,
DNI, fechas, ubigeo, correo, celular… También abre la mesa de partes, copia su usuario y su
clave (si el administrador los guardó), descarga el firmado o **abre su ubicación** (en la
computadora donde corre el sistema).

**Autocompletar**: la primera vez, arrastre el botón «Autocompletar Qillqa» (en la ventana o en
Directorio → Mesas de partes) a la barra de marcadores. Después, en la ventana pulse
«Preparar autocompletado» y, en la página de la mesa de partes, pulse ese marcador: llena los
campos vacíos que reconoce (con borde dorado) y no envía nada. Revise antes de enviar.

**Datos del titular**: Directorio → Mesas de partes. Todos los ven y copian; solo el
administrador los cambia.

#### La agenda se llena sola con lo que anuncian los documentos

Si un oficio (o cualquier documento) dice, por ejemplo, «una reunión de trabajo el sábado 10 de
octubre de 2026, a las 12:00 m.», al guardarlo el sistema la agrega a la **Agenda** como
**propuesta** (borde punteado, «por confirmar»), vinculada al documento y con el lugar de la
entidad destinataria. Ábrala y pulse **Confirmar** (y Guardar), o bórrela: borrada, no vuelve a
proponerse. Si cambia la fecha en el documento, la propuesta se mueve sola.

#### Contraseñas

El módulo **Contraseñas** (menú principal) guarda el usuario y la clave de cada mesa de partes y
de cualquier otro sitio, como Google Contraseñas: buscador, categorías y favoritas a la
izquierda; a la derecha la ficha, con «ver» (30 segundos) y «copiar» para el usuario y la clave,
y «Abrir» para el sitio. El administrador agrega cuentas (con un generador de claves seguras),
las edita y puede **importar** de una vez el archivo CSV que exportan Google Contraseñas o
KeePassXC (después hay que borrar ese archivo: tiene las claves sin cifrar). Las claves se
guardan cifradas y cada vez que alguien ve, copia o autocompleta una queda en «Quién la usó».
Un sitio es **una sola cuenta** aunque se entre de varias formas (con DNI, con correo, con
usuario…): cada forma de ingreso lleva su propia clave («Editar» → «Otra forma de ingreso»).
Con la extensión de Qillqa, al abrir la página de ingreso de un sitio guardado aparece
«Autocompletar acceso» con cada forma («Entrar con DNI», «Entrar con Correo»): un clic pone el
usuario y la clave. La extensión se instala en Chrome, Edge, Zen o Firefox (Directorio → Mesas
de partes).

#### El firmado

Solo se acepta como firmado el **PDF que devuelve el firmador** («…[R].pdf») de ese documento:
con firma digital y con el mismo texto y páginas que el generado. Si no cumple, el sistema dice
por qué; el administrador puede subirlo de todos modos (queda anotado).

#### Ver un PDF en grande

El botón de pantalla completa de cualquier vista previa abre el **visor completo**: miniaturas,
zoom, girar, buscar, imprimir y descargar; a la derecha, como en Outlook, la lista de todos los
archivos del documento (firmado, adjuntos, cargos, expediente…) para abrir cada uno ahí mismo.
En el celular, «Abrir PDF» abre este visor y la lista sale con «Archivos».

En los dos, al pasar el ratón sobre un control se lee qué cambia en el papel, la opción con ★
es la predeterminada del tipo y la vista previa se actualiza sola. «Restablecer» vuelve a los
predeterminados del tipo; «Usar como predeterminado» / «Predeterminar» guarda los actuales
para los documentos nuevos de ese tipo.

#### La vista previa, en pestañas

Encima del PDF hay **cinco pestañas fijas**, en el orden del trámite:

| pestaña | qué muestra |
|---|---|
| **Documento** | fichas «Vista previa» (el PDF del sistema) y «Firmado» |
| **Adjuntos** | una ficha por adjunto, en el orden de la línea «Adj.» |
| **Referencia** | los documentos citados o relacionados, con su archivo |
| **Cargos** | los cargos (constancias) de recepción |
| **Expediente** | el PDF único del documento con sus adjuntos |

Una pestaña vacía se ve atenuada; al abrirla dice qué falta y dónde se carga. Un adjunto
escrito **solo con su nombre** tiene su ficha con el icono de «sin archivo»: al abrirla se puede
**cargar su PDF ahí mismo** (también con «Cargar archivo» en su fila de Anexos). El archivo de una
referencia se sube con el botón «Archivo» junto a ella en el formulario **o desde su ficha en
Referencia** («Cargar su PDF»), y se ve en Referencia (y en Adjuntos, porque también va en la línea
«Adj.»). «Adjuntos» y «Referencia» muestran un ✓ verde cuando todo lo suyo tiene archivo. A la
derecha, copiar y descargar lo que se ve.

Para **agregar un adjunto**, en Anexos: primero «Elegir archivo para adjuntar» y, al elegirlo,
escribir su nombre (viene propuesto desde el archivo) y «Adjuntar». Un documento que existe solo
en papel se registra con «Es un documento solo en papel». Arriba de la lista se lee si está
completo (✓) o cuántos archivos faltan; un nombre y su archivo nunca salen en dos filas.

#### Adjuntos, copias y expediente en el papel

Tras la firma, **Adj.:** y **c.c.:** salen en lista, uno por línea y alineados (los adjuntos
numerados si son varios); cada copia ocupa una línea: «Nombre, cargo». Si se prefiere todo en
una línea, se elige en Formato general → Página y pie.

**Expediente** es el PDF único con el documento firmado (o sin firma, y así se marca) seguido de
los adjuntos, los cargos de recepción y, si se eligen, las respuestas: lo que se envía o se registra en
el STD. Se arma al **final de la sección Anexos**: «Armar expediente» abre una ventana con cada pieza y
su casilla (lo que no es PDF no puede entrar); se arma en este orden: documento, adjuntos, cargos y respuestas. Ármelo al
final, con el firmado subido; si después cambia un adjunto o el firmado, aparece
«desactualizado»: vuelva a armarlo. El resultado se ve en la pestaña «Expediente».

El sello va siempre fijo abajo a la derecha de la hoja donde cae la firma, apoyado sobre la
línea del pie; si esa hoja tiene **notas al pie, va justo encima de ellas**. Nunca salta solo a
otra hoja. Solo en casos excepcionales se sube o baja un poco con «Posición del sello».

### Herramientas del editor (como en Word)

En la barra de cualquier texto: **deshacer y rehacer**, negrita, cursiva, subrayado, **tachado** (sale tachado en el
PDF: sirve para lo que se suprime en el cuadro comparativo), listas, sangrías, enlace, **nota al pie** (abre un
cuadro para escribirla; con una nota seleccionada, la edita o la quita), tabla y **buscar y reemplazar** (o
Ctrl+F y Ctrl+H dentro del texto). En «⋯», superíndice (m²) y subíndice (CO₂). A la derecha, el número de
palabras. Clic derecho sobre una tabla: insertar filas y columnas a cada lado, **combinar celdas** (seleccione
varias arrastrando) o dividirlas, y **«Título y fuente del cuadro…»**: en el PDF sale «CUADRO — N° n» con el
título encima y la fuente debajo, numerados en orden.

**Texto pegado de Word.** Al pegar varios párrafos de Word, el editor los ordena solo: las notas al pie
quedan como notas y se ven con su número, el mismo del PDF (aunque lleguen como «[1]», como «¹» o con el
número en superíndice), las listas con número o viñeta pasan a ser listas, los
subtítulos numerados («II.1. …») quedan como subtítulos, la «Fuente:» bajo un cuadro pasa a ser su fuente y
se quitan los párrafos vacíos y los espacios de relleno. Si un texto ya pegado sigue desordenado, la barra lo
ofrece arriba («Ordenar ahora»), o en «⋯ → Ordenar texto pegado de Word». Ctrl+Z lo deshace. Las fotos no
viajan al pegar: insértelas con «Fotografía», o use **«Cargar desde Word»** en el proyecto, que trae el
documento entero con sus notas y sus fotos.

### Otras formas de ver la bandeja

Junto al número de documentos de la bandeja hay cinco botones: **Lista** (la tabla de siempre), **Por
etapa** (un tablero por estado), **Seguimiento** (qué le falta a cada uno: por enviar, esperan cargo de
recepción, por registrar en el STD, completos; cada tarjeta dice además si su expediente está **al día**,
**desactualizado** —con el motivo al pasar el cursor— o **sin armar**), **Instituciones** (a quién se ha escrito y en qué va cada
cosa) y **Cronología** (por mes y semana). La búsqueda, las pestañas de etapa y «A mi cargo» valen en todas;
el equipo recuerda la última elegida.

### Pedidos de la semana: qué hacer con cada uno

Arriba, cinco contadores dicen en qué va cada pedido: **por derivar** (aún sin oficio), **oficio en
preparación** (el oficio existe pero no se ha enviado), **esperando respuesta**, **respondido** y
**cerrado** (ya se comunicó a la población); pulsar uno muestra solo esos. La vista **Por paso** junta los
pedidos de cada paso según la institución a la que va el oficio (la primera entidad del pedido), con los
urgentes primero. Cada tarjeta trae su siguiente acción: **Generar oficio**, **Abrir oficio**,
**Respondido** o **Cerrar**; en «⋯», cambiar el estado o **asignarlo** a alguien del equipo. Un plazo
vencido se ve en rojo y el filtro «Vencidos» los junta.

Con los botones **Institución**, **Actividad**, **Lugar** y **Tabla** se ve lo mismo de otra forma (el
navegador recuerda la elegida). Los filtros de prioridad, responsable, institución y distrito, «Sin oficio»
y el buscador valen en todas.

### Fotos de la semana

Las fotos se ven por **día y actividad**; cada sección se pliega con su flecha (la semana lo recuerda).
Arriba, los filtros con su cuenta: **Por revisar**, **Sin actividad** (no llegan al informe hasta tenerla),
**Sin pie**, **En el informe**, **Reservadas** y **Con pedido**; S, M y L cambian el tamaño.

- **Revisar muchas a la vez**: marque una foto con su casilla (o Mayús + clic para un tramo, o el círculo
  de la actividad para todas); la barra de arriba aplica a las marcadas: al informe, estado, actividad,
  pie, tipo, **Relacionar** (con pedidos e instituciones) y «A la Fototeca». Esc desmarca.
- **Elegir para el informe**: con el botón encendido, cada toque elige o quita una foto. La elegida lleva
  su número en la actividad: la **1** va en la ficha de la actividad; las del día forman su galería (4 al
  cierre del día, hasta 8 en la crónica). Una «por revisar» elegida pasa a pública; una reservada no se
  puede elegir. **Orden** sube o baja las elegidas de cada actividad.
- **Ver una foto**: un clic la abre en grande; ←/→ pasan a la siguiente. Al lado se corrige el pie, la
  actividad, el estado, si va al informe y, en las verticales, la franja que conserva el recorte (lo
  oscurecido no sale en la galería).
- **Subir**: «Subir fotos» pregunta a qué actividad van; el icono junto a cada actividad sube directo a ella.

### Pedidos de la semana en .md

En los pedidos de una semana, el botón **«.md»** descarga todos sus pedidos en un archivo de texto con formato
(Markdown), agrupados por actividad y con su estado, entidades, responsable, plazo y oficio: se pega tal cual en
WhatsApp o en un correo y se abre en Obsidian. En «Semanas → Territorio y pedidos», **«Descargar .md»** junta
los de todas las semanas.

### Mapa de relaciones

En el menú principal, **Mapa de relaciones**: cada punto es un documento, proyecto, semana, persona o
institución, y cada línea, una relación (continua: guardada en el sistema; punteada: deducida del
destinatario, las copias o la referencia). Pasar el cursor ilumina lo conectado; pulsar abre su ficha con
sus conexiones, «Abrir» y «Enfocar» (solo su vecindad, a 1 o 2 saltos). El buscador de arriba lleva a
cualquier elemento y el botón de capas elige qué se ve (las copias de rutina y el equipo, apagados al
inicio). Desde un documento: «Más acciones → Ver en el mapa de relaciones». El botón del sol o la luna
cambia entre el fondo oscuro y el claro.

Un punto **arrastrado se queda donde se suelta** (lleva una marca pequeña); doble clic lo suelta y
«Reordenar» suelta todos. Clic derecho sobre un punto: Abrir, Ver PDF, Descargar, Enfocar aquí, Ver en el
mapa completo. En el mapa de un documento aparecen también sus **archivos** (firmado, cargo de recepción,
respuesta, adjuntos, expediente): pulsarlos los abre.

El mapa de un documento o de un proyecto **se actualiza al guardar**, y lo que acaba de citar aparece al
instante, tenue y con línea de puntos, hasta que guarde. Las normas citadas se abren en su fuente oficial
si se conoce; de un libro se copia la referencia APA.

### Citar y relacionar mientras se escribe

En el cuerpo de un documento, en las partes de un proyecto de ley y en los textos del informe de la semana,
escriba **«Ley »**, «Ley N° 277…», «D.S.», «Decreto», «Resolución», «Oficio 95», «Informe», «PL» o **«@»**
seguido de lo que busca («@huanta», «@educación»): aparece una lista con normas, documentos, proyectos,
semanas, pedidos, personas, instituciones y obras de **Zotero**. Muévase con ↑ ↓ y elija con **Enter**,
**Tab** o un clic; **Esc** la cierra. En los textos del informe, **Ctrl+Espacio** busca la palabra que
acaba de escribir.

Lo elegido queda escrito como se cita («Ley N° 27795, Ley de Demarcación y Organización Territorial»), con
un subrayado tenue que en el PDF no sale, y **queda relacionado** al guardar: aparece en el mapa del
documento o del proyecto sin registrarlo otra vez. Si borra la cita, la relación se quita al guardar. Una
obra de Zotero sale con la cita en el texto que da Zotero («(Bobbio, 1985)») y su referencia APA en nota
al pie (con Zotero cerrado, las arma Qillqa desde una copia de su base); en un proyecto de ley, la norma
o la obra citada pasa sola a sus **Fuentes**. «@obra» (o «@cita») seguido
del autor o el título busca solo en Zotero: «@obra cotler».

**El oficio que presenta un informe de la semana**: si el asunto o la referencia hablan del informe de la
Semana de Representación (SR-02, «setiembre de 2026»…), el sistema reconoce el informe y, si no hay duda y
el oficio aún no tiene número, lo adjunta y lo relaciona solo (con **Deshacer**). Si hay dudas, pregunta:
«¿Este documento presenta el Informe SR-02 (setiembre de 2026)?» con **Adjuntar**, **Otro…** y **No**. Desde
la semana, «Generar informe» → **Oficio de presentación** crea ese oficio ya redactado y con el informe
adjunto.

### Contactos (Directorio)

**Directorio** abre los **contactos**, como los de Google o del celular: arriba **Nuevo contacto**, la
búsqueda (nombre, cargo, institución, celular, correo o etiqueta) y «⋮»; debajo, una fila de filtros
—**Todos**, **Favoritos** y las **etiquetas**— y la lista: foto o inicial, nombre y, en gris, cargo ·
institución, con los favoritos arriba y una letra por grupo.

- **La ficha** (toque un contacto): foto, nombre, cargo y la institución (tóquela para ver su ficha y su
  organigrama); los botones **Llamar**, **WhatsApp**, **Correo** y **Mensaje** (si tiene cuenta en el
  chat); cada dato con **Copiar**; sus etiquetas (tóquelas para filtrar) y sus notas. La estrella lo marca
  como favorito suyo (cada cuenta tiene los suyos). En el celular, la flecha de arriba vuelve a la lista;
  en la computadora, la ficha se ve al lado.
- **Nuevo contacto o Editar**: nombre, celular, correo, institución y cargo; **Ver más** para el resto
  (etiquetas, tratamiento, área, teléfono fijo, anexo, correo alterno, oficina, notas y si se sugiere al
  redactar). Toque el círculo de arriba para poner la **foto**. Si ya hay alguien con ese nombre, celular o
  correo, lo avisa con «Abrir». De quien tiene cuenta en Qillqa, el nombre, cargo, correo y celular se
  cambian en **Mi perfil** o en Administración.
- **Etiquetas** (grupos): escríbalas en «Ver más → Etiquetas» (Enter agrega una nueva): Prensa, Comisión de
  Educación, Gobierno regional… «⋮ → Etiquetas» las renombra o las quita de todos.
- **Importar** («⋮ → Importar contactos»): en Google Contacts, «Exportar» → vCard o CSV de Google; en el
  celular, Contactos → Exportar (.vcf). Suba el archivo: antes de guardar verá cada contacto y los
  **duplicados** (mismo celular, correo o nombre, también los repetidos dentro del archivo) con
  **Fusionar** (completa lo que falta sin pisar nada), **Crear** u **Omitir**. Puede ponerle una etiqueta a
  todo lo importado. La organización que no está en el directorio queda en las notas.
- **Exportar** («⋮ → Exportar»): un `.vcf` con todos, con la etiqueta elegida o con lo buscado, que
  importan Google Contacts y el celular. Desde una ficha, «⋮ → Exportar» saca solo ese contacto.

Las **instituciones** siguen en «Directorio → Instituciones», con su ficha, sus autoridades (tocar un
nombre abre su contacto), dependencias y organigrama; su formulario también muestra lo de siempre y
«Ver más» para el resto.

### Organigramas

En «Directorio → Jerarquía», el icono junto a una entidad abre su organigrama. Si es grande, abre
**resumido** (la entidad y dos niveles); cada rama tiene «−» para contraerla y «+N» para desplegarla, y
arriba a la derecha están desplegar todo, solo dos niveles, ajustar a la pantalla y el buscador de unidades
(Enter pasa a la siguiente). «Imprimir / PDF» sale tal como se ve.

### Distritos y aniversarios

En «Directorio → **Distritos**», los distritos de Ayacucho con su ley y fecha de creación; «Orden → Aniversario
más próximo» muestra los que vienen. En el Inicio aparecen los que cumplen años de creación en las próximas dos
semanas (para preparar el saludo del despacho). La fecha es la de su ley de creación: confirme con la
municipalidad si celebra otro día. Para añadir otro departamento, se agrega su CSV en `../qillqasqa/qillqasqa/catalogos/`.

### Mesa de Partes (antes «Recibidos»)

En el módulo **Mesa de Partes** (en el celular, en la barra de abajo) se registra todo lo que llega al
despacho: cartas de gremios,
pedidos de municipios, invitaciones, citaciones y las respuestas de las entidades a nuestros oficios.

1. **Registrar**: arrastre uno o varios PDF sobre la página (o «Registrar documentos» y elíjalos; en el
   celular, toque para elegirlos). El sistema lee de cada uno su **ficha**: el número de registro STD (del
   nombre con que lo descarga el STD, «2437652-OFICIO-…pdf», o del texto), la fecha, el documento («Oficio
   N° …»), el remitente (si está en el directorio, lo reconoce), el asunto, la referencia, qué pide
   (responder, agendar, emitir opinión, interceder o solo para conocimiento) y un plazo sugerido en días
   hábiles (sin sábados, domingos, feriados ni días no laborables del Perú). Revise
   cada ficha —con el PDF al lado— y corrija lo que haga falta; para varias cartas iguales, ponga la misma
   **campaña** y el mismo responsable a todas con «A todos los marcados». Luego **Registrar**.
   - **Word e imágenes**: también se pueden soltar un `.docx` o una foto (JPG, PNG); el sistema los pasa a
     PDF antes de leerlos.
   - **Partes de un mismo envío** (la citación, su agenda y los proyectos de ley; un oficio en varios
     archivos): márquelas y toque **Unir en un documento**; quedan en un solo PDF, en el orden de la lista.
   - **Pegar resumen**: el botón del portapapeles de cada ficha recibe el mensaje que se escribió en el
     grupo con el prompt de recepción (📌 NUEVO DOCUMENTO RECIBIDO o 🗓️ AGENDA — NUEVA ACTIVIDAD) y llena
     la ficha: documento, remitente, fechas, n.º STD, asunto, contenido, qué pide y plazo. Si es una
     **agenda**, propone además el evento («Crear también en la Agenda»): al registrar se crea en la
     Agenda, vinculado al recibido. Si la actividad ya estaba en la Agenda (mismo día, título parecido),
     ofrece «Vincular al evento que ya está en la Agenda» y no la duplica.
2. **Duplicados**: si el PDF ya estaba registrado (el mismo archivo, o el mismo número STD aunque sea
   otra descarga o una copia «(1)»), lo avisa y no lo registra otra vez; «Ver la registrada» la abre.
3. **Atender**: elija un responsable y un plazo (al asignarlo le llega un aviso). La lista pone primero lo
   que vence antes; los filtros muestran lo nuevo, lo vencido, lo suyo o una campaña.
4. **Responder**: crea el borrador del oficio de respuesta con el destinatario, el asunto y la Referencia
   ya escritos, y lo deja vinculado. También se vincula solo cualquier oficio que cite en su
   **Referencia** el número STD del recibido (en la Referencia, escriba «Oficio …» o «@» y elija el
   recibido del grupo «Mesa de Partes»). Cuando ese oficio se **firma o se envía**, el recibido pasa solo a
   «Respondida».
5. **Agendar** y **Crear tarea** llevan a la Agenda y a Tareas con el recibido. **Archivar** lo saca de la
   lista (se reabre cuando haga falta), por ejemplo lo que era solo para conocimiento.

Si un plazo vence sin respuesta, el responsable recibe el aviso «Sin respuesta» y el recibido se marca en
rojo. En el Inicio, «Mesa de Partes: por atender» resume lo nuevo, lo que vence pronto y lo vencido.

### Mesa de partes virtual

Cualquier persona, institución o empresa puede presentar documentos al despacho desde
**`<enlace del sistema>/mesa-de-partes`**, a cualquier hora y **sin cuenta**. Lo que llega aparece en
Mesa de Partes con la marca «Mesa virtual».

**Encenderla o apagarla (Administración → Módulos).** Viene apagada. Apagada, su enlace muestra el mensaje
que se escribe ahí mismo y no recibe documentos nuevos; quien ya presentó sigue su trámite. Al encenderla, revise el horario de atención —de fábrica, **las 24 horas, todos los días** (TUO de la Ley
27444, art. 117.1): lo que llega queda presentado el día y la hora en que llegó—, agregue los
días no hábiles propios del despacho (los feriados nacionales ya se cuentan), el plazo para subsanar
(2 días hábiles, como el TUO de la Ley 27444), los límites de tamaño y los tipos de documento, y
**Guardar**. Si apaga «Las 24 horas, todos los días», elige días y horas de atención y lo que llegue fuera
de ellos se tiene por presentado el día hábil siguiente. Un horario que ya estaba guardado se respeta: la
mesa que se encendió antes de este cambio sigue con lunes a viernes de 08:30 a 17:30 hasta que alguien
encienda «Las 24 horas». En «Enlace público» escriba el enlace permanente seguido de `/mesa-de-partes`
(`./enlace.sh --ver` lo muestra) y use **Copiar enlace** para compartirlo por WhatsApp, en el portal o
en un cartel.

**Por fuera (quien envía).** Dos botones: **Enviar un documento** y **Seguir mi trámite**.
1. Enviar, en cuatro pasos: quién envía (persona con DNI o carné de extranjería, o entidad con RUC y
   quien la representa; un celular o un correo), el documento (tipo, número, folios, asunto y, si
   responde a un documento del despacho, su número), los archivos (el principal en PDF y anexos en PDF,
   JPG o PNG) y revisar, marcar la declaración jurada y la autorización de datos personales, y **Enviar**.
2. Al instante, el **cargo**: expediente, código de seguimiento, fecha y hora de recepción (con la mesa de
   24 horas, es también la de presentación; con horario de atención, el cargo dice además desde cuándo se
   tiene por presentado) y la huella de cada archivo. Se descarga en PDF, se imprime o se copia el código. No se envían correos: el cargo lo dice.
3. Seguir: con el **código** y su **documento de identidad** (o el RUC, o el DNI de quien representa)
   ve el estado en una línea de tiempo y la historia. Si está **Observado**, lee qué falta y hasta
   cuándo, y sube ahí mismo lo que subsana. Si está **Atendido**, descarga la respuesta.

**Por dentro (el equipo, en Mesa de Partes).** El interruptor **Mesa virtual** de la lista deja solo lo que
llegó por la página pública; cada fila dice el estado que ve el remitente. Al abrir uno, la pestaña
**Mesa virtual** muestra expediente y código (con «Copiar», para dictarlos por teléfono), el remitente
con su contacto, los archivos (descargar), la historia y las acciones:
- **En revisión**: el remitente ve que se está revisando (también pasa solo al asignar responsable).
- **Observar**: escriba TODO lo que falta en un solo acto (no se puede volver a observar por otra cosa)
  y elija el plazo en días hábiles; el sistema calcula hasta qué día. La subsanación llega como archivo
  nuevo, con aviso en la campana y en el canal Mesa de Partes; si llegó tarde, queda marcada «fuera de plazo».
- **Derivar**: está en atención (con una nota para el remitente, si hace falta).
- **Atender**: elija el oficio propio que responde (debe estar **firmado o enviado**; vincúlelo antes en
  «Respuestas y relaciones» o créelo con «Responder») o suba el PDF de la respuesta, y un mensaje. El
  remitente la descarga desde su seguimiento.
- **Archivar** (con el motivo que leerá el remitente; por ejemplo, «no se subsanó en el plazo: se tiene
  por no presentado») y **Reabrir**.

**El remitente al directorio.** Debajo de sus datos, el sistema propone guardarlo como contacto: la
persona (nombre, celular, correo) o la entidad (razón social, RUC, correo, teléfono, dirección) y quien la
representa. Si ya hay una ficha con el mismo celular, correo o nombre (la entidad, con el mismo RUC o
nombre), lo dice: **Vincular** la usa y completa lo que le falte, sin pisar nada; si no es la misma,
«No es la misma: crear otro». Si no hay ficha, **Crear contacto**. Nada se crea solo. El recibido queda
vinculado a la ficha (en adelante muestra su nombre y cargo vigentes). El DNI no pasa al directorio.
Quien envía lo autoriza al marcar la casilla de datos personales: para atender el trámite y mantener
contacto con el despacho (Ley 29733). Los registros de seguridad de la página (IP y navegador) se
conservan por el plazo que fija la ley.

Todo lo demás del recibido (ficha, Responder, Agendar, Crear tarea, pegar el resultado del prompt)
funciona igual que con cualquier otro.

### Mediateca (antes Fototeca)

**Toda foto o video pertenece a una actividad.** Al subir (botón «Subir» o soltando los archivos) se
elige primero de qué actividad son: una actividad de una **Semana de Representación** (la semana y
luego la actividad; entran también al banco de trabajo de la semana) u **otra actividad** del
despacho (una ya registrada, o escriba el nombre y la fecha de una nueva). La cuadrícula las muestra
agrupadas por actividad; con «Agrupar» se cambia a día, mes, semana o etiqueta.

En el menú principal, **Mediateca**: el archivo de fotografías y videos del despacho. «Subir» (o arrastrarlas a
la ventana) guarda el original una sola vez (avisa de las repetidas) y lee la fecha y el lugar de la cámara.
Las fotos se ordenan por día; a la izquierda, álbumes, etiquetas, personas, semanas de representación,
línea de tiempo y papelera. Marcar varias (Mayúsculas para un tramo) permite etiquetarlas, moverlas a un
álbum, cambiar su estado (por revisar, pública, reservada), descargarlas o mandarlas a la papelera. Abrir una
foto muestra sus datos para corregir título, pie, lugar y etiquetas; **«Editar»** gira, endereza, recorta
(3:2 para informes, 4:5 y 1:1 para publicaciones, 9:16 para historias) y ajusta brillo, contraste y
saturación sin tocar el original; **«Exportar»** la baja con esos ajustes. Desde un proyecto de ley,
«Fotografía → Elegir de la Fototeca»; desde las fotos de una semana, «Desde la Fototeca». Lo subido en una
semana entra también a la Fototeca; el administrador trae lo anterior con «Traer fotos de las semanas».

Los **videos** (MP4, MOV, WEBM) se suben igual y se guardan una sola vez; en la cuadrícula llevan ▶ y su
duración, y el selector «Fotos y videos / Solo fotos / Solo videos» los separa. Al abrir uno se reproduce
ahí mismo (se puede adelantar); no se edita en la Fototeca —se edita en Prensa— y el botón de descarga
baja el original. Todo lo que se exporta en Prensa (posts, historias, portadas, videos) se guarda solo en
la Mediateca, con nombre por fecha: se ve en su panel, sección **Prensa**, por formato, con la red y el
nombre que se le dio como etiquetas y título; si salió de una foto, aparece también entre sus versiones.

**Subir fotos de una semana de representación.** Al subir, el sistema pregunta si son de una Semana de
Representación y de qué actividad: entran a la Mediateca y, además, al banco de trabajo de esa semana
(la carpeta donde se procesan y eligen para el informe), en la carpeta de la actividad. Conviene subir por
actividad; lo elegido se recuerda para la tanda siguiente.

**Copia en su equipo.** Con «Copia local» se elige una vez una carpeta de la laptop (por ejemplo
Imágenes o Pictures); desde entonces las fotos se guardan ahí por **Año/Mes**: las marcadas, la vista
entera o «lo que falta», y también lo que se suba desde ese equipo. Nada se baja solo: en la cuadrícula,
un punto verde dice qué está ya en este equipo y un punto blanco qué solo está en la Mediateca. Solo en
Chrome o Edge. «Agrupar» ordena la cuadrícula por día, mes, actividad, álbum o etiqueta.

### Prensa

En el menú principal, **Prensa** (lo ven la cuenta de prensa, el titular y el administrador): el estudio
de piezas gráficas del despacho, con la identidad visual. Arriba, cuatro opciones:

- **«Piezas»** (como Canva): empezar desde un tamaño (post, historia, portada, A4…) o una plantilla de la
  marca; elementos (formas, marcos para fotos, collages, insignias, gráficos, tablas, código QR), panel de
  **Marca** (colores, estilos de texto, logos, firma), varias páginas (carruseles), **«Cambiar tamaño»** a
  otro formato y exportar a imagen, PDF o PDF de imprenta.
- **«Fotos»** (como Photoshop): capas con modos de fusión, selecciones (rectángulo, elipse, lazo, varita
  mágica), pinceles, clonar, curvas y niveles por canal, filtros, texto, tamaños de redes, marcos y logos.
- **«Video»** (como CapCut o Kdenlive): línea de tiempo con varias pistas, cortes, velocidad, transiciones,
  títulos y rótulos de la marca, música y **subtítulos automáticos**; se exporta en la laptop o en el navegador.
- **«Formatos y marcos»**: encuadre rápido de una foto o video con marco y rótulo para una red.

Las fotos que ofrece el estudio son las de la **Fototeca**: las públicas y las del álbum «Prensa» (créelo y
ponga ahí lo que prensa puede usar aunque aún no sea público). Para empezar desde una foto, ábrala en la
Fototeca y pulse **«Usar en Prensa»** (el ícono de periódico): se abre en «Fotos» con sus ajustes.
Lo que se exporta en «Formatos y marcos» queda en la carpeta de su red social **y** en la Fototeca, álbum «Piezas de
prensa»; en «Piezas», el diálogo **Exportar** trae **«Guardar en la Fototeca»** (con el nombre de la edición y la
foto de origen en el pie), porque su exportación normal solo descarga el archivo en la computadora; lo
que se sube al estudio también llega a la Fototeca, por revisar. Los **videos** exportados («Formatos y marcos»
o «Video») entran a la Fototeca cuando el estudio termina de hacerlos, mientras la página sigue abierta. Si la página dice que el estudio no está
encendido, el `.env` necesita `IDENTIDAD_PERFIL` (el perfil de identidad del despacho) y reiniciar con
`./iniciar.sh`. La cuenta de prensa se crea en Administración con el cargo **Prensa**.

### Tareas y Agenda

En el menú principal, **Tareas y Agenda**: los encargos del equipo con responsable, plazo y estado, y la
agenda del despacho. Arriba, sus opciones: **Mis tareas**, **Hoy**, **Tablero**, **Agenda**, **Todas** y
**Nueva tarea**. En el Inicio, «Agenda de hoy» y «Mis tareas de hoy» (con las vencidas) lo resumen.

- **Alta rápida**: escriba la tarea en una línea y pulse Enter. Puede agregar cuándo («mañana 15:00»,
  «el viernes», «7/10», «en 3 días», «próxima semana»), para quién («@cuenta»), la prioridad («!alta»,
  «!urgente») y etiquetas («#comision»). Debajo se ve lo que el sistema entendió antes de crearla. Sin
  «@», la tarea queda a su cargo.
- **Ficha de la tarea** (pulsar su texto): responsable, plazo y hora, prioridad, estado (por hacer, en
  curso, en espera, hecha, cancelada), lista, etiquetas, detalle, **lista de verificación**, **vinculada
  a** (un documento, proyecto de ley, semana, recibido, persona o institución: escriba parte de su número
  o nombre) y la conversación con el historial de cambios. Al marcarla hecha puede indicar el
  **entregable** (el documento que resultó). El círculo de la lista la marca hecha de un toque.
- **Tablero**: las tareas de todo el equipo por estado; arrástrelas entre columnas. En el celular, use
  «⋮ → Mover a…».
- **Plantillas** (menú «⋮»): semana de representación, sesión de comisión, proyecto de ley y pedido de
  información. Elija la fecha de referencia (el lunes de la semana, el día de la sesión…) y el sistema
  calcula el plazo de cada paso; puede crear una tarea con su lista o una tarea por paso.
- **Crear tarea desde donde está el trabajo**: el ícono de tarea en el visor de un documento y en la
  tarjeta de una persona del directorio; desde Mesa de Partes, la tarea o el evento nacen vinculados al
  documento recibido.
- **Avisos**: la campana avisa cuando le asignan una tarea, cuando comentan una suya, cuando se cierra
  lo que usted encargó, cuando lo incluyen en un evento y, una vez al día, de lo que vence en 24 horas
  o ya venció.

**Agenda**: mes, semana o día (en el celular la semana se ve como lista). Pulse un hueco para agendar.
Los **feriados del Perú** marcan su día en rojo con su nombre (Jueves y Viernes Santo se calculan cada año);
los días no laborables del sector público y las fechas cívicas (Día de la Madre, del Maestro…) solo llevan su
nombre.
Cada evento tiene tipo (pleno, comisión, reunión en el despacho, externa, semana de representación,
medio, otro), estado, horario o todo el día, lugar y modalidad (con enlace si es virtual), quién va
(del equipo, del directorio o un nombre, con su papel) y vínculos. **Se repite** cada semana o cada dos
en los días elegidos; «Omitir solo esta fecha» quita una sesión sin tocar las demás. Mientras lo llena,
el sistema avisa si **choca** con otra cosa (dos comisiones a la misma hora o alguien en dos sitios), y
la agenda marca los cruces del periodo. Las tareas con plazo se ven en su día.

**Ver la agenda en el celular o en Google Calendar**: «⋮ → Ver en otro calendario» da una dirección
personal para suscribirse (Google Calendar: «Otros calendarios → Desde URL»; Outlook: «Suscribirse
desde la web»; también Super Productivity → Calendarios). Es de solo lectura y se actualiza sola; si se
filtra, «Renovar». **Importar**: un `.ics` («⋮ → Importar un .ics») o, en Tareas, el respaldo de
**Super Productivity** («⋮ → Importar de Super Productivity»: en esa aplicación, Ajustes →
Sincronización y exportación → Exportar datos). Las dos importaciones muestran primero qué traerían y no
repiten lo ya importado.

### Rendición de cuentas de viáticos

En el menú principal, **Rendición de cuentas** (o, dentro de una semana, la opción **Rendición**). Cada
quien ve las suyas y las que hizo para un compañero; el administrador ve todas, el **Resumen del despacho**
y los **Parámetros**. La lista va **por comisión**: una tarjeta por Semana (o comisión de servicio) con sus
fechas, su avance, su plazo y su estado si es el mismo para todos, y dentro una fila por comisionado —con su
nombre, también la propia— con lo rendido, el saldo, su avance y lo que le falta; un toque abre esa
rendición. Una rendición presentada, observada o cerrada ya no muestra «Vencida». Arriba de cada rendición, una barra dice cómo va cada parte —**Datos, Comprobantes,
Movilidad, Documento**— (gris: pendiente; dorado: registrado, falta revisar; verde: validado); un toque lleva
a esa parte. El ícono de la **calculadora** (arriba a la derecha, y en cada campo de importe) abre una
calculadora en hoja inferior: «Usar S/ …» pone el resultado en el campo que está llenando.

**Dos formas de trabajar.** Cada quien hace la suya, o un **encargado** hace las de todos los de la comisión:
al crearla elija el **Comisionado** (a nombre de quién va). Si hay varias rendiciones de la misma comisión a su
alcance, salen en **pestañas por persona** arriba (pasa de una a otra sin salir y sin perder el paso), y quien
aún no tiene la suya aparece con **+ Nombre** para crearla. En los dos modos, la movilidad es la misma.

1. **Nueva rendición**: viene elegida la última semana que terminó (o elija «Otra comisión de servicio» y
   sus fechas). Las fechas, el lugar y el motivo salen de la semana. Si es la primera de la comisión, la
   movilidad viene propuesta desde las actividades; si un compañero ya la registró, aparece tal cual.
2. **Datos**: su nombre, cargo y DNI salen de **Mi perfil**. Vincule el **memorando** que pidió los viáticos
   (el sistema sugiere los que hablan de viáticos). Debajo, **Relaciones de esta rendición**: el mapa de sus
   vínculos, como en el editor, los recibidos y los proyectos —la Semana, el memorando, el comisionado, la otra
   rendición de la comisión, los comprobantes, los otros sustentos y el PDF—; un toque abre cada uno y
   **Ampliar** lleva al mapa completo. Escriba el SIAF y el comprobante de pago; cada campo se
   guarda al salir de él. En **Importe y topes**:
   - el **importe recibido** dice de dónde sale: anotado en esta rendición, anotado **para toda la
     comisión** (lo mismo para los dos), leído del memorando, o **Pendiente** si no consta (mientras, se
     calcula con viático × días y queda como pendiente). Cambia en cada Semana: anótelo siempre;
   - debajo, lo que rige en una línea cada cosa: **Viático por día: S/ 320** (D.S. 007-2013-EF), **Declaración
     jurada: hasta 30 % de lo recibido** (solo movilidad), **Movilidad por día: hasta S/ 96**, **Plazo: 10 días
     hábiles, hasta el …**, y un ejemplo («si un día gastó S/ 230 con comprobante, la movilidad de ese día
     llega a S/ 90»);
   - **Ver más**: lo raro (pasajes u otros recursos recibidos, un tope distinto solo para esta rendición) y de
     dónde sale cada valor.
3. **Comprobantes**: **Agregar** pregunta cómo empezar: **Uno por uno** abre el formulario; **Con ayuda de la
   IA** muestra en la misma ventana los tres pasos (copiar o descargar el prompt, pegarlo en su IA con las
   fotos, traer la respuesta) y **Pegar la respuesta**. **Subir comprobantes** sube todas las fotos o PDF de
   una vez para completarlos después. En el formulario, la **foto o el PDF se ve a la derecha** (en el
   celular, debajo; un toque la abre completa); el número puede escribirse entero («EB01-1586»). Bajo la
   fecha se ve lo **ya registrado** ese día (concepto e importe) y cada concepto ya registrado lleva un
   **puntito**. Un desayuno, un almuerzo y una cena por día: si ya hay uno, no deja guardar otro (corrija el
   que está); el hospedaje y «otros» pueden ser más de uno y solo avisa. **Guardar y siguiente** (el botón
   principal, también con Enter en el importe) guarda y pasa al siguiente concepto del día —desayuno,
   almuerzo, cena, otros de alimentación, hospedaje— y, al acabar, al día siguiente; **Guardar** es para
   cuando termina. Si los comprobantes se entregaron en papel, active **Entregados en físico (sin foto)**: la
   foto deja de pedirse.
4. **Movilidad** (compartida): los tramos son de la **comisión**. Lo que usted registra o corrige (la ruta, la
   hora, el monto) aparece en la rendición de su compañero, y al revés; **⋮ → Quién cambió qué** muestra cada
   cambio con su autor y su hora. Cada día dice cuánto **alcanza a todos** y por qué, en una línea: «S/ 96: el
   tope de declaración jurada del día» o «S/ 90: Ana ya gastó S/ 230 con comprobante ese día» (la
   movilidad debe ser igual para los dos, así que el día llega solo hasta lo que le falta a quien más gastó con
   comprobante). **Ajustar a lo sugerido** dice primero, en una línea, qué hará («Pondrá lun 24/08 a S/ 96 (hoy
   S/ 90)…»); los días que ya suman lo sugerido no se tocan. **Nunca pasa los topes**: ni los S/ 96 por día
   de declaración jurada ni el viático del día de ninguno de los comisionados, ni el 30 % de lo recibido de
   cada uno; una DJ del día fijada a mano rige solo si es menor. Solo cambia los montos de los tramos (los
   topes y la DJ fijada quedan como están). Después del ajuste, y de cualquier cambio en la
   movilidad, **Deshacer** lo vuelve atrás (en el aviso o en «Último cambio»). Si la ruta real es otra, **⋮ →
   Quitar todos los tramos** (o los del día) y escríbala con **Tramo → Guardar y otro**. Cuando alguien de la
   comisión presenta su rendición, la movilidad queda **fija** (para corregirla, Administración observa esa
   rendición). Abajo, los otros gastos sin comprobante de usted (la declaración jurada vale solo para
   movilidad: lo demás va con comprobante).
5. **Revisión**: recibido (dice «pendiente» si aún no consta), rendido, **saldo a devolver** y el % de
   declaración jurada (máximo 30 % de lo recibido); **Pendientes**: un renglón por cada cosa que falta y no
   consta en ningún papel; los **controles** (rojo: hay que corregir; dorado: conviene revisar) con «Ver» para
   ir al sitio. **Comparar con la comisión**: los comisionados de la misma comisión lado a lado —día por día,
   los comprobantes por concepto (entre paréntesis, cuántos hay), la movilidad (la misma), lo reconocido y el
   saldo; y los totales: rendido, recibido, saldo y % de declaración jurada—, con lo distinto resaltado y
   **Solo lo distinto** para ver únicamente eso; sirve para la última revisión y para levantar las
   observaciones de la oficina. En el celular se alterna entre personas y cada valor distinto dice debajo el
   del otro. Sin rojos, **Marcar como lista** y, cuando la entregue, **Presentada**. Administración la
   **observa** (con el motivo; se subsana en 72 horas) o la **cierra**.
6. **Documento**: **Generar los anexos** compone el Anexo 3 (declaración jurada, con el importe en letras)
   y el Anexo 4 (rendición) listos para imprimir y firmar; en escritorio el documento se ve **a la derecha**
   (botones e información a la izquierda), en el celular debajo. **Excel** baja la liquidación con sus fórmulas.
   Si cambia algo después —también si su compañero corrige un tramo—, el aviso «vuelva a generar» evita
   imprimir uno viejo. En **Otros sustentos** adjunte el boleto aéreo y, si devolvió saldo, el recibo.

El plazo es de **10 días hábiles** desde el fin de la comisión (15 para congresistas; DI 37-2025-DF-DGA-CR); vencido,
Finanzas puede descontar lo recibido de la remuneración, y mientras haya una rendición pendiente no se otorgan
nuevos viáticos. El saldo se devuelve en efectivo en la Caja de Tesorería y la copia del recibo va con la
rendición. En el **Resumen del despacho**, el administrador ve quién aún no tiene rendición («Crear») o no la
necesita porque viajó sin viáticos («No rinde»). En **Parámetros del despacho** (administrador) se fijan el
viático por día, el porcentaje de declaración jurada, el plazo y a nombre de quién van los comprobantes (razón
social y RUC).

**Dónde quedan los archivos**: fuera de la carpeta de la Semana, en la carpeta **`rendiciones/`** del despacho,
por año y comisión: `rendiciones/2026/2026-08_SR-01_<tema>/R-003_<usuario>/` con `comprobantes/` (fotos y PDF),
`anexos/` (boleto, recibo de devolución) y `documento/` (el PDF de los anexos y el Excel). Otra comisión de
servicio: `rendiciones/2026/2026-10-05_<lugar>/…`. La Semana enlaza a sus rendiciones (opción **Rendición**); no
hay copias.

### Pegar el resultado de un prompt (Mesa de Partes, Agenda, Seguimiento, Semana, editor)

Desde el 2026-10-12 no hace falta volver a escribir lo que ya dice un documento. El camino es el
mismo en todos los módulos:

1. Use el prompt institucional que toca (están en el repo de prompts, carpeta `06 legislativo`:
   recibidos → `prompt_13`, agenda → `prompt_14`, seguimiento de un oficio → `prompt_15`, Semana de
   representación → `prompt_11`, comprobantes de la rendición de viáticos → `prompt_19`; para redactar
   un oficio, memorando o solicitud, el skill
   `documentos-administrativos`) con la inteligencia artificial que prefiera (ChatGPT, Claude, Grok,
   DeepSeek…). El sistema no llama a ninguna: solo lee lo que usted pega.
2. Copie el resultado entero (trae un bloque que empieza por `tipo: …`; el mensaje para el grupo
   puede ir debajo, no estorba).
3. En el módulo, pulse **Pegar…** (Mesa de Partes: en la ficha, al subir o en un recibido ya registrado;
   Agenda: menú ⋮ → «Pegar actividades»; seguimiento de un documento: «Pegar seguimiento» junto a
   las actuaciones; Semana: «Pegar el registro de la jornada» en Actividades; editor: ⋮ → «Pegar el
   documento redactado») y pegue. En el botón principal de cada módulo («Nuevo…», «Agendar», «Nueva
   tarea»…), la ventana **¿Cómo quiere empezar?** ofrece **Con ayuda de la IA**: abre en la misma ventana los
   tres pasos con **Copiar el prompt** y **Descargar .md**, y al final **Pegar la respuesta**; la otra opción
   va directo al formulario.
4. **Lea la tabla**: cada fila dice qué hay ahora, qué propone lo pegado y si es nuevo, cambia o
   hay que elegir (un valor que no está en la lista del sistema). Desmarque lo que no quiera.
5. **Aplicar** solo llena el formulario; nada se guarda hasta que pulse **Guardar** (o Registrar,
   Agendar) como siempre. Lo que el pegado propone además (crear el evento en la Agenda, vincular
   el recibido que responde, la tarea de revisión) va con su casilla.

Qué no hace: no cambia el estado de un documento ni le pone número; una actuación que viene del
prompt se ve en gris «por confirmar» hasta que alguien la confirma; si el texto no es ningún
formato conocido, avisa y no llena nada. En la ficha del recibido, «Origen de los datos» dice
cuántos campos salieron del PDF, del prompt o se escribieron a mano; el administrador ve el
historial de pegados por entidad.

### Reglas: lo que el sistema hace solo

Administración → **Reglas** lista lo que el sistema hace cuando pasa algo (llega un recibido, se
numera un documento, se agenda un evento): avisar en la campana, crear una tarea, publicar en un
canal del chat o mandar al grupo de Telegram. Cada regla tiene su interruptor; el administrador
crea y cambia. Los avisos de siempre de cada módulo no pasan por aquí.

### Chat

El módulo **Chat** reúne al equipo dentro del sistema: directos, grupos y temas (General, Mesa de Partes,
Documentos, Agenda, Proyectos de ley, Semana de representación, Prensa). En los temas publican las
reglas: cada mensaje automático lleva el enlace a lo que lo originó. Se puede responder en hilo,
mencionar con `@cuenta` (la persona recibe un aviso), adjuntar lo que ya está en el sistema
(un recibido, un documento, una foto) y buscar en todo lo dicho. La cuenta de invitado no entra.

El **+** junto a la caja manda además: foto o archivo, **encuesta** (pregunta y de 2 a 10 opciones;
se vota tocando una opción y se quita tocándola otra vez), **tarea** y **actividad de agenda** (a mano
o con el resultado del prompt; el chat deja la tarjeta de lo creado). Con la caja vacía, el botón
de enviar es un **micrófono**: un toque graba la nota de voz, la papelera la descarta y la flecha la
envía. El **resultado de un prompt** basta pegarlo en la caja: antes de enviar se ve
«Reconocido: …» y, al enviar, el chat ofrece «Registrar» o «Abrir y revisar».

Los **temas** van en secciones plegables (Equipo, Documentos, Agenda, Legislativo, Prensa y medios,
Representación); una sección plegada muestra cuánto tiene sin leer. Lo que publica el sistema se ve
como tarjeta: qué pasó, el número en negrita, el asunto (con «ver más») y un solo botón. Quien
administra crea un tema con «Nuevo» → Tema y elige su sección (o escribe una nueva); el ⋮ del tema
permite cambiarla. Cada mañana, «Programación del día» trae las actividades de hoy.

En lo que usted envía, **✓** es enviado, **✓✓** recibido y **✓✓ en azul** leído; mantenga pulsado un
mensaje suyo → «Info» para ver quién lo leyó. **Avisos en el celular**: Mi perfil → «Avisos en este
dispositivo» → Activar (o «Activar» en la franja del chat, la primera vez); funciona con el enlace
https de Qillqa y, en iPhone, con Qillqa instalado en la pantalla de inicio. Qillqa suena con sus
propios sonidos al enviar y al llegar un mensaje (se apagan en Mi perfil); el sonido del aviso en el
celular lo pone el teléfono, pero la vibración (dos toques cortos y uno largo) es la de Qillqa.

### La vista: celular, tableta o escritorio

La pantalla se adapta sola al ancho de la ventana. Para verla como en otro aparato: menú de la cuenta
(su foto, arriba a la derecha) → **Vista** → Celular, Tableta o Escritorio. El sistema se muestra en un
marco de ese ancho, con una barra arriba para cambiar de vista; **Automática** lo quita. Se recuerda en
cada dispositivo.

### Mi perfil y la tarjeta de contacto

**Mi perfil** (menú de la cuenta, arriba a la derecha, o su foto en la lista del Chat) es como los
ajustes de WhatsApp: el botón de cámara cambia o quita la foto; cada fila (Nombre, Celular, Correo,
DNI, Cargo, «Info») se toca para corregirla. El rol solo lo cambia quien administra, y el cargo, solo
entre los de su mismo rol. «Cambiar contraseña» lleva a la pantalla de siempre.

Tocar la foto o el nombre de alguien en el Chat (cabecera de un directo, integrantes de un grupo,
autor de un mensaje) o en «en línea» abre su **tarjeta**: Mensaje, Llamar, WhatsApp, Correo y
«Copiar» en cada dato. El DNI solo lo ven la persona y quien administra; el invitado no ve celular ni
correo.

### Sin conexión: qué se ve y qué se puede hacer

Si se va la señal o la laptop que hace de servidor, el sistema **no se pone en blanco**: abre igual y cada
pantalla muestra lo último que se vio en ese equipo (bandeja, documentos, Mesa de Partes, agenda, tareas, chat,
contactos, proyectos, semanas, inicio y avisos). No sale ningún aviso mientras solo se mira: la franja «Sin
conexión · mostrando lo guardado a las 09:41» la ve **solo el administrador**. A los demás, si algo suyo espera
para enviarse, un ícono discreto de nube con flecha en la barra de arriba (al pasar el cursor dice cuántos
cambios esperan).

- **Se puede**, y se guarda en el equipo hasta que vuelva («Se guardará cuando vuelva la conexión»): escribir
  y guardar en el editor (también el guardado automático), escribir en el chat, **comentar** una tarea u
  **observar** un documento, **crear una tarea** (con el formulario o la línea rápida; «mañana» cuenta desde el
  día en que se escribió) y **anotar una actuación**. Todo eso se ve en su lugar como «En espera».
- **Ver los PDF**: los que se abrieron antes y, si el equipo tiene una **carpeta sincronizada** (opción
  Sincronizar), todos los que hay en ella, también los de Mesa de Partes: se abren directamente de la carpeta.
  Si Chrome pide permiso, sale «Abrir carpeta»; con «Permitir siempre» no vuelve a preguntar.
- **Necesita el servidor**: numerar, cambiar de estado, compilar el PDF, subir el firmado o cualquier archivo.
  El sistema lo dice en una línea y ofrece **«Hacerlo al volver»**: cuando haya conexión aparece arriba
  «Ya hay conexión · Numerar Oficio…» con **Hacer ahora** (abre el documento y empieza la numeración, que pide
  la revisión de siempre).
- Lo que nunca se abrió en ese equipo no está guardado (una tarea nunca abierta muestra lo que su lista sabe
  de ella).
- Al volver la conexión lo pendiente se envía solo y una línea arriba dice cuántos cambios salieron. **Nada se
  pierde**: si alguien guardó el mismo documento entretanto, sus cambios quedan apartados en el documento
  («Cargar mis cambios»); si el servidor no aceptó algo (por ejemplo, la tarea ya no existe), queda en «No
  enviados» (botón **Ver**) con su texto para copiarlo.
- Al **cerrar sesión** se borra lo guardado en el navegador, y lo de una cuenta nunca se muestra a otra (la
  carpeta sincronizada tampoco: solo la usa la cuenta que sincronizó).

### Si algo no funciona

- Si la página no carga o dice "error", avise a la persona encargada
  (puede que haya que reiniciar el sistema en la laptop).
- Si el PDF se demora, espere: es normal, está armando el documento.
