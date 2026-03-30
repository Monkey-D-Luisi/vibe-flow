/**
 * Natural Language Intent Parser
 *
 * Parses free-form Telegram messages and maps them to structured pipeline
 * actions. Supports common intents like checking status, viewing pipelines,
 * approving/rejecting decisions, and submitting ideas.
 *
 * EP21 Task 0147
 */

export type IntentKind =
  | 'status'
  | 'pipeline'
  | 'budget'
  | 'health'
  | 'approve_decision'
  | 'reject_decision'
  | 'idea'
  | 'help'
  | 'unknown';

export interface ParsedIntent {
  readonly kind: IntentKind;
  readonly confidence: number;
  readonly args?: string;
  /** Original message text. */
  readonly raw: string;
}

interface IntentPattern {
  readonly kind: IntentKind;
  readonly patterns: readonly RegExp[];
  /** Extract args from the first capture group of the matched pattern. */
  readonly extractArgs?: boolean;
}

const INTENT_PATTERNS: readonly IntentPattern[] = [
  {
    kind: 'status',
    patterns: [
      /\b(?:status|how(?:'s| is) (?:the|my) team|team status|what(?:'s| is) (?:going on|happening)|sit(?:uation)?rep)\b/i,
      /\b(?:who(?:'s| is) (?:doing what|working|active)|agents?[ -]?status)\b/i,
    ],
  },
  {
    kind: 'pipeline',
    patterns: [
      /\b(?:pipeline|stage|progress|where (?:is|are)|show (?:me )?(?:the )?(?:pipeline|tasks?|progress))\b/i,
      /\bpipeline\s+(\S+)/i,
      /\btask\s+(?:status|progress)?\s*(\S+)/i,
    ],
    extractArgs: true,
  },
  {
    kind: 'budget',
    patterns: [
      /\b(?:budget|spending|costs?|money|how much (?:have we|did we) (?:spent?|used?))\b/i,
      /\b(?:token (?:usage|consumption)|remaining (?:budget|tokens))\b/i,
    ],
  },
  {
    kind: 'health',
    patterns: [
      /\b(?:health|diagnostics?|system (?:status|check)|everything (?:ok|okay|alright)|is (?:it|the system) (?:ok|working))\b/i,
    ],
  },
  {
    kind: 'approve_decision',
    patterns: [
      /\bapprove\s+(?:decision\s+)?(\S+)(?:\s+(.+))?/i,
      /\byes,?\s+(?:go with|choose|pick|select)\s+(.+)/i,
      /\blgtm\b/i,
    ],
    extractArgs: true,
  },
  {
    kind: 'reject_decision',
    patterns: [
      /\breject\s+(?:decision\s+)?(\S+)(?:\s+(.+))?/i,
      /\bno,?\s+(?:don'?t|reject|cancel)\b/i,
    ],
    extractArgs: true,
  },
  {
    kind: 'idea',
    patterns: [
      /\b(?:idea|feature request|suggestion|(?:we|i) (?:should|could|need to)|what if (?:we|I))\b/i,
      /\b(?:add|build|create|implement|make)\s+(?:a|an|the)\s+(.+)/i,
    ],
    extractArgs: true,
  },
  {
    kind: 'help',
    patterns: [
      /\b(?:help|commands?|what can (?:you|I) do|how do I|usage)\b/i,
    ],
  },
];

/**
 * Parse a free-form message into a structured intent.
 *
 * Returns the best-matching intent with a confidence score (0-1).
 * Falls back to 'unknown' with 0 confidence when no pattern matches.
 */
export function parseIntent(text: string): ParsedIntent {
  const trimmed = text.trim();
  if (!trimmed) {
    return { kind: 'unknown', confidence: 0, raw: text };
  }

  let bestMatch: ParsedIntent | null = null;

  for (const intentDef of INTENT_PATTERNS) {
    for (const pattern of intentDef.patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        const confidence = computeConfidence(trimmed, match[0]);
        const argParts = [match[1], match[2]].filter(Boolean).map(s => s.trim()).filter(Boolean);
        const args = intentDef.extractArgs && argParts.length > 0 ? argParts.join(' ') : undefined;

        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = {
            kind: intentDef.kind,
            confidence,
            args,
            raw: text,
          };
        }
      }
    }
  }

  return bestMatch ?? { kind: 'unknown', confidence: 0, raw: text };
}

/**
 * Confidence based on how much of the message was covered by the pattern match.
 */
function computeConfidence(fullText: string, matchedText: string): number {
  const ratio = matchedText.length / fullText.length;
  // Base confidence from match coverage, minimum 0.3 for any match
  return Math.min(1, Math.max(0.3, ratio * 1.5));
}

/**
 * Map parsed intent to a slash command equivalent.
 *
 * Returns null if the intent cannot be mapped to a known command.
 */
export function intentToCommand(intent: ParsedIntent): { command: string; args?: string } | null {
  switch (intent.kind) {
    case 'status':
      return { command: 'teamstatus' };
    case 'pipeline':
      return { command: 'pipeline', args: intent.args };
    case 'budget':
      return { command: 'budget' };
    case 'health':
      return { command: 'health' };
    case 'help':
      return { command: 'help' };
    case 'approve_decision':
      return intent.args ? { command: 'approve', args: intent.args } : null;
    case 'reject_decision':
      return intent.args ? { command: 'reject', args: intent.args } : null;
    case 'idea':
      return intent.args ? { command: 'idea', args: intent.args } : null;
    case 'unknown':
      return null;
  }
}

/**
 * Format a help message listing available natural language intents.
 */
export function formatIntentHelp(): string {
  return [
    '🤖 *I understand natural language\\!*',
    '',
    'Try saying things like:',
    "  • \"How's the team doing?\"",
    '  • "Show me the pipeline"',
    "  • \"What's the budget?\"",
    '  • "Is everything healthy?"',
    '  • "Approve decision abc option1"',
    '  • "Build a login page" \\(idea\\)',
    '',
    'Or use slash commands: /teamstatus, /pipeline, /budget, /health, /idea',
  ].join('\n');
}
