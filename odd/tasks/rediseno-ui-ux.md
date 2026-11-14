# Rediseño UI/UX del frontend

Objetivo: modernizar las vistas sin quitar funciones. Rama: main (sin rama nueva, no pedida). Estrategia: ask-on-risk. Tests: no se ejecutan salvo pedido; solo typecheck/lint/build.
ClickUp: 1dfm34y4vk5

## Specs

- S1: "Adelante con todo, sin poblema en comenzar a modificar todo aunque tome mucho tiempo, seria lo mejor modernizar y mejorar estas vistas"
- S2: No se elimina ninguna función existente (guards de capacidad, 403, confirmaciones 🔌, secretos de un solo uso, `confirm_token`, slugs `?tab=`).
- S3: Reglas del proyecto: colores por tokens, texto en español, iconos de `components/ui/icons.tsx`, sin hover `bg-surface-muted` en controles, tablas sin scroll horizontal.

## Tasks

- [x] T1 (S2,S3) Fase 1 mecánica: hover `bg-surface-muted` -> `bg-primary/10` en controles — inline — sin commit (12 archivos; typecheck OK, lint 0 errores; tests no ejecutados)
- [ ] T2 (S3) Fase 1: skip link ✔ (AppShell, con Esc y rol dialog en el drawer; typecheck OK, lint 0 errores), flex-wrap en 9 barras de pestañas ✔, motivos del botón deshabilitado en IntegrationTokenFormModal ✔ (+1 test escrito, no ejecutado), skeleton de DataTable visible en dark + aria-busy ✔; pendiente: motivos en otros formularios y PanelSkeleton para spinners sueltos — inline
- [ ] T3 (S3) Fase 2: TabButton accesible ✔ (flechas/Inicio/Fin/tabindex móvil, docs actualizadas), drawer móvil ✔, AdoptionBadge con icono y consecuencia ✔; pendiente: Stepper compartido, VersionBadge, PanelSkeleton — inline
- [ ] T4 (S3) Fase 3: migración de tablas a DataTable y contraste de tokens — inline
- [ ] T5 (S1) Fase 4: matriz blueprint×canal y reorganización de pantallas — inline

## Log

- L1 (2026-11-14): Adelante con todo, sin poblema en comenzar a modificar todo aunque tome mucho tiempo, seria lo mejor modernizar y mejorar estas vistas
- L2: Ruta inline por regla del usuario (un solo escritor). Commits solo cuando el usuario los pida, vía agente `git`.
- L3 (2026-11-14): ActionMenu (src/components/ui/ActionMenu.tsx + test escrito, no ejecutado) aplicado a DatabaseRowActions: con más de 4 acciones, Reasignar/Agentes/Comparar/Clonar/Exportar van al menú; dominio, Editar, Migraciones y destructiva siguen visibles. Pendiente: EngineUsersPanel y ServerUserDetailPage.
