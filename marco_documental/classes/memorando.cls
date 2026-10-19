%% =====================================================================
%%  classes/memorando.cls  --  Tipo documental: MEMORANDO
%% ---------------------------------------------------------------------
%%  Clase delgada sobre el nucleo. Uso:  \documentclass{memorando}
%% =====================================================================
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{memorando}[2026/08/03 v1.0 MDD tipo documental: memorando]

\DeclareOption*{\PassOptionsToClass{\CurrentOption}{despacho}}
\ProcessOptions\relax
\LoadClass{despacho}

% --- Defaults del tipo (sobrescribibles) ------------------------------
\setmeta{tipodoc}{Memorando}
\setmeta{anio}{\the\year}
\usarmembrete{congreso}
\usarestructura{memorando}
\sinfolio

\endinput
