import { Injectable } from '@nestjs/common';
import { ConditionOperator, FieldType } from '../common/enums';

// Ports FlowFormDemo/Services/ConditionEvaluator.cs exactly.
const OPERATORS_BY_FIELD_TYPE: Partial<Record<FieldType, ConditionOperator[]>> = {
  Text: ['Equals', 'NotEquals', 'Contains', 'IsEmpty', 'IsNotEmpty'],
  LongText: ['Equals', 'NotEquals', 'Contains', 'IsEmpty', 'IsNotEmpty'],
  Number: ['Equals', 'NotEquals', 'GreaterThan', 'GreaterThanOrEqual', 'LessThan', 'LessThanOrEqual', 'IsEmpty', 'IsNotEmpty'],
  Date: ['Equals', 'GreaterThan', 'GreaterThanOrEqual', 'LessThan', 'LessThanOrEqual', 'IsEmpty', 'IsNotEmpty'],
  Dropdown: ['Equals', 'NotEquals', 'IsEmpty', 'IsNotEmpty'],
  YesNo: ['Equals', 'NotEquals'],
};

export const REFERENCEABLE_FIELD_TYPES = Object.keys(OPERATORS_BY_FIELD_TYPE) as FieldType[];

export interface ConditionRuleLike {
  fieldId: number | null;
  operator: ConditionOperator | null;
  compareValue: string | null;
}

export interface ConditionStepLike {
  conditionRulesOf: Array<{
    orderIndex: number;
    isElse: boolean;
    fieldId: number | null;
    operator: ConditionOperator | null;
    compareValue: string | null;
    toStepId: number | null;
  }>;
}

@Injectable()
export class ConditionEvaluatorService {
  operatorsByFieldType() {
    return OPERATORS_BY_FIELD_TYPE;
  }

  isOperatorLegal(fieldType: FieldType, op: ConditionOperator): boolean {
    return (OPERATORS_BY_FIELD_TYPE[fieldType] ?? []).includes(op);
  }

  matches(rule: ConditionRuleLike, fieldValuesByFieldId: Record<number, string | undefined>): boolean {
    const raw = rule.fieldId != null ? fieldValuesByFieldId[rule.fieldId] : undefined;

    if (rule.operator === 'IsEmpty') return !raw || raw.trim() === '';
    if (rule.operator === 'IsNotEmpty') return !!raw && raw.trim() !== '';
    if (!raw || raw.trim() === '') return false;

    switch (rule.operator) {
      case 'Equals':
        return raw.toLowerCase() === (rule.compareValue ?? '').toLowerCase();
      case 'NotEquals':
        return raw.toLowerCase() !== (rule.compareValue ?? '').toLowerCase();
      case 'Contains':
        return raw.toLowerCase().includes((rule.compareValue ?? '').toLowerCase());
      case 'GreaterThan':
      case 'GreaterThanOrEqual':
      case 'LessThan':
      case 'LessThanOrEqual':
        return this.compareOrdered(raw, rule.compareValue ?? '', rule.operator);
      default:
        return false;
    }
  }

  private compareOrdered(raw: string, compare: string, op: ConditionOperator): boolean {
    const rawDate = Date.parse(raw);
    const compareDate = Date.parse(compare);
    let cmp: number | null = null;
    if (!Number.isNaN(rawDate) && !Number.isNaN(compareDate)) {
      cmp = rawDate - compareDate;
    } else {
      const rawNum = Number(raw);
      const compareNum = Number(compare);
      if (!Number.isNaN(rawNum) && !Number.isNaN(compareNum)) cmp = rawNum - compareNum;
    }
    if (cmp === null) return false; // fails closed, same as the C# version
    if (op === 'GreaterThan') return cmp > 0;
    if (op === 'GreaterThanOrEqual') return cmp >= 0;
    if (op === 'LessThan') return cmp < 0;
    return cmp <= 0; // LessThanOrEqual
  }

  // First-match-wins over non-else rules (ordered by orderIndex), falling back to the else rule.
  // Either path returning null means the request ends (completes) here — same convention as a
  // plain Transition.toStepId.
  resolve(step: ConditionStepLike, fieldValuesByFieldId: Record<number, string | undefined>): number | null {
    const rules = step.conditionRulesOf.filter((r) => !r.isElse).sort((a, b) => a.orderIndex - b.orderIndex);
    for (const rule of rules) {
      if (this.matches(rule, fieldValuesByFieldId)) return rule.toStepId;
    }
    const elseRule = step.conditionRulesOf.find((r) => r.isElse);
    return elseRule ? elseRule.toStepId : null;
  }
}
