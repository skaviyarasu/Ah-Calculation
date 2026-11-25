#!/usr/bin/env python3
"""
Generates the synthetic Excel fixtures used by the cell-grouping parity tests.

    python tests/fixtures/make_fixtures.py

Deterministic (fixed seed). Covers the pandas read_excel behaviours the TypeScript
reader must reproduce: int vs float columns, numeric text, NA strings, blanks,
bool columns with/without blanks, mixed object columns, duplicate / blank headers,
blank rows in the middle and a pre-filled group column.
"""
import random
from pathlib import Path

import openpyxl

OUT = Path(__file__).resolve().parent / "data"
OUT.mkdir(parents=True, exist_ok=True)


def save(name, rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Cells"
    for r in rows:
        ws.append(r)
    wb.save(OUT / name)
    print("wrote", OUT / name, f"({len(rows) - 1} rows)")


def basic(rng):
    rows = [["Cell_ID", "CC_Ratio", "Capacity_Retention", "IR_Value", "Voltage", "Status", "Batch"]]
    for i in range(1, 151):
        rows.append([
            f"C{i:04d}",
            round(rng.uniform(0.80, 0.99), 3),
            round(rng.uniform(0.88, 1.0), 3),
            rng.randint(8, 100),
            round(rng.uniform(3.55, 3.72), 3),
            rng.choice(["PASS", "PASS", "PASS", "FAIL", "OK", "pass"]),
            rng.choice(["B1", "B2", "B3-X"]),
        ])
    return rows


def messy(rng):
    rows = [["Cell_ID", "CC_Ratio", "Capacity_Retention", "IR_Value", "Status", "Notes", "Passed", "Flag", "Status", None, "Capacity_Ah"]]
    for i in range(1, 81):
        ir = rng.choice([rng.randint(8, 100), round(rng.uniform(8, 100), 2), None])
        cc = rng.choice([round(rng.uniform(0.80, 0.99), 3)] * 6 + ["n/a", str(round(rng.uniform(0.8, 0.99), 3)), None])
        status = rng.choice(["PASS", " PASS", "FAIL", "NA", "OK ", None, "Pass"])
        notes = rng.choice(["ok", "retest", 5, 2.5, "IR high", None, "B2 weld"])
        passed = rng.choice([True, False, None])
        flag = rng.choice([True, False])
        status2 = rng.choice(["x", "y"])
        unnamed = rng.choice(["u1", None])
        cap = str(round(rng.uniform(2.80, 3.10), 3))
        rows.append([f"M{i:03d}", cc, round(rng.uniform(0.88, 1.0), 3), ir, status, notes, passed, flag, status2, unnamed, cap])
        if i == 40:
            rows.append([None] * 11)  # blank row in the middle (pandas keeps it as all-NaN)
    return rows


def pregrouped(rng):
    rows = [["Cell_ID", "CC_Ratio", "Capacity_Retention", "IR_Value", "Category", "Grade"]]
    for i in range(1, 61):
        rows.append([
            f"P{i:03d}",
            round(rng.uniform(0.80, 0.99), 3),
            round(rng.uniform(0.88, 1.0), 3),
            round(rng.uniform(8, 100), 1),
            rng.choice(["Manual-Hold", None, None, None]),
            rng.choice(["A", None, None]),
        ])
    return rows


def objectcol(rng):
    rows = [["Cell_ID", "CC_Ratio", "IR_Value", "Status"]]
    for i in range(1, 41):
        rows.append([f"O{i:03d}", round(rng.uniform(0.80, 0.99), 3), rng.choice([rng.randint(8, 100), "high", "low", 12.5]), rng.choice(["PASS", "FAIL"])])
    return rows


def grader_csv(rng):
    """CSV shaped like the grading machine's export: UTF-8 BOM, CRLF, leading spaces in IDs,
    '***' / '---' placeholders, a trailing comma (empty last column), quoted text."""
    header = ["Number", "cell No.", "3End Voltage(mV)", "3Capacity(mAh)", "3SD (%)  ", "5Time(minute)", "5CC_Ratio(%)", "Note", "ERROR", "Category"]
    lines = [",".join(header)]
    for i in range(1, 121):
        lines.append(",".join([
            f" 03-{i // 40 + 1}-{i % 40}",
            str(64 + i),
            str(rng.randint(2890, 3005)),
            str(rng.randint(4380, 4500)),
            rng.choice(["***", "1.2", "0.98"]),
            f"{rng.uniform(98, 152):.1f}",
            f"{rng.uniform(78, 100):.2f}",
            rng.choice(['"retest, high IR"', "ok", "", "NA"]),
            "---",
            "",
        ]))
    return "\r\n".join(lines) + "\r\n"


def numeric_only(rng):
    """Only numeric columns: pandas upcasts each row to float64 for row-wide regex (8 -> "8.0")."""
    rows = [["Cell_No", "CC_Ratio", "IR_Value"]]
    for i in range(1, 31):
        rows.append([i, round(rng.uniform(0.80, 0.99), 3), rng.randint(8, 100)])
    return rows


if __name__ == "__main__":
    rng = random.Random(20261124)
    save("cells_basic.xlsx", basic(rng))
    save("cells_messy.xlsx", messy(rng))
    save("cells_pregrouped.xlsx", pregrouped(rng))
    save("cells_objectcol.xlsx", objectcol(rng))
    save("cells_numeric_only.xlsx", numeric_only(rng))
    (OUT / "cells_grader.csv").write_bytes(grader_csv(rng).encode("utf-8-sig"))  # with BOM, like the grader
    print("wrote", OUT / "cells_grader.csv")
