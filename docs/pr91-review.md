# Informe técnico PR #91

## 0) Resumen ejecutivo

**Semáforo:** Rojo  
- Flujo core incumple EP01: los agentes saltan Arquitectura y PO Check sin evaluar fast-track ni guards (`services/task-mcp/src/orchestrator/router.ts:12`, `services/task-mcp/src/orchestrator/runner.ts:320`).  
- Fast-track y MCP tools carecen de validaciones contractuales clave (sin `additionalProperties:false`, sin errores 404/409/423) y faltan herramientas `quality.*` y `state.append_event`.  
- CI no hace cumplir lint ni cobertura: la verificación se omite por piping y el job de quality gate nunca recibe artefactos (`.github/workflows/ci.yml:26`, `.github/workflows/ci.yml:50`).  
- Código presenta fallos de runtime/compatibilidad (uso de `require` en módulos ESM, etiquetas GitHub fuera de contrato, strings corruptos) y datos inconsistentes (`services/task-mcp/src/orchestrator/runner.ts:195`).  
- Tests cubren casos felices pero dejan huecos críticos (transiciones PO -> ARCH, revocación fast-track, errores de leasing) y usan IDs fuera de esquema.

## 1) Lógica de negocio y flujo de agentes (prioridad máxima)

**Veredicto:** No cumple  
- Fast-track fuerza `po -> dev` para todo scope minor incluso sin evaluación ni hard rules (`services/task-mcp/src/orchestrator/router.ts:12`, `services/task-mcp/src/domain/TaskRecord.ts:189`).  
- El orquestador nunca visita `po_check`; pasa `review -> qa` directo, rompiendo guards definidos (aceptación PO y QA) (`services/task-mcp/src/orchestrator/router.ts:25`, `services/task-mcp/src/orchestrator/runner.ts:315`).  
- `TaskRecordValidator` permite `po -> arch` sin comprobar `scope = major` y no recibe evidencia para quality gates en `task.transition`, por lo que los checks quedan inoperantes (`services/task-mcp/src/domain/TaskRecord.ts:183`, `services/task-mcp/src/mcp/tools.ts:420`).  

**Hallazgos críticos:** Transición fast-track y handoffs PO Check incumplen criterios A y B; estado `po_check` queda inalcanzable, dejando la máquina de estados fuera de contrato.

## 2) MCP Tools (cobertura funcional real)

- Tools expuestas: `task.create`, `task.get`, `task.update`, `task.search`, `task.transition`, `state.get`, `state.patch`, `state.acquire_lock`, `state.release_lock`, `state.events`, `fasttrack.evaluate`, `fasttrack.guard_post_dev`, `gh.*`. Faltan `state.append_event`, `state.search` y los tools `quality.*`.  
- Ningún `inputSchema` define `additionalProperties:false` ni se valida con Ajv al recibir la llamada (`services/task-mcp/src/mcp/tools.ts:14`, `services/task-mcp/src/mcp/tools.ts:342`).  
- Errores semánticos 404/409/423 ausentes: se lanzan `Error` genéricos sin códigos (`services/task-mcp/src/mcp/tools.ts:396`).  
- `task.create` genera IDs no ULID (timestamp padded) y `task.transition` aplica patch tras validar sin incorporar evidencia, dejando gates dependientes de estado previo (`services/task-mcp/src/mcp/tools.ts:382`, `services/task-mcp/src/mcp/tools.ts:420`).  

**Casos faltantes:** Hard rules fast-track (diff prohibidas), colisiones de lease expirado, transiciones inválidas con errores semánticos.

## 3) Tests (unitarios, contract, integración)

- Cobertura depende de `coverage/coverage-summary.json`, pero CI no la genera en el job del quality gate, por lo que el artefacto falta.  
- Matriz actual: pruebas felices para `dev -> review`, `review -> po_check`, `qa -> pr`; faltan negativos de `po -> arch`, `po -> dev` bloqueado por fast-track, `po_check -> qa` con AC incompletos, revocación fast-track, errores de lease expirado/423 y códigos semánticos en tools.  
- Tests usan IDs como `TR-01`, incompatibles con el schema ULID (`services/task-mcp/test/repo.test.ts:21`, `services/task-mcp/test/transition.test.ts:19`), ocultando validaciones reales.  

## 4) Seguridad y validaciones

- Falta hardening de input: sin `additionalProperties:false`, sin validación Ajv en runtime, sin sanitización de rutas sensibles ni control de errores semánticos (`services/task-mcp/src/mcp/tools.ts:14`, `services/task-mcp/src/mcp/tools.ts:342`).  
- Fast-track no checa patrones ni ADR según reglas duras B y no valida `metadata` o `diff` contra esquemas (`services/task-mcp/src/domain/FastTrack.ts`).  
- Locks devuelven excepciones genéricas, por lo que los clientes no distinguen 423/409 (`services/task-mcp/src/repo/state.ts:186`).  
- Strings con caracteres corruptos en prompts y comentarios pueden romper rendering en GH (`services/task-mcp/src/domain/FastTrackGitHub.ts:78`, `.github/PULL_REQUEST_TEMPLATE/default.md:5`).

## 5) GitHub Actions y automatización

- Paso de lint siempre “pasa” por `|| echo`, incluso con errores (`.github/workflows/ci.yml:26`).  
- Job `quality-gate` vuelve a clonar pero no restaura cobertura, así que nunca valida cobertura real (`.github/workflows/ci.yml:40`).  
- Automatización fast-track usa etiqueta `fast-track:incompatible` fuera del contrato y nunca añade `fast-track` al revocar (`services/task-mcp/src/domain/FastTrackGitHub.ts:66`).  
- `FastTrackGitHub` depende de `task.pr_number` inexistente en `TaskRecord`, por lo que no añadirá etiquetas/comentarios a PR reales (`services/task-mcp/src/orchestrator/runner.ts:195`).  
- No se encontró evidencia de required checks o branch protection configurados.

## 6) Calidad de código, SOLID, patrones

- Agentes ESM usan `require` directo, lo que rompe en runtime (`services/task-mcp/src/agents/dev.ts:41`, `services/task-mcp/src/agents/architect.ts:20`, etc.).  
- `updateTaskWithAgentOutput` referencia propiedades inexistentes (`v.message`, `task.pr_number`), generando datos nulos (`services/task-mcp/src/orchestrator/runner.ts:398`, `services/task-mcp/src/orchestrator/runner.ts:195`).  
- Falta cohesión entre dominio y orquestador: fast-track tags nunca se escriben (`services/task-mcp/src/orchestrator/runner.ts:370`) y `nextAgent` ignora contexto, rompiendo el patrón previsto.  
- Strings con caracteres mojibake en prompts/comentarios degradan DX (`services/task-mcp/src/agents/prbot.ts:34`, `.github/pr-comments/quality-gate-contract.md:1`).  
- `TaskRepository` mezcla persistencia con lógica (ID generation, JSON parse) sin capa de servicio.

## 7) Estructura del repo y convenciones

- Carpetas principales (`packages/schemas`, `services/task-mcp`, `tooling`) presentes; docs EP01 agregadas.  
- Falta `tooling/quality-mcp` funcional y `services/task-mcp/src/mcp` concentra server y dominio sin separación clara.  
- Convenciones: README y template contienen texto con caracteres corruptos; no se valida Conventional Commits.  
- `test-mcp.js` mezcla responsabilidades y usa rutas hardcode sin documentación.

## 8) Tabla de hallazgos

| Severidad | Área | Archivo/Sección | Descripción | Recomendación |
| --- | --- | --- | --- | --- |
| Critical | lógica | `services/task-mcp/src/orchestrator/router.ts:12` | `nextAgent` salta Arquitectura para scope minor y nunca devuelve `po_check` | Integrar fast-track real y respetar el statechart completo (`po -> arch/dev`, `review -> po_check`). |
| Critical | lógica | `services/task-mcp/src/orchestrator/runner.ts:315` | Máquina de estados omite `po_check` y asume `review -> qa` directo | Reescribir `getNextState` y guards para insertar `po_check`, validar ACs y QA report como exige el criterio A. |
| Critical | lógica | `services/task-mcp/src/domain/TaskRecord.ts:183` | Guards `po -> arch` y `po -> dev` no aplican reglas de scope ni fast-track | Implementar condicionantes de scope y fast-track eligibility dentro de `validateTransition`. |
| Major | MCP | `services/task-mcp/src/mcp/tools.ts:14` | Schemas sin `additionalProperties:false` ni validación Ajv en runtime | Añadir JSON Schemas estrictos por tool y validar argumentos antes de ejecutar. |
| Major | MCP | `services/task-mcp/src/mcp/tools.ts:420` | `task.transition` valida con estado obsoleto y no emite 409/423 | Hidratar registro con evidencia previa y mapear errores a códigos semánticos. |
| Major | fast-track | `services/task-mcp/src/domain/FastTrack.ts:35` | Hard rules ignoran patrones, módulos y ADR reales | Extender análisis de diff/metadata para detectar áreas prohibidas y exigir score >= 60. |
| Major | GitHub | `services/task-mcp/src/domain/FastTrackGitHub.ts:66` | Etiquetas y comentarios fuera de contrato más caracteres corruptos | Ajustar labels a `{fast-track, fast-track:eligible, fast-track:blocked, fast-track:revoked}` y limpiar strings. |
| Major | CI | `.github/workflows/ci.yml:26` | Lint step nunca falla y quality gate sin cobertura | Quitar `|| echo` y publicar el artefacto de cobertura del job previo. |
| Major | runtime | `services/task-mcp/src/agents/dev.ts:41` | Uso de `require` en ESM rompe ejecución | Cambiar a `createRequire` o imports compatibles con módulos. |
| Minor | tests | `services/task-mcp/test/transition.test.ts:19` | IDs de prueba no respetan schema ULID | Actualizar fixtures a ULIDs válidos y añadir tests negativos de validación. |

## 9) Recomendaciones accionables

1. Reconstruir el flujo de estados para cumplir el statechart (incluyendo fast-track real y `po_check`).  
2. Endurecer MCP tools: schemas estrictos, validación Ajv, errores semánticos y completar catálogo de tools (`quality.*`, `state.append_event`, `state.search`).  
3. Reparar automatización fast-track y GitHub (labels correctos, comentarios limpios, uso de `links.git.prNumber`, tagging del TaskRecord).  
4. Arreglar el pipeline CI para que lint y cobertura sean bloqueantes y se propaguen artefactos.  
5. Sustituir `require` en agentes y limpiar strings mojibake para evitar fallos en runtime y UX.  
6. Ampliar suite de tests con escenarios de error (fast-track bloqueado, revocación, leases expirados, transiciones prohibidas) y validar IDs reales.

## 10) Anexo

- Inspección de orquestador y fast-track (`Select-String` sobre `services/task-mcp/src/orchestrator/router.ts` y `services/task-mcp/src/orchestrator/runner.ts`).  
- Revisión de workflows (`cat .github/workflows/ci.yml`).  
- Validación de agentes y schemas (`Select-String services/task-mcp/src/agents/*.ts require`).  
- Lectura de specs de fast-track y tests asociados (`services/task-mcp/test/fasttrack.test.ts`, `services/task-mcp/test/fasttrack-github.test.ts`, `services/task-mcp/test/mcp-tools.test.ts`).
