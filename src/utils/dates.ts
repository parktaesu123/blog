const parts = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul' });

/** Formats a date as YYYY.MM.DD in Korean time. */
export function formatDate(date: Date) {
  const value = Object.fromEntries(parts.formatToParts(date).map((part) => [part.type, part.value]));
  return `${value.year}.${value.month}.${value.day}`;
}
