%% =====================================================================
%%  classes/agenda.cls  --  Tipo documental: AGENDA DIARIA DE TRABAJO
%% ---------------------------------------------------------------------
%%  Clase delgada: carga el nucleo (core/despacho.cls) y fija los
%%  defaults del tipo. La agenda es un documento de trabajo INTERNO que
%%  se imprime ya rellenado con lo del dia (reuniones, pendientes y
%%  comunicaciones, antes extraidos de la carpeta de correo) y deja renglones y
%%  casillas en blanco para escribir a mano durante la jornada.
%%
%%  No la crea nuevo.sh (no lleva serie): la compone el generador
%%  scripts/generar-agenda.py, keyed por FECHA. Sin marca de agua (es
%%  una superficie para escribir) y con folio (suele ocupar 2-3 hojas).
%%
%%  Uso:  \documentclass{agenda}
%% =====================================================================
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{agenda}[2026/08/17 v1.0 MDD tipo documental: agenda diaria]

\DeclareOption*{\PassOptionsToClass{\CurrentOption}{despacho}}
\ProcessOptions\relax
\LoadClass{despacho}

% --- Defaults del tipo (sobrescribibles) ------------------------------
\setmeta{tipodoc}{Agenda Diaria}
\setmeta{anio}{\the\year}
\usarmembrete{congreso}
\usarestructura{agenda}
\sinmarcaagua      % superficie para escribir: la marca de agua estorbaria
\confolio          % suele ser multipagina

\endinput
