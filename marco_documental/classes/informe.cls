%% =====================================================================
%%  classes/informe.cls  --  Tipo documental: INFORME
%% ---------------------------------------------------------------------
%%  Clase delgada sobre el nucleo. Los informes suelen tener varias
%%  paginas: folio activado por defecto. Uso: \documentclass{informe}
%% =====================================================================
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{informe}[2026/08/03 v1.0 MDD tipo documental: informe]

\DeclareOption*{\PassOptionsToClass{\CurrentOption}{despacho}}
\ProcessOptions\relax
\LoadClass{despacho}

% --- Defaults del tipo (sobrescribibles) ------------------------------
\setmeta{tipodoc}{Informe}
\setmeta{anio}{\the\year}
\usarmembrete{congreso}
\usarestructura{informe}
\confolio

\endinput
