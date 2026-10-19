%% =====================================================================
%%  classes/rendicion-viaticos.cls  --  Tipo: RENDICIÓN DE VIÁTICOS
%% ---------------------------------------------------------------------
%%  Clase delgada sobre el nucleo (2026-10-18). Compone los formatos de
%%  la rendicion de cuentas de una comision de servicio dentro del
%%  territorio nacional, en el orden de la directiva:
%%     Anexo N.° 3 -- Formato N.° 02-VN  Declaracion jurada de gastos
%%                                       sin comprobante
%%     Anexo N.° 4 -- Formato N.° 03-VN  Rendicion de cuentas por
%%                                       viaticos, pasajes terrestres y/u
%%                                       otros recursos asignados
%%  Son FORMATOS de la institucion, no papel del despacho: sin membrete,
%%  sin marca de agua y sin sello (como el formato de referencia). La
%%  cabecera repite el nombre de la directiva y el pie, su procedencia y
%%  el folio. Lo genera el SGDP desde la rendicion (backend/app/servicios/
%%  rendicion_tex.py); no se numera (no tiene serie).
%%
%%  Uso:  \documentclass{rendicion-viaticos}
%% =====================================================================
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{rendicion-viaticos}[2026/10/18 v1.0 MDD tipo: rendicion de viaticos]

\DeclareOption*{\PassOptionsToClass{\CurrentOption}{despacho}}
\ProcessOptions\relax
\LoadClass[10pt]{despacho}

% --- Defaults del tipo (sobrescribibles) ------------------------------
\setmeta{tipodoc}{Rendición de viáticos}
\setmeta{anio}{\the\year}
\setmeta{sello}{no}
\sinmarcaagua
\confolio
\usarestructura{rendicion-viaticos}
% Cabecera y pie del FORMATO (directiva y procedencia + folio) en lugar del
% membrete y del pie institucional: son formularios de la institucion.
\fancyhead[C]{\cabeceraformato}
\fancyfoot[C]{\pieformato}

% Sin membrete: la zona superior solo lleva el renglon de la directiva.
% El headheight global (2.15 cm) es el piso del membrete estandar; aqui
% no hay membrete y se reduce SOLO en esta clase (como comunicado.cls).
\geometry{top=1.20cm, headheight=0.95cm, headsep=0.45cm, bottom=2.10cm, footskip=1.00cm}

% Prosa de formulario: parrafos en bloque, sin sangria.
\setsangriaparrafo{0pt}
\setespacioparrafos{4pt}

\endinput
