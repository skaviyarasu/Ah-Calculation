#!/usr/bin/env python3
"""
Parity harness: runs the Python reference (categorize_csv.py) on an Excel file and
prints the result as JSON on stdout, for comparison with the TypeScript engine.

    python run_python.py --rules rules.yaml --input cells.xlsx|cells.csv [--group-col Category] [--ref path/to/categorize_csv.py]

Output: {"columns": [...], "rows": [[...]], "index": [...], "keep": [...]}
        or {"error": "<ExceptionType>: <message>"} when the reference raises.
The reference is used unchanged. .csv input is read exactly like the CLI (pd.read_csv, utf-8, sep ",",
decimal "."); .xlsx input uses pd.read_excel.
"""
import argparse
import copy
import importlib.util
import json
import math
import os
import sys
import warnings
from pathlib import Path

warnings.simplefilter("ignore")
import pandas as pd  # noqa: E402

HERE = Path(__file__).resolve().parent
DEFAULT_REF = HERE / "reference" / "categorize_csv.py"


def load_reference(path: Path):
    spec = importlib.util.spec_from_file_location("categorize_csv_ref", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def to_json_value(v):
    if v is None:
        return None
    if hasattr(v, "item") and not isinstance(v, (str, bytes)):
        v = v.item()  # numpy scalar -> Python scalar
    if isinstance(v, float):
        if math.isnan(v):
            return None
        if math.isinf(v):
            return "Infinity" if v > 0 else "-Infinity"
        return v
    if isinstance(v, (bool, int, str)):
        return v
    if isinstance(v, pd.Timestamp):
        return str(v)
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    return str(v)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rules", required=True)
    ap.add_argument("--input", required=True)
    ap.add_argument("--group-col", default="Category")
    ap.add_argument("--sheet", default=None)
    ap.add_argument("--ref", default=os.environ.get("CELL_GROUPING_PY_REF", str(DEFAULT_REF)))
    args = ap.parse_args()

    ref = load_reference(Path(args.ref))
    try:
        if args.input.lower().endswith(".csv"):
            df = pd.read_csv(args.input, encoding="utf-8", sep=",", decimal=".")
        else:
            df = pd.read_excel(args.input, sheet_name=args.sheet if args.sheet else 0)
        df.columns = [str(c) for c in df.columns]
        rules = ref._load_rules(Path(args.rules))
        ref._validate_rules(rules)
        default_action = (rules.get("global", {}) or {}).get("default_action", "keep_unmatched")

        # The run exactly as the CLI does it.
        out = ref._apply_steps(df.copy(), copy.deepcopy(rules), category_col=args.group_col, default_action=default_action)

        # Second run forced to drop_unmatched, only to recover keep_mask (row index survives filtering).
        forced = copy.deepcopy(rules)
        forced["global"] = dict(forced.get("global") or {}, default_action="drop_unmatched")
        kept = ref._apply_steps(df.copy(), forced, category_col=args.group_col)
    except Exception as e:  # reported, so the TS side can be checked to fail too
        print(json.dumps({"error": f"{type(e).__name__}: {e}"}))
        return

    result = {
        "columns": [str(c) for c in out.columns],
        "rows": [[to_json_value(v) for v in row] for row in out.itertuples(index=False, name=None)],
        "index": [int(i) for i in out.index],
        "keep": [int(i) for i in kept.index],
        "dtypes": {str(c): str(t) for c, t in out.dtypes.items()},
    }
    sys.stdout.write(json.dumps(result))


if __name__ == "__main__":
    main()
