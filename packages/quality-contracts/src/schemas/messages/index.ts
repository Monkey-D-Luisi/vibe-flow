import type { TSchema } from '@sinclair/typebox';

export type { MessageType } from './protocol-types.js';
export { MessageTypeEnum, ProtocolEnvelope, MESSAGE_TYPES } from './protocol-types.js';

export { StageHandoffBody } from './stage-handoff.js';
export { ReviewRequestBody } from './review-request.js';
export { ReviewResultBody } from './review-result.js';
export { QaRequestBody } from './qa-request.js';
export { QaReportBody } from './qa-report.js';
export { DesignRequestBody } from './design-request.js';
export { DesignDeliveryBody } from './design-delivery.js';
export { EscalationBody } from './escalation.js';
export { StatusUpdateBody } from './status-update.js';
export { BudgetAlertBody } from './budget-alert.js';

import { StageHandoffBody } from './stage-handoff.js';
import { ReviewRequestBody } from './review-request.js';
import { ReviewResultBody } from './review-result.js';
import { QaRequestBody } from './qa-request.js';
import { QaReportBody } from './qa-report.js';
import { DesignRequestBody } from './design-request.js';
import { DesignDeliveryBody } from './design-delivery.js';
import { EscalationBody } from './escalation.js';
import { StatusUpdateBody } from './status-update.js';
import { BudgetAlertBody } from './budget-alert.js';

/**
 * Registry mapping message type names to their TypeBox body schemas.
 * Used by the message validator to look up the correct schema at runtime.
 */
export const MESSAGE_SCHEMAS: ReadonlyMap<string, TSchema> = new Map<string, TSchema>([
  ['stage_handoff', StageHandoffBody],
  ['review_request', ReviewRequestBody],
  ['review_result', ReviewResultBody],
  ['qa_request', QaRequestBody],
  ['qa_report', QaReportBody],
  ['design_request', DesignRequestBody],
  ['design_delivery', DesignDeliveryBody],
  ['escalation', EscalationBody],
  ['status_update', StatusUpdateBody],
  ['budget_alert', BudgetAlertBody],
]);
