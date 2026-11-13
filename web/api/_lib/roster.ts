// Class list CSV → students. Columns (any order, case-insensitive): student id, fullname, section, gmail.

export type Student = { studentId: string; name: string; section: string; email: string };

const MAX_ROWS = 3000;
const COLUMNS: Record<keyof Student, string[]> = {
  studentId: ["student id", "student_id", "studentid", "student no", "student number", "id"],
  name: ["fullname", "full name", "full_name", "name"],
  section: ["section"],
  email: ["gmail", "email", "e-mail", "email address"],
};
const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

/** RFC 4180-ish: quoted fields may hold commas, quotes ("") and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, ""); // Excel adds a BOM
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") row.push(field), (field = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field), rows.push(row), (row = []), (field = "");
    } else field += c;
  }
  if (field || row.length) row.push(field), rows.push(row);
  return rows.filter((r) => r.some((f) => f.trim()));
}

export function parseRoster(text: string): { students: Student[]; errors: string[] } {
  const [header, ...lines] = parseCsv(text);
  if (!header) return { students: [], errors: ["The file is empty."] };
  const names = header.map((h) => h.trim().toLowerCase());
  const col = {} as Record<keyof Student, number>;
  const missing: string[] = [];
  for (const key of Object.keys(COLUMNS) as (keyof Student)[]) {
    col[key] = names.findIndex((n) => COLUMNS[key].includes(n));
    if (col[key] < 0) missing.push(COLUMNS[key][0]);
  }
  if (missing.length) return { students: [], errors: [`Missing column: ${missing.join(", ")}. Required: student id, fullname, section, gmail.`] };
  if (lines.length > MAX_ROWS) return { students: [], errors: [`Too many rows: up to ${MAX_ROWS} students only.`] };

  const students: Student[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  lines.forEach((cells, i) => {
    const line = i + 2; // 1-based, after the header
    const get = (k: keyof Student) => (cells[col[k]] ?? "").trim();
    const s = { studentId: get("studentId"), name: get("name"), section: get("section"), email: get("email").toLowerCase() };
    if (!s.name) return void errors.push(`Row ${line}: missing fullname.`);
    if (!EMAIL.test(s.email)) return void errors.push(`Row ${line}: invalid gmail (${s.email || "blank"}).`);
    if (seen.has(s.email)) return void errors.push(`Row ${line}: duplicate gmail ${s.email}.`);
    seen.add(s.email);
    students.push(s);
  });
  return { students, errors };
}
