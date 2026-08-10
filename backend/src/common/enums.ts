// Mirrors FlowFormDemo/Models/Entities/Enums.cs. SQLite has no native enum type, so Prisma stores
// every one of these as a plain String column — this file is the single source of truth for
// legal values, validated at the NestJS layer (DTOs / class-validator @IsIn).

export const DefinitionStatus = ['Draft', 'Published', 'Retired'] as const;
export type DefinitionStatus = (typeof DefinitionStatus)[number];

export const StepType = ['ApprovalGate', 'ActionTask', 'ParallelReview', 'Condition', 'SystemCall', 'Notification'] as const;
export type StepType = (typeof StepType)[number];

export const ActorType = ['User', 'Role', 'Tag', 'Dynamic'] as const;
export type ActorType = (typeof ActorType)[number];

export const SlaUnit = ['WorkingDays', 'CalendarDays', 'Hours'] as const;
export type SlaUnit = (typeof SlaUnit)[number];

export const ResolutionRule = ['All', 'Any', 'Quorum'] as const;
export type ResolutionRule = (typeof ResolutionRule)[number];

export const TransitionAction = ['Submit', 'Approve', 'Return', 'Reject', 'RequestChange', 'Delegate', 'Complete', 'AutoRoute'] as const;
export type TransitionAction = (typeof TransitionAction)[number];

export const FieldType = [
  'Text', 'LongText', 'Number', 'Date', 'Dropdown', 'YesNo', 'Checklist',
  'Table', 'FileUpload', 'PeoplePicker', 'ReferenceLookup', 'ExternalLookup', 'Section',
] as const;
export type FieldType = (typeof FieldType)[number];

export const ConditionOperator = [
  'Equals', 'NotEquals', 'Contains', 'GreaterThan', 'LessThan',
  'GreaterThanOrEqual', 'LessThanOrEqual', 'IsEmpty', 'IsNotEmpty',
] as const;
export type ConditionOperator = (typeof ConditionOperator)[number];

export const FieldWidth = ['Full', 'Half', 'Third'] as const;
export type FieldWidth = (typeof FieldWidth)[number];

export const RequestStatus = ['Draft', 'InReview', 'PendingApproval', 'InProgress', 'Completed', 'Returned', 'Terminated'] as const;
export type RequestStatus = (typeof RequestStatus)[number];

// Mirrors WorkflowDesignerController.GatekeeperFunctions — hardcoded, not sourced from a table.
export const GATEKEEPER_FUNCTIONS = [
  'Process Technology', 'Operations', 'HSSE - Safety', 'Quality Assurance', 'Quality Control', 'Mechanical Maintenance',
] as const;
