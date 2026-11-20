#!/usr/bin/env python3
"""Build data/drains.json from auno.org item pages.

Usage:  python3 scripts/scrape_auno.py

For every nano id in DRAIN_IDS this fetches the auno.org item page, picks the
item version that was in force at TARGET_PATCH (auno keeps a per-item patch
history), parses it, and follows each "Self/User Cast" effect to the self-buff
item, which is resolved to the same patch.

Nothing is estimated: a field that is not on the page is written as null.
Pages are cached in .cache/auno/ (git-ignored); delete that folder to refetch.
Standard library only.
"""
from __future__ import annotations

import html
import json
import re
import sys
import time
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "auno"
OUT = ROOT / "data" / "drains.json"

TARGET_PATCH = "18.4"
# auno encodes patch a.b.c as a*1_000_000 + b*10_000 + c*100.
# Any item version from a patch below 18.5 was in force during 18.4.x.
PATCH_CUTOFF = 18_05_00_00

ITEM_URL = "https://auno.org/ao/db.php?id={id}"
PATCH_URL = "https://auno.org/ao/db.php?id={id}&patch={patch}"

# family name -> nano ids, weakest first.
# Nanoline names auno prints that are known to be wrong, by strain id. The name
# is written as null and auno's text is kept in nanolineLabelOnAuno.
# 138 holds only the 16 Ransack/Plunder "Transfer" self-buffs and no AC nano.
MISLABELLED_STRAINS = {138: "Trader AC leech line A"}

DRAIN_IDS: dict[str, list[int]] = {
    "Deprive Skills": [85872, 85870, 85868, 85866, 85864, 85862, 85860],
    "Divest Skills": [85858, 85856, 85854, 85852, 85850, 85848, 85846, 267114, 275030],
    "Ransack Skills": [85871, 85869, 85867, 85865, 85863, 85861, 85859],
    "Plunder Skills": [85857, 85855, 85853, 85851, 85849, 85847, 85845, 267110, 275029],
}


def fetch(url: str, cache_name: str) -> str:
    path = CACHE / cache_name
    if path.exists() and path.stat().st_size > 2000:
        return path.read_text(encoding="utf-8", errors="replace")
    request = urllib.request.Request(url, headers={"User-Agent": "curl/8.5.0"})
    data = urllib.request.urlopen(request, timeout=30).read()
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    time.sleep(0.7)  # be polite
    return data.decode("utf-8", "replace")


def text(fragment: str) -> str:
    stripped = re.sub(r"<[^>]+>", " ", fragment)
    return re.sub(r"\s+", " ", html.unescape(stripped)).replace("\xa0", " ").strip()


def patch_number(label: str) -> int:
    parts = [int(p) for p in label.split(".")] + [0, 0]
    return parts[0] * 1_000_000 + parts[1] * 10_000 + parts[2] * 100


def patch_labels(page: str) -> list[str]:
    cell = re.search(r">Patch</td>\s*<td[^>]*>(.*?)</td>", page, flags=re.S)
    return text(cell.group(1)).split() if cell else []


def page_at_target_patch(item_id: int) -> tuple[str, str, list[str]] | None:
    """Return (page, patch label, all patch labels), or None if the item did
    not exist yet at the target patch."""
    current = fetch(ITEM_URL.format(id=item_id), f"{item_id}_current.html")
    labels = patch_labels(current)
    in_force = [label for label in labels if patch_number(label) < PATCH_CUTOFF]
    if not in_force:
        return None
    label = max(in_force, key=patch_number)
    if label == labels[-1]:
        return current, label, labels
    number = patch_number(label)
    page = fetch(PATCH_URL.format(id=item_id, patch=number), f"{item_id}_{number}.html")
    return page, label, labels


def info_table(page: str) -> dict[str, str]:
    rows = re.findall(
        r"<td class='field_left'[^>]*>(.*?)</td>\s*<td class='field_left'>(.*?)</td>",
        page,
        flags=re.S,
    )
    return {text(key): value for key, value in rows}


def fieldset(page: str, legend: str) -> str | None:
    match = re.search(
        r"<legend>" + re.escape(legend) + r"</legend>(.*?)</fieldset>", page, flags=re.S
    )
    return match.group(1) if match else None


def rows_of(table_html: str) -> list[list[str]]:
    rows = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", table_html, flags=re.S):
        rows.append(re.findall(r"<td[^>]*>(.*?)</td>", row, flags=re.S))
    return rows


def integer(value: str | None) -> int | None:
    if value is None:
        return None
    match = re.fullmatch(r"-?\d+", text(value))
    return int(match.group(0)) if match else None


def seconds(value: str | None) -> float | None:
    if value is None:
        return None
    match = re.fullmatch(r"([\d.]+)\s*s", text(value))
    return float(match.group(1)) if match else None


def duration_seconds(value: str | None) -> int | None:
    if value is None:
        return None
    units = {"hour": 3600, "minute": 60, "second": 1}
    found = re.findall(r"(\d+)\s*(hour|minute|second)s?", text(value))
    if not found:
        return None
    return sum(int(amount) * units[unit] for amount, unit in found)


def percent_table(page: str, legend: str) -> dict[str, int]:
    section = fieldset(page, legend)
    if section is None:
        return {}
    result = {}
    for cells in rows_of(section):
        if len(cells) == 2:
            result[text(cells[0])] = int(text(cells[1]).rstrip(" %"))
    return result


def requirements(page: str) -> list[dict]:
    section = fieldset(page, "Requirements")
    if section is None:
        return []
    result = []
    for cells in rows_of(section):
        if len(cells) == 5:  # first row of a group carries the "To Use" cell
            cells = cells[1:]
        if len(cells) != 4:
            raise ValueError(f"unexpected requirement row: {cells}")
        target, stat, condition, connector = (text(c) for c in cells)
        operator, _, value = condition.partition(" ")
        if operator == "not" and value == "running":
            operator, value = "not running", ""
        entry: dict = {"target": target, "stat": stat, "operator": operator}
        entry["value"] = int(value) if re.fullmatch(r"-?\d+", value) else (value or None)
        entry["connector"] = connector or None
        result.append(entry)
    return result


def effects(page: str) -> list[dict]:
    """Every effect row, in page order. An "if" row attaches to the row above."""
    section = fieldset(page, "Effects")
    if section is None:
        return []
    result: list[dict] = []
    for cells in rows_of(section):
        plain = [text(c) for c in cells]
        if "if" in plain[:2]:
            index = plain.index("if")
            result[-1]["condition"] = f"{plain[index + 1]} {plain[index + 2]}"
            continue
        _event, target, action = plain[0], plain[1], plain[2]
        entry: dict = {"target": target, "action": action, "condition": None}
        if action == "Cast":
            link = re.search(r"id=(\d+)", cells[3])
            entry["castId"] = int(link.group(1)) if link else None
            entry["castName"] = plain[3]
        else:
            entry["stat"] = plain[3]
            entry["amount"] = integer(cells[4])
            if entry["amount"] is None:
                entry["raw"] = plain[4:]
        result.append(entry)
    return result


def grouped_modifiers(effect_rows: list[dict], targets: set[str]) -> list[dict]:
    """Collapse stat rows sharing action/amount/condition into one group.
    Purely a compaction: every stat and amount is kept as it is on the page."""
    groups: list[dict] = []
    for row in effect_rows:
        if row["action"] == "Cast" or row["target"] not in targets:
            continue
        key = (row["action"], row.get("amount"), row["condition"])
        for group in groups:
            if group["_key"] == key and "raw" not in row:
                group["stats"].append(row["stat"])
                break
        else:
            group = {
                "_key": key,
                "action": row["action"],
                "amount": row.get("amount"),
                "condition": row["condition"],
                "stats": [row["stat"]],
            }
            if "raw" in row:
                group["raw"] = row["raw"]
            groups.append(group)
    for group in groups:
        del group["_key"]
    return groups


def school(info: dict[str, str]) -> tuple[str | None, str | None, int | None]:
    raw = info.get("School")
    if raw is None:
        return None, None, None
    label = text(raw)
    if ": " in label:
        kind, _, line = label.partition(": ")
    else:  # some internal nanos show only the school, with no nanoline
        kind, line = label, None
    strain = re.search(r"strain=(\d+)", raw)
    return kind, line, int(strain.group(1)) if strain else None


def common_fields(item_id: int, page: str, patch: str, labels: list[str]) -> dict:
    info = info_table(page)
    kind, line, _ = school(info)
    # The patch-history view prints the school without its strain link, so the
    # strain id is read from the live page.
    current = (CACHE / f"{item_id}_current.html").read_text(encoding="utf-8", errors="replace")
    _, current_line, strain = school(info_table(current))
    legend = re.search(r"<fieldset>\s*<legend>(.*?)</legend>(.*?)<br", page, flags=re.S)
    strain = strain if current_line == line else None
    label_on_auno = None
    if MISLABELLED_STRAINS.get(strain) == line:
        label_on_auno, line = line, None
    return {
        "id": item_id,
        "name": text(legend.group(1)) if legend else None,
        "aunoUrl": ITEM_URL.format(id=item_id),
        "dataPatch": patch,
        "patchHistory": labels,
        "description": text(legend.group(2)) if legend else None,
        "school": kind,
        "nanoline": line,
        "nanolineStrainId": strain,
        "nanolineLabelOnAuno": label_on_auno,
        "stackingOrder": integer(info.get("Stacking order")),
        "ncu": integer(info.get("NCU")),
        "durationSeconds": duration_seconds(info.get("Duration")),
    }


def self_buff(item_id: int) -> dict | None:
    resolved = page_at_target_patch(item_id)
    if resolved is None:
        return None
    page, patch, labels = resolved
    buff = common_fields(item_id, page, patch, labels)
    rows = effects(page)
    buff["modifiers"] = grouped_modifiers(rows, {"Target", "Self", "User"})
    buff["requirements"] = requirements(page)
    return buff


def drain(item_id: int, family: str) -> dict | None:
    resolved = page_at_target_patch(item_id)
    if resolved is None:
        return None
    page, patch, labels = resolved
    info = info_table(page)
    reqs = requirements(page)
    rows = effects(page)
    level = [r["value"] for r in reqs if r["stat"] == "Level" and r["target"] == "User"]

    nano = common_fields(item_id, page, patch, labels)
    nano["family"] = family
    nano["ql"] = integer(info.get("QL"))
    nano["levelRequirement"] = level[0] if level else None
    nano["requirements"] = reqs
    nano["nanoCost"] = integer(info.get("Nanocost"))
    nano["attackTimeSeconds"] = seconds(info.get("Attack time"))
    nano["rechargeTimeSeconds"] = seconds(info.get("Recharge time"))
    nano["range"] = text(info["Range"]) if "Range" in info else None
    nano["nanoResistPercent"] = percent_table(page, "Defense skills").get("Nano resist")
    nano["attackSkillsPercent"] = percent_table(page, "Attack skills")
    crystal = info.get("Crystal")
    crystal_id = re.search(r"id=(\d+)", crystal) if crystal else None
    nano["crystal"] = (
        {"id": int(crystal_id.group(1)), "name": text(crystal)} if crystal_id else None
    )
    nano["targetModifiers"] = grouped_modifiers(rows, {"Target"})
    casts = [r for r in rows if r["action"] == "Cast" and r["target"] in {"Self", "User"}]
    nano["selfBuffs"] = []
    for cast in casts:
        buff = self_buff(cast["castId"]) if cast["castId"] else None
        if buff is None:
            buff = {"id": cast["castId"], "name": cast["castName"], "modifiers": None}
        elif buff["name"] != cast["castName"]:
            # auno prints links with the item's *current* name.
            buff["nameOnLivePatch"] = cast["castName"]
        nano["selfBuffs"].append(buff)
    other_casts = [r for r in rows if r["action"] == "Cast" and r not in casts]
    nano["otherCasts"] = other_casts
    return nano


def main() -> int:
    nanos = []
    skipped = []
    for family, ids in DRAIN_IDS.items():
        for item_id in ids:
            parsed = drain(item_id, family)
            if parsed is None:
                skipped.append(item_id)
                continue
            nanos.append(parsed)
            print(f"{item_id:>7}  {parsed['dataPatch']:<8} {parsed['name']}", file=sys.stderr)

    sample = (CACHE / f"{nanos[0]['id']}_current.html").read_text(encoding="utf-8", errors="replace")
    db_version = re.search(r"Auno\.org:\s*([\d.]+)", text(sample))
    document = {
        "meta": {
            "source": "auno.org item database",
            "sourceUrlTemplate": ITEM_URL,
            "targetPatch": TARGET_PATCH,
            "aunoDatabasePatch": db_version.group(1) if db_version else None,
            "generatedOn": date.today().isoformat(),
            "note": (
                "Each nano is the item version in force at the target patch "
                "(see dataPatch), not the live-server version."
            ),
            "notInGameAtTargetPatch": skipped,
        },
        "drains": nanos,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(nanos)} nanos", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
