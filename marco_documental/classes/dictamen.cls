%% =====================================================================
%%  classes/dictamen.cls  --  Tipo documental: DICTAMEN de comision
%% ---------------------------------------------------------------------
%%  Clase delgada del MDD sobre despacho.cls, con el ESQUEMA `dictamen` del
%%  ecosistema (Reglamento del Congreso art. 70; Manual de Tecnica
%%  Legislativa 2021 sec. XI y anexos A-F; calibre-id 10086, 10098):
%%  sumilla, encabezado, presentacion, situacion procesal, contenido,
%%  marco normativo, opiniones, analisis, conclusion, formula legal (con
%%  \esquemacondicion{aprobacion}), formula de estilo y firmas.
%%  Normativo: ~/Documents/prompts/00 metodo/ARQUITECTURA_DOCUMENTAL.md 5.12
%% =====================================================================
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{dictamen}[2026/09/11 v1.0 MDD tipo documental: dictamen]
\DeclareOption*{\PassOptionsToClass{\CurrentOption}{despacho}}
\ProcessOptions\relax
\LoadClass{despacho}
\setmeta{tipodoc}{Dictamen}
\setmeta{anio}{\the\year}
\usarmembrete{congreso}
\usarestructura{legislativo}
\usaresquema{dictamen}
\confolio
\endinput
