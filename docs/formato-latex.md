---
tipo: doc
titulo: "Formato LaTeX de los documentos generados"
estado: activo
---

# Convenciones de formato LaTeX (documentos personalizados a mano)

**Fuente única** de las reglas de MAQUETACIÓN para los `.tex` que se editan a
mano (documentos `origen=framework`: anexos escaneados, agenda con letras,
tablas de anexo, multi-destinatario fino, etc.). `docs/procesar-un-documento.md` §5–§6 y
`docs/arquitectura.md` apuntan aquí; si una regla cambia, se edita este
archivo. Son reglas del despacho (pedidos de Edison), no preferencias sueltas.

Complementa a `docs/redaccion-administrativa.md` (que es de TEXTO, no de
maqueta).

---

## 1. La firma NUNCA queda huérfana ni sola en una hoja casi vacía

La firma va **al PIE de la última página de texto**, con el sello al fondo
(`\selloalfondo`), igual que en los oficios 0022–0029. Dos errores a evitar:

- **Firma huérfana**: `\atentamente` al pie de una página y el bloque de
  firma solo, arriba de la siguiente. Pasa cuando el texto llena casi toda la
  página y solo el `\bloquefirma` (2 cm + nombre) se desborda.
- **Firma flotando arriba de una hoja casi vacía**: si se «arregla» con un
  `\newpage` antes del cierre, la firma queda ARRIBA de la última hoja y el
  `\selloalfondo` manda el sello ABAJO → un hueco enorme entre firma y sello.
  **Feo. NO hacer esto.** (pedido de Edison 2026-08-14, OF-0031).

**Solución correcta — COMPACTAR para que la firma caiga al pie:**

```latex
\setinterlineado{1.0}        % en el preámbulo, tras \sinsello
\setespacioparrafos{4pt}     % (ganan varias líneas; la firma sube a la pág.)
% y si aún no basta: \documentclass[10pt]{oficio}
```

Con eso el cierre + «Atentamente,» + firma caben al pie de la última página de
texto y el sello queda al fondo, sin hueco. Un `\newpage` suelto solo se usa
si compactar de verdad no alcanza (raro). **SIEMPRE abrir la página donde CAE
la firma para verificar** — no basta con ver la del «Atentamente,».

## 2. Anexos con tabla: de EXTREMO A EXTREMO (todo el ancho)

Una tabla de anexo (p. ej. relación de participantes con DNI) va **a todo el
ancho del texto**, no como bloque angosto centrado (pedido de Edison
2026-08-14, OF-0031). La columna de texto libre (nombre) se hace `p{}` con el
ancho restante para que la tabla llegue al margen derecho:

```latex
\clearpage
{\centering
 \textbf{ANEXO 1}\par\smallskip
 Relación de dirigentes participantes en la reunión de trabajo\par}
\vspace{1em}
{\small
\begin{longtable}{@{} c p{\dimexpr\linewidth-3.6cm\relax} r @{}}
  \toprule
  {\seriesemi N°} & {\seriesemi Nombre completo} & {\seriesemi DNI} \\
  \midrule
  \endhead
   1 & Nombre Apellido & 00000000 \\
   ...
  \bottomrule
\end{longtable}}
```

- `p{\dimexpr\linewidth-3.6cm\relax}` = ancho restante tras N° y DNI → la tabla
  llega al margen derecho. Ajustar el `3.6cm` si las columnas fijas cambian.
- `booktabs`: `\toprule` / `\midrule` / `\bottomrule` (ya cargado; ver OF-0006).
- Encabezado en `{\seriesemi ...}` (semibold), cuerpo en `{\small ...}`.

⚠️ **Trampa de llaves con `longtable` dentro de `{\small ...}`:** el grupo
`{\small … \end{longtable}}` debe abrir y cerrar la llave EXACTAMENTE. Si al
editar se borra el `{\small` de apertura pero queda el `}` de cierre en
`\end{longtable}}`, LuaLaTeX aborta con **«Too many }'s»** en esa línea (pasó
al reformatear OF-0031). El spec de columnas con `p{}` o `@{\extracolsep{}}`
NO es el problema; revisar el balance del grupo `{\small}`.

## 3. Agenda / listas con literales a) b) c)

El `enumerate` anidado del despacho sale numérico (`\arabic*.`, ver
`../qillqasqa/marco_documental/core/config/listas.tex`). Para una **agenda con letras** a) b) c) —como pide
el Word— se sobreescribe por instancia con `enumitem`:

```latex
\noindent\textbf{Agenda:}
\begin{enumerate}[label=\alph*)]
  \item Primer punto…
\end{enumerate}
```

## 4. Sello

- **Colgante** (por defecto de `\bloquefirma`): el sello cuelga junto a la
  firma. **Nunca deja hueco**, caiga donde caiga la firma.
- **Al fondo** (`\sinsello` en preámbulo + `\selloalfondo` tras la firma): el
  sello se ancla al pie de la página. Solo sirve cuando la firma cae BAJA en
  la página (documento de una hoja con `\vfill`); si la firma queda alta,
  deja un hueco (ver §1).

**Regla automática en el generador editable (2026-08-14):** para documentos
**multipágina** (`fmt_multipagina=si`, donde la firma sigue al texto y puede
caer alta en la última hoja), el generador **ignora `fmt_sello=fondo` y usa
el sello COLGANTE** —omite `\sinsello`/`\selloalfondo`— para que NUNCA quede
el hueco. Está en `../qillqasqa/qillqasqa/latex/generador.py` (`_preambulo_formato` y
`_cierre_normativo`). Así el bug de la firma con hueco no se repite: sale bien
solo, sin compactar a mano.
