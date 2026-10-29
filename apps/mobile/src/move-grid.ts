/** Inverse pairs first; half turns are self-inverse and share a six-cell row. */
export function moveGridRows(moves: readonly string[]): string[][] {
  const bases = [...new Set(moves.map((move) => move.replace(/(2|')$/, "")))];
  const pairs = bases.flatMap((base) => [base, base + "'"]);
  const doubles = bases
    .filter((base) => moves.includes(base + "2"))
    .map((base) => base + "2");
  const rows: string[][] = [];
  for (const group of [pairs, doubles])
    for (let i = 0; i < group.length; i += 6) rows.push(group.slice(i, i + 6));
  return rows;
}
