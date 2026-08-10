import { SlaUnit } from '../common/enums';

// Ports FlowFormDemo/Services/SlaCalculator.cs exactly. WorkingDays only skips Saturday/Sunday —
// there's no public-holiday calendar, same known simplification as the old app.
export function isSlaBreached(enteredAt: Date, slaValue: number, unit: SlaUnit, now: Date): boolean {
  switch (unit) {
    case 'Hours':
      return now.getTime() >= enteredAt.getTime() + slaValue * 60 * 60 * 1000;
    case 'CalendarDays':
      return now.getTime() >= enteredAt.getTime() + slaValue * 24 * 60 * 60 * 1000;
    case 'WorkingDays':
      return now.getTime() >= addWorkingDays(enteredAt, slaValue).getTime();
    default:
      return false;
  }
}

function addWorkingDays(start: Date, days: number): Date {
  const date = new Date(start.getTime());
  let remaining = days;
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return date;
}
