import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseRoster } from "./roster.ts";

test("parseCsv: quotes, commas inside quotes, CRLF, BOM", () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"Dela Cruz, Juan","say ""hi"""\r\n\r\n'), [
    ["a", "b"],
    ["Dela Cruz, Juan", 'say "hi"'],
  ]);
});

test("parseRoster: any column order and header case, emails lowercased", () => {
  const { students, errors } = parseRoster("Section,Gmail,Student ID,Fullname\nBSCpE 3-1,Juan@Gmail.com,2023-001,\"Dela Cruz, Juan\"\n");
  assert.deepEqual(errors, []);
  assert.deepEqual(students, [{ studentId: "2023-001", name: "Dela Cruz, Juan", section: "BSCpE 3-1", email: "juan@gmail.com" }]);
});

test("parseRoster: reports bad rows and keeps the good ones", () => {
  const csv = "student id,fullname,section,gmail\n1,Ana,A,ana@gmail.com\n2,,A,x@gmail.com\n3,Ben,A,not-an-email\n4,Ana Two,A,ANA@gmail.com\n";
  const { students, errors } = parseRoster(csv);
  assert.equal(students.length, 1);
  assert.equal(errors.length, 3); // no name, bad email, duplicate email
});

test("parseRoster: missing column is one clear error", () => {
  const { students, errors } = parseRoster("student id,fullname,gmail\n1,Ana,ana@gmail.com\n");
  assert.equal(students.length, 0);
  assert.match(errors[0], /section/);
});
