#!/usr/bin/env python3
"""
CSV Categorizer (Windows-friendly)
----------------------------------
Fetch a CSV (file or latest in a folder), categorize rows by rule conditions,
and write the category to a new column in the output CSV.

Install:
    pip install pandas pyyaml

Examples:
    # Direct file
    python categorize_csv.py --input "D:\\Data\\items.csv" --rules "D:\\Data\\rules.yaml"

    # Latest CSV from a folder (matching pattern)
    python categorize_csv.py --input-dir "D:\\Grader\\Output" --latest --pattern "*.csv" --rules "D:\\Data\\rules.yaml"

    # Custom category column and output path
    python categorize_csv.py --input items.csv --rules rules.yaml --category-col Category --output final.csv
"""
from __future__ import annotations

import argparse
import json
import logging
import math
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd

try:
    import yaml  # type: ignore
    HAVE_YAML = True
except Exception:
    HAVE_YAML = False

# ---------- Logging ----------
log = logging.getLogger("csv_categorizer")
_handler = logging.StreamHandler(sys.stdout)
_handler.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))
log.addHandler(_handler)
log.setLevel(logging.INFO)

# ---------- Rule helpers ----------
def _to_num_or_str(v: Any) -> Any:
    if isinstance(v, str):
        s = v.strip().lower()
        if s in ("nan", "none", "null", ""):
            return math.nan
        try:
            return float(v)
        except Exception:
            return v
    return v

def _load_rules(path: Path) -> Dict[str, Any]:
    txt = path.read_text(encoding="utf-8")
    if path.suffix.lower() in (".yaml", ".yml"):
        if not HAVE_YAML:
            raise RuntimeError("PyYAML is not installed. Run: pip install pyyaml")
        return yaml.safe_load(txt)
    return json.loads(txt)

def _validate_rules(raw: Dict[str, Any]) -> None:
    if "steps" not in raw or not isinstance(raw["steps"], list) or not raw["steps"]:
        raise ValueError("Rules file must define a non-empty 'steps' list.")
    for i, st in enumerate(raw["steps"], 1):
        if "name" not in st or not st["name"]:
            raise ValueError(f"Step #{i} is missing a 'name'.")
        then = st.get("then", {})
        if then is not None and not isinstance(then, dict):
            raise ValueError(f"Step '{st['name']}' has invalid 'then' (must be a dict).")

def _pick_latest_csv(input_dir: Path, pattern: str = "*.csv", recursive: bool = False) -> Path:
    if not input_dir.exists():
        raise FileNotFoundError(f"Input directory not found: {input_dir}")
    glob_pat = ("**/" if recursive else "") + pattern
    files = [p for p in input_dir.glob(glob_pat) if p.is_file()]
    if not files:
        raise FileNotFoundError(f"No files matching '{pattern}' in {input_dir}")
    return max(files, key=lambda p: p.stat().st_mtime)

def _build_mask(df: pd.DataFrame, filt: Dict[str, Any]) -> pd.Series:
    """Build a boolean mask from a filter dict that supports 'all'/'any' or a single condition."""
    if not filt:
        return pd.Series([True] * len(df), index=df.index)

    if "all" in filt:
        conds = filt["all"]; mode = "all"
    elif "any" in filt:
        conds = filt["any"]; mode = "any"
    else:
        conds = [filt]; mode = "all"

    parts = []
    for c in conds:
        col = c.get("col")
        op = (c.get("op") or "==").lower()
        val = c.get("value")
        vals = c.get("values")
        between = c.get("between")
        regex = c.get("regex")
        ci = bool(c.get("case_insensitive", False))

        if col is None and regex is None:
            raise ValueError(f"Condition requires 'col' or 'regex': {c}")

        if regex is not None:
            series = df[c.get("col", "").strip()] if col else df.apply(lambda r: r.astype(str).str.cat(sep=" "), axis=1)
            flags = re.IGNORECASE if ci else 0
            parts.append(series.astype(str).str.contains(regex, flags=flags, na=False))
            continue

        if col not in df.columns:
            parts.append(pd.Series([False] * len(df), index=df.index))
            continue

        s = df[col]
        v = _to_num_or_str(val) if val is not None else None
        vs = [_to_num_or_str(x) for x in vals] if vals is not None else None

        if between is not None:
            lo = _to_num_or_str(between[0]); hi = _to_num_or_str(between[1])
            parts.append(s.astype(float).between(float(lo), float(hi), inclusive="both"))
            continue

        if op in (">", ">=", "<", "<=", "==", "!="):
            try:
                mask = eval(f"s {op} v")  # safe here (controlled tokens)
            except Exception:
                mask = eval(f"s.astype(str) {op} str(v)")
            parts.append(mask)
        elif op == "in":
            if vs is None and v is not None:
                vs = [v]
            if vs is None:
                raise ValueError("'in' requires 'values' or a single 'value'.")
            parts.append(s.isin(vs))
        elif op in ("not in", "nin"):
            if vs is None and v is not None:
                vs = [v]
            if vs is None:
                raise ValueError("'not in' requires 'values' or a single 'value'.")
            parts.append(~s.isin(vs))
        elif op in ("contains", "~"):
            parts.append(s.astype(str).str.contains(str(v), case=not ci, na=False))
        elif op in ("startswith", "beginswith"):
            parts.append(s.astype(str).str.lower().str.startswith(str(v).lower()) if ci else s.astype(str).str.startswith(str(v)))
        elif op in ("endswith",):
            parts.append(s.astype(str).str.lower().str.endswith(str(v).lower()) if ci else s.astype(str).str.endswith(str(v)))
        else:
            raise ValueError(f"Unsupported op: {op}")

    m = parts[0]
    for p in parts[1:]:
        m = (m & p) if mode == "all" else (m | p)
    return m

def _apply_steps(df: pd.DataFrame, rules: Dict[str, Any], category_col: str, default_action: str = "keep_unmatched") -> pd.DataFrame:
    """
    Apply steps in sequence. For each step:
      - Build mask.
      - Write category_col (defaults to step name unless then.set overrides).
      - Optionally set extra columns (then.set).
      - then.action: 'keep' or 'drop' (affects inclusion when default_action='drop_unmatched').
      - once (default True): assign only if not already categorized (first match wins).
    """
    keep_mask = pd.Series([False] * len(df), index=df.index)
    assigned = pd.Series(df.get(category_col, pd.Series([None] * len(df))).notna(), index=df.index)

    for i, step in enumerate(rules.get("steps", [])):
        step_name = step.get("name", f"step_{i+1}")
        filt = step.get("filter", {})
        mask = _build_mask(df, filt)

        then = step.get("then", {}) or {}
        action = then.get("action", "keep")
        set_map = then.get("set", {}) or {}
        once = step.get("once", True)

        # Default category = step name (if not explicitly set)
        if category_col not in set_map:
            set_map[category_col] = step_name

        if once:
            idx = mask & (~assigned)
            for k, v in set_map.items():
                df.loc[idx, k] = v
            assigned = assigned | idx
        else:
            for k, v in set_map.items():
                df.loc[mask, k] = v

        if action == "keep":
            keep_mask = keep_mask | mask
        elif action == "drop":
            keep_mask = keep_mask & (~mask)
        else:
            raise ValueError(f"Unknown action: {action}")

    if (rules.get("global", {}) or {}).get("default_action", default_action) == "drop_unmatched":
        final = df[keep_mask].copy()
    else:
        final = df.copy()

    return final

# ---------- CLI ----------
def main():
    ap = argparse.ArgumentParser(description="Categorize CSV rows using sequential rule steps.")
    src = ap.add_mutually_exclusive_group(required=False)
    src.add_argument("--input", help="Input CSV file (full path)")
    src.add_argument("--input-dir", help="Directory to search for CSVs; use with --latest/--pattern")
    ap.add_argument("--latest", action="store_true", help="Pick most recently modified CSV from --input-dir")
    ap.add_argument("--pattern", default="*.csv", help="Filename pattern when using --input-dir (default: *.csv)")
    ap.add_argument("--recursive", action="store_true", help="Recurse subfolders when using --input-dir")
    ap.add_argument("--rules", required=True, help="Rules file (JSON or YAML)")
    ap.add_argument("--output", help="Output CSV file (default: <input>_categorized.csv)")
    ap.add_argument("--category-col", default="Category", help="Column name to write category to")
    ap.add_argument("--encoding", default="utf-8", help="CSV encoding")
    ap.add_argument("--sep", default=",", help="CSV delimiter (default ,)")
    ap.add_argument("--decimal", default=".", help="Decimal separator (default .)")
    args = ap.parse_args()

    # Resolve input
    if args.input:
        input_path = Path(args.input)
        if not input_path.exists():
            raise FileNotFoundError(f"Input file not found: {input_path}")
    else:
        if not args.input_dir:
            ap.error("Provide either --input <file> OR --input-dir <dir> (with --latest).")
        if not args.latest:
            log.warning("No --latest provided with --input-dir; defaulting to pick newest CSV.")
        input_path = _pick_latest_csv(Path(args.input_dir), pattern=args.pattern, recursive=args.recursive)

    # Resolve output
    if args.output:
        output_path = Path(args.output)
    else:
        stem = input_path.stem + "_categorized"
        output_path = input_path.with_name(stem + input_path.suffix)

    log.info(f"Using input: {input_path}")
    df = pd.read_csv(input_path, encoding=args.encoding, sep=args.sep, decimal=args.decimal)
    log.info(f"Rows: {len(df)}; Columns: {list(df.columns)}")

    rules_raw = _load_rules(Path(args.rules))
    _validate_rules(rules_raw)

    default_action = (rules_raw.get("global", {}) or {}).get("default_action", "keep_unmatched")
    out = _apply_steps(df.copy(), rules_raw, category_col=args.category_col, default_action=default_action)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(output_path, index=False, encoding=args.encoding)
    log.info(f"Saved: {output_path} (rows: {len(out)})")

if __name__ == "__main__":
    main()
