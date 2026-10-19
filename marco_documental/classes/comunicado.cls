%% =====================================================================
%%  classes/comunicado.cls  --  Tipo documental: COMUNICADO (publico)
%% ---------------------------------------------------------------------
%%  Clase delgada de los documentos PUBLICOS del despacho: comunicado,
%%  pronunciamiento, nota de prensa y anuncio. Un solo tipo: la palabra
%%  impresa en la cabecera sale de \setmeta{tipodoc}{...}.
%%
%%  Uso:  \documentclass{comunicado}
%%        \setmeta{tipodoc}{Pronunciamiento}   % si no es comunicado
%% =====================================================================
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{comunicado}[2026/08/06 v1.0 MDD tipo documental: comunicado]

\DeclareOption*{\PassOptionsToClass{\CurrentOption}{despacho}}
\ProcessOptions\relax
\LoadClass{despacho}

% --- Defaults del tipo (sobrescribibles) ------------------------------
\setmeta{tipodoc}{Comunicado}
\setmeta{anio}{\the\year}
\usarmembrete{prensa}
\usarestructura{comunicado}
\sinfolio

% Prosa de declaracion publica: parrafos en bloque, sin sangria
\setsangriaparrafo{0pt}
\setespacioparrafos{7pt}

% El membrete 'prensa' (emblemas centrados + lema + doble filete) es
% MAS ALTO que el headheight global de 2.60cm (oficios): sin ensancharlo,
% el 2.º filete se desborda del encabezado y cae SOBRE el titulo.
% fancyhdr pide >= 3.51cm; damos 3.55cm + headsep holgado para separar
% el filete del titulo. NO tocar el headheight global (rompe oficios):
% solo esta clase usa el membrete alto.
%   La banda de prensa ocupa el fondo (banda 2.90 + franja 0.45 +
%   respiro): bottom generoso para que el cuerpo no pise el retrato.
%   El retrato mide 4.50cm (sobresale la banda): bottom=4.70cm mantiene
%   el colchon entre la coronilla y la ultima linea del cuerpo.
\geometry{headheight=3.55cm, headsep=0.60cm, bottom=4.70cm}
% El retrato ocupa la banda del pie: las notas no bajan (core/lib/partes-comunes.tex, \setnotasbajan).
\AtBeginDocument{\setnotasbajan{0pt}}

\endinput
