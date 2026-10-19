%% =====================================================================
%%  classes/proyecto-de-ley.cls  --  Tipo documental: PROYECTO DE LEY
%% ---------------------------------------------------------------------
%%  Clase delgada del MDD: hereda de despacho.cls, fija el membrete del
%%  Congreso, la forma parlamentaria (structures/legislativo) y el ESQUEMA
%%  `proyecto-de-ley` del ecosistema (Reglamento del Congreso art. 75-76;
%%  Manual de Tecnica Legislativa 2021 sec. X y VI; calibre-id 10086, 10098),
%%  que el compilador exige: presentacion, titulo, formula legal, exposicion
%%  de motivos con sus partes, y firmas. Condiciones que el maestro declara:
%%  \esquemacondicion{modificatoria|ambiental|agenda|anexo}.
%%  Normativo: ~/Documents/prompts/00 metodo/ARQUITECTURA_DOCUMENTAL.md 5.11
%% =====================================================================
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{proyecto-de-ley}[2026/09/11 v1.0 MDD tipo documental: proyecto de ley]
%% Letra base 10 pt (un punto menos que el resto del despacho; 2026-10-01):
%% el proyecto es largo y de lectura continua. \documentclass[11pt]{...} la
%% devuelve a 11 pt si hiciera falta.
\PassOptionsToClass{10pt}{despacho}
\DeclareOption*{\PassOptionsToClass{\CurrentOption}{despacho}}
\ProcessOptions\relax
\LoadClass{despacho}
\setmeta{tipodoc}{Proyecto de ley}
\setmeta{anio}{\the\year}
%% Membrete y pie de las proposiciones de la Camara de Diputados (2026-10-01):
%% logos en blanco y negro, nombre en barra gris; pie institucional del
%% Congreso con la franja guinda; sin folio ni datos personales del despacho.
\usarmembrete{camara}
\usarpiecongreso
%% Sin marca de agua: el proyecto presentado no la lleva.
\sinmarcaagua
\usarestructura{legislativo}
\usaresquema{proyecto-de-ley}
\sinfolio
%% Composicion del proyecto (revision del proyecto real, 2026-10-01):
%%  - sin filete bajo el membrete: quedaba pegado a la primera linea; lo
%%    separa un headsep algo mayor;
%%  - parrafos SIN sangria de primera linea, separados por un poco de aire;
%%    los incisos llevan sangria completa (\itemlegislativo, listas);
%%  - URL partibles en cualquier punto (xurl, cargado por el nucleo).
\sinfileteencabezado
%% El membrete de la Camara lleva logos mas altos (2,15 cm) que el de los oficios.
\geometry{headheight=2.55cm,headsep=0.55cm}
\setsangriaparrafo{0pt}
\setespacioparrafos{5pt plus 1pt}
%% Las URL en la misma letra del texto (no en mecanografica).
\urlstyle{same}
%% Barra del nombre mas ancha: los lemas quedan debajo de ella (2026-10-01).
\setanchocajamembrete{9.4cm}
%% Rotulos y titulos en NEGRO, como el proyecto presentado y el Word de la
%% Camara (FORMULA LEGAL, EXPOSICION DE MOTIVOS, I. Fundamentos...).
\colorlet{colortitulos}{negro}
%% Notas al pie SIN sangria: la llamada al margen y el texto a continuacion.
\renewcommand\@makefntext[1]{\noindent\@makefnmark\,#1}
\endinput
