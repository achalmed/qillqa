import { createTheme } from '@mui/material/styles'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined'
import { createElement } from 'react'
import { MODO, PALETA } from './paleta'

// Celular y tableta, más compactos (Edison 2026-10-06: «los elementos deberían
// ser un poco más pequeños… hay botones muy grandes o elementos que ocupan casi
// todo el espacio»). CEL = teléfono; TAB = teléfono y tableta. Los campos de
// texto NO bajan de 16 px en el celular (el iPhone acercaría la página).
const CEL = '@media (max-width: 599.95px)'
const TAB = '@media (max-width: 899.95px)'

/** Un velo del tono al 10 % con el texto del tono: la pastilla tenue de todo el sistema. */
const pastilla = (tono: string) => ({ backgroundColor: `${tono}1A`, color: tono, '& .MuiChip-deleteIcon': { color: `${tono}99`, '&:hover': { color: tono } } })

// Rediseño tipo macOS (Edison 2026-10-19; docs/plataforma/rediseno-macos.md): tipografía del
// sistema, fondo gris claro y superficies blancas, radios de 8–12 px, sombras muy suaves, un solo
// acento (la tinta) y color solo donde dice algo. La paleta vive en paleta.ts con su porqué; aquí
// solo se conecta a MUI y se fija el aspecto por defecto de cada pieza, para que la mayoría de
// pantallas cambie sin tocarlas. La apariencia (clara u oscura) ya viene resuelta en PALETA
// (apariencia.ts): aquí solo se declara el `mode` para que MUI ajuste lo suyo (sombras, rellenos
// por omisión, el contraste de los colores de componente).
export const tema = createTheme({
  palette: {
    mode: MODO === 'oscuro' ? 'dark' : 'light',
    primary: { main: PALETA.primario, light: PALETA.primarioClaro, dark: PALETA.primarioOscuro, contrastText: PALETA.sobrePrimario },
    secondary: { main: PALETA.secundario },
    warning: { light: PALETA.avisoClaro, main: PALETA.aviso, dark: PALETA.avisoOscuro, contrastText: PALETA.sobrePrimario },
    error: { main: PALETA.error },
    success: { main: PALETA.exito },
    info: { main: PALETA.info },
    background: { default: PALETA.fondo, paper: PALETA.superficie },
    text: { primary: PALETA.texto, secondary: PALETA.textoSecundario, disabled: PALETA.textoTenue },
    divider: PALETA.borde,
    action: { hover: PALETA.velo, selected: PALETA.veloMedio, focus: PALETA.focoVelo },
  },
  typography: {
    // La letra del aparato: SF en Apple, Segoe en Windows, Roboto en Android; Inter si está.
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Inter, "Helvetica Neue", Arial, sans-serif',
    // Jerarquía de títulos ÚNICA (Edison 2026-09-05; ver componentes/Estilo.tsx):
    //   h6        → título de sección (Datos del documento, 1.6 Cuerpo…)
    //   subtitle2 → subtítulo dentro de una sección (Documentos adjuntos)
    //   caption   → rótulos, ayudas y notas
    // La jerarquía la dan el peso y el tamaño, nunca el color.
    h5: { fontSize: '1.35rem', fontWeight: 700, letterSpacing: '-0.015em', lineHeight: 1.25 },
    h6: { fontSize: '0.95rem', fontWeight: 600, letterSpacing: '-0.005em', lineHeight: 1.35 },
    subtitle1: { fontSize: '0.9rem', fontWeight: 600, lineHeight: 1.4 },
    subtitle2: {
      fontSize: '0.72rem',
      fontWeight: 600,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      color: PALETA.textoTenue,
      lineHeight: 1.4,
    },
    caption: { fontSize: '0.75rem', lineHeight: 1.4 },
    // body1 y body2 del celular: ver MuiCssBaseline (2026-10-19). Puestos aquí, su regla de medios
    // ganaba a cualquier `fontSize` de `sx` y todo texto pequeño del teléfono salía a 14,4 px.
    // Botones en caja de oración (no MAYÚSCULAS): más sobrio y legible.
    button: { fontWeight: 600, letterSpacing: '0', textTransform: 'none' },
  },
  // La unidad de los `borderRadius: n` del código (n × 4): 2 = 8 px, 2.5 = 10, 3 = 12.
  shape: { borderRadius: 4 },
  components: {
    // Superficies planas: el orden lo dan el espacio y los títulos, no las
    // sombras ni las cajas (Edison 2026-09-05: «demasiadas cajas y
    // separadores»). Lo que necesita borde lo pide con variant="outlined".
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        rounded: { borderRadius: 10 },
        outlined: { borderColor: PALETA.borde },
        // Lo que flota (menús, ayudas) lleva la sombra suave y un borde fino, no la sombra de MUI.
        elevation1: { boxShadow: PALETA.sombra },
        elevation2: { boxShadow: PALETA.sombra },
        elevation3: { boxShadow: PALETA.sombra },
        elevation4: { boxShadow: PALETA.sombra },
        elevation8: { boxShadow: PALETA.sombra, border: `1px solid ${PALETA.borde}` },
      },
    },
    // La barra de arriba: clara, con el texto en tinta y una línea fina abajo (antes, vino macizo).
    MuiAppBar: {
      defaultProps: { color: 'inherit', elevation: 0 },
      styleOverrides: {
        root: { backgroundColor: PALETA.barra, color: PALETA.texto, borderBottom: `1px solid ${PALETA.borde}`, backdropFilter: 'saturate(180%) blur(12px)' },
      },
    },
    // Botones: UN solo aspecto en todo el sistema (Edison 2026-10-12). El relleno es la tinta y
    // marca la acción principal; el delineado, borde fino y texto en tinta; nunca en color.
    MuiButton: {
      defaultProps: { disableElevation: true },
      variants: [
        {
          props: { variant: 'outlined', color: 'inherit' },
          style: {
            color: PALETA.texto,
            borderColor: PALETA.bordeFuerte,
            '&:hover': { borderColor: PALETA.textoTenue, backgroundColor: PALETA.primarioSuave },
          },
        },
      ],
      styleOverrides: {
        root: { borderRadius: 8, [TAB]: { fontSize: '0.84rem', minHeight: 32, padding: '4px 12px' } },
        outlined: { borderColor: PALETA.bordeFuerte, '&:hover': { borderColor: PALETA.textoTenue, backgroundColor: PALETA.primarioSuave } },
        outlinedPrimary: { color: PALETA.texto },
        text: { '&:hover': { backgroundColor: PALETA.primarioSuave } },
        sizeSmall: { [TAB]: { fontSize: '0.8rem', minHeight: 28, padding: '2px 8px' } },
        startIcon: { [TAB]: { marginRight: 6, '& > *:nth-of-type(1)': { fontSize: 18 } } },
        endIcon: { [TAB]: { marginLeft: 6, '& > *:nth-of-type(1)': { fontSize: 18 } } },
      },
    },
    // El botón flotante (el del chat y el de cada módulo): tinta con sombra suave.
    MuiFab: { styleOverrides: { root: { boxShadow: PALETA.sombraFlotante, '&:hover': { boxShadow: PALETA.sombraFlotante } } } },
    MuiIconButton: { styleOverrides: { root: { borderRadius: 8, [TAB]: { padding: 6 } }, sizeSmall: { [TAB]: { padding: 4 } } } },
    MuiToggleButtonGroup: { styleOverrides: { root: { backgroundColor: PALETA.superficieMedia, borderRadius: 8, padding: 2, gap: 2 } } },
    // El selector segmentado de macOS: fondo gris, el elegido en blanco con sombra suave.
    MuiToggleButton: {
      styleOverrides: {
        root: {
          border: 'none', borderRadius: '6px !important', color: PALETA.textoSecundario, textTransform: 'none', fontWeight: 500,
          padding: '3px 10px', fontSize: '0.84rem', [TAB]: { padding: '3px 10px', fontSize: '0.8rem' },
          '&.Mui-selected': { backgroundColor: PALETA.superficie, color: PALETA.texto, fontWeight: 600, boxShadow: '0 1px 2px rgba(0,0,0,.12)', '&:hover': { backgroundColor: PALETA.superficie } },
          '&.MuiToggleButtonGroup-grouped': { margin: 0 },
          '&:hover': { backgroundColor: PALETA.velo },
        },
      },
    },
    // Pastillas: la neutra en gris claro; las de color, un velo del tono con el texto del tono
    // (nunca relleno con texto blanco); la delineada, borde fino.
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 500, [TAB]: { fontSize: '0.76rem' } },
        filled: { backgroundColor: PALETA.superficieMedia, color: PALETA.texto },
        outlined: { borderColor: PALETA.bordeFuerte },
        sizeSmall: { [TAB]: { height: 22 } },
        colorPrimary: { '&.MuiChip-filled': { backgroundColor: PALETA.primario, color: PALETA.sobrePrimario }, '&.MuiChip-outlined': { color: PALETA.texto, borderColor: PALETA.bordeFuerte } },
        colorSecondary: { '&.MuiChip-filled': pastilla(PALETA.secundario) },
        colorWarning: { '&.MuiChip-filled': pastilla(PALETA.aviso), '&.MuiChip-outlined': { color: PALETA.avisoOscuro, borderColor: PALETA.avisoBorde } },
        colorError: { '&.MuiChip-filled': pastilla(PALETA.error), '&.MuiChip-outlined': { color: PALETA.error, borderColor: `${PALETA.error}66` } },
        colorSuccess: { '&.MuiChip-filled': pastilla(PALETA.exito), '&.MuiChip-outlined': { color: PALETA.exito, borderColor: PALETA.exitoBorde } },
        colorInfo: { '&.MuiChip-filled': pastilla(PALETA.info), '&.MuiChip-outlined': { color: PALETA.info, borderColor: `${PALETA.info}66` } },
      },
    },
    MuiTextField: { defaultProps: { size: 'small' } },
    // Campos: borde fino, radio 8 y el foco en el azul del sistema.
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: PALETA.bordeFuerte },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: PALETA.textoTenue },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: PALETA.acento, borderWidth: 1.5 },
        },
      },
    },
    MuiFilledInput: { styleOverrides: { root: { borderRadius: 8, backgroundColor: PALETA.superficieMedia } } },
    MuiInputLabel: { styleOverrides: { root: { '&.Mui-focused': { color: PALETA.acento } } } },
    MuiLink: { defaultProps: { underline: 'hover' }, styleOverrides: { root: { color: PALETA.acento } } },
    MuiAccordion: {
      defaultProps: { disableGutters: true, elevation: 0 },
      styleOverrides: {
        root: { '&::before': { display: 'none' }, background: 'transparent' },
      },
    },
    MuiDivider: { styleOverrides: { root: { borderColor: PALETA.borde } } },
    // Revisión de tamaños (Edison 2026-10-01: «ni interfaces excesivamente
    // grandes ni elementos comprimidos»): barras de 48 px en todas las
    // pantallas, menús y ayudas en la letra del resto de la interfaz, pestañas compactas.
    MuiToolbar: { defaultProps: { variant: 'dense' } },
    MuiMenu: { styleOverrides: { paper: { borderRadius: 10, boxShadow: PALETA.sombraFlotante, border: `1px solid ${PALETA.borde}` }, list: { padding: 4 } } },
    MuiMenuItem: { styleOverrides: { root: { fontSize: '0.875rem', minHeight: 34, borderRadius: 6, margin: '0 0', '&.Mui-selected': { backgroundColor: PALETA.primarioSuave } } } },
    MuiListItemButton: { styleOverrides: { root: { '&.Mui-selected': { backgroundColor: PALETA.primarioSuave, '&:hover': { backgroundColor: PALETA.veloFuerte } } } } },
    // Ayudas y avisos flotantes: la tinta con su texto de contraste (en la oscura, claro sobre casi blanco).
    MuiTooltip: { styleOverrides: { tooltip: { fontSize: '0.75rem', lineHeight: 1.4, backgroundColor: PALETA.texto, color: PALETA.sobrePrimario, borderRadius: 6 } } },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', minHeight: 36, color: PALETA.textoSecundario, '&.Mui-selected': { color: PALETA.texto }, [TAB]: { minWidth: 0, padding: '6px 10px', fontSize: '0.84rem' } } } },
    MuiTabs: { styleOverrides: { root: { minHeight: 36 }, indicator: { height: 2, borderRadius: 2, backgroundColor: PALETA.texto } } },
    MuiBottomNavigation: { styleOverrides: { root: { backgroundColor: PALETA.superficie } } },
    MuiBottomNavigationAction: { styleOverrides: { root: { color: PALETA.textoTenue, '&.Mui-selected': { color: PALETA.texto } } } },
    // Avisos: una tarjeta blanca de borde fino con el icono en el tono (nada de fondos pastel ni
    // franjas laterales). Sin triángulos: el aviso es un círculo con «!», como en macOS.
    MuiAlert: {
      defaultProps: {
        iconMapping: {
          success: createElement(CheckCircleOutlineIcon, { fontSize: 'inherit' }),
          info: createElement(InfoOutlinedIcon, { fontSize: 'inherit' }),
          warning: createElement(ErrorOutlineIcon, { fontSize: 'inherit' }),
          error: createElement(CancelOutlinedIcon, { fontSize: 'inherit' }),
        },
      },
      styleOverrides: {
        root: {
          borderRadius: 10,
          [TAB]: { padding: '2px 10px', fontSize: '0.84rem' },
          // Las acciones de un aviso son botones del sistema, no del color del texto.
          '& .MuiButton-text.MuiButton-colorInherit': { color: PALETA.texto },
        },
        standard: { backgroundColor: PALETA.superficie, color: PALETA.texto, border: `1px solid ${PALETA.borde}` },
        icon: { [TAB]: { marginRight: 8, padding: '6px 0', fontSize: 20 } },
        message: { [TAB]: { padding: '6px 0' } },
        standardWarning: { '& .MuiAlert-icon': { color: PALETA.aviso } },
        standardError: { '& .MuiAlert-icon': { color: PALETA.error } },
        standardInfo: { '& .MuiAlert-icon': { color: PALETA.info } },
        standardSuccess: { '& .MuiAlert-icon': { color: PALETA.exito } },
        // Los avisos flotantes (variant="filled", en Snackbar): todos en tinta con el icono en su tono,
        // nunca un relleno de color con texto blanco (2026-10-19).
        filled: { backgroundColor: PALETA.texto, color: PALETA.sobrePrimario, '& .MuiAlert-icon': { opacity: 1 }, '& .MuiAlert-action': { color: PALETA.sobrePrimario } },
        filledInfo: { backgroundColor: PALETA.texto, color: PALETA.sobrePrimario },
        filledSuccess: { backgroundColor: PALETA.texto, '& .MuiAlert-icon': { color: PALETA.exito } },
        filledWarning: { backgroundColor: PALETA.texto, '& .MuiAlert-icon': { color: PALETA.aviso } },
        filledError: { backgroundColor: PALETA.texto, '& .MuiAlert-icon': { color: PALETA.error } },
      },
    },
    // Diálogos: radio 14 y sombra flotante. En el celular todo diálogo que no es de pantalla
    // completa sale como HOJA INFERIOR, como en Android (Edison 2026-10-12): a lo ancho, pegado
    // abajo, con las esquinas de arriba redondeadas (las de HojaInferior) y el borde seguro del iPhone.
    MuiDialog: {
      styleOverrides: {
        container: { [CEL]: { alignItems: 'flex-end' } },
        paper: {
          borderRadius: 14, boxShadow: PALETA.sombraFlotante,
          [CEL]: {
            '&:not(.MuiDialog-paperFullScreen)': {
              margin: 0, width: '100%', maxWidth: '100%', maxHeight: 'calc(100% - 32px)',
              borderRadius: '16px 16px 0 0', paddingBottom: 'env(safe-area-inset-bottom)',
              // El asa de las hojas inferiores (HojaInferior), para que todas se vean iguales.
              '&::before': { content: '""', display: 'block', flexShrink: 0, width: 36, height: 4, borderRadius: 2, backgroundColor: PALETA.bordeFuerte, margin: '8px auto 0' },
            },
          },
        },
      },
    },
    MuiDialogTitle: { styleOverrides: { root: { fontWeight: 600, [TAB]: { fontSize: '1rem', padding: '14px 16px 6px' } } } },
    MuiDialogContent: { styleOverrides: { root: { [TAB]: { padding: '8px 16px' } } } },
    MuiDialogActions: { styleOverrides: { root: { [TAB]: { padding: '8px 12px' } } } },
    MuiDrawer: { styleOverrides: { paper: { borderRight: `1px solid ${PALETA.borde}`, boxShadow: PALETA.sombraFlotante } } },
    // Ayudas y menús emergentes: nunca más anchos que la pantalla.
    MuiPopover: { styleOverrides: { paper: { borderRadius: 10, boxShadow: PALETA.sombraFlotante, border: `1px solid ${PALETA.borde}`, [CEL]: { maxWidth: 'calc(100vw - 16px)' } } } },
    MuiSnackbarContent: { styleOverrides: { root: { backgroundColor: PALETA.texto, color: PALETA.sobrePrimario, borderRadius: 10 } } },
    MuiLinearProgress: { styleOverrides: { root: { borderRadius: 2, backgroundColor: PALETA.superficieMedia }, bar: { borderRadius: 2 } } },
    MuiSkeleton: { styleOverrides: { root: { backgroundColor: PALETA.superficieMedia } } },
    MuiCheckbox: { styleOverrides: { root: { color: PALETA.bordeFuerte } } },
    MuiRadio: { styleOverrides: { root: { color: PALETA.bordeFuerte } } },
    MuiSwitch: {
      styleOverrides: {
        switchBase: { '&.Mui-checked': { color: '#fff' }, '&.Mui-checked + .MuiSwitch-track': { backgroundColor: PALETA.exito, opacity: 1 } },
        track: { backgroundColor: PALETA.bordeFuerte, opacity: 1 },
      },
    },
    // Safari del iPhone acerca la página al tocar un campo con letra < 16 px:
    // en el celular los campos usan 16 px y la página no salta.
    // El campo «Hora» (2026-10-18, Edison: «el ícono del reloj tapa la hora, se ve 03:0(»): la hora
    // tiene un ancho mínimo para «12:00 p. m.» y el reloj queda FUERA del texto, pegado a la derecha.
    MuiInputBase: {
      styleOverrides: {
        input: {
          '@media (max-width: 599.95px)': { fontSize: 16 },
          '&[type="time"]': { minWidth: '6.6em', paddingRight: 4 },
          '&[type="time"]::-webkit-calendar-picker-indicator': { marginLeft: 4, padding: 0, flexShrink: 0 },
          '&[type="time"]::-webkit-datetime-edit': { overflow: 'visible' },
        },
      },
    },
    // Barras de desplazamiento (Edison 2026-10-13: «en un aplicativo Android no aparecen»). En
    // pantallas táctiles o angostas no se dibujan; en escritorio con ratón, una barra fina y
    // discreta, para TODO contenedor con su propia barra.
    MuiCssBaseline: {
      styleOverrides: {
        // Celular: body1 y body2 un punto más chicos. Como estilo global (y no como variante del tema)
        // para que un `fontSize` puesto por `sx` siga mandando: la clase de `sx` se inserta después y gana.
        '.MuiTypography-body1': { [CEL]: { fontSize: '0.9rem', lineHeight: 1.45 } },
        '.MuiTypography-body2': { [CEL]: { fontSize: '0.84rem' } },
        '*': { scrollbarWidth: 'thin', scrollbarColor: `${PALETA.bordeFuerte} transparent` },
        '*::-webkit-scrollbar': { width: 8, height: 8 },
        '*::-webkit-scrollbar-track': { background: 'transparent' },
        '*::-webkit-scrollbar-thumb': { backgroundColor: PALETA.bordeFuerte, borderRadius: 8, border: '2px solid transparent', backgroundClip: 'content-box' },
        '*::-webkit-scrollbar-thumb:hover': { backgroundColor: PALETA.apagado },
        'a': { color: PALETA.acento },
        // Control de cambios (2026-10-19): la inserción sugerida, salvia subrayada; la supresión, roja tachada.
        '.ProseMirror ins[data-cambio]': { color: PALETA.exito, textDecoration: 'underline', textDecorationColor: PALETA.exito, backgroundColor: PALETA.exitoFondo },
        '.ProseMirror mark[data-resaltado]': { backgroundColor: PALETA.resaltado, color: 'inherit', borderRadius: 2 },
        '.ProseMirror span[data-comentario]': { backgroundColor: PALETA.comentarioFondo, borderBottom: `2px solid ${PALETA.comentarioLinea}`, cursor: 'pointer' },
        '.ProseMirror del[data-cambio]': { color: PALETA.error, textDecoration: 'line-through', textDecorationColor: PALETA.error, backgroundColor: `${PALETA.error}12` },
        // Formato sugerido y aún no aplicado (borde punteado); párrafo dividido o unión sugerida:
        // una línea discontinua arriba y el calderón al margen.
        '.ProseMirror span[data-cambio-formato]': { outline: `1px dotted ${PALETA.info}`, outlineOffset: 1, backgroundColor: `${PALETA.info}0F`, borderRadius: 2 },
        '.ProseMirror p[data-cambio-parrafo]': { position: 'relative', borderTop: '1px dashed' },
        '.ProseMirror p[data-cambio-parrafo]::before': { content: '"¶"', position: 'absolute', left: -18, top: 0, fontSize: 13, lineHeight: 1.4, fontWeight: 600 },
        '.ProseMirror p[data-cambio-parrafo="insercion"]': { borderTopColor: `${PALETA.exito}99` },
        '.ProseMirror p[data-cambio-parrafo="insercion"]::before': { color: PALETA.exito },
        '.ProseMirror p[data-cambio-parrafo="supresion"]': { borderTopColor: `${PALETA.error}99` },
        '.ProseMirror p[data-cambio-parrafo="supresion"]::before': { color: PALETA.error, textDecoration: 'line-through' },
        // Táctil o angosta: ninguna (va después, así que manda).
        '@media (pointer: coarse), (max-width: 899.95px)': {
          '*': { scrollbarWidth: 'none' },
          '*::-webkit-scrollbar': { display: 'none', width: 0, height: 0 },
        },
      },
    },
    // Tablas: cabecera pequeña en gris, filas con línea fina.
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottomColor: PALETA.borde, '@media (max-width: 599.95px)': { paddingLeft: 8, paddingRight: 8 } },
        head: { fontSize: '0.75rem', fontWeight: 600, color: PALETA.textoSecundario, backgroundColor: PALETA.superficie },
      },
    },
    MuiTableRow: { styleOverrides: { root: { '&.Mui-selected': { backgroundColor: PALETA.primarioSuave } } } },
  },
})
