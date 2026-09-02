export function buildSessionCsv(headers: string[], rows: unknown[][]) {
  const escape = (value: unknown) =>
    `"${csvText(value).replaceAll('"', '""')}"`;
  return `\uFEFF${[
    headers.map(escape).join(','),
    ...rows.map((row) => row.map(escape).join(',')),
  ].join('\n')}`;
}

function csvText(value: unknown) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  )
    return String(value);
  return JSON.stringify(value);
}
