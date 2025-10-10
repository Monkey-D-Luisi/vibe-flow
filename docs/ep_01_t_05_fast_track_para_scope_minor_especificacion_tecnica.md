# EP01‑T05 — Fast‑track para `scope=minor`

> Objetivo: habilitar una ruta **PO → DEV** que omite Arquitectura cuando el riesgo es bajo, sin degradar calidad ni seguridad. El fast‑track debe ser **explicable**, **medible** y **reversible**.

---

## 1) Criterios de elegibilidad (reglas + scoring)

### 1.1 Reglas duras (cualquier violación desactiva fast‑track)
- Cambios en **contratos** públicos (`contracts.*`), **patrones** críticos, o `adr_id` requerido ⇒ requiere Arquitectura.
- Archivos en rutas sensibles: `security/*`, `auth/*`, `payments/*`, `infra/*`, `migrations/*`.
- Cambios de **esquema** (`packages/schemas/**`) que afecten interoperabilidad.
- Aumento de **superficie pública** (nuevas APIs, endpoints) o cambios en `modules[]` del TaskRecord.
- Violaciones **high** en reviewer o **quality gate** fallido.

### 1.2 Señales positivas (suman puntos)
- Sólo **tests** o **docs** tocados.
- Cambios localizados en módulo interno no compartido.
- LOC total del diff < `Δmax` (por defecto 120 LOC) y sin aumento de complejidad media.
- `scope=minor` declarado en TaskRecord y **PO brief** no introduce NFR agresivas.

### 1.3 Puntuación (0–100)
```
score = 40 (base si scope=minor)
      + 20 si sólo tests/docs
      + 15 si LOC < 60, +10 si 60–120
      + 10 si complejidad (avgCyclomatic) no aumenta
      + 5  si sin nuevos módulos
      - 60 si toca contratos/patrones/ADR
      - 40 si toca security/auth/payments/infra/migrations
      - 25 si cambia schemas
      - 20 si añade APIs públicas
Elegible si score ≥ 60 y ninguna regla dura violada.
```

---

## 2) Datos de entrada para la evaluación
- `TaskRecord.scope`, `modules`, `contracts`, `patterns`, `adr_id`.
- **Diff** de la rama respecto a `main` (`git diff --numstat --name-only` + LCOV + complejidad).
- Resultados de **quality‑mcp**: cobertura, lint, complejidad.
- Señales de reviewer/QA si existieran (para reevaluación post‑dev).

---

## 3) API del evaluador

### 3.1 Tool MCP `fasttrack.evaluate`
**Input**
```json
{
  "task": { "id": "TR-...", "scope": "minor" },
  "diff": { "files": ["..."], "locAdded": 42, "locDeleted": 10 },
  "quality": { "coverage": 0.78, "avgCyclomatic": 4.1, "lintErrors": 0 },
  "metadata": { "modulesChanged": false, "publicApiChanged": false }
}
```
**Output**
```json
{
  "eligible": true,
  "score": 75,
  "reasons": ["minor","diff_small","no_public_api"],
  "hardBlocks": []
}
```
- `eligible=false` incluye `hardBlocks` con las reglas violadas.

### 3.2 Tool MCP `fasttrack.guard_post_dev`
- Reevalúa tras `dev` con `diff` real y señal de reviewer/quality.
- Si pierde elegibilidad, retorna `{ revoke: true, reason: "contracts_changed" }`.

---

## 4) Integración con el orquestador

### 4.1 Router (antes de lanzar Arquitectura)
```
if (tr.status === "po") {
  const ft = fasttrack.evaluate(...)
  if (ft.eligible) { route = "dev"; label("fast-track") }
  else { route = "architect"; label("needs-architecture") }
}
```

### 4.2 Post‑DEV
- Ejecutar `fasttrack.guard_post_dev`.
- Si `revoke=true`: mover a **architect**, quitar `fast-track`, añadir `fast-track-revoked` y crear **mini‑ADR requerida**.

### 4.3 Persistencia
- Guardar en `TaskRecord.tags` `fasttrack:eligible|rejected|revoked` y `fasttrack:score:<n>`.
- Añadir evento `type="fasttrack"` al journal con scoring y razones.

---

## 5) GitHub (automatización)
- Label `fast-track` cuando `eligible=true`.
- PR en **draft** igualmente; los **quality gates** no se saltan jamás.
- Si `revoked`: comentar en PR con razones y convertir a **draft**, asignar a Arquitectura.

---

## 6) Pseudocódigo del evaluador (TypeScript)
```ts
export function evaluateFastTrack({task, diff, quality, metadata}: Ctx){
  const hardBlocks: string[] = [];
  const touches = (re: RegExp) => diff.files.some(f => re.test(f));
  if (metadata.publicApiChanged) hardBlocks.push("public_api");
  if (metadata.modulesChanged)   hardBlocks.push("modules_changed");
  if (touches(/^(security|auth|payments|infra|migrations)\//)) hardBlocks.push("sensitive_path");
  if (touches(/^packages\/schemas\//)) hardBlocks.push("schema_change");
  if (task.contracts?.length) hardBlocks.push("contracts_touched");

  let score = task.scope === "minor" ? 40 : 0;
  const LOC = diff.locAdded + diff.locDeleted;
  if (diff.files.every(f => /\.(md|rst|adoc|spec|test\.[tj]s)$/.test(f))) score += 20;
  score += LOC < 60 ? 15 : LOC <= 120 ? 10 : 0;
  if ((quality.avgCyclomatic ?? 0) <= 5) score += 10;
  if (!metadata.modulesChanged) score += 5;

  const eligible = hardBlocks.length === 0 && score >= 60;
  return { eligible, score, reasons: [], hardBlocks };
}
```

---

## 7) Tests (TDD)
- **Positivos**: sólo tests/docs, LOC 40, sin APIs → `eligible=true`.
- **Negativos**: cambia `packages/schemas/*` → `eligible=false (schema_change)`.
- **Revocación**: pasa evaluación inicial, pero `dev` introduce contrato → `revoke=true`.
- **Límites**: LOC = 121 cae por debajo del umbral si no hay otras señales positivas.
- **Property-based** (opcional): inyectar rutas al azar para validar reglas duras.

---

## 8) Observabilidad y auditoría
- Evento `fasttrack` con `{ eligible, score, reasons, hardBlocks }` en el **event_log**.
- Métrica: ratio de fast‑track por épica y tasa de revocación.

---

## 9) Definition of Done (T05)
- Tools `fasttrack.evaluate` y `fasttrack.guard_post_dev` implementadas y validadas.
- Router actualizado para elegir DEV u Arquitectura según resultado.
- Etiquetas GitHub y comentarios automáticos aplicados.
- Tests unitarios + integración verdes.
- Documentación en README con política y ejemplos.

---

## 10) Checklist de PR
- [ ] Resultado del evaluador en comentario (score y razones)
- [ ] Etiqueta `fast-track` aplicada o rechazada con motivo
- [ ] Quality gates verdes (coverage/lint/complexity)
- [ ] Evidencias TDD (RGR ≥ 2)
- [ ] Si revocado: mini‑ADR creado y reasignado a Arquitectura

