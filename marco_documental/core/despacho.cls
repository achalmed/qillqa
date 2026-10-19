%% =====================================================================
%%  core/despacho.cls  --  NUCLEO del Marco Documental del Despacho
%% ---------------------------------------------------------------------
%%  Clase madre de todos los documentos oficiales de un despacho
%%  parlamentario (el titular lo da el perfil, MDD_PERFIL). Hereda la arquitectura del
%%  Academic Writing Framework:
%%
%%     article (estandar)
%%        └─ core/despacho.cls          <- este archivo (nucleo unico)
%%             ├─ core/lib/       (metadatos, partes comunes)
%%             ├─ core/config/    (un archivo = una responsabilidad)
%%             ├─ classes/        (tipos delgados: oficio, memorando, informe)
%%             ├─ membretes/      (papel membretado seleccionable)
%%             └─ structures/     (esqueleto retorico de cada tipo)
%%
%%  Principio: EL DOCUMENTO SOLO SELECCIONA Y RELLENA. Ningun estilo
%%  se define en documentos/; todo lo compartido vive aqui una sola vez.
%%
%%  Motor: LuaLaTeX (unico soportado; fontspec + polyglossia).
%%  Compilar siempre con scripts/build.sh, que exporta TEXINPUTS y
%%  las rutas de fuentes vendorizadas.
%% =====================================================================
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{despacho}[2026/08/03 v1.0 Marco documental del despacho MDD]

%% --- Opciones: tamaño de letra configurable (default 11pt) -----------
%%  El cuerpo puede compactarse o agrandarse por opcion de clase:
%%    \documentclass[10pt]{oficio}   \documentclass[12pt]{informe}
%%  Si no se indica tamaño, se usa 11pt. El resto de opciones pasa a
%%  article. (Antes se hacia \LoadClass[11pt]{article}, que IGNORABA
%%  cualquier 10pt/12pt pasado por el documento.)
\newif\ifdespachotam \despachotamfalse
\DeclareOption{10pt}{\despachotamtrue\PassOptionsToClass{10pt}{article}}
\DeclareOption{11pt}{\despachotamtrue\PassOptionsToClass{11pt}{article}}
\DeclareOption{12pt}{\despachotamtrue\PassOptionsToClass{12pt}{article}}
\DeclareOption*{\PassOptionsToClass{\CurrentOption}{article}}
\ProcessOptions\relax
\ifdespachotam\else\PassOptionsToClass{11pt}{article}\fi
\LoadClass[a4paper]{article}

%% --- Paquetes base compartidos ---------------------------------------
\RequirePackage{graphicx}
\RequirePackage{microtype}
\RequirePackage{longtable}   % tablas que quiebran de pagina (requerimientos)
\RequirePackage{booktabs}    % filetes tipograficos de tabla

%% --- Nucleo modular (el orden IMPORTA) --------------------------------
%%  1. metadatos primero: todo lo demas consume \meta{...}
%%  2. colores antes que membrete/enlaces (definen los roles)
%%  3. fuentes antes que idioma (fontspec antes de polyglossia)
%%  4. hyperref (enlaces) SIEMPRE al final
\input{core/lib/metadata.tex}
\input{core/config/colores.tex}
\input{core/config/fuentes.tex}
\input{core/config/idioma.tex}
\input{core/config/margenes.tex}
\input{core/config/espaciado.tex}
\input{core/config/tamanos.tex}
\input{core/config/listas.tex}
\input{core/config/membrete.tex}
\input{core/config/banda-prensa.tex}
\input{core/config/marca-agua.tex}
\input{core/config/enlaces.tex}
\input{core/lib/partes-comunes.tex}

%% --- El perfil del despacho (2026-09-15) -----------------------------
%%  Titular, datos de contacto y activos de marca. Se busca por TEXINPUTS:
%%  primero MDD_PERFIL (scripts/lib/env.sh), después core/perfil-defecto/
%%  (valores neutros y relleno). Nada del despacho vive en el framework.
\InputIfFileExists{perfil-despacho.tex}{}{%
  \ClassError{despacho}{perfil-despacho.tex no encontrado}{Defina MDD_PERFIL o restaure core/perfil-defecto/}}

%% --- El esquema documental del ecosistema (2026-09-11) ---------------
%%  \usaresquema{<tipo>} carga esquemas/<tipo>.tex del Academic Writing
%%  Framework (scripts/lib/env.sh lo pone en TEXINPUTS por nombre) y hace
%%  cumplir sus componentes: \componente{clave}. Opt-in: oficio, memorando,
%%  acta... no lo declaran y compilan como siempre; las clases legislativas
%%  (proyecto-de-ley, dictamen, mocion) si. Normativo:
%%  ~/Documents/prompts/00 metodo/ARQUITECTURA_DOCUMENTAL.md
\InputIfFileExists{core/esquema/esquema.tex}{}{%
  \ClassWarningNoLine{despacho}{core/esquema/esquema.tex no encontrado: compila con
    scripts/build.sh, que localiza el Academic Writing Framework}}

%% --- Selectores (mismo contrato que el AWF) ---------------------------
%%  \usarmembrete{nombre}   ya definido en config/membrete.tex
%%  \usarestructura{nombre} carga structures/<nombre>/structure.tex
\newcommand{\usarestructura}[1]{\input{structures/#1/structure.tex}}

\endinput
