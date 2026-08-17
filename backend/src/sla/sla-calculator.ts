import { SlaUnit } from '../common/enums';

// Ports FlowFormDemo/Services/SlaCalculator.cs exactly. WorkingDays only skips Saturday/Sunday —
// there's no public-holiday calendar, same known simplification as the old app. Isolated here
// (rather than inlined at each call site) so a future holiday-aware calendar only has to change
// addWorkingDays — every caller (SLA breach checks, Task.dueAt) keeps working unmodified.
export function computeDueAt(enteredAt: Date, slaValue: number, unit: SlaUnit): Date {
  switch (unit) {
    case 'Hours':
      return new Date(enteredAt.getTime() + slaValue * 60 * 60 * 1000);
    case 'CalendarDays':
      return new Date(enteredAt.getTime() + slaValue * 24 * 60 * 60 * 1000);
    case 'WorkingDays':
      return addWorkingDays(enteredAt, slaValue);
  }
}

export function addWorkingDays(start: Date, days: number): Date {
  const date = new Date(start.getTime());
  let remaining = days;
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return date;
}
