import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const idPattern = new RegExp("^TR-[0-9A-HJKMNP-TV-Z]{26}$");

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
      "pattern": idPattern,
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
        "github": {"type": "object", "properties": {"owner": {"type": "string"}, "repo": {"type": "string"}, "issueNumber": {"type": "integer"}}, "additionalProperties": false},
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
    github?: {
      owner: string;
      repo: string;
      issueNumber: number;
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

  static validateTransition(from: TaskRecord['status'], to: TaskRecord['status'], record: TaskRecord, evidence?: any): { valid: boolean; reason?: string } {
    // Helper function for quality gate validation
    const validateQualityGate = (record: TaskRecord): boolean => {
      const hasTddLogs = record.red_green_refactor_log && record.red_green_refactor_log.length >= 2;
      const requiredCoverage = record.scope === 'major' ? 0.8 : 0.7;
      const hasCoverage = record.metrics?.coverage && record.metrics.coverage >= requiredCoverage;
      const noLintErrors = !record.metrics?.lint?.errors || record.metrics.lint.errors === 0;
      return Boolean(hasTddLogs && hasCoverage && noLintErrors);
    };

    // Helper function for violations check
    const hasHighViolations = (evidence?: any): boolean => {
      return evidence?.violations?.some((v: any) => v.severity === 'high') || false;
    };

    switch (`${from}->${to}`) {
      case 'po->arch':
        // Guard: requisitos mínimos definidos (assume acceptance_criteria is sufficient)
        return record.acceptance_criteria && record.acceptance_criteria.length > 0
          ? { valid: true }
          : { valid: false, reason: 'Requirements must be groomed before moving to arch' };

      case 'po->dev': {
        if (record.scope !== 'minor') {
          return { valid: false, reason: 'Fast-track only available for minor scope' };
        }
        if (!((record.tags || []).includes('fast-track:eligible') && !(record.tags || []).includes('fast-track:revoked'))) {
          return { valid: false, reason: 'Fast-track evaluation required with score >= 60' };
        }
        return { valid: true };
      }

      case 'arch->dev':
        // Guard: ADR and contracts defined
        return record.adr_id && record.contracts && record.contracts.length > 0
          ? { valid: true }
          : { valid: false, reason: 'ADR and contracts must be defined' };

      case 'dev->review':
        // Quality gate validation
        if (!validateQualityGate(record)) {
          return { valid: false, reason: 'Quality gate failed: insufficient coverage, TDD logs, or lint errors' };
        }
        return { valid: true };

      case 'review->dev':
        // Check round limit
        if ((record.rounds_review || 0) >= 2) {
          return { valid: false, reason: 'Maximum review rounds (2) exceeded' };
        }
        return { valid: true };

      case 'review->po_check':
        // Guard: no high violations in rúbrica
        return !hasHighViolations(evidence)
          ? { valid: true }
          : { valid: false, reason: 'High severity violations must be resolved' };

      case 'po_check->qa':
        // Guard: acceptance criteria marked as met (assume evidence contains approval)
        return evidence?.acceptance_criteria_met === true
          ? { valid: true }
          : { valid: false, reason: 'Acceptance criteria must be approved by PO' };

      case 'qa->dev':
        // QA failed, return to dev with report
        return evidence?.qa_report
          ? { valid: true }
          : { valid: false, reason: 'QA report required for failed QA' };

      case 'qa->pr':
        // Guard: qa_report.failed == 0
        return record.qa_report?.failed === 0
          ? { valid: true }
          : { valid: false, reason: 'QA must pass with 0 failures' };

      case 'pr->done':
        // PR merged
        return evidence?.merged === true
          ? { valid: true }
          : { valid: false, reason: 'PR must be merged to complete' };

      default:
        return { valid: false, reason: `Invalid transition: ${from} -> ${to}` };
    }
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
