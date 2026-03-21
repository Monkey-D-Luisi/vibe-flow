import { Type, type Static } from '@sinclair/typebox';

/** Body schema for `qa_report` messages. */
export const QaReportBody = Type.Object({
  _type: Type.Literal('qa_report'),
  taskId: Type.String({ minLength: 1, description: 'Task tested' }),
  total: Type.Number({ minimum: 0, description: 'Total test count' }),
  passed: Type.Number({ minimum: 0, description: 'Passed test count' }),
  failed: Type.Number({ minimum: 0, description: 'Failed test count' }),
  evidence: Type.Optional(Type.Array(Type.Object({
    name: Type.String(),
    result: Type.Union([Type.Literal('pass'), Type.Literal('fail'), Type.Literal('skip')]),
    message: Type.Optional(Type.String()),
  }), { description: 'Individual test results' })),
});
export type QaReportBody = Static<typeof QaReportBody>;
