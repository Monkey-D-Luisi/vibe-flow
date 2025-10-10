# Agents & MCPs — TaskRecord v1.0.0 Implementation

Este monorepo contiene la implementación completa del **TaskRecord v1.0.0** siguiendo la arquitectura hexagonal, con persistencia SQLite y exposición vía **Model Context Protocol (MCP)**.

## 📋 Descripción del Proyecto

Implementación de un sistema de gestión de tareas (TaskRecord) que permite:
- Crear y gestionar registros de tareas con validaciones estrictas
- Control de concurrencia optimista
- Transiciones de estado con reglas de negocio
- Búsqueda y filtrado avanzado
- Exposición vía herramientas MCP para integración con agentes IA

## 🏗️ Arquitectura

### Arquitectura Hexagonal
- **Dominio**: Lógica de negocio pura (TaskRecord, validaciones, reglas de transición)
- **Persistencia**: Repositorio SQLite con migración automática
- **Exposición**: Servidor MCP con herramientas JSON-RPC

### Estructura del Monorepo
```
agents-mcps/
├── packages/
│   └── schemas/           # JSON Schema v1.0.0
│       └── taskrecord.schema.json
├── services/
│   └── task-mcp/          # Servicio MCP principal
│       ├── src/
│       │   ├── domain/    # Tipos y reglas de dominio
│       │   ├── repo/      # Persistencia SQLite
│       │   └── mcp/       # Herramientas MCP
│       └── test/          # Tests TDD
└── docs/
    └── task_record_v_1_0.md  # Documentación completa
```

## 🚀 Inicio Rápido

### Prerrequisitos
- Node.js 18+
- pnpm
- SQLite (viene incluido)

### Instalación
```bash
# Clonar el repositorio
git clone <repository-url>
cd agents-mcps

# Instalar dependencias
pnpm install

# Aprobar builds de better-sqlite3 (solo primera vez)
pnpm approve-builds
```

### Ejecutar el Servidor MCP
```bash
# Desde la raíz del monorepo
pnpm --filter @agents/task-mcp dev

# O desde el directorio del servicio
cd services/task-mcp
pnpm dev
```

El servidor iniciará y mostrará: `Task MCP server started`

## 🛠️ Herramientas MCP Disponibles

### task.create
Crea un nuevo TaskRecord en estado inicial (`po`).

**Input:**
```json
{
  "title": "Añadir validación de usuario",
  "description": "Como PO quiero...",
  "acceptance_criteria": ["cuando usuario inválido → error 422"],
  "scope": "minor",
  "links": {
    "jira": {"projectKey": "AGENTSMCPS", "issueKey": "AGENTSMCPS-15"}
  },
  "tags": ["area_architecture", "agent_orchestrator"]
}
```

### task.get
Obtiene un TaskRecord por su ID.

**Input:**
```json
{"id": "TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C"}
```

### task.update
Actualiza un TaskRecord con control optimista de concurrencia.

**Input:**
```json
{
  "id": "TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C",
  "if_rev": 3,
  "patch": {
    "metrics": {"coverage": 0.83, "lint": {"errors": 0, "warnings": 2}},
    "red_green_refactor_log": ["red: 4 failing", "green: all passing"]
  }
}
```

### task.search
Busca TaskRecords con filtros y paginación.

**Input:**
```json
{
  "q": "validación",
  "status": ["dev", "review"],
  "labels": ["area_architecture"],
  "limit": 50,
  "offset": 0
}
```

### task.transition
Transita un TaskRecord a un nuevo estado con validaciones y efectos secundarios.

**Input:**
```json
{
  "id": "TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C",
  "to": "review",
  "if_rev": 5,
  "evidence": {
    "red_green_refactor_log": ["red: 4 failing", "green: all passing"],
    "metrics": {"coverage": 0.85, "lint": {"errors": 0, "warnings": 1}},
    "acceptance_criteria_met": true,
    "qa_report": {"total": 10, "passed": 10, "failed": 0},
    "violations": [{"severity": "low", "description": "style issue"}],
    "merged": true
  }
}
```

**Efectos por Transición:**
- `dev → review`: Actualiza `red_green_refactor_log` y `metrics`
- `review → dev`: Incrementa `rounds_review`
- `qa → dev`: Actualiza `qa_report`
- `qa → pr`: Actualiza `qa_report`

## 📊 Estados y Transiciones

Los TaskRecords siguen un flujo de estados con validaciones estrictas y quality gates:

```
po → arch → dev → review → po_check → qa → pr → done
     ↓
   dev (fast-track)
```

### Estados Disponibles
- **`po`**: Product Owner - Requisitos iniciales
- **`arch`**: Architecture - Diseño y contratos
- **`dev`**: Development - Implementación con TDD
- **`review`**: Code Review - Revisión de pares
- **`po_check`**: PO Check - Validación de criterios
- **`qa`**: Quality Assurance - Testing automatizado
- **`pr`**: Pull Request - Integración pendiente
- **`done`**: Completado - Tarea finalizada

### Transiciones y Guards

| Desde | Hacia | Condición | Evidencia Requerida |
|-------|-------|-----------|-------------------|
| `po` | `arch` | `acceptance_criteria.length > 0` | - |
| `po` | `dev` | `scope === 'minor'` (fast-track) | - |
| `arch` | `dev` | `adr_id && contracts.length > 0` | - |
| `dev` | `review` | Quality Gate: TDD logs + Coverage + No lint errors | `red_green_refactor_log`, `metrics` |
| `review` | `dev` | Siempre (hasta 2 rondas) | - |
| `review` | `po_check` | `!hasHighViolations(evidence)` | `violations` |
| `po_check` | `qa` | `acceptance_criteria_met === true` | `acceptance_criteria_met` |
| `qa` | `dev` | `qa_report` presente | `qa_report` |
| `qa` | `pr` | `record.qa_report.failed === 0` | - |
| `pr` | `done` | `merged === true` | `merged` |

### Quality Gates

#### Dev → Review
- **TDD Logs**: `red_green_refactor_log.length ≥ 2`
- **Coverage**: ≥80% (major) / ≥70% (minor)
- **Lint**: `errors === 0`

#### Review Rounds
- Máximo 2 iteraciones `review → dev`
- Después del límite: tarea requiere replanificación

#### QA Gates
- **QA Pass**: `qa_report.failed === 0`
- **QA Fail**: Requiere `qa_report` para regresar a `dev`

### Estados Terminales
- **`done`**: Estado final, no permite transiciones salientes

## 🧪 Testing

### Ejecutar Tests
```bash
# Tests del servicio task-mcp
pnpm --filter @agents/task-mcp test

# Tests con watch mode
pnpm --filter @agents/task-mcp test -- --watch
```

### Cobertura de Tests
- ✅ Validaciones de esquema JSON
- ✅ Operaciones CRUD del repositorio
- ✅ Control optimista de concurrencia
- ✅ Transiciones de estado con reglas de negocio
- ✅ Validaciones de creación

## 📚 Esquema de Datos

### TaskRecord v1.0.0
Campos principales:
- `id`: ULID con prefijo `TR-`
- `title`: Título (5-120 caracteres)
- `status`: Estado actual del flujo
- `scope`: `minor` | `major`
- `acceptance_criteria`: Lista de criterios de aceptación
- `metrics`: Cobertura, complejidad, lint
- `red_green_refactor_log`: Log TDD
- `links`: Referencias JIRA, Git, ADR

Ver [`docs/task_record_v_1_0.md`](docs/task_record_v_1_0.md) para documentación completa.

## 🔧 Desarrollo

### Comandos Disponibles
```bash
# Instalar dependencias
pnpm install

# Ejecutar servicio
pnpm --filter @agents/task-mcp dev

# Ejecutar tests
pnpm --filter @agents/task-mcp test

# Type checking
cd services/task-mcp && npx tsc --noEmit

# Lint (si configurado)
pnpm lint
```

### Conventional Commits
Este proyecto usa Conventional Commits:
- `feat:` para nuevas funcionalidades
- `fix:` para correcciones
- `docs:` para documentación
- `test:` para tests

## 🤝 Contribución

1. Fork el proyecto
2. Crea una rama feature (`git checkout -b feat/amazing-feature`)
3. Commit tus cambios (`git commit -m 'feat: add amazing feature'`)
4. Push a la rama (`git push origin feat/amazing-feature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.

## 📞 Soporte

Para soporte o preguntas:
- Abre un issue en GitHub
- Consulta la documentación en [`docs/`](docs/)
- Revisa los tests para ejemplos de uso