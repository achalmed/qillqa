%% =====================================================================
%%  classes/solicitud.cls  --  Tipo documental: SOLICITUD (formal)
%% ---------------------------------------------------------------------
%%  Clase delgada: carga el nucleo (core/despacho.cls) y fija los
%%  defaults del tipo. La solicitud sigue la norma administrativa peruana
%%  (TUO Ley 27444): sumilla SOLICITO: arriba-derecha, destinatario en
%%  mayusculas, cuerpo (exordio/exposicion/conclusion) y firma SIN
%%  antefirma ("Atentamente,").
%%
%%  Uso:  \documentclass{solicitud}
%% =====================================================================
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{solicitud}[2026/08/11 v1.0 MDD tipo documental: solicitud]

\DeclareOption*{\PassOptionsToClass{\CurrentOption}{despacho}}
\ProcessOptions\relax
\LoadClass{despacho}

% --- Defaults del tipo (sobrescribibles) ------------------------------
\setmeta{tipodoc}{Solicitud}
\setmeta{anio}{\the\year}
\usarmembrete{congreso}
\usarestructura{solicitud}
\sinfolio

\endinput
