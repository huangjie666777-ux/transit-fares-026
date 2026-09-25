export function formatMinute(total: number): string {
  const day = Math.floor(total / 1440);
  const m = ((total % 1440) + 1440) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  const suffix = day > 0 ? `（+${day}日）` : '';
  return `${hh}:${mm}${suffix}`;
}

export function durationText(minutes: number): string {
  if (minutes === 0) return '0 分钟';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} 分钟`;
  if (m === 0) return `${h} 小时`;
  return `${h} 小时 ${m} 分钟`;
}
