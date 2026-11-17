# Convenciones de UI (reglas para quien escribe pantallas)

Este documento fija **cómo se construye una pantalla** para no repetir refactors. Es normativo:
cada regla nació de algo que hubo que corregir a mano. El catálogo de componentes y sus props
está en [`ui-components.md`](ui-components.md); los tokens de color, en [`theming.md`](theming.md).
Aquí está el **cuándo y el porqué**.

> **Para agentes:** leé este archivo entero antes de crear o cambiar una pantalla, un panel o un
> diálogo. Si una regla choca con lo que te piden, no la rompas en silencio: decilo y pedí una
> decisión. Las reglas marcadas **[ESLint]** las hace cumplir el linter; las demás, la revisión.

## 0. Orden de decisión (resumen de una página)

Antes de escribir un control o una vista, recorré esto en orden:

1. ¿Ya existe un primitivo en `@/components/ui`? **Usalo.** No copies sus clases (§1, §2).
2. ¿Es una lista de filas? → `DataTable`, sin scroll horizontal (§6).
3. ¿Cuántas acciones tiene cada fila? Más de 3 → las ocasionales van a `ActionMenu` (§3).
4. ¿Alguna acción es destructiva? → variante y diálogo según §5.
5. ¿Algún control puede quedar deshabilitado? → el motivo va **visible** (§4).
6. ¿Pinta datos del servidor? → estados loading / vacío / error / 403 (§7).
7. ¿Escribís texto con números? → plural correcto (§9).
8. Al terminar: checklist de §12.

## 1. Botones **[ESLint]**

- Un botón sale **siempre** de `Button`, `IconButton`, `TabButton` o `RowActionButton`.
  `<button>` crudo está prohibido fuera de `src/components/ui` por la regla `no-restricted-syntax`
  de `eslint.config.js`.
- **Por qué:** cada `<button>` crudo copia estilos de foco, tamaño y estados que después
  divergen. Hubo copias de las clases outline que ya no coincidían con `Button`.
- **Excepciones legítimas** (no existe primitivo, y una variante `link` sería API nueva):
  chips o toggles con `aria-pressed`, disclosures con `aria-expanded`, filas o resultados
  clicables, enlaces de texto en línea, pestañas con diseño propio, chrome de layout con
  medidas propias (`h-9`).
- **Cómo registrar una excepción:** agregá el archivo al override de `eslint.config.js` (el
  bloque «Excepciones a la regla anterior») y justificá la razón en el comentario. No uses
  `eslint-disable` suelto para saltarte la regla.
- Texto o icono: `IconButton` (exige `label`, que pone `aria-label` y tooltip) **solo** si la
  acción se repite (filas, barras) **y** es universalmente reconocible: editar, eliminar,
  actualizar, copiar, navegar, ver/ocultar. Las acciones de dominio («Adoptar», «Reconciliar»,
  «Aplicar a todas 🔌»), los botones primarios de página, las confirmaciones destructivas finales
  y los botones con contador **conservan el texto**.
- Iconos: solo del set `components/ui/icons.tsx`. Si falta uno, se agrega ahí.
- Un solo `primary` por pantalla o formulario (la acción que avanza).
- **Hover:** ningún control usa `bg-surface-muted` al pasar el puntero (es el tinte de la fila
  apuntada y el botón desaparecería). Los controles se resaltan con `bg-primary/10`.

## 2. Enlaces con aspecto de botón **[revisión]**

- Si navega, es un `<Link>` con `className={buttonClassName({ variant, size })}`. Nunca un
  `<Button>` dentro de un `<Link>` (dos controles anidados, HTML inválido).
- **Nunca** pegues una cadena de clases de botón a mano en un `<Link>`: usá `buttonClassName`.
  Es la única forma de que un cambio de diseño llegue a todos.

## 3. Acciones por fila y `ActionMenu` **[revisión]**

- **Máximo 3 acciones visibles** por fila o por barra de cabecera de una lista. Con más, las de
  uso **ocasional** pasan a `ActionMenu` («Más acciones de «<nombre>»», con el nombre de la fila
  en el `label`).
- **Nunca** se esconde en el menú: la acción destructiva ni las acciones de dominio frecuentes.
  El menú se coloca **antes** de la destructiva, para que ésta siga siendo lo último de la fila.
- Cada ítem del menú ejecuta **exactamente** lo que hacía su botón. Un ítem bloqueado se queda en
  el menú, deshabilitado.
- **No migres a `RowActionButton` un botón que un test busca por su nombre exacto** (por
  ejemplo `'Eliminar'`): `RowActionButton` le agrega `«sujeto»` al nombre accesible y rompe esos
  tests. Si lo migrás, actualizá los tests en el mismo cambio.
- Si el control lleva un `aria-describedby` (aviso de acceso) y el `ActionMenu` no puede
  conservarlo, **dejá el botón visible**. Perder la descripción accesible es peor que una fila
  más ancha.
- Contenedor de acciones de una fila: `flex flex-wrap`. En la tarjeta de `< md` seis botones no
  caben y la destructiva quedaría fuera de pantalla.

## 4. Controles deshabilitados **[revisión]**

- El **motivo** de un control deshabilitado va **visible**, en texto, junto al control, y el
  control lo referencia con `aria-describedby`. Si el motivo viene de permisos, usá
  `CapabilityCallout` (uno por pantalla) o `CapabilityHint` (uno por control) con
  `useCapabilityGuard`.
- `Button.disabledReason` es **solo un tooltip nativo** (`title`). No llega por teclado ni en
  táctil, y **no** es una descripción accesible. Se usa como complemento, nunca como único canal.
- Lo mismo vale para `Badge title` y para un `<span title>` alrededor de un botón deshabilitado.
- Un botón gris sin explicación parece roto. Si lo que falta es que **carga** algo, usá
  `isLoading` (spinner) en vez de `disabled` mudo.
- Para pasar el id: `useId()` en el componente que muestra el motivo, el mismo id en el control.

## 5. Severidad de acciones destructivas **[revisión]**

| Dónde | Variante |
| --- | --- |
| Fila de tabla o botón de cabecera de una ficha que **abre** un diálogo destructivo | `danger-soft` |
| Botón de **confirmación final** dentro de `ConfirmDialog` | `danger` |
| Acción normal de fila | `ghost` |
| Acción secundaria con peso de primaria | `outline` |

- Rojo **solo en dos intensidades**: `danger-soft` y `danger`. Nada de rojo intermedio ni de
  `danger` sólido repetido en cada fila.
- **Criterio para decidir si una acción es destructiva:** mirá el `tone` de su `ConfirmDialog`. Si
  el diálogo es `danger`, el botón que lo abre es `danger-soft`. Si la acción cierra algo
  **para siempre** (Rechazar, Cancelar solicitud, Revocar, Eliminar, Quitar del inventario), es
  destructiva aunque no borre datos del motor.
- Las acciones que tocan un motor real y son irreversibles llevan 🔌 en el texto y confirmación
  explícita. **Nada de reintentos automáticos.**
- El botón que **retrocede** o descarta un paso sin consecuencias (Cancelar un formulario, Limpiar
  selección) es `ghost`, no rojo. No confundas «Cancelar» de un formulario con «Cancelar
  solicitud» de un flujo.

## 6. Tablas **[ESLint]**

- Toda lista de filas es un `DataTable`. **Ninguna tabla lleva scroll horizontal**; por debajo de
  `md` `DataTable` pinta una tarjeta por fila. No armes un `<table>` propio fuera de él: ESLint
  (`no-restricted-syntax`, selector `JSXOpeningElement[name.name='table']`) lo prohíbe fuera de
  `components/ui` y de la lista de excepciones de `eslint.config.js`.
- **La columna de acciones** es la de `header: ''`: en la tarjeta de `< md` queda sin etiqueta
  al final. Tiene que llevar `enableSorting: false` y `enableHiding: false`.
- **`columns`**: a nivel de módulo si no dependen de props ni de estado (lo habitual en tablas de
  solo lectura); en `useMemo` (con sus callbacks en `useCallback`) si dependen; si no,
  `react-hooks` marca `exhaustive-deps` y la tabla se recalcula en cada render. Dentro de un
  helper de render condicional (que no puede llamar hooks) se declaran en línea.
- **Si el orden es información, apagá la ordenación:** `enableSorting: false` en TODAS las columnas
  y `enableGlobalFilter={false}`. Aplica al orden de ejecución, al de aplicación de versiones, al
  de las columnas del motor y a los resultados que el servidor ya entrega ordenados. `DataTable`
  ordena y filtra en cliente por defecto, y un clic en la cabecera destruiría esa información.
- **Páginas del servidor:** `DataTable` no pagina si no pasás `clientPageSize`. Con paginación del
  servidor (`Pagination` debajo) no lo pases, y apagá ordenación y filtro: se ordenaría solo la
  página visible.
- **Controles por fila** (checkbox, `<select>`): conservan su `aria-label` con el nombre de la fila;
  sin él un lector de pantalla oye N controles idénticos.
- `getRowId` con el id estable del dominio, no el índice.
- `enableGlobalFilter={false}` si la lista tiene pocas filas y la búsqueda no aporta.
- **Excepciones documentadas** (cada una explica su motivo en el JSDoc de su componente y está en
  el override de tablas de `eslint.config.js`):
  - `EngineUsersPanel` y `InventoryStep` (modo `columns`): filas expandibles con subtabla anidada,
    que `DataTable` no soporta.
  - `StatementResultCard` y `SelectResultsPage`: rejillas del resultado de un SELECT arbitrario,
    con columnas dinámicas y celdas de ancho arbitrario; el scroll horizontal es parte del contenido.
  - `ReconcilePartialSection`: región con scroll vertical propio y SQL multilínea.
  - `RenameSlugDialog`: filas resaltadas por bloqueo y `table-fixed` sin scroll horizontal.
  Una excepción nueva se justifica en el JSDoc del componente y se agrega a ese override.
- Estados de fila (adoptada / no gestionada / huérfana, etc.): usá `Badge` con `tone` y, para
  explicar el significado, `StatusLegend` **una vez** bajo la tabla, no prosa repetida por fila.

## 7. Estados de pantalla **[revisión]**

Toda pantalla que pide datos resuelve los cuatro, en este orden:

1. **Cargando:** `isLoading` de `DataTable` o `Spinner`/`FullPageSpinner`.
2. **Error:** `ErrorState` con `onRetry`. Si el error es **403** (`isAccessForbidden`), usá
   `ForbiddenState`: **sin «Reintentar»**, porque el mismo pedido da el mismo 403.
3. **Vacío:** `EmptyState` con `title`, descripción que **explique qué es** lo que falta y, si
   hay acción, `action`.
4. **Con datos.**

Los guards de UI son **pistas**: el servidor decide. Deshabilitá o escondé con
`useCapabilityGuard` (con motivo visible, §4), pero manejá igual el 403.

## 8. Secciones colapsables y filtros **[revisión]**

- Un colapsable usa un botón con `aria-expanded` y `aria-controls`.
- Si hay estado que el usuario ya cargó (filtros avanzados en la URL, un rango inválido), la
  sección **arranca abierta**. Calculalo en `useState(() => …)`, no en un efecto.
- Ocultá con el atributo `hidden` sobre un contenedor **sin clases `display`** (`flex`, `grid`),
  porque un `display` explícito gana al `hidden`. Los inputs siguen montados: el borrador del
  formulario no se pierde al plegar.
- Lo que el usuario usa siempre (presets, el campo principal, «Aplicar» y «Limpiar») queda fuera
  del colapsable.
- Un botón cuyo nombre incluye un contador cambia de nombre accesible cuando cambia el contador:
  los tests lo buscan con regex, no con texto exacto.

## 9. Copy y texto **[revisión]**

- **Todo en español**: UI, comentarios y JSDoc. Los comentarios explican el **porqué**.
- **Plurales:** nunca texto fijo con un contador. `1 activo` / `2 activos`. Si la misma frase
  aparece en varios sitios, un helper o una expresión explícita; no un «(s)».
- Un mensaje de error dice **qué pasó y cómo seguir**, y nunca expone SQL, rutas ni ids internos.
- Seguí el registro (tú / vos) de la pantalla que modificás; no mezcles dos en una vista.
- El estado nunca se transmite solo por color: icono o texto además.

## 10. Layout y navegación

- Una **ruta nueva** se agrega en `NAV_SECTIONS` de `components/layout/Sidebar.tsx`. Si no, cae en
  la sección de respaldo («Otros»). Mantené `NAV_ITEMS`, rutas y `anyOf` coherentes.
- Los **asistentes** usan los componentes compartidos `Stepper`/`WizardStepper` y
  `WizardFooter` + `WizardBackButton`. No vuelvas a copiar el pie: «Atrás» a la izquierda
  (`ghost`), la única acción `primary` a la derecha. `clone-batches/WizardShell` es la excepción.
- Una pestaña nueva usa `TabButton` dentro de un `div role="tablist"` con `flex flex-wrap`.
- Nada de scroll horizontal de página: ver `min-w-0` en [`ui-components.md`](ui-components.md).

## 11. Color y contraste **[revisión]**

- Colores **solo por tokens** de `src/styles/theme.css`. Prohibido hex/rgb en componentes.
- WCAG: texto 4.5:1; borde de control (input, botón outline) 3:1. `--input` es el borde de los
  controles y se subió por eso. `--border` es suave a propósito (separadores, no controles).
- Cualquier token nuevo se valida en claro y en oscuro antes de usarse.

## 12. Tests y verificación **[revisión]**

- Se **escriben** tests con cada cambio de comportamiento; **no se ejecutan** salvo pedido
  explícito (ver `CLAUDE.md`). Siempre decí al cerrar que no se corrieron.
- `DataTable` pinta **tabla y tarjetas a la vez** en el DOM: `getByRole` con un nombre único falla
  por duplicado. Acotá con `within(await screen.findByRole('table'))`.
- Buscá por **rol y nombre accesible**, nunca por clase o `data-testid`. Si cambiás el nombre de
  un botón, actualizá sus tests en el mismo cambio.
- Si cambiás una tabla, un menú o un colapsable, el test cubre: que la acción sigue existiendo,
  que hace lo mismo y el estado inicial (abierto/cerrado).
- Verificaciones que **sí** se corren: `pnpm typecheck`, `pnpm lint` y `pnpm build`, más
  `npx prettier --write` sobre los archivos tocados.

## 13. Checklist antes de dar por terminado un cambio de UI

- [ ] ¿Cada botón sale de un primitivo? ¿Las excepciones están en el override de ESLint?
- [ ] ¿Ningún motivo de bloqueo vive solo en un `title`?
- [ ] ¿Las destructivas usan `danger-soft` / `danger` según §5?
- [ ] ¿Ninguna fila supera 3 acciones visibles sin `ActionMenu`?
- [ ] ¿La tabla es `DataTable`, con `header: ''` y `useMemo`?
- [ ] ¿Hay estados loading / vacío / error / 403?
- [ ] ¿Los plurales y el copy están en español y sin texto fijo con contador?
- [ ] ¿Se actualizaron los tests, `docs/ui-components.md` y, si hay endpoint nuevo,
      `docs/api-coverage.md`?
- [ ] ¿`pnpm typecheck`, `pnpm lint` y `prettier` pasan? ¿Se aclaró que los tests no se corrieron?
- [ ] ¿Se conservó cada función y cada botón de acción de la pantalla original?
