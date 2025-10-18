# EP03 · T03 · Commit protegido por tests en verde

## 1) Resumen

**Objetivo**: impedir que se comitee o se fusione código si la batería de tests no está en verde.

**Estrategia en dos capas**

- **Local (hooks)**: `pre-commit` y `pre-push` ejecutan tests y abortan si fallan.
- **Remoto (CI + branch protection)**: workflow `green-tests` en GitHub Actions; ramas protegidas exigen ese check en verde para permitir el merge.

**Compatibilidad**: convive con el `quality-gate` de EP02 y con el PR-Bot de EP03 (no lo sustituye). Idempotencia garantizada por CI y reglas de protección.

---

## 2) Alcance

- **Incluye**: hooks locales, workflow CI, configuración de protección de ramas, criterios de aceptación, plan de pruebas y rollback.
- **No incluye**: ejecución selectiva por archivos afectados, paralelización por paquetes o cambios de arquitectura de tests.

---

## 3) Diseño

### 3.1 Capa local (hooks)

- **pre-commit**: smoke rápido; corta en el primer fallo (`--bail=1`).
- **pre-push**: ejecución CI equivalente; aborta si hay fallos.
- **Bypass controlado**: variable `SKIP_TESTS=1` (para pipelines o excepciones justificadas). Aunque se desactive localmente, **la capa remota** seguirá bloqueando el merge en ramas protegidas.

### 3.2 Capa remota (Actions + Branch Protection)

- **Workflow**: `.github/workflows/green-tests.yml` corre en `push` y `pull_request` y publica el check \`\`.
- **Branch Protection** (para `main` y, si aplica, `release/*`):
  - Require a pull request before merging.
  - Require status checks to pass before merging → **green-tests** (y `quality-gate` si ya está en uso).
  - Require branches to be up to date before merging.
  - Restringir quién puede hacer push; no permitir force-push ni bypass admin.

### 3.3 Observabilidad

- Logs de hooks locales visibles en consola.
- Logs de Actions y estado de `green-tests` visibles en el PR y en el commit.

---

## 4) Implementación

### 4.1 Scripts y Husky (hooks)

Añadir dependencias en la **raíz del monorepo**:

```bash
pnpm add -D husky lint-staged
pnpm dlx husky init
```

**package.json (raíz)** — scripts base:

```json
{
  "scripts": {
    "test:quick": "pnpm -r -w test -- --passWithNoTests --bail=1",
    "test:ci": "pnpm -r -w test -- --passWithNoTests --runInBand",
    "precommit:check": "node -e \"if(process.env.SKIP_TESTS==='1'){process.exit(0)}\" && pnpm test:quick",
    "prepush:check": "node -e \"if(process.env.SKIP_TESTS==='1'){process.exit(0)}\" && pnpm test:ci"
  }
}
```

**.husky/pre-commit**

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"
echo "[pre-commit] Running tests (set SKIP_TESTS=1 to bypass under CI control)..."
pnpm precommit:check || { echo "❌ Tests failed. Commit aborted."; exit 1; }
```

**.husky/pre-push**

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"
echo "[pre-push] Running CI tests (set SKIP_TESTS=1 to bypass under CI control)..."
pnpm prepush:check || { echo "❌ Tests failed. Push aborted."; exit 1; }
```

> Si ya existen hooks, integrar las llamadas a `precommit:check` y `prepush:check` sin pisar lógica previa.

### 4.2 GitHub Actions: workflow `green-tests.yml`

**.github/workflows/green-tests.yml**

```yaml
name: green-tests

on:
  push:
    branches: ["**"]
  pull_request:
    branches: ["**"]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install
        run: pnpm i --frozen-lockfile

      - name: Run tests (CI)
        run: pnpm test:ci
```

### 4.3 Protección de ramas (UI)

1. **Settings → Branches → Add rule** para `main` (y `release/*` si aplica).
2. Activar:
   - Require a pull request before merging.
   - Require status checks to pass before merging → seleccionar **green-tests** (y `quality-gate`).
   - Require branches to be up to date before merging.
   - Restrict who can push.
   - Desactivar bypass de administradores y force-push.

---

## 5) Criterios de aceptación

- **Local**
  - Con tests rojos: `git commit` falla en `pre-commit`; `git push` falla en `pre-push`.
  - Con `SKIP_TESTS=1`: hooks permiten avanzar, dejando rastro en consola.
- **Remoto**
  - PR con tests rojos → check `green-tests` en rojo; merge bloqueado por Branch Protection.
  - Arreglar tests → `green-tests` en verde; merge permitido (si el resto de checks/puertas pasan).

---

## 6) Plan de pruebas

1. **Hooks**
   - Romper un test y probar `git commit` y `git push`.
   - Arreglar y repetir.
   - Probar `SKIP_TESTS=1` para confirmar bypass controlado.
2. **Workflow**
   - Abrir PR con fallo: `green-tests` rojo.
   - Fix y nuevo push: `green-tests` verde.
3. **Protección de ramas**
   - Intentar push directo a `main`: debe estar bloqueado por la regla.

---

## 7) Despliegue y rollback

**Despliegue**

1. Añadir hooks y scripts.
2. Subir `green-tests.yml` a `main`.
3. Configurar Branch Protection con `green-tests` requerido.

**Rollback**

- Desactivar regla de Branch Protection; eliminar o renombrar el workflow.
- Deshabilitar hooks Husky (o comentar su contenido).

---

## 8) Riesgos y mitigaciones

- **Tests lentos**: `pre-commit` usa `--bail=1` y puede limitarse a smoke; la pasada completa queda en `pre-push`/CI.
- **Flakiness**: estabilizar tests o introducir retries en el runner si procede.
- **Bypass local**: aunque exista `SKIP_TESTS=1`, el merge a ramas protegidas sigue bloqueado por el check remoto.

---

## 9) Relación con EP03

- El PR-Bot no realiza commits; abre PRs y sincroniza estado/labels. Esta tarea garantiza que todo commit que llegue a PR y todo merge a ramas protegidas pase por `green-tests`.
- `quality-gate` continúa como control adicional de métricas (coverage/lint/etc.).

---

## 10) Checklist de cierre

-

