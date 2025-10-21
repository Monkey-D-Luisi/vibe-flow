# Quality MCP

The **Quality MCP** service provides automated quality tooling for the Agents & MCPs system. It exposes tools for running tests, generating coverage reports, linting, complexity analysis, and enforcing quality gates.

## Features

- **Test Execution**: Run test suites and collect results
- **Coverage Reporting**: Generate and normalize coverage reports
- **Linting**: Execute ESLint and collect diagnostics
- **Complexity Analysis**: Calculate cyclomatic complexity per function
- **Quality Gate Enforcement**: Apply thresholds and generate gate verdicts
- **HTTP Server**: RESTful API with authentication and rate limiting
- **Streaming Support**: Server-Sent Events (SSE) for real-time progress

## Architecture

```
tooling/quality-mcp/
├── cli/                 # Command-line interface
│   └── qcli.ts         # Entry point for CLI operations
├── server/             # HTTP server
│   ├── src/
│   │   ├── index.ts    # Server entry point
│   │   ├── auth.ts     # API key authentication
│   │   ├── rate-limit.ts
│   │   └── routes/     # HTTP endpoints
│   └── dist/           # Compiled server
├── src/
│   ├── exec/           # Test runners
│   │   └── vitest-runner.ts
│   ├── parsers/        # Coverage and lint parsers
│   │   ├── istanbul.ts
│   │   └── eslint.ts
│   └── tools/          # MCP tools implementation
│       ├── run_tests.ts
│       ├── coverage_report.ts
│       ├── lint.ts
│       ├── complexity.ts
│       └── gate_enforce.ts
└── test/               # Tests
```

## CLI Usage

### Run Quality Tools

```bash
# From monorepo root
pnpm q:tests        # Run tests and generate report
pnpm q:coverage     # Generate coverage report
pnpm q:lint         # Run linting
pnpm q:complexity   # Calculate complexity
pnpm q:gate         # Enforce quality gate

# With options
pnpm q:gate --source artifacts --scope major --task-id TR-123
pnpm q:gate --source artifacts --scope minor --max-file-cyclomatic 50
```

### Output Location

All reports are generated in `.qreport/`:
```
.qreport/
├── tests.json          # Test results
├── coverage.json       # Coverage data
├── lint.json          # Linting diagnostics
├── complexity.json    # Complexity metrics
└── gate.json          # Quality gate verdict
```

### Quality Gate

The gate tool merges individual reports and applies thresholds:

```bash
pnpm q:gate --source artifacts --scope major
```

**Thresholds (Major Scope)**:
- Coverage: ≥80%
- Lint errors: 0
- Average cyclomatic complexity: ≤5.0
- Tests: All passing

**Thresholds (Minor Scope)**:
- Coverage: ≥70%
- Lint errors: 0
- Average cyclomatic complexity: ≤5.0
- Tests: All passing

**Sample Output** (`gate.json`):
```json
{
  "passed": false,
  "metrics": {
    "tests": { "total": 33, "failed": 1 },
    "coverage": { "lines": 0.76 },
    "lint": { "errors": 0, "warnings": 5 },
    "complexity": { "avgCyclomatic": 5.8, "maxCyclomatic": 14 }
  },
  "violations": [
    { "code": "TESTS_FAILED", "message": "1 test failed" },
    { "code": "COVERAGE_BELOW", "message": "Coverage 0.76 < 0.80 (major)" },
    { "code": "COMPLEXITY_HIGH", "message": "avg 5.8 > 5.0" }
  ]
}
```

## HTTP Server

### Starting the Server

```bash
# From monorepo root
pnpm --filter @agents/quality-mcp-server dev

# Or with custom port
PORT=8081 pnpm --filter @agents/quality-mcp-server dev

# Production build
cd tooling/quality-mcp/server
pnpm build
node dist/index.js
```

### Authentication

Configure API keys via environment variable:
```bash
export QUALITY_MCP_KEYS="abc123:run|read@shared-secret,def456:run"
```

Format: `key[:scope1|scope2][@hmac],...`

**Scopes**:
- `run`: Execute quality tools
- `read`: Read results only

### Rate Limiting

Configure limits:
```bash
export QUALITY_RPS=10          # Requests per second
export QUALITY_BURST=20        # Burst size
export QUALITY_MAX_CONCURRENCY=5
export QUALITY_TOOL_TIMEOUT_MS=60000
```

### API Endpoints

#### POST `/mcp/tool` - Synchronous Tool Execution

**Request**:
```bash
curl -H "Authorization: Bearer abc123" \
     -H "Content-Type: application/json" \
     -d '{"tool":"quality.run_tests","input":{}}' \
     http://localhost:8080/mcp/tool
```

**Response**:
```json
{
  "result": {
    "total": 33,
    "passed": 33,
    "failed": 0,
    "source": "server",
    "timestamp": "2024-10-21T16:00:00Z"
  }
}
```

#### POST `/mcp/tool/stream` - Streaming Execution

**Request**:
```bash
curl -N -H "Authorization: Bearer abc123" \
     -H "Content-Type: application/json" \
     -d '{"tool":"quality.run_tests","input":{},"stream":true}' \
     http://localhost:8080/mcp/tool/stream
```

**Response** (Server-Sent Events):
```
event: progress
data: {"stage":"running","percentage":0.5}

event: complete
data: {"result":{"total":33,"passed":33,"failed":0}}
```

#### GET `/healthz` - Health Check

```bash
curl http://localhost:8080/healthz
```

Response: `200 OK`

#### GET `/metrics` - Prometheus Metrics

```bash
curl http://localhost:8080/metrics
```

**Metrics**:
- `quality_mcp_requests_total`: Request counter
- `quality_mcp_request_duration_seconds`: Latency histogram
- `quality_mcp_active_requests`: Active request gauge

### Available Tools

The HTTP server exposes these tools:

1. **`quality.run_tests`**: Execute test suite
2. **`quality.coverage_report`**: Generate coverage report
3. **`quality.lint`**: Run linting
4. **`quality.complexity`**: Calculate complexity

**Note**: `quality.gate_enforce` is CLI/orchestrator-only and not exposed via HTTP.

### Error Responses

**401 Unauthorized**:
```json
{"error": "Unauthorized"}
```

**422 Unprocessable Entity**:
```json
{"error": "RUNNER_ERROR", "message": "Tool execution failed"}
```

**429 Too Many Requests**:
```json
{"error": "Rate limit exceeded"}
```

## Tool Details

### quality.run_tests

Executes the test suite and collects results.

**Input**: `{}` (no parameters)

**Output**:
```json
{
  "total": 33,
  "passed": 33,
  "failed": 0,
  "skipped": 0,
  "duration": 1234,
  "source": "server",
  "timestamp": "2024-10-21T16:00:00Z"
}
```

### quality.coverage_report

Generates coverage report from Istanbul output.

**Input**: `{}` (no parameters)

**Output**:
```json
{
  "overall": {
    "lines": 0.85,
    "statements": 0.86,
    "functions": 0.80,
    "branches": 0.75
  },
  "files": [
    {
      "path": "src/domain/TaskRecord.ts",
      "coverage": 0.92
    }
  ],
  "source": "server",
  "timestamp": "2024-10-21T16:00:00Z"
}
```

### quality.lint

Runs ESLint and collects diagnostics.

**Input**: `{}` (no parameters)

**Output**:
```json
{
  "errors": 0,
  "warnings": 5,
  "files": [
    {
      "path": "src/example.ts",
      "errors": 0,
      "warnings": 2
    }
  ],
  "rules": {
    "no-unused-vars": 2,
    "prefer-const": 3
  },
  "source": "server",
  "timestamp": "2024-10-21T16:00:00Z"
}
```

### quality.complexity

Calculates cyclomatic complexity using `typhonjs-escomplex`.

**Input**: `{}` (no parameters)

**Output**:
```json
{
  "avgCyclomatic": 3.5,
  "maxCyclomatic": 12,
  "functions": [
    {
      "name": "validateTask",
      "cyclomatic": 8,
      "path": "src/domain/validators.ts",
      "line": 42
    }
  ],
  "source": "server",
  "timestamp": "2024-10-21T16:00:00Z"
}
```

### quality.gate_enforce (CLI Only)

Enforces quality gates by merging reports and applying thresholds.

**CLI Usage**:
```bash
pnpm q:gate --source artifacts --scope major
```

**Output** (`gate.json`):
```json
{
  "passed": true,
  "metrics": {
    "tests": { "total": 33, "failed": 0 },
    "coverage": { "lines": 0.85 },
    "lint": { "errors": 0, "warnings": 5 },
    "complexity": { "avgCyclomatic": 3.5 }
  },
  "violations": []
}
```

## Testing

```bash
# Run tests
pnpm --filter @agents/quality-mcp test

# Watch mode
pnpm --filter @agents/quality-mcp test -- --watch

# With coverage
pnpm --filter @agents/quality-mcp test -- --coverage
```

## Configuration

### Environment Variables

```bash
# Server
PORT=8080
QUALITY_MCP_KEYS="key1:run@secret,key2:read"
QUALITY_RPS=10
QUALITY_BURST=20
QUALITY_MAX_CONCURRENCY=5
QUALITY_TOOL_TIMEOUT_MS=60000

# Paths (CLI)
COVERAGE_PATH=coverage/coverage-summary.json
ESLINT_PATH=.eslintrc.json
```

## Docker Support

Build and run the server in Docker:

```bash
cd tooling/quality-mcp/server
docker build -t quality-mcp .
docker run -p 8080:8080 \
  -e QUALITY_MCP_KEYS="abc123:run" \
  quality-mcp
```

## Integration with CI

### GitHub Actions Example

```yaml
- name: Run Quality Checks
  run: |
    pnpm q:tests
    pnpm q:coverage
    pnpm q:lint
    pnpm q:complexity

- name: Enforce Quality Gate
  run: |
    pnpm q:gate --source artifacts --scope major

- name: Upload Artifacts
  uses: actions/upload-artifact@v3
  with:
    name: qreport
    path: .qreport/
```

### Consuming in Orchestrator

```typescript
import { runQualityGate } from '@agents/quality-mcp';

const result = await runQualityGate({
  source: 'artifacts',
  scope: 'major',
  taskId: 'TR-123'
});

if (!result.passed) {
  console.error('Quality gate failed:', result.violations);
}
```

## Troubleshooting

### Coverage report missing

Ensure tests run with coverage:
```bash
pnpm test -- --coverage
```

### Lint errors not detected

Verify ESLint config:
```bash
cat .eslintrc.json
```

### Server authentication fails

Check API key format:
```bash
echo $QUALITY_MCP_KEYS
# Should be: key:scopes@hmac
```

### High complexity warnings

Reduce complexity by:
- Extracting helper functions
- Using early returns
- Simplifying conditionals

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## License

MIT - see [LICENSE](../../LICENSE)

## Support

- [Main Documentation](../../README.md)
- [Getting Started](../../docs/GETTING_STARTED.md)
- [Troubleshooting](../../docs/TROUBLESHOOTING.md)
