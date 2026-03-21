import { Type, type Static } from '@sinclair/typebox';

/** All recognized inter-agent message types. */
export const MessageTypeEnum = Type.Union([
  Type.Literal('stage_handoff'),
  Type.Literal('review_request'),
  Type.Literal('review_result'),
  Type.Literal('qa_request'),
  Type.Literal('qa_report'),
  Type.Literal('design_request'),
  Type.Literal('design_delivery'),
  Type.Literal('escalation'),
  Type.Literal('status_update'),
  Type.Literal('budget_alert'),
]);
export type MessageType = Static<typeof MessageTypeEnum>;

/** All valid message type string values. */
export const MESSAGE_TYPES: readonly MessageType[] = [
  'stage_handoff',
  'review_request',
  'review_result',
  'qa_request',
  'qa_report',
  'design_request',
  'design_delivery',
  'escalation',
  'status_update',
  'budget_alert',
] as const;

/**
 * Protocol envelope fields injected into every typed message.
 * Presence of `_type` triggers schema validation.
 */
export const ProtocolEnvelope = Type.Object({
  _protocol: Type.String({ pattern: '^\\d+\\.\\d+\\.\\d+$', description: 'Protocol semver version' }),
  _type: MessageTypeEnum,
  _sender: Type.String({ minLength: 1, description: 'Sending agent ID' }),
  _timestamp: Type.String({ description: 'ISO 8601 timestamp' }),
});
export type ProtocolEnvelope = Static<typeof ProtocolEnvelope>;
