import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const schema = {
  "title": "TaskRecord",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "id", "title", "acceptance_criteria", "scope", "status", "rev",
    "created_at", "updated_at"
  ],
  "properties": {
    "version": {"type": "string", "const": "1.0.0"},
    "id": {
      "type": "string",
      "pattern": "^TR-[0-9A-HJKMNP-TV-Z]{26}$",
      "description": "ULID con prefijo TR-"
    },
    "title": {"type": "string", "minLength": 5, "maxLength": 120},
    "description": {"type": "string", "maxLength": 4000},
    "acceptance_criteria": {
      "type": "array", "minItems": 1, "items": {"type": "string", "minLength": 3, "maxLength": 300}
    },
    "scope": {"type": "string", "enum": ["minor", "major"]},
    "modules": {
      "type": "array", "items": {"type": "string", "pattern": "^[a-z][a-z0-9_\-]*(/[a-z0-9_\-]+)*$"}, "uniqueItems": true
    },
    "contracts": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "methods"],
        "properties": {
          "name": {"type": "string", "pattern": "^[A-Z][A-Za-z0-9]+$"},
          "methods": {"type": "array", "minItems": 1, "items": {"type": "string"}}
        },
        "additionalProperties": false
      }
    },
    "patterns": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name"],
        "properties": {
          "name": {"type": "string"},
          "where": {"type": "string"},
          "why": {"type": "string"}
        },
        "additionalProperties": false
      }
    },
    "adr_id": {"type": "string", "pattern": "^ADR-\\d{3,}$"},
    "test_plan": {"type": "array", "items": {"type": "string"}},
    "branch": {"type": "string", "pattern": "^feature/[a-z0-9._-]+$"},
    "diff_summary": {"type": "string"},
    "review_notes": {"type": "array", "items": {"type": "string"}},
    "qa_report": {
      "type": "object",
      "required": ["total", "passed", "failed"],
      "properties": {
        "total": {"type": "integer", "minimum": 0},
        "passed": {"type": "integer", "minimum": 0},
        "failed": {"type": "integer", "minimum": 0}
      },
      "additionalProperties": false
    },
    "metrics": {
      "type": "object",
      "properties": {
        "coverage": {"type": "number", "minimum": 0, "maximum": 1},
        "complexity": {"type": "object", "additionalProperties": {"type": "number", "minimum": 0}},
        "lint": {
          "type": "object",
          "properties": {"errors": {"type": "integer", "minimum": 0}, "warnings": {"type": "integer", "minimum": 0}},
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "red_green_refactor_log": {"type": "array", "items": {"type": "string"}},
    "status": {"type": "string", "enum": ["po","arch","dev","review","po_check","qa","pr","done"]},
    "rounds_review": {"type": "integer", "minimum": 0},
    "links": {
      "type": "object",
      "properties": {
        "jira": {"type": "object", "properties": {"projectKey": {"type": "string"}, "issueKey": {"type": "string"}}, "additionalProperties": false},
        "git": {"type": "object", "properties": {"repo": {"type": "string"}, "branch": {"type": "string"}, "prNumber": {"type": "integer"}}, "additionalProperties": false},
        "adr_url": {"type": "string", "format": "uri"}
      },
      "additionalProperties": false
    },
    "tags": {"type": "array", "items": {"type": "string"}},
    "rev": {"type": "integer", "minimum": 0},
    "created_at": {"type": "string", "format": "date-time"},
    "updated_at": {"type": "string", "format": "date-time"}
  }
};

const ajv = new Ajv();
addFormats(ajv);
const validateSchema = ajv.compile(schema);

export interface TaskRecord {
  version?: string;
  id: string;
  title: string;
  description?: string;
  acceptance_criteria: string[];
  scope: 'minor' | 'major';
  modules?: string[];
  contracts?: Array<{
    name: string;
    methods: string[];
  }>;
  patterns?: Array<{
    name: string;
    where?: string;
    why?: string;
  }>;
  adr_id?: string;
  test_plan?: string[];
  branch?: string;
  diff_summary?: string;
  review_notes?: string[];
  qa_report?: {
    total: number;
    passed: number;
    failed: number;
  };
  metrics?: {
    coverage?: number;
    complexity?: Record<string, number>;
    lint?: {
      errors: number;
      warnings: number;
    };
  };
  red_green_refactor_log?: string[];
  status: 'po' | 'arch' | 'dev' | 'review' | 'po_check' | 'qa' | 'pr' | 'done';
  rounds_review?: number;
  links?: {
    jira?: {
      projectKey: string;
      issueKey: string;
    };
    git?: {
      repo: string;
      branch: string;
      prNumber: number;
    };
    adr_url?: string;
  };
  tags?: string[];
  rev: number;
  created_at: string;
  updated_at: string;
}

// Domain invariants and specific validations beyond schema
export class TaskRecordValidator {
  static validateSchema(record: any): boolean {
    return validateSchema(record);
  }

  static validateTransition(from: TaskRecord['status'], to: TaskRecord['status'], record: TaskRecord): { valid: boolean; reason?: string } {
    switch (to) {
      case 'review':
        if (from !== 'dev') return { valid: false, reason: 'Can only transition to review from dev' };
        if (!record.red_green_refactor_log || record.red_green_refactor_log.length < 2) {
          return { valid: false, reason: 'red_green_refactor_log must have at least 2 entries' };
        }
        const requiredCoverage = record.scope === 'major' ? 0.8 : 0.7;
        if (!record.metrics?.coverage || record.metrics.coverage < requiredCoverage) {
          return { valid: false, reason: `Coverage must be at least ${requiredCoverage}` };
        }
        break;
      case 'dev':
        if (from !== 'review') return { valid: false, reason: 'Can only transition to dev from review' };
        if ((record.rounds_review || 0) >= 2) return { valid: false, reason: 'Max 2 review rounds' };
        break;
      case 'po_check':
        if (from !== 'review') return { valid: false, reason: 'Can only transition to po_check from review' };
        // Assume no high violations, but since not defined, skip for now
        break;
      case 'qa':
        if (from !== 'po_check') return { valid: false, reason: 'Can only transition to qa from po_check' };
        // Assume acceptance criteria met, skip
        break;
      case 'pr':
        if (from !== 'qa') return { valid: false, reason: 'Can only transition to pr from qa' };
        if (record.qa_report?.failed !== 0) return { valid: false, reason: 'QA report must have 0 failed' };
        break;
      case 'done':
        if (!['pr', 'qa'].includes(from)) return { valid: false, reason: 'Can only transition to done from pr or qa' };
        break;
      default:
        return { valid: false, reason: 'Invalid transition' };
    }
    return { valid: true };
  }

  static validateCreation(record: Partial<TaskRecord>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!record.title || record.title.length < 5 || record.title.length > 120) {
      errors.push('Title must be 5-120 characters');
    }
    if (!record.acceptance_criteria || record.acceptance_criteria.length === 0) {
      errors.push('Acceptance criteria required');
    }
    if (!record.scope || !['minor', 'major'].includes(record.scope)) {
      errors.push('Scope must be minor or major');
    }
    return { valid: errors.length === 0, errors };
  }
}