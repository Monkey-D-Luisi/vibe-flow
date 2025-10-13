// tooling/smoke/e2e-minor-fasttrack.ts
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { __test__ } from '../../services/task-mcp/src/mcp/tools.js'

async function runCmd(cmd: string, args: string[], cwd = process.cwd()) {
  return new Promise<void>((res, rej) => {
    const p = spawn(cmd, args, { cwd, shell: true, stdio: 'inherit' })
    p.on('exit', code => code === 0 ? res() : rej(new Error(`${cmd} ${args.join(' ')} exit ${code}`)))
  })
}

async function readJson<T>(p: string) {
  return JSON.parse(await readFile(resolve(p), 'utf8')) as T
}

async function callTool(name: string, input: any) {
  return (__test__.toolHandlers as any)[name](input)
}

async function main() {
  console.log('🚀 Starting E2E smoke test for minor fast-track...')

  // 1) Generar artefactos
  console.log('📊 Generating quality artifacts...')
  await runCmd('pnpm', ['q:tests'])
  await runCmd('pnpm', ['q:coverage'])
  await runCmd('pnpm', ['q:lint'])
  await runCmd('pnpm', ['q:complexity'])

  const tests = await readJson<any>('.qreport/tests.json')
  const coverage = await readJson<any>('.qreport/coverage.json')
  const lint = await readJson<any>('.qreport/lint.json')
  const complexity = await readJson<any>('.qreport/complexity.json')

  console.log('✅ Artifacts generated:')
  console.log(`   Tests: ${tests.passed}/${tests.total} passed`)
  console.log(`   Coverage: ${(coverage.total?.lines * 100 || coverage.lines * 100).toFixed(1)}%`)
  console.log(`   Lint: ${lint.errors ?? lint.summary?.errors ?? 0} errors`)
  console.log(`   Complexity: max ${complexity.maxCyclomatic ?? complexity.metrics?.max} (limit: 12)`)

  // 2) Evidencia para dev→review
  const rgrLog = [
    { step: 'red', at: new Date().toISOString() },
    { step: 'green', at: new Date().toISOString() }
  ]
  const evidence = {
    rgr_log: rgrLog,
    coverage: { lines: coverage.total?.lines ?? coverage.lines },
    lint: { errors: lint.errors ?? lint.summary?.errors ?? 0 },
    complexity: { max: complexity.maxCyclomatic ?? complexity.metrics?.max }
  }

  console.log('📋 Evidence prepared for dev→review transition')

  // 3) Crear tarea usando MCP tools del Task MCP
  console.log('🎯 Creating task...')
  const createRes: any = await callTool('task.create', {
    title: 'E2E smoke minor fast-track',
    scope: 'minor',
    acceptance_criteria: ['Debe pasar quality gate minor', 'Debe crear PR']
  })
  const id = createRes.id
  console.log(`✅ Task created with ID: ${id}`)

  // 4) Fast-track evaluation
  console.log('⚡ Evaluating fast-track eligibility...')
  try {
    const fastTrackRes: any = await callTool('fasttrack.evaluate', {
      task_id: id,
      diff: { files: ['tooling/smoke/e2e-minor-fasttrack.ts'], locAdded: 50, locDeleted: 0 },
      quality: {
        coverage: evidence.coverage.lines,
        avgCyclomatic: complexity.avgCyclomatic ?? complexity.metrics?.avg ?? 2.5,
        lintErrors: evidence.lint.errors
      },
      metadata: {
        modulesChanged: false,
        publicApiChanged: false
      }
    })
    console.log(`✅ Fast-track evaluation completed: ${JSON.stringify(fastTrackRes)}`)
  } catch (error) {
    console.log(`ℹ️  Fast-track evaluation failed (expected): ${(error as Error).message}`)
  }

  // Obtener tarea actualizada después de fast-track
  const taskAfterFastTrack = await callTool('task.get', { id })

  // 5) Transiciones de estado
  console.log('🔄 Starting state transitions...')

  // po→dev (ahora debería ser válido con fast-track tags)
  try {
    await callTool('task.transition', {
      id,
      to: 'dev',
      if_rev: taskAfterFastTrack.rev, // Usar la rev actualizada
      evidence: { brief: 'fast-track demo' }
    })
    console.log('✅ po → dev transition completed')
  } catch (error) {
    console.log(`ℹ️  po → dev transition skipped: ${(error as Error).message}`)
  }

  // Gate explícito si la transición no lo invoca
  console.log('🚦 Running quality gate...')
  await runCmd('pnpm', ['q:gate'])

  // dev → review
  const taskAfterDev = await callTool('task.get', { id })
  await callTool('task.transition', {
    id,
    to: 'review',
    if_rev: taskAfterDev.rev,
    evidence: evidence
  })
  console.log('✅ dev → review transition completed')

  // review → po_check
  const taskAfterReview = await callTool('task.get', { id })
  await callTool('task.transition', {
    id,
    to: 'po_check',
    if_rev: taskAfterReview.rev,
    evidence: { violations: [] }
  })
  console.log('✅ review → po_check transition completed')

  // po_check → qa
  const taskAfterPoCheck = await callTool('task.get', { id })
  await callTool('task.transition', {
    id,
    to: 'qa',
    if_rev: taskAfterPoCheck.rev,
    evidence: { acceptance_criteria_met: true }
  })
  console.log('✅ po_check → qa transition completed')

  // qa → pr
  const taskAfterQa = await callTool('task.get', { id })
  await callTool('task.transition', {
    id,
    to: 'pr',
    if_rev: taskAfterQa.rev,
    evidence: { qa_report: { total: tests.total, passed: tests.passed, failed: tests.failed } }
  })
  console.log('✅ qa → pr transition completed')

  // pr → done
  const taskAfterPr = await callTool('task.get', { id })
  await callTool('task.transition', {
    id,
    to: 'done',
    if_rev: taskAfterPr.rev,
    evidence: { merged: true }
  })
  console.log('✅ pr → done transition completed')

  // 6) Obtener estado final
  const final = await callTool('task.get', { id })

  // 7) Obtener eventos del journal
  const events = await callTool('state.search', { task_id: id })

  console.log('\n🎉 E2E smoke test completed successfully!')
  console.log('📊 Final Results:')

  const result = {
    id,
    status: final.status,
    rounds: final.rounds,
    evidence: evidence,
    timeline: events.events?.map((e: any) => ({
      type: e.type,
      at: e.at,
      from: e.payload?.from,
      to: e.payload?.to
    })) || [],
    quality: {
      tests: { total: tests.total, passed: tests.passed, failed: tests.failed },
      coverage: evidence.coverage.lines,
      lint: evidence.lint.errors,
      complexity: evidence.complexity.max
    }
  }

  console.log(JSON.stringify(result, null, 2))
}

main().catch(e => {
  console.error('❌ E2E smoke test failed:', e)
  process.exit(1)
})