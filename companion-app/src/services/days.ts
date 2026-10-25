export const WINDOW_DAYS = 7;

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return startOfDay(next);
}

export function dayKey(date: Date): string {
  const day = startOfDay(date);
  return `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
}

export function sameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b);
}

export function sessionDateLabel(session: { timestamp: number; dateStr: string }): string {
  if (session.timestamp >= 1e12) {
    return new Date(session.timestamp).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  return session.dateStr;
}

export function startOfWeekMonday(date: Date): Date {
  const day = startOfDay(date);
  const weekday = day.getDay();
  const delta = weekday === 0 ? -6 : 1 - weekday;
  return addDays(day, delta);
}

export function inWindow(day: Date, today = new Date()): boolean {
  const start = addDays(startOfDay(today), -WINDOW_DAYS).getTime();
  const end = addDays(startOfDay(today), WINDOW_DAYS).getTime();
  const time = startOfDay(day).getTime();
  return time >= start && time <= end;
}

export function shiftWeek(selected: Date, direction: -1 | 1, today = new Date()): Date {
  const target = addDays(selected, direction * 7);
  if (inWindow(target, today)) return target;
  return addDays(startOfDay(today), direction * WINDOW_DAYS);
}
