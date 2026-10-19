%% =====================================================================
%%  classes/acta.cls  --  Tipo documental: ACTA DE SESIÓN
%% ---------------------------------------------------------------------
%%  Clase delgada: carga el nucleo (core/despacho.cls) y fija los
%%  defaults del tipo. El acta de sesion (organos deliberantes, norma
%%  peruana) lleva titulo centrado, clase de sesion (ordinaria/
%%  extraordinaria), estaciones, acuerdos correlativos y DOBLE firma
%%  (presidente y secretario). Suele ser multipagina -> folio activo.
%%
%%  Uso:  \documentclass{acta}
%% =====================================================================
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{acta}[2026/08/11 v1.0 MDD tipo documental: acta]

\DeclareOption*{\PassOptionsToClass{\CurrentOption}{despacho}}
\ProcessOptions\relax
\LoadClass{despacho}

% --- Defaults del tipo (sobrescribibles) ------------------------------
\setmeta{tipodoc}{Acta de Sesión}
\setmeta{anio}{\the\year}
\usarmembrete{congreso}
\usarestructura{acta}
\confolio

\endinput
