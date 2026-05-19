#!/usr/bin/env python3
"""Convert the SQLite inventory schema to the static web app inventory.json format.

Usage:
  python tools/sqlite_to_inventory_json.py inventory.db data/inventory.json
"""
from __future__ import annotations

import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_CATEGORIES = [
    "resistor",
    "capacitor",
    "inductor",
    "ic",
    "keyswitch",
    "connector",
    "diode",
    "transistor",
    "module",
    "mechanical",
    "other",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def rows(conn: sqlite3.Connection, table: str) -> list[sqlite3.Row]:
    exists = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    if not exists:
        return []
    return list(conn.execute(f'SELECT * FROM "{table}"'))


def value(row: sqlite3.Row, *names: str, default: Any = None) -> Any:
    keys = set(row.keys())
    for name in names:
        if name in keys:
            return row[name]
    return default


def clean_text(v: Any) -> str | None:
    if v is None:
        return None
    text = str(v).strip()
    return text or None


def clean_num(v: Any) -> float | int | None:
    if v is None or v == "":
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    return int(n) if n.is_integer() else n


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: sqlite_to_inventory_json.py <inventory.db> <inventory.json>", file=sys.stderr)
        return 2

    db_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2])
    if not db_path.exists():
        print(f"SQLite file not found: {db_path}", file=sys.stderr)
        return 1

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    now = utc_now()

    categories = [
        {"id": int(row["id"]), "name": str(row["name"])}
        for row in rows(conn, "categories")
    ]
    if not categories:
        categories = [{"id": i + 1, "name": name} for i, name in enumerate(DEFAULT_CATEGORIES)]

    locations = [
        {
            "id": int(row["id"]),
            "name": str(row["name"]),
            "parentId": value(row, "parent_id", "parentId"),
            "notes": clean_text(value(row, "notes")),
        }
        for row in rows(conn, "locations")
    ]

    parts = [
        {
            "id": int(row["id"]),
            "categoryId": int(value(row, "category_id", "categoryId", default=11)),
            "name": str(row["name"]),
            "manufacturer": clean_text(value(row, "manufacturer")),
            "mpn": clean_text(value(row, "mpn", "partnumber")),
            "footprint": clean_text(value(row, "footprint")),
            "package": clean_text(value(row, "package")),
            "description": clean_text(value(row, "description")),
            "datasheetUrl": clean_text(value(row, "datasheet_url", "datasheetUrl")),
            "notes": clean_text(value(row, "notes")),
            "createdAt": clean_text(value(row, "created_at", "createdAt")) or now,
            "updatedAt": clean_text(value(row, "updated_at", "updatedAt")),
        }
        for row in rows(conn, "parts")
    ]

    stock = [
        {
            "id": int(row["id"]),
            "partId": int(value(row, "part_id", "partId")),
            "locationId": value(row, "location_id", "locationId"),
            "quantity": int(value(row, "quantity", default=0) or 0),
            "minQuantity": int(value(row, "min_quantity", "minQuantity", default=0) or 0),
            "source": clean_text(value(row, "source")),
            "orderNumber": clean_text(value(row, "order_number", "orderNumber")),
            "unitPrice": clean_num(value(row, "unit_price", "unitPrice")),
            "currency": clean_text(value(row, "currency")),
            "dateAdded": clean_text(value(row, "date_added", "dateAdded")),
            "notes": clean_text(value(row, "notes")),
        }
        for row in rows(conn, "stock")
    ]

    resistor_specs = [
        {
            "partId": int(value(row, "part_id", "partId")),
            "resistanceOhm": clean_num(value(row, "resistance_ohm", "resistanceOhm")),
            "tolerancePercent": clean_num(value(row, "tolerance_percent", "tolerancePercent")),
            "powerW": clean_num(value(row, "power_w", "powerW")),
            "voltageV": clean_num(value(row, "voltage_v", "voltageV")),
            "tempcoPpm": clean_num(value(row, "tempco_ppm", "tempcoPpm")),
        }
        for row in rows(conn, "resistor_specs")
    ]

    capacitor_specs = [
        {
            "partId": int(value(row, "part_id", "partId")),
            "capacitanceF": clean_num(value(row, "capacitance_f", "capacitanceF")),
            "voltageV": clean_num(value(row, "voltage_v", "voltageV")),
            "tolerancePercent": clean_num(value(row, "tolerance_percent", "tolerancePercent")),
            "dielectric": clean_text(value(row, "dielectric")),
            "esrOhm": clean_num(value(row, "esr_ohm", "esrOhm")),
        }
        for row in rows(conn, "capacitor_specs")
    ]

    inductor_specs = [
        {
            "partId": int(value(row, "part_id", "partId")),
            "inductanceH": clean_num(value(row, "inductance_h", "inductanceH")),
            "currentA": clean_num(value(row, "current_a", "currentA")),
            "resistanceOhm": clean_num(value(row, "resistance_ohm", "resistanceOhm")),
            "shielded": clean_num(value(row, "shielded")),
        }
        for row in rows(conn, "inductor_specs")
    ]

    ic_specs = []
    for row in rows(conn, "ic_specs"):
        spec = {
            "partId": int(value(row, "part_id", "partId")),
            "pinCount": clean_num(value(row, "pin_count", "pinCount")),
            "interface": clean_text(value(row, "interface")),
            "supplyMinV": clean_num(value(row, "supply_min_v", "supplyMinV")),
            "supplyMaxV": clean_num(value(row, "supply_max_v", "supplyMaxV")),
        }
        footprint = clean_text(value(row, "footprint"))
        if footprint and not spec["interface"]:
            spec["interface"] = footprint
        ic_specs.append(spec)

    keyswitch_rows = rows(conn, "keyswitch_specs") or rows(conn, "keyswitch_spec")
    keyswitch_specs = [
        {
            "partId": int(value(row, "part_id", "partId")),
            "switchType": clean_text(value(row, "switch_type", "switchType")),
            "mount": clean_text(value(row, "mount")),
            "actuationForceG": clean_num(value(row, "actuation_force_g", "actuationForceG")),
            "travelMm": clean_num(value(row, "travel_mm", "travelMm")),
        }
        for row in keyswitch_rows
    ]

    attributes = [
        {
            "partId": int(value(row, "part_id", "partId")),
            "name": str(value(row, "name")),
            "valueNum": clean_num(value(row, "value_num", "valueNum")),
            "unit": clean_text(value(row, "unit")),
            "valueText": clean_text(value(row, "value_text", "valueText")),
        }
        for row in rows(conn, "attributes")
    ]

    inventory = {
        "schemaVersion": 1,
        "meta": {
            "app": "too-many-items",
            "createdAt": now,
            "updatedAt": now,
            "source": str(db_path.name),
        },
        "categories": categories,
        "locations": locations,
        "parts": parts,
        "resistorSpecs": resistor_specs,
        "capacitorSpecs": capacitor_specs,
        "inductorSpecs": inductor_specs,
        "icSpecs": ic_specs,
        "keyswitchSpecs": keyswitch_specs,
        "stock": stock,
        "attributes": attributes,
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(inventory, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {out_path}")
    print(f"Parts: {len(parts)}, stock rows: {len(stock)}, locations: {len(locations)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
