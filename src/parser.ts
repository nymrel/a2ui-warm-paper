/**
 * A2UI-inspired payload parser and stream validator
 * 
 * Provides robust JSON parsing, schema validation, markdown block unwrapping,
 * stream delta patching, and typed component resolution.
 */

import {
  A2UIPayload,
  A2UIParseResult,
  A2UIStreamDelta,
  A2UIContainerPayload,
  A2UIDecisionPayload,
  A2UIParameterSliderPayload,
  A2UIApprovalGatePayload,
  A2UIDiffViewerPayload,
  A2UIProgressTrackerPayload,
  A2UIDataTablePayload,
} from './types';

/**
 * Strips markdown codeblock fencing (```json ... ```) and leading/trailing whitespace
 */
export function cleanRawJSON(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

/**
 * Type guard for Decision payloads
 */
export function isA2UIDecision(payload: A2UIPayload): payload is A2UIDecisionPayload {
  return payload.type === 'decision';
}

/**
 * Type guard for Parameter Slider payloads
 */
export function isA2UIParameterSlider(payload: A2UIPayload): payload is A2UIParameterSliderPayload {
  return payload.type === 'parameter_slider' || payload.type === 'slider';
}

/**
 * Type guard for Approval Gate payloads
 */
export function isA2UIApprovalGate(payload: A2UIPayload): payload is A2UIApprovalGatePayload {
  return payload.type === 'approval_gate' || payload.type === 'approval';
}

/**
 * Type guard for Diff Viewer payloads
 */
export function isA2UIDiffViewer(payload: A2UIPayload): payload is A2UIDiffViewerPayload {
  return payload.type === 'diff_viewer' || payload.type === 'diff';
}

/**
 * Type guard for Progress Tracker payloads
 */
export function isA2UIProgressTracker(payload: A2UIPayload): payload is A2UIProgressTrackerPayload {
  return payload.type === 'progress_tracker' || payload.type === 'progress';
}

/**
 * Type guard for Data Table payloads
 */
export function isA2UIDataTable(payload: A2UIPayload): payload is A2UIDataTablePayload {
  return payload.type === 'data_table' || payload.type === 'table';
}

/**
 * Type guard for Container payloads
 */
export function isA2UIContainer(payload: A2UIPayload): payload is A2UIContainerPayload {
  return payload.type === 'container' || payload.type === 'card';
}

/**
 * Validates an untyped JavaScript object against this package's local payload model
 */
export function validateA2UIPayload(data: unknown): A2UIParseResult {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return {
      valid: false,
      errors: ['Payload must be a non-null JSON object.'],
    };
  }

  const obj = data as Record<string, unknown>;

  if (!obj['id'] || typeof obj['id'] !== 'string') {
    errors.push("Missing or invalid 'id' string property.");
  }

  if (!obj['type'] || typeof obj['type'] !== 'string') {
    errors.push("Missing or invalid 'type' string property.");
    return { valid: false, errors };
  }

  const type = obj['type'];

  switch (type) {
    case 'decision': {
      if (!obj['question'] || typeof obj['question'] !== 'string') {
        errors.push("Decision card requires a 'question' string.");
      }
      if (!Array.isArray(obj['options']) || obj['options'].length < 2) {
        errors.push("Decision card requires an 'options' array with at least 2 choices.");
      } else {
        obj['options'].forEach((opt: unknown, i: number) => {
          if (!opt || typeof opt !== 'object') {
            errors.push(`Option at index ${i} is invalid.`);
          } else {
            const optObj = opt as Record<string, unknown>;
            if (!optObj['id'] || !optObj['title']) {
              errors.push(`Option at index ${i} must have 'id' and 'title'.`);
            }
          }
        });
      }
      break;
    }

    case 'parameter_slider':
    case 'slider': {
      if (typeof obj['label'] !== 'string') {
        errors.push("Parameter slider requires a 'label' string.");
      }
      if (typeof obj['min'] !== 'number' || typeof obj['max'] !== 'number') {
        errors.push("Parameter slider requires numeric 'min' and 'max' bounds.");
      }
      if (typeof obj['value'] !== 'number') {
        errors.push("Parameter slider requires a numeric 'value'.");
      }
      break;
    }

    case 'approval_gate':
    case 'approval': {
      if (!obj['title'] || typeof obj['title'] !== 'string') {
        errors.push("Approval gate requires a 'title' string.");
      }
      if (!Array.isArray(obj['impactSummary']) || obj['impactSummary'].length === 0) {
        errors.push("Approval gate requires a non-empty 'impactSummary' array.");
      }
      const risk = obj['riskLevel'];
      if (!risk || !['low', 'medium', 'high', 'critical'].includes(risk as string)) {
        errors.push("Approval gate requires 'riskLevel' to be 'low' | 'medium' | 'high' | 'critical'.");
      }
      break;
    }

    case 'diff_viewer':
    case 'diff': {
      if (typeof obj['originalContent'] !== 'string' || typeof obj['modifiedContent'] !== 'string') {
        errors.push("Diff viewer requires 'originalContent' and 'modifiedContent' strings.");
      }
      break;
    }

    case 'progress_tracker':
    case 'progress': {
      if (!obj['title'] || typeof obj['title'] !== 'string') {
        errors.push("Progress tracker requires a 'title' string.");
      }
      if (!Array.isArray(obj['steps'])) {
        errors.push("Progress tracker requires a 'steps' array.");
      }
      break;
    }

    case 'data_table':
    case 'table': {
      if (!Array.isArray(obj['columns'])) {
        errors.push("Data table requires a 'columns' array.");
      }
      if (!Array.isArray(obj['rows'])) {
        errors.push("Data table requires a 'rows' array.");
      }
      break;
    }

    case 'container':
    case 'card': {
      if (!obj['title'] || typeof obj['title'] !== 'string') {
        errors.push("Container requires a 'title' string.");
      }
      break;
    }

    default:
      errors.push(`Unknown A2UI component type: '${type}'.`);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    payload: data as A2UIPayload,
  };
}

/**
 * Parses raw text (e.g. from an LLM stream or API payload) into a validated A2UIPayload
 */
export function parseA2UI(rawText: string): A2UIParseResult {
  const cleaned = cleanRawJSON(rawText);

  try {
    const parsed = JSON.parse(cleaned);
    const validation = validateA2UIPayload(parsed);
    return {
      ...validation,
      rawText,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      errors: [`JSON syntax error: ${errorMsg}`],
      rawText,
    };
  }
}

const UNSAFE_DELTA_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function parseDeltaPath(path: string): Array<string | number> {
  if (typeof path !== 'string' || path.trim() === '') {
    throw new Error('Stream delta path must be a non-empty string.');
  }

  const parts: Array<string | number> = [];
  for (const segment of path.split('.')) {
    const match = /^([A-Za-z_$][A-Za-z0-9_$]*)(?:\[(\d+)\])?$/.exec(segment);
    if (!match?.[1]) {
      throw new Error(`Invalid stream delta path segment: '${segment}'.`);
    }
    if (UNSAFE_DELTA_KEYS.has(match[1])) {
      throw new Error(`Unsafe stream delta path segment: '${match[1]}'.`);
    }
    parts.push(match[1]);
    if (match[2] !== undefined) {
      const index = Number(match[2]);
      if (!Number.isSafeInteger(index)) {
        throw new Error(`Invalid stream delta array index: '${match[2]}'.`);
      }
      parts.push(index);
    }
  }
  return parts;
}

function containsUnsafeDeltaKey(value: unknown, seen = new WeakSet<object>()): boolean {
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);

  for (const key of Object.keys(value)) {
    if (UNSAFE_DELTA_KEYS.has(key)) return true;
    if (containsUnsafeDeltaKey((value as Record<string, unknown>)[key], seen)) return true;
  }
  return false;
}

/**
 * Applies a stream delta / mutation patch to an existing A2UI payload
 */
export function applyStreamDelta<T extends A2UIPayload>(base: T, delta: A2UIStreamDelta): T {
  const clone = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
  const pathParts = parseDeltaPath(delta.path);
  if (delta.op !== 'delete' && containsUnsafeDeltaKey(delta.value)) {
    throw new Error('Stream delta value contains an unsafe object key.');
  }

  let curr: any = clone;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const key = pathParts[i]!;
    if (!curr || typeof curr !== 'object') {
      throw new Error(`Stream delta path cannot traverse '${String(key)}'.`);
    }
    if (curr[key] === undefined) {
      curr[key] = typeof pathParts[i + 1] === 'number' ? [] : {};
    } else if (!curr[key] || typeof curr[key] !== 'object') {
      throw new Error(`Stream delta path cannot traverse '${String(key)}'.`);
    }
    curr = curr[key];
  }

  const lastKey = pathParts[pathParts.length - 1]!;
  if (!curr || typeof curr !== 'object') {
    throw new Error(`Stream delta path cannot write '${String(lastKey)}'.`);
  }

  switch (delta.op) {
    case 'set':
      curr[lastKey] = delta.value;
      break;
    case 'append':
      if (Array.isArray(curr[lastKey])) {
        curr[lastKey].push(delta.value);
      } else {
        curr[lastKey] = [delta.value];
      }
      break;
    case 'merge':
      if (typeof curr[lastKey] === 'object' && curr[lastKey] !== null && typeof delta.value === 'object' && delta.value !== null) {
        curr[lastKey] = { ...curr[lastKey], ...delta.value };
      } else {
        curr[lastKey] = delta.value;
      }
      break;
    case 'delete':
      if (Array.isArray(curr) && typeof lastKey === 'number') {
        curr.splice(lastKey, 1);
      } else {
        delete curr[lastKey];
      }
      break;
    default:
      throw new Error(`Unsupported stream delta operation: '${String(delta.op)}'.`);
  }

  return clone as T;
}
