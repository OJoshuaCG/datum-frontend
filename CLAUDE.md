# Datum — Frontend

## Qué es y por qué existe

SPA de **React + TypeScript** que es la única interfaz de **Datum**. El gateway
existe para que un administrador opere servidores de bases de datos remotos —MySQL, MariaDB y
PostgreSQL— **sin entrar al motor a mano** (cliente SQL, SSH): crear y borrar bases y usuarios,
otorgar privilegios, versionar esquemas y aplicarlos, comparar y clonar bases.

**Alcance y límites, que son lo que más se malinterpreta:**

- Es **solo cliente**. No tiene backend propio, ni lógica de negocio, ni de seguridad: consume el
  contrato de `backend/docs/api-reference.md` y nunca lee ni modifica código del backend.
- **Hay roles y capacidades.** Cada endpoint exige una capacidad; qué otorga cada rol
  (`viewer`/`operator`/`owner`) y cada global (`access_admin`/`security_officer`) sale del
  catálogo `GET /authz/catalog`, nunca de una lista del frontend. A un rol se le pueden **sumar
  capacidades puntuales** (`docs/capability-grants.md`). El servidor chequea el rol unión
  (capa 1) y, **en toda ruta con destino** (declaran `require_at` desde
  `scope-enforcement-hardening`), el rol por alcance EN ese destino (capa 2): ver
  `features/auth/authz-model.ts`. Los guards de UI son **pistas**: deshabilitá o escondé con
  `useCapabilityGuard` (motivo visible), pero toda pantalla tiene que manejar el 403
  (`isAccessForbidden` → `ForbiddenState`/`forbiddenCopy`, sin «Reintentar»). El modelo
  completo está en `docs/authorization.md`.
- Muchas acciones **tocan un motor de BD real** y son irreversibles. Se marcan con 🔌 en la UI.
  Trátalas con la seriedad que merecen: confirmación explícita, nada de reintentos automáticos.

**Dos conceptos que se cruzan todo el tiempo:** el *motor* (lo que existe físicamente en el
servidor) y el *inventario* del gateway (lo que este registró). Una base o un usuario puede
existir en uno, en otro o en ambos — de ahí los estados `adopted`/`unmanaged`/`orphan` y la
pantalla de reconciliación.

## Cómo funciona

```
Componentes → hooks (TanStack Query) → capa API (fetch + Zod) → /api/v1
```

- **Un componente nunca llama a `fetch`.** Todo pasa por `src/lib/api/client.ts`, que valida cada
  respuesta con Zod en runtime y normaliza los errores a `ApiError`.
- Estado de servidor: **TanStack Query** (caché, invalidación). Estado de UI: local o contextos
  transversales (tema, toasts, sesión). Auth por **cookie httpOnly**, nunca tokens en JS.
- Los contratos Zod se escriben **a mano** (ADR-0001): un cambio de forma en el backend falla al
  ejecutar, no al compilar. Si ves `[api] Respuesta no conforme al contrato` en consola, es eso.

Estructura: `src/features/<feature>/{api,hooks,components,pages}` + `index.ts` (barrel = API
pública de la feature, y lo que carga el router en modo lazy). Compartido en `src/components/ui`,
`src/lib/{api,contracts,toast,theme,syntax}`.

## Reglas del proyecto (resumen)

- **Todo el texto en español**: UI, comentarios y JSDoc. Los comentarios explican el *porqué*.
- **Colores solo por tokens** de `src/styles/theme.css`. Prohibido hex/rgb en componentes.
- **Sin `any`.** Sin class components. Type imports en línea: `import { X, type Y } from '…'`.
- **Prohibido `setState` síncrono dentro de `useEffect`** y **llamar funciones impuras en render**
  (`Date.now()`, `Math.random()`): `react-hooks` v7 lo marca como error.
- Prettier: sin punto y coma, comillas simples, ancho 100.
- Al añadir un endpoint: sigue la receta de `docs/maintenance.md` (contrato → servicio → query key
  → hook → UI con estados loading/empty/error → test) y **añade su fila a `docs/api-coverage.md`
  en el mismo PR**. Si cambias un flujo, actualiza su documento.
- Commits: `tipo(alcance): descripción` en español, con cuerpo que explique el *porqué*.

**Convenciones de UI: `docs/ui-conventions.md` (léelo antes de crear o cambiar una pantalla).**
Es el documento normativo de botones, enlaces, acciones por fila, controles deshabilitados,
acciones destructivas, tablas, estados de pantalla, colapsables, copy, tests y checklist de cierre.
Resumen de lo que más se rompe:

- **Botones:** siempre `Button`, `IconButton`, `TabButton` o `RowActionButton`. `<button>` crudo
  está prohibido por ESLint (`no-restricted-syntax`) fuera de `components/ui`; las excepciones
  legítimas (chips, disclosures, filas clicables) están listadas con su motivo en
  `eslint.config.js`. Un enlace con aspecto de botón usa `buttonClassName(...)`, nunca clases
  copiadas.
- **Icono vs. texto:** `IconButton` (exige `label`) **solo** si la acción se repite **y** es
  universalmente reconocible (editar, eliminar, actualizar, copiar, navegar, ver/ocultar). Las
  acciones de dominio («Adoptar», «Reconciliar», «Aplicar a todas 🔌»), los botones primarios, las
  confirmaciones destructivas finales y los que llevan contador conservan el texto. Iconos solo de
  `components/ui/icons.tsx`.
- **Color:** rojo en dos intensidades — `danger-soft` en filas y en el botón que abre un diálogo
  destructivo, `danger` solo en la confirmación final. El resto `ghost` u `outline`. Ningún hover
  de un control usa `bg-surface-muted` (es el tinte de la fila); se resaltan con `bg-primary/10`.
- **Filas:** máximo 3 acciones visibles; las ocasionales van a `ActionMenu`, nunca la destructiva.
- **Deshabilitados:** el motivo va visible y enlazado con `aria-describedby`;
  `Button.disabledReason` es solo un tooltip y no basta.

⚠️ **Fin de línea:** `.gitattributes` fuerza LF en el repositorio (`* text=auto eol=lf`), así que
un diff con cambios solo de CRLF↔LF no debería aparecer. Si aparece, comprueba qué cambió de verdad
(`git diff --ignore-cr-at-eol -- <archivo>`) y no lo arrastres al commit. Al editar, conserva el
fin de línea que ya tiene el archivo.

## Documentación: consúltala, no la memorices

`docs/` describe el estado real del código. Entra al que toque en lugar de cargarlo todo:

`ui-conventions.md` (**reglas normativas de UI: el primero a leer antes de tocar una pantalla**) ·
`maintenance.md` (convenciones y recetas para ampliar algo) ·
`architecture.md` (capas y carpetas) · `data-flow.md` (recorrido de una request) ·
`api-coverage.md` (endpoint → pantalla) · `sql-console.md` (consola SQL: identidad de
ejecución y ciclo del `confirm_token`) · `database-export.md` (exportación de bases: los dos
conjuntos, la matriz de compatibilidad y el artefacto de un solo uso) · `authorization.md`
(**punto de entrada a permisos**: roles, globales, capa 1/capa 2, step-up, ventana de arranque y
códigos de error) · `capability-grants.md` (capacidades puntuales: quién otorga, segundo aprobador
de las sensibles, vencimiento a 7 días y acceso efectivo) · `separation-of-duties.md` (reglas,
override de emergencia, banner y reporte) · `audit.md` (pantalla de auditoría) · `ui-components.md` ·
`theming.md` · `testing.md` · `security.md` · `deployment.md` · `adr/` (el *porqué* de las
decisiones).

## Delegar en los agentes

Actúa como coordinador: para trabajo que abarca muchos archivos, **delega y quédate con las
conclusiones**, no con el volcado de los archivos. Lanza en paralelo lo que sea independiente y
asigna archivos disjuntos a cada agente para que no se pisen.

| Agente | Cuándo |
|---|---|
| `Explore` | Barridos de solo lectura: mapear dónde vive algo, rastrear un patrón por el repo. |
| `general-purpose` | Tareas de varios pasos que se pueden aislar (construir un componente, migrar N archivos). |
| `git` | **Agente propio del proyecto.** Commits granulares y mensajes según la convención. Confirma siempre el alcance antes de `git add`. |
| `Plan` | Diseñar la estrategia de un cambio grande antes de tocar código. |
| `claude-code-guide` | Dudas sobre Claude Code, el Agent SDK o la API de Claude. |

Cuando delegues, dale al agente el contexto que ya reuniste (rutas exactas, firmas, convenciones
de arriba). Un agente sin contexto reinventa patrones que este repo ya tiene resueltos.

## Tests: escribirlos sí, ejecutarlos no

**No ejecutes los tests salvo que se te pida explícitamente.** Ni `pnpm test`, ni `vitest run`,
ni variantes — tampoco como comprobación final al cerrar una tarea.

- **Sí** escribe y actualiza los tests que correspondan: siguen siendo parte del entregable.
- **Solo** ejecútalos cuando se pida en ese momento («corré los tests», «verificá que pasan»).
  Una autorización puntual no se extiende a las tareas siguientes.
- Cuando los ejecutes a petición, **acota el alcance** al archivo o carpeta afectados
  (`npx vitest run ruta/al/archivo.test.ts`); no lances la suite completa salvo que se pida.
- Al terminar, **di explícitamente que no se ejecutaron**. Nunca afirmes ni insinúes que los
  tests pasan si no los has corrido.

Motivo: en este entorno (WSL2 sobre `/mnt/c`) el arranque de cada worker de Vitest es muy lento
—la suite completa tarda varios minutos y a veces los workers ni siquiera arrancan—, así que
ejecutarla por rutina cuesta mucho más de lo que aporta.

`pnpm typecheck`, `pnpm lint` y `pnpm build` **sí** se siguen ejecutando con normalidad: son
rápidos y detectan la mayor parte de las regresiones.
