%% =====================================================================
%%  classes/oficio.cls  --  Tipo documental: OFICIO
%% ---------------------------------------------------------------------
%%  Clase delgada: carga el nucleo (core/despacho.cls) y fija los
%%  defaults del tipo. El documento puede sobrescribir cualquiera
%%  (p. ej. \usarmembrete{despacho} o \sinmarcaagua).
%%
%%  Uso:  \documentclass{oficio}
%% =====================================================================
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{oficio}[2026/08/03 v1.0 MDD tipo documental: oficio]

\DeclareOption*{\PassOptionsToClass{\CurrentOption}{despacho}}
\ProcessOptions\relax
\LoadClass{despacho}

% --- Defaults del tipo (sobrescribibles) ------------------------------
\setmeta{tipodoc}{Oficio}
\setmeta{anio}{\the\year}
\usarmembrete{congreso}
\usarestructura{oficio}
\sinfolio

\endinput
