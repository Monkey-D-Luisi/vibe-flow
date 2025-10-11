# Informe técnico PR #91

## 0) Resumen ejecutivo

**Semáforo:** **Rojo**
- El orquestador avanza estados sin ejecutar los guards definidos, permitiendo que QA fallido llegue a PR (`services/task-mcp/src/orchestrator/runner.ts:212`, `services/task-mcp/src/orchestrator/runner.ts:325`).
- Los handlers MCP aceptan evidencia incompatible con los schemas oficiales y desincronizan TaskRecord y orchestrator_state (`services/task-mcp/src/mcp/tools.ts:190`, `services/task-mcp/src/mcp/tools.ts:652`).
- Las salidas de los agentes no se persisten correctamente (PO, arquitectura, reviewer, PR bot), perdiendo información crítica (`services/task-mcp/src/orchestrator/runner.ts:397`).
- Fast-track en GitHub produce etiquetas/comentarios fuera del contrato y con caracteres corruptos (`services/task-mcp/src/domain/FastTrackGitHub.ts:79`, `services/task-mcp/src/orchestrator/runner.ts:118`).
- La suite de tests se apoya en mocks laxos de schemas y omite escenarios bloqueantes (guard QA, revocación fast-track, leases) (`services/task-mcp/test/setup.ts:4`, `services/task-mcp/test/mcp-tools.test.ts:17`).

## 1) Lógica de negocio y flujo de agentes (prioridad máxima)

**Veredicto:** **No cumple**
- `runOrchestratorStep` decide el siguiente estado únicamente con `determineNextState` sin invocar `TaskRecordValidator`, de modo que los guards de cobertura, lint, AC y merge nunca se ejecutan (`services/task-mcp/src/orchestrator/runner.ts:212`).
- El mock de QA devuelve `failed: 2`, pero el flujo continúa hacia PR al no revisar la evidencia entrante (`services/task-mcp/src/orchestrator/runner.ts:103`).
- El mapeo de salidas ignora la mayoría de campos o usa propiedades inexistentes (`services/task-mcp/src/orchestrator/runner.ts:397`).
- Existe `mapAgentOutput` reutilizable (`services/task-mcp/src/orchestrator/mappers.ts:41`), pero no se emplea en el flujo real.

**Hallazgo crítico:** la máquina de estados viola los criterios A dejando `po_check` y `qa` sin los controles requeridos.

## 2) MCP Tools (cobertura funcional real)

- `task.transition` espera evidencias con `severity: 'medium'` y `message`, incompatibles con `packages/schemas/reviewer_report.schema.json` (usa `med` junto con `where`, `why`, `suggested_fix`) (`services/task-mcp/src/mcp/tools.ts:190`).
- `fasttrack.guard_post_dev` revierte el TaskRecord pero no actualiza `orchestrator_state`, dejando al orquestador en `qa` mientras la tarea vuelve a `arch` (`services/task-mcp/src/mcp/tools.ts:652`).
- Los handlers no combinan la evidencia recibida (coverage, QA report) antes de validar, así que un cliente no puede avanzar la transición en una sola llamada.
- Los códigos semánticos 404/409/423 están disponibles mediante `SemanticError`, pero faltan pruebas contractuales que los garanticen.

## 3) Tests (unitarios, contract, integración)

- Todos los schemas se mockean con versiones permisivas que no fallan ante `additionalProperties` o enums inválidos (`services/task-mcp/test/setup.ts:4`).
- `mcp-tools.test.ts` reimplementa handlers fast-track en lugar de usar `toolHandlers`, dejando sin cobertura la lógica real (`services/task-mcp/test/mcp-tools.test.ts:17`).
- No hay casos negativos para QA fallido, revocación fast-track o leases expirados; los criterios de aceptación pueden romperse sin que los tests avisen.

## 4) Seguridad y validaciones

- La evidencia de reviewer/QA se rechaza o ignora por discrepancias de schema (`services/task-mcp/src/mcp/tools.ts:190`).
- Checklists y comentarios incluyen caracteres corruptos (`services/task-mcp/src/orchestrator/runner.ts:118`, `services/task-mcp/src/domain/FastTrackGitHub.ts:149`).
- `fasttrack.guard_post_dev` deja estado inconsistente, lo que habilita ejecuciones concurrentes sobre datos desalineados.

## 5) GitHub Actions y automatización

- Al revocar fast-track no se añade la etiqueta `fast-track:blocked` cuando solo baja el score sin hard-blocks (`services/task-mcp/src/domain/FastTrackGitHub.ts:79`).
- Los comentarios generados contienen caracteres inválidos que impiden su lectura (`services/task-mcp/src/domain/FastTrackGitHub.ts:149`).
- No se detectó automatismo que marque el PR como listo tras pasar quality gate; revisar integración con el workflow.

## 6) Calidad de código, SOLID, patrones

- Duplicación de lógica: `updateTaskWithAgentOutput` replica un mapeo que ya existe en `mapAgentOutput` (`services/task-mcp/src/orchestrator/mappers.ts:41`).
- Los handlers MCP acceden directamente a repositorios; conviene encapsular reglas en servicios para aislar el dominio.
- La persistencia SQLite respeta la arquitectura hexagonal, pero se rompe el encapsulamiento al actualizar TaskRecord y estado por separado.

## 7) Estructura del repo y convenciones

- La estructura (`packages/`, `services/task-mcp/`, `tooling/`) cumple lo esperado.
- Commits recientes siguen Conventional Commits.
- La documentación (README, ADR) describe guards y fast-track correctamente, pero la implementación actual no los respeta.

## 8) Tabla de hallazgos

| Severidad | Área | Archivo/Sección | Descripción | Recomendación |
| --- | --- | --- | --- | --- |
| Critical | lógica | services/task-mcp/src/orchestrator/runner.ts:212 | Avanza al siguiente estado sin validar guards; QA fallido pasa a PR. | Invocar `TaskRecordValidator.validateTransition` antes de mutar estado y bloquear la transición cuando falte evidencia. |
| Major | lógica | services/task-mcp/src/orchestrator/runner.ts:397 | No se persisten campos clave (PO, módulos, QA, PR). | Reutilizar `mapAgentOutput` o completar el mapeo para cada agente. |
| Major | MCP | services/task-mcp/src/mcp/tools.ts:190 | Evidencia de reviewer no coincide con el schema oficial (`med`, `where`, `why`). | Ajustar el handler para usar los campos del schema y actualizar tests contractuales. |
| Major | MCP | services/task-mcp/src/mcp/tools.ts:652 | Revocar fast-track actualiza solo TaskRecord y deja `orchestrator_state` desalineado. | Sincronizar ambos repositorios (task y estado) dentro del handler. |
| Major | automatización | services/task-mcp/src/domain/FastTrackGitHub.ts:79 | Falta etiqueta `fast-track:blocked` cuando el score cae por debajo de 60 sin hard-blocks. | Añadir la etiqueta siempre que `eligible` sea `false`. |
| Minor | DX | services/task-mcp/src/orchestrator/runner.ts:118 | Checklist de PR-BOT con caracteres corruptos. | Normalizar los strings a UTF-8 y evitar símbolos inválidos. |

## 9) Recomendaciones accionables

1. Integrar `TaskRecordValidator.validateTransition` en el orquestador y bloquear movimientos que no cumplan los guards (QA, coverage, merge).
2. Reemplazar `updateTaskWithAgentOutput` por `mapAgentOutput`, persistiendo todos los campos necesarios (`links`, `review_notes`, `non_functional`, etc.).
3. Alinear `task.transition` con los schemas oficiales (`reviewer_report`, `qa_report`) mezclando la evidencia entrante antes de evaluar.
4. Sincronizar `fasttrack.guard_post_dev` con `orchestrator_state` y ajustar automatización (etiquetas coherentes, comentarios sin caracteres corruptos).
5. Reforzar la suite de pruebas eliminando mocks laxos de schemas y cubriendo escenarios negativos críticos (QA fallido, revocación fast-track, errores 423).

## 10) Anexo

- QA → PR sin guard: `services/task-mcp/src/orchestrator/runner.ts:325`.
- Schema oficial de reviewer: `packages/schemas/reviewer_report.schema.json:24`.
- Revocación fast-track sin actualizar estado: `services/task-mcp/src/mcp/tools.ts:652`.
- Strings corruptos en checklist PR-BOT: `services/task-mcp/src/orchestrator/runner.ts:118`.

## Nota sobre revisiones adicionales

- **Permitir evidencia en el guard `dev -> review`:** Aceptada. Evaluar la evidencia recibida antes de persistirla para habilitar el tránsito en una sola llamada.
- **Guard `qa -> pr` revisando evidencia:** Aceptada. La validación debe considerar `evidence.qa_report` antes de decidir si la transición es válida.

