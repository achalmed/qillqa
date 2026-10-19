%% =====================================================================
%%  classes/informe-sr.cls  --  Tipo documental: INFORME DE SEMANA DE
%%                              REPRESENTACION (ISR)
%% ---------------------------------------------------------------------
%%  Documento EDITORIAL (30-50 paginas) que el despacho produce cada mes
%%  tras la Semana de Representacion: portada, capitulos por dia con
%%  fichas de actividad, matriz de pedidos, analisis, anexos con los
%%  oficios PDF y contraportada. Se genera desde datos YAML con el
%%  generador generadores/informe-sr/ (no se escribe a mano).
%%
%%  Clase delgada sobre el nucleo: fija defaults y la GEOMETRIA
%%  editorial (margenes de 20 mm del manual de marca, cabecera corrida
%%  ligera); la logica vive en structures/informe-sr/.
%%
%%  Uso:  \documentclass{informe-sr}
%%        \input{metadata.tex}      % numero, periodo, ambito, titulo corrido
%% =====================================================================
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{informe-sr}[2026/09/03 v1.0 MDD tipo documental: informe de semana de representacion]

\DeclareOption*{\PassOptionsToClass{\CurrentOption}{despacho}}
\ProcessOptions\relax
\LoadClass{despacho}

% --- Defaults del tipo (sobrescribibles en metadata.tex) --------------
\setmeta{tipodoc}{Informe de Semana de Representación}
\setmeta{serie}{ISR}
\setmeta{anio}{\the\year}
\setmeta{periodo}{2026--2031}

% El informe editorial NO lleva marca de agua: las fotos y las cajas de
% color la taparian a trozos y ensuciarian las paginas.
\sinmarcaagua
\confolio

% --- Geometria editorial ------------------------------------------------
%%  Manual de marca (08_grid §3.a): informes A4 con 20 mm uniformes. La
%%  cabecera corrida es LIGERA (logo pequeno + titulo corrido + filete),
%%  por eso headheight baja de 2.60 cm (oficios) a 1.15 cm. El membrete
%%  institucional completo NO va en fancyhdr: se compone en linea con
%%  \membreteinforme solo en las paginas que lo piden (presentacion).
\geometry{
  top=1.55cm, headheight=1.15cm, headsep=0.55cm,
  left=2.0cm, right=2.0cm,
  bottom=2.05cm, footskip=1.05cm,
}
% Banda del pie angosta (1.05 cm): las notas no bajan (core/lib/partes-comunes.tex, \setnotasbajan).
\AtBeginDocument{\setnotasbajan{0pt}}

% --- Prosa editorial ----------------------------------------------------
%%  Parrafos en bloque (sin sangria) con aire, interlineado 1.08 sobre
%%  Source Serif 4 (equivale a ~1.35 de la escala CSS del manual).
\setsangriaparrafo{0pt}
\setespacioparrafos{5pt}
\setinterlineado{1.08}
%%  Particion de palabras ACTIVA (columnas angostas en fichas y tablas)
%%  pero con tolerancia generosa para no dejar lineas apretadas.
\hyphenpenalty=60\relax
\exhyphenpenalty=60\relax
\tolerance=900\relax
\emergencystretch=1.5em\relax

% --- Enlaces: el indice no debe verse rojo -----------------------------
\hypersetup{linkcolor=tinta, urlcolor=puka700, bookmarksnumbered=true}

\usarestructura{informe-sr}

\endinput
