/** "Grade 5", "Grades 4–6" for a run, otherwise "Grades 3, 5, 8". */
export function describeGrades(grades: number[]): string {
  const g = [...new Set(grades)].sort((a, b) => a - b);
  if (g.length === 0) return 'No grades';
  if (g.length === 1) return `Grade ${g[0]}`;
  const run = g.every((x, i) => i === 0 || x === g[i - 1]! + 1);
  return run ? `Grades ${g[0]}–${g[g.length - 1]}` : `Grades ${g.join(', ')}`;
}
