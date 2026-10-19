%% =====================================================================
%%  classes/mocion.cls  --  Tipo documental: MOCION DE ORDEN DEL DIA
%% ---------------------------------------------------------------------
%%  Clase delgada del MDD sobre despacho.cls, con el ESQUEMA `mocion` del
%%  ecosistema (Reglamento del Congreso art. 68, casos a-e; calibre-id
%%  10086): sumilla, considerandos, propuesta de acuerdo, firmas.
%%  Normativo: ~/Documents/prompts/00 metodo/ARQUITECTURA_DOCUMENTAL.md 5.14
%% =====================================================================
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{mocion}[2026/09/11 v1.0 MDD tipo documental: mocion]
\DeclareOption*{\PassOptionsToClass{\CurrentOption}{despacho}}
\ProcessOptions\relax
\LoadClass{despacho}
\setmeta{tipodoc}{Moci\'on de orden del d\'ia}
\setmeta{anio}{\the\year}
\usarmembrete{congreso}
\usarestructura{legislativo}
\usaresquema{mocion}
\confolio
\endinput
