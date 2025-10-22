---
design_ready:
  id: EP04-T03
  title: Typed design-ready artifact
  updated_at: 2025-10-22
  owners:
    - monkey-d-luisi
    - '@team/architecture'
  modules:
    - key: design-hub
      summary: Coordinates generators, schema validation, and repository integrations.
      owned_by: '@team/architecture'
      dependencies:
        - schema-pipeline
        - catalog-sync
      public_surface:
        - generateDocument
        - scheduleRefresh
        - publishStatus
    - key: schema-pipeline
      summary: Owns JSON Schema authoring, Ajv configuration, and type generation tasks.
      owned_by: '@team/architecture'
      dependencies:
        - pattern-registry
      public_surface:
        - emitSchema
        - updateTypes
    - key: catalog-sync
      summary: Ingests ADR and pattern catalog metadata for downstream validation.
      owned_by: monkey-d-luisi
      public_surface:
        - refreshCatalogs
        - inspectReferences
    - key: pattern-registry
      summary: Provides cached pattern metadata for schema and lint rules.
      owned_by: '@team/architecture'
      public_surface:
        - listPatterns
        - hydratePattern
  contracts:
    - id: design.ready.generate.v1
      kind: http
      module: design-hub
      request:
        type: object
        additionalProperties: false
        required: [taskId, context]
        properties:
          taskId:
            type: string
            pattern: '^EP\\d{2}-T\\d{2}$'
          context:
            type: object
            additionalProperties: false
            properties:
              dryRun:
                type: boolean
              regenerateTypes:
                type: boolean
      response:
        type: object
        additionalProperties: false
        required: [document, artifacts]
        properties:
          document:
            type: object
          artifacts:
            type: array
            items:
              type: string
          warnings:
            type: array
            items:
              type: string
      errors:
        - code: DESIGN_NOT_FOUND
          when: Unknown task identifier
          http: 404
        - code: LINT_FAILED
          when: Schema or domain validation failed
          http: 422
      examples:
        - name: ok
          file: examples/design-ready/generate.ok.json
    - id: design.ready.validate.v1
      kind: rpc
      module: schema-pipeline
      request:
        type: object
        additionalProperties: false
        required: [document]
        properties:
          document:
            type: object
      response:
        type: object
        additionalProperties: false
        required: [valid]
        properties:
          valid:
            type: boolean
          issues:
            type: array
            items:
              type: string
      errors:
        - code: INVALID_JSON
          when: Serialized document cannot be parsed
          http: 400
    - id: design.ready.completed.v1
      kind: event
      module: catalog-sync
      event:
        type: object
        additionalProperties: false
        required: [taskId, status, generatedAt]
        properties:
          taskId:
            type: string
          status:
            type: string
            enum: [success, failed]
          generatedAt:
            type: string
          checksum:
            type: string
    - id: design.ready.artifacts.v1
      kind: http
      module: design-hub
      request:
        type: object
        additionalProperties: false
        required: [taskId]
        properties:
          taskId:
            type: string
            pattern: '^EP\\d{2}-T\\d{2}$'
      response:
        type: object
        additionalProperties: false
        required: [artifacts]
        properties:
          artifacts:
            type: array
            items:
              type: string
  patterns:
    - id: P-0001
      rationale: Circuit breaker isolates pattern catalog outages from generation.
    - id: P-0002
      rationale: Outbox guarantees event emission for design_ready.completed.
  risks:
    - Schema and type definitions can diverge if generation is skipped.
    - Event consumers may not monitor checksum changes leading to stale caches.
  test_plan:
    strategy: mixed
    acceptance:
      - id: AC-001
        relates_to:
          contract: design.ready.generate.v1
        description: Design hub returns a validated document for a known task.
        success_criteria:
          - 200 response with document payload
          - Generated JSON matches design-ready.schema.json
          - Lint summary is empty
      - id: AC-002
        relates_to:
          module: catalog-sync
        description: Catalog sync emits completion events after refresh.
        success_criteria:
          - Event includes checksum and status
          - Downstream consumer receives success notification within 5s
      - id: AC-003
        relates_to:
          contract: design.ready.completed.v1
        description: Event consumers can correlate updates to specific tasks.
        success_criteria:
          - Task id present in payload
          - Status transitions reflected in monitoring dashboard
    coverage_targets:
      contracts_pct: 90
  links:
    adrs: [ADR-0001]
    tasks: [EP04-T03]
---

## Draft notes

This spec captures the authoritative input for design_ready generation. Update the front matter to add modules or contracts, then run `pnpm design:gen` to refresh the JSON artifact.
