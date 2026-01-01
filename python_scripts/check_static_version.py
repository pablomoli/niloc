#!/usr/bin/env python3
"""
Check that local static JS script tags include cache-busting query strings.
"""
from __future__ import annotations

import pathlib
import re
import sys


TEMPLATE_GLOB = "templates/**/*.html"
VERSION_RE = re.compile(r"\?v=\{\{\s*static_version\s*\}\}")


def find_missing_versions(template_path: pathlib.Path) -> list[tuple[int, str]]:
    missing = []
    for line_no, line in enumerate(template_path.read_text(encoding="utf-8").splitlines(), start=1):
        if "<script" not in line or "src=" not in line:
            continue
        if "url_for('static'" not in line and 'url_for("static"' not in line:
            continue
        if VERSION_RE.search(line):
            continue
        missing.append((line_no, line.strip()))
    return missing


def main() -> int:
    root = pathlib.Path(__file__).resolve().parents[1]
    templates = sorted(root.glob(TEMPLATE_GLOB))
    if not templates:
        print("No templates found to scan.")
        return 0

    violations: list[str] = []
    for template in templates:
        missing = find_missing_versions(template)
        for line_no, line in missing:
            violations.append(f"{template.relative_to(root)}:{line_no}: {line}")

    if violations:
        print("Missing ?v={{ static_version }} on static JS script tags:")
        print("\n".join(violations))
        return 1

    print("All static JS script tags include ?v={{ static_version }}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
