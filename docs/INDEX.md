# Documentation Index

Complete documentation for the Agents & MCPs system.

## 🚀 Getting Started

Start here if you're new to the project:

- **[Getting Started Guide](GETTING_STARTED.md)** - Installation, first steps, and quick start
- **[README](../README.md)** - Project overview and features
- **[Contributing Guidelines](../CONTRIBUTING.md)** - How to contribute
- **[Troubleshooting](TROUBLESHOOTING.md)** - Common issues and solutions

## 📐 Architecture

Understand the system design:

- **[Architecture Overview](ARCHITECTURE.md)** - High-level system architecture
- **[TaskRecord v1.0.0 Specification](task_record_v_1_0.md)** - Core data model
- **[ADR-TR-001](ADR-TR-001.md)** - Architecture Decision Record
- **[State Graph and Handoffs](grafo_de_estados_y_handoffs_ep_01_t_02_especificacion_tecnica.md)** - State machine specification

## 🤖 Agent System

Learn about the agent orchestration framework:

- **[Agent Contracts](ep_01_t_03_prompts_por_agente_y_contratos_de_salida_especificacion.md)** - Agent I/O specifications
- **[State Management](ep_01_t_04_estado_compartido_y_persistencia_sqlite_mcp.md)** - Shared state and persistence
- **[Fast-Track System](ep_01_t_05_fast_track_para_scope_minor_especificacion_tecnica.md)** - Workflow optimization

## 🔍 Quality System

Documentation for quality tooling:

### Quality MCP Episodes

- **[EP02-T01: Quality Foundation](ep_02_t_01_quality.md)** - Quality tools foundation
- **[EP02-T02: Quality MCP](ep_02_t_02_quality.md)** - Quality MCP implementation
- **[EP02-T03: Test Runner](ep_02_t_03_quality.md)** - Test execution tooling
- **[EP02-T04: Coverage Analysis](ep_02_t_04_quality.md)** - Coverage reporting
- **[EP02-T05: HTTP Server](ep_02_t_05_publicar_quality_mcp_http_streamable_auth_limites.md)** - Quality MCP HTTP API
- **[EP02-T06: Quality Gates](ep_02_t_06_quality.md)** - Gate enforcement

## 🐙 GitHub Integration

Learn about GitHub automation:

- **[GitHub Integration Overview](ep_03_git_hub_integration_pr_bot_especificacion_tecnica_y_plan_de_entrega.md)** - Complete GitHub integration
- **[GitHub Connector](ep_03_t_02_conector_git_hub_mcp_pr_bot_sync_documento_de_implementacion.md)** - GitHub MCP connector
- **[Protected Commits](ep_03_t_03_commit_protegido_por_tests_en_verde.md)** - Test-protected commits
- **[Protected Commits v2](ep_03_t_03_commit_protegido_por_tests_en_verde_v2.md)** - Enhanced commit protection
- **[PR Checklist](ep_03_t_04_create_pr_with_checklist_diseno_implementacion_y_validacion.md)** - PR creation automation
- **[Draft PR Management](ep_03_t_05_pr_en_draft_si_qa_no_pasa_y_solo_salir_de_draft_con_qa_review.md)** - Draft PR workflow

## 📊 Reports and Testing

Test results and analysis:

- **[E2E Smoke Test Report](e2e-smoke-test-report.md)** - Latest end-to-end test results
- **[E2E Minor Fast-Track Flow](e_2_e_smoke_flujo_serio_minor_fast_track_sin_romper_complejidad.md)** - Fast-track workflow testing

## 🔧 Development

Guides for developers:

- **[Task MCP Service README](../services/task-mcp/README.md)** - Task MCP documentation
- **[Quality MCP README](../tooling/quality-mcp/README.md)** - Quality tooling documentation
- **[Schemas README](../packages/schemas/README.md)** - JSON schemas documentation

## 📝 Additional Documentation

Other important documents:

- **[PR Review Example](pr91-review.md)** - Example PR review
- **[Complexity Reduction](prompt_agente_ia_reducir_complejidad_hasta_pasar_el_gate_arreglar_logging_del_servidor_pino_pretty.md)** - Complexity reduction guide
- **[E2E Harness Fix](prompt_corregir_harness_e_2_e_sin_from_circuito_de_pruebas_informe.md)** - E2E test harness fixes

## 📚 Documentation by Topic

### For Product Owners

Start with these documents to understand requirements and workflow:
1. [Getting Started Guide](GETTING_STARTED.md)
2. [Agent Contracts](ep_01_t_03_prompts_por_agente_y_contratos_de_salida_especificacion.md)
3. [State Graph](grafo_de_estados_y_handoffs_ep_01_t_02_especificacion_tecnica.md)

### For Architects

Understand the system design:
1. [Architecture Overview](ARCHITECTURE.md)
2. [TaskRecord Specification](task_record_v_1_0.md)
3. [ADR-TR-001](ADR-TR-001.md)
4. [State Management](ep_01_t_04_estado_compartido_y_persistencia_sqlite_mcp.md)

### For Developers

Implementation guides:
1. [Getting Started Guide](GETTING_STARTED.md)
2. [Contributing Guidelines](../CONTRIBUTING.md)
3. [Task MCP README](../services/task-mcp/README.md)
4. [Schemas README](../packages/schemas/README.md)

### For QA Engineers

Testing and quality documentation:
1. [Quality MCP README](../tooling/quality-mcp/README.md)
2. [Quality System (EP02 series)](ep_02_t_01_quality.md)
3. [E2E Smoke Test Report](e2e-smoke-test-report.md)

### For DevOps/SRE

CI/CD and infrastructure:
1. [GitHub Integration](ep_03_git_hub_integration_pr_bot_especificacion_tecnica_y_plan_de_entrega.md)
2. [Protected Commits](ep_03_t_03_commit_protegido_por_tests_en_verde_v2.md)
3. [Quality Gates](ep_02_t_06_quality.md)

## 🔄 Document Status

### Complete and Current ✅

All documentation has been reviewed and is up to date as of 2024-10-21.

### Recently Updated

- `GETTING_STARTED.md` - Comprehensive setup guide (NEW)
- `TROUBLESHOOTING.md` - Common issues and solutions (NEW)
- `ARCHITECTURE.md` - System architecture overview (NEW)
- `task_record_v_1_0.md` - Removed duplicate sections
- All package READMEs created (NEW)

## 📖 Documentation Standards

All documentation in this repository follows these standards:

1. **Markdown Format**: All docs use GitHub-flavored Markdown
2. **Code Examples**: Include working, tested examples
3. **Version Information**: Documents include version/date where relevant
4. **Cross-References**: Liberal use of links between documents
5. **Table of Contents**: Long documents include TOC
6. **Professional Tone**: Clear, concise, professional language

## 🔍 Finding Information

### By Feature

- **Task Management**: `task_record_v_1_0.md`, `../services/task-mcp/README.md`
- **Quality Gates**: `ep_02_t_06_quality.md`, `../tooling/quality-mcp/README.md`
- **Fast-Track**: `ep_01_t_05_fast_track_para_scope_minor_especificacion_tecnica.md`
- **GitHub Integration**: `ep_03_git_hub_integration_pr_bot_especificacion_tecnica_y_plan_de_entrega.md`

### By Technology

- **SQLite**: `ep_01_t_04_estado_compartido_y_persistencia_sqlite_mcp.md`
- **MCP Protocol**: `task_record_v_1_0.md`, all package READMEs
- **TypeScript**: `../CONTRIBUTING.md`, package READMEs
- **GitHub Actions**: EP03 series documents

### By Use Case

- **Setting up locally**: `GETTING_STARTED.md`
- **Fixing build issues**: `TROUBLESHOOTING.md`
- **Contributing code**: `../CONTRIBUTING.md`
- **Understanding architecture**: `ARCHITECTURE.md`
- **Creating new agents**: `ep_01_t_03_prompts_por_agente_y_contratos_de_salida_especificacion.md`

## 🆘 Need Help?

If you can't find what you're looking for:

1. Check the [Troubleshooting Guide](TROUBLESHOOTING.md)
2. Search this index for keywords
3. Review the [Getting Started Guide](GETTING_STARTED.md)
4. [Open an issue](https://github.com/Monkey-D-Luisi/agents-mcps/issues) on GitHub

## 📄 License

All documentation is licensed under [MIT License](../LICENSE).

---

**Last Updated**: 2024-10-21  
**Documentation Version**: 1.0.0
