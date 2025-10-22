# EP04 · T01 — Informe de la **plantilla ADR ligera**

## 1) Resumen ejecutivo
Diseñar e introducir una plantilla ADR (Architecture Decision Record) mínima, estandarizada y **machine‑readable**, que permita capturar decisiones de arquitectura con el menor coste de autoría posible y con suficiente señal para automatización futura (lint, indexación y cruce con PRs).

---

## 2) Objetivo
- Disponer de una **plantilla de ADR** lista para usar en el repo.
- Alinear la convención de **nombres/IDs** con el patrón ya reconocido por el PR‑Bot (`ADR-\d+`).
- Dejar preparado **lint** básico y un **workflow CI** opcional que valide estructura y campos obligatorios.

### Definición de éxito (DoD)
- Existe `docs/adr/_TEMPLATE.md` y guía rápida en `docs/adr/README.md`.
- Nuevo ADR se crea bajo `docs/adr/ADR-xxxx-<slug>.md`.
- El linter (`pnpm adr:lint`) valida: encabezados, metadatos, estados y enlaces.
- La referencia `ADR-####` en PRs se detecta y se refleja en el checklist del PR‑Bot.

---

## 3) Alcance
**Incluye**
- Estructura mínima de plantilla.
- Convenciones de nomenclatura y estados.
- Metadatos en **YAML front‑matter** y secciones obligatorias.
- Script de lint simple (Node/TS) y comandos `pnpm`.
- Pipeline CI opcional para ejecutar el lint.

**No incluye** (se programará en tareas posteriores)
- Indexador semántico y búsqueda full‑text de ADRs.
- Agente MCP de arquitectura.
- Migración masiva de decisiones históricas.

---

## 4) Estructura de archivos
```
/docs
  /adr
    _TEMPLATE.md            # Plantilla lista para copiar
    README.md               # Guía de uso y convención
    ADR-0001-lint-pipeline.md # Ejemplo (opcional)
/tooling/adr
  adr-lint.ts               # Linter mínimo
/package.json               # scripts pnpm: adr:new, adr:lint
/.github/workflows
  adr-lint.yml              # (opcional) status check "adr-lint"
```

---

## 5) Convención de nombres e IDs
- **ID**: `ADR-\d{4}` incremental (cero‑padding a 4). Alternativa futura: fecha `ADR-YYYYMMDD`.
- **Slug**: kebab‑case corto y descriptivo.
- **Ruta**: `docs/adr/ADR-<ID>-<slug>.md`.
- **Compatibilidad**: el PR‑Bot ya reconoce `ADR-\d+`; mantener ese patrón asegura que aparezcan en el checklist.

---

## 6) Estados y ciclo de vida
Estados admitidos (campo `status`):
- `proposed` → `accepted` | `rejected` | `superseded`
- `accepted` → `deprecated` | `superseded`
- `superseded` (requiere campo `supersedes` o `superseded_by`).

Reglas del linter:
- `accepted` requiere `date` y al menos 1 `owners`.
- `superseded` exige vínculo cruzado (`superseded_by` y, en el destino, `supersedes`).

---

## 7) Front‑matter (YAML) — Esquema
```yaml
---
id: ADR-0001
title: Título breve en imperativo
status: proposed   # proposed | accepted | rejected | deprecated | superseded
date: 2025-03-10   # ISO 8601
owners:
  - @monkey-d-luisi
  - @team/architecture
area: platform     # opcional: dominio/área
links:
  issues: ["#123", "#456"]
  pr: ["#789"]
  docs: ["https://…"]
supersedes: []             # IDs de ADR anteriores
superseded_by: null        # ID si aplica
---
```

> Razón: el YAML hace a los ADRs fácilmente parseables por herramientas, sin molestar a quien escribe.

---

## 8) Plantilla Markdown
```md
---
id: ADR-XXXX
title: <Título>
status: proposed
date: YYYY-MM-DD
owners:
  - @<owner>
area: <dominio>
links:
  issues: []
  pr: []
  docs: []
supersedes: []
superseded_by: null
---

# {{title}}

## Contexto
<¿Qué problema resuelve? ¿Cuáles son las restricciones y drivers?>

## Decisión
<La decisión, en una o dos frases claras.>

## Alternativas consideradas
- Alternativa A — pros/cons breves
- Alternativa B — pros/cons breves

## Consecuencias
- Positivas: …
- Negativas/Costes: …
- Operación/Mantenibilidad: …

## Métricas de éxito (opc.)
- Indicadores objetivos que validan la decisión.

## Notas de implementación (opc.)
- Feature flags, rollout, migraciones.

## Anexos (opc.)
- Diagramas, pseudocódigo, enlaces.
```

Reglas de estilo mínimas (linter): encabezados obligatorios `Contexto`, `Decisión`, `Alternativas consideradas`, `Consecuencias`.

---

## 9) Comandos y automatización
**package.json**
```json
{
  "scripts": {
    "adr:new": "node tooling/adr/adr-new.cjs",   
    "adr:lint": "tsx tooling/adr/adr-lint.ts"
  }
}
```

**adr:new (opcional, simple)**: pide título, crea ID siguiente, genera archivo desde `_TEMPLATE.md` y rellena `id/title/date`.

**adr-lint.ts (mínimo viable)**
- Verifica patrón de archivo y front‑matter YAML.
- Revisa `status` válido y encabezados requeridos.
- Reglas de referencialidad para `supersedes/superseded_by`.
- Salida legible y código de salida distinto de cero si hay errores.

---

## 10) CI (opcional pero recomendado)
`.github/workflows/adr-lint.yml`
- Trigger: `pull_request`, `push` a ramas protegidas.
- Pasos: `setup-node`, `pnpm install`, `pnpm adr:lint`.
- Nombre del check: **adr-lint**. Puede añadirse a branch protection.

Hooks Husky (opc.)
- `pre-commit`: `pnpm adr:lint --changed` (en ficheros tocados bajo `docs/adr/`).

---

## 11) Integración con PR‑Bot (existente)
- El bot detecta `ADR-\d+` en descripción/ACs y los añade al **Checklist** del PR.
- Mantener ese patrón en `id` y en el texto del PR garantiza la señal.
- Futuro: el bot podría validar que los ADR referenciados están en `accepted` o enlazar su estado en el comentario de calidad.

---

## 12) Pruebas
### Unitarias
- `adr-lint` sobre casos:
  1. ADR correcto (pasa).
  2. Falta un encabezado (falla con mensaje claro).
  3. `status` inválido (falla).
  4. `superseded_by` sin archivo destino (falla).

### Smoke
- Crear ADR con `adr:new` y abrir PR que lo referencie.
- Confirmar que el PR‑Bot lista **ADR referenciados** en el checklist.

---

## 13) Riesgos y mitigaciones
- **Sobrecarga de autoría** → Plantilla mínima, guía corta, comando `adr:new`.
- **Divergencia de formatos** → Linter y CI como contrato.
- **IDs duplicados** → `adr:new` calcula ID desde el máximo existente; CI detecta colisiones.

---

## 14) Plan de entrega
1. Añadir `docs/adr/_TEMPLATE.md` y `docs/adr/README.md`.
2. Implementar `tooling/adr/adr-lint.ts` y scripts `pnpm`.
3. (Opc.) `adr-new` básico.
4. Workflow `adr-lint.yml` y, si procede, proteger rama con el check.
5. Documentar en `CONTRIBUTING.md` el flujo ADR.

---

## 15) Criterios de aceptación
- [ ] Plantilla publicada y versionada.
- [ ] Linter ejecutable localmente y en CI.
- [ ] Ejemplo de ADR válido incluido.
- [ ] Documentación de uso y naming.
- [ ] PR de prueba muestra ADRs en el checklist del PR‑Bot.

---

## 16) Ejemplo mínimo (listo para copiar)
```md
---
id: ADR-0007
title: Registrar logs de negocio en formato JSON
status: proposed
date: 2025-03-10
owners:
  - @monkey-d-luisi
area: observability
links:
  issues: ["#321"]
  pr: []
  docs: []
supersedes: []
superseded_by: null
---

# Registrar logs de negocio en formato JSON

## Contexto
Actualmente los logs se mezclan con trazas técnicas, dificultando búsqueda y correlación.

## Decisión
Adoptar formato JSON con claves estándar (ts, level, msg, service, traceId, userId).

## Alternativas consideradas
- Texto libre con prefijos — fácil de leer, difícil de parsear.
- Estructura JSON — más rígida, habilita consultas y alerting.

## Consecuencias
- Positivas: consultas en tiempo real, dashboards consistentes.
- Negativas: volumen de log algo mayor; necesidad de validación.
```

---

## 17) Propietarios y gobernanza
- **Tech Lead / Arq.**: curaduría y revisión.
- **Equipo**: redacta y mantiene ADRs de su dominio.
- **MCP (futuro)**: sugerencias y checks automáticos.
