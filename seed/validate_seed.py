#!/usr/bin/env python3
"""Validate the shipped seed content against SCHEMA.md.

Standard library ONLY. No third-party package, no package manifest, no install step, no
node tooling. Runs in seconds and is re-runnable identically by a reviewer in a fresh
shell. Paths are resolved from this script's own location, so the working directory does
not matter.

    python validate_seed.py --self-test          validate the validator itself
    python validate_seed.py                      validate every seed file that exists
    python validate_seed.py --only exercises     validate one file kind
    python validate_seed.py --only patterns      short form of --only intensity-patterns
    python validate_seed.py --list-rules         print the enforced rules and exit

Exit codes: 0 clean, 1 findings reported, 2 bad usage.

This file is the ACCEPTANCE GATE and only the acceptance gate. The seed data is consumed
at runtime by the application, which is JavaScript. Nothing about the data shape exists to
make this script's job easier -- which is why the JSON Schema subset below is implemented
here by hand rather than the data being reshaped to suit a library.
"""

from __future__ import annotations

import argparse
import copy
import json
import re
import sys
import tempfile
from pathlib import Path
from typing import Any, Callable, Iterable, NamedTuple

ROOT = Path(__file__).resolve().parent

KINDS = ("exercises", "routines", "intensity-patterns")

# Short spellings accepted by --only, resolved to the canonical kind before anything runs.
# "patterns" is the name the rest of the project uses for this file kind in prose, so a
# reviewer re-running the gate by hand types it without thinking; rejecting it as bad usage
# would fail the run for a reason that has nothing to do with the content.
KIND_ALIASES = {
    "patterns": "intensity-patterns",
    "intensity": "intensity-patterns",
    "exercise": "exercises",
    "routine": "routines",
}

DATA_FILE = {
    "exercises": "exercises.json",
    "routines": "routines.json",
    "intensity-patterns": "intensity-patterns.json",
}

SCHEMA_FILE = {
    "exercises": "schema/exercise.schema.json",
    "routines": "schema/routine.schema.json",
    "intensity-patterns": "schema/intensity-pattern.schema.json",
}

RULES = {
    "R0": "A file requested by --only exists and parses as JSON.",
    "R1": "Every file is a top-level array and every record conforms to its JSON Schema.",
    "R2": "Content keys are unique within a file.",
    "R3": "Content keys match the stable format ^[a-z0-9]+(-[a-z0-9]+)*$.",
    "R4": "Every exercise_id referenced by a routine entry resolves to a real exercise.",
    "R5": "measurement and the prescription agree, at the default prescription, at all "
          "three scaling points, and in any routine-level override.",
    "R6": "scaling is complete and correctly ordered: work non-decreasing and strictly "
          "greater at high than at low, sets non-decreasing, rest non-increasing.",
    "R7": "No endorsement, certification or approval term appears in any key or value.",
    "R8": "No key or value looks like an image, media or url reference.",
    "R9": "No key or value encodes week-over-week progression.",
    "R10": "Exercise names are speakable: letters and single spaces, no digits, no "
           "punctuation, no abbreviation tokens, no bare single letters but a and i.",
    "R11": "An intensity pattern name that spells out a curve matches its sequence "
           "exactly, in order and in count.",
    "R12": "Every record in a shipped seed file carries provenance shipped-untouched.",
}

PROVENANCE_SEED = "shipped-untouched"
INTENSITY_POINTS = ("low", "medium", "high")


# --------------------------------------------------------------------------------------
# Findings
# --------------------------------------------------------------------------------------


class Finding(NamedTuple):
    rule: str
    scope: str
    where: str
    message: str

    def render(self) -> str:
        return f"  [{self.rule}] {self.scope} {self.where}: {self.message}"


# --------------------------------------------------------------------------------------
# R7 / R8 / R9 -- the content-rule vocabularies
#
# These lists are duplicated in SCHEMA.md section 7 in prose. SCHEMA.md itself is NOT
# scanned: it names these terms in order to ban them.
# --------------------------------------------------------------------------------------

BANNED_ACRONYMS = (
    "nasm", "ace", "issa", "acsm", "nsca", "nesta", "afaa", "ncsf", "ncca",
    "cscs", "cpt", "ces", "pes", "nfpt", "isca",
)

BANNED_CLAIM_TERMS = (
    "certified", "certification", "certifying", "certificate",
    "endorse", "endorsed", "endorses", "endorsement",
    "approved", "approval", "approved by",
    "accredited", "accreditation", "sanctioned",
    "licensed", "license", "licence",
    "official", "officially", "seal of approval",
    "recognised by", "recognized by", "in partnership with", "backed by",
)

# Word boundaries are what keep this usable: `ace` must not match brace, pace, face or
# surface, so ordinary coaching cues are unaffected.
BANNED_RE = re.compile(
    r"\b(?:" + "|".join(re.escape(t) for t in BANNED_ACRONYMS + BANNED_CLAIM_TERMS) + r")\b",
    re.IGNORECASE,
)

MEDIA_KEY_TOKENS = (
    "image", "img", "photo", "picture", "thumb", "thumbnail", "illustration", "media",
    "video", "gif", "icon", "asset", "url", "uri", "href", "src", "link", "poster",
    "animation", "sprite", "avatar", "diagram", "figure",
)

MEDIA_VALUE_RE = re.compile(
    r"(?:https?://|data:|file://"
    r"|\.(?:png|jpe?g|gif|svg|webp|avif|bmp|tiff?|ico|mp4|webm|mov|m4v|avi|mp3|wav|ogg)\b)",
    re.IGNORECASE,
)

PROGRESSION_KEY_TOKENS = (
    "week", "progression", "deload", "cycle", "phase",
    "periodization", "periodisation", "increment", "ramp",
)

# The bare word "week" is allowed in a VALUE -- a routine description may legitimately say
# a split rests body parts across the week -- but is banned in a KEY, where it could only
# ever be structural.
PROGRESSION_VALUE_RES = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"week\s*-?\s*(?:over|on)\s*-?\s*week",
        r"\bweek\s*\d+\b",
        r"\bweek\s+(?:one|two|three|four|five|six|seven|eight)\b",
        r"\bdeload\b",
        r"\bperiodi[sz]ation\b",
        r"\b(?:meso|micro|macro)cycle\b",
        r"\bprogressive\s+overload\b",
        r"\b(?:add|adds|increase|increases|raise|raises|bump|bumps|progress|progresses"
        r"|advance|advances)\b[^.]{0,40}\b(?:each|every|per|next)\s+"
        r"(?:week|weeks|session|sessions|month|months)\b",
    )
)

# R10 -- tokens that read badly or not at all through a speech synthesiser.
ABBREVIATION_TOKENS = frozenset(
    """db bb kb kbs rdl ohp bw hiit reps rep sec secs min mins alt ea wo ss amrap emom
    rpe oh sl dl gh ghd tgu mb sa bo bor pu su hspu bs fs ohs""".split()
)

ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
SPEAKABLE_RE = re.compile(r"^[A-Za-z]([A-Za-z ]*[A-Za-z])?$")


# --------------------------------------------------------------------------------------
# A minimal JSON Schema validator (R1)
#
# Only the keywords the three schema files actually use. An UNKNOWN keyword raises rather
# than being ignored, so a constraint cannot be written into a schema file and then
# silently not enforced here.
# --------------------------------------------------------------------------------------

_ANNOTATION_KEYWORDS = frozenset({"$schema", "$id", "title", "description", "$comment", "$defs"})

_SUPPORTED_KEYWORDS = frozenset(
    {
        "$ref", "type", "enum", "const", "required", "properties", "additionalProperties",
        "items", "minItems", "maxItems", "uniqueItems", "minLength", "maxLength", "pattern",
        "minimum", "maximum", "allOf", "anyOf", "oneOf", "not",
    }
) | _ANNOTATION_KEYWORDS


def _is_type(value: Any, wanted: str) -> bool:
    if wanted == "object":
        return isinstance(value, dict)
    if wanted == "array":
        return isinstance(value, list)
    if wanted == "string":
        return isinstance(value, str)
    if wanted == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if wanted == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if wanted == "boolean":
        return isinstance(value, bool)
    if wanted == "null":
        return value is None
    raise ValueError(f"unsupported JSON Schema type keyword: {wanted!r}")


def _resolve_ref(ref: str, root: dict) -> dict:
    if not ref.startswith("#/"):
        raise ValueError(f"only local $ref is supported, got {ref!r}")
    node: Any = root
    for part in ref[2:].split("/"):
        part = part.replace("~1", "/").replace("~0", "~")
        if not isinstance(node, dict) or part not in node:
            raise ValueError(f"unresolvable $ref {ref!r}")
        node = node[part]
    if not isinstance(node, dict):
        raise ValueError(f"$ref {ref!r} does not point at a schema object")
    return node


def js_validate(instance: Any, schema: dict, root: dict, path: str = "") -> list[str]:
    """Return a list of human-readable violations of `schema` by `instance`."""
    errors: list[str] = []

    unknown = set(schema) - _SUPPORTED_KEYWORDS
    if unknown:
        raise ValueError(f"unsupported JSON Schema keyword(s) at {path or '<root>'}: {sorted(unknown)}")

    if "$ref" in schema:
        errors += js_validate(instance, _resolve_ref(schema["$ref"], root), root, path)
        # A $ref sits alone in these schema files; nothing else to apply.
        return errors

    if "type" in schema:
        wanted = schema["type"]
        options = wanted if isinstance(wanted, list) else [wanted]
        if not any(_is_type(instance, w) for w in options):
            errors.append(f"{path or '<root>'}: expected type {'/'.join(options)}, got {type(instance).__name__}")
            return errors  # further keywords would be meaningless

    if "const" in schema and instance != schema["const"]:
        errors.append(f"{path}: expected the constant {schema['const']!r}, got {instance!r}")

    if "enum" in schema and instance not in schema["enum"]:
        errors.append(f"{path}: {instance!r} is not one of {schema['enum']}")

    if isinstance(instance, str):
        if "minLength" in schema and len(instance) < schema["minLength"]:
            errors.append(f"{path}: shorter than {schema['minLength']} characters")
        if "maxLength" in schema and len(instance) > schema["maxLength"]:
            errors.append(f"{path}: longer than {schema['maxLength']} characters")
        if "pattern" in schema and not re.search(schema["pattern"], instance):
            errors.append(f"{path}: {instance!r} does not match {schema['pattern']}")

    if isinstance(instance, (int, float)) and not isinstance(instance, bool):
        if "minimum" in schema and instance < schema["minimum"]:
            errors.append(f"{path}: {instance} is below the minimum {schema['minimum']}")
        if "maximum" in schema and instance > schema["maximum"]:
            errors.append(f"{path}: {instance} is above the maximum {schema['maximum']}")

    if isinstance(instance, list):
        if "minItems" in schema and len(instance) < schema["minItems"]:
            errors.append(f"{path}: fewer than {schema['minItems']} items")
        if "maxItems" in schema and len(instance) > schema["maxItems"]:
            errors.append(f"{path}: more than {schema['maxItems']} items")
        if schema.get("uniqueItems") and len(instance) != len({json.dumps(i, sort_keys=True) for i in instance}):
            errors.append(f"{path}: items are not unique")
        if "items" in schema:
            for index, item in enumerate(instance):
                errors += js_validate(item, schema["items"], root, f"{path}[{index}]")

    if isinstance(instance, dict):
        for key in schema.get("required", []):
            if key not in instance:
                errors.append(f"{path}: required property {key!r} is missing")
        properties = schema.get("properties", {})
        for key, value in instance.items():
            if key in properties:
                errors += js_validate(value, properties[key], root, f"{path}.{key}")
            elif schema.get("additionalProperties") is False:
                errors.append(f"{path}: unknown property {key!r} is not allowed")
            elif isinstance(schema.get("additionalProperties"), dict):
                errors += js_validate(value, schema["additionalProperties"], root, f"{path}.{key}")

    for branch in schema.get("allOf", []):
        errors += js_validate(instance, branch, root, path)

    if "anyOf" in schema:
        if all(js_validate(instance, branch, root, path) for branch in schema["anyOf"]):
            errors.append(f"{path}: does not match any permitted alternative")

    if "oneOf" in schema:
        matched = sum(1 for branch in schema["oneOf"] if not js_validate(instance, branch, root, path))
        if matched != 1:
            errors.append(
                f"{path}: must match exactly one permitted alternative, matched {matched} "
                f"(for a prescription this means exactly one of repetitions / duration_seconds)"
            )

    if "not" in schema and not js_validate(instance, schema["not"], root, path):
        errors.append(f"{path}: matches a forbidden alternative")

    return errors


# --------------------------------------------------------------------------------------
# Walking helpers
# --------------------------------------------------------------------------------------


def _walk(node: Any, path: str = "") -> Iterable[tuple[str, str | None, Any]]:
    """Yield (path, key_or_None, value) for every node, so key and value scans share a walk."""
    if isinstance(node, dict):
        for key, value in node.items():
            here = f"{path}.{key}"
            yield here, key, value
            yield from _walk(value, here)
    elif isinstance(node, list):
        for index, item in enumerate(node):
            here = f"{path}[{index}]"
            yield here, None, item
            yield from _walk(item, here)


def _record_label(record: Any, index: int) -> str:
    if isinstance(record, dict) and isinstance(record.get("id"), str):
        return f"[{index}] {record['id']}"
    return f"[{index}]"


def _work_of(point: Any) -> tuple[str | None, int | None]:
    """Return which work key a prescription carries, and its value."""
    if not isinstance(point, dict):
        return None, None
    for key in ("repetitions", "duration_seconds"):
        if isinstance(point.get(key), int) and not isinstance(point.get(key), bool):
            return key, point[key]
    return None, None


# --------------------------------------------------------------------------------------
# The rules
# --------------------------------------------------------------------------------------


def rule_schema(kind: str, data: Any, schema: dict) -> list[Finding]:
    """R1."""
    return [
        Finding("R1", kind, message.split(":")[0] or "<root>", message.split(": ", 1)[-1])
        for message in js_validate(data, schema, schema)
    ]


def rule_keys(kind: str, records: list) -> list[Finding]:
    """R2 and R3."""
    findings: list[Finding] = []
    seen: dict[str, int] = {}
    for index, record in enumerate(records):
        if not isinstance(record, dict):
            continue
        key = record.get("id")
        if not isinstance(key, str):
            continue
        if not ID_RE.match(key):
            findings.append(
                Finding("R3", kind, _record_label(record, index),
                        f"content key {key!r} is not lowercase-hyphenated")
            )
        if key in seen:
            findings.append(
                Finding("R2", kind, _record_label(record, index),
                        f"content key {key!r} is already used by record [{seen[key]}]")
            )
        else:
            seen[key] = index
    return findings


def rule_references(exercises: list, routines: list) -> list[Finding]:
    """R4."""
    known = {r["id"] for r in exercises if isinstance(r, dict) and isinstance(r.get("id"), str)}
    findings: list[Finding] = []
    for index, routine in enumerate(routines):
        if not isinstance(routine, dict):
            continue
        for position, entry in enumerate(routine.get("entries") or []):
            if not isinstance(entry, dict):
                continue
            referenced = entry.get("exercise_id")
            if isinstance(referenced, str) and referenced not in known:
                findings.append(
                    Finding("R4", "routines", f"{_record_label(routine, index)} entry[{position}]",
                            f"references exercise {referenced!r}, which does not exist")
                )
    return findings


def rule_measurement(kind: str, records: list) -> list[Finding]:
    """R5 over exercises: default prescription and all three scaling points."""
    findings: list[Finding] = []
    for index, record in enumerate(records):
        if not isinstance(record, dict):
            continue
        measurement = record.get("measurement")
        if measurement not in ("repetitions", "time"):
            continue
        expected = "repetitions" if measurement == "repetitions" else "duration_seconds"
        forbidden = "duration_seconds" if measurement == "repetitions" else "repetitions"
        places: list[tuple[str, Any]] = [("default_prescription", record.get("default_prescription"))]
        scaling = record.get("scaling")
        if isinstance(scaling, dict):
            places += [(f"scaling.{point}", scaling.get(point)) for point in INTENSITY_POINTS]
        for label, place in places:
            if not isinstance(place, dict):
                continue
            if expected not in place:
                findings.append(
                    Finding("R5", kind, f"{_record_label(record, index)} {label}",
                            f"measurement is {measurement!r} so {expected!r} is required")
                )
            if forbidden in place:
                findings.append(
                    Finding("R5", kind, f"{_record_label(record, index)} {label}",
                            f"measurement is {measurement!r} so {forbidden!r} must not be set")
                )
    return findings


def rule_override_measurement(exercises: list, routines: list) -> list[Finding]:
    """R5 over routine entries: an override must not contradict the exercise."""
    by_key = {
        r["id"]: r for r in exercises
        if isinstance(r, dict) and isinstance(r.get("id"), str)
    }
    findings: list[Finding] = []
    for index, routine in enumerate(routines):
        if not isinstance(routine, dict):
            continue
        for position, entry in enumerate(routine.get("entries") or []):
            if not isinstance(entry, dict):
                continue
            exercise = by_key.get(entry.get("exercise_id"))
            if not isinstance(exercise, dict):
                continue
            measurement = exercise.get("measurement")
            forbidden = "duration_seconds" if measurement == "repetitions" else "repetitions"
            if measurement in ("repetitions", "time") and forbidden in entry:
                findings.append(
                    Finding("R5", "routines", f"{_record_label(routine, index)} entry[{position}]",
                            f"overrides {forbidden!r} but exercise {entry['exercise_id']!r} is "
                            f"measured by {measurement!r}")
                )
    return findings


def rule_scaling(kind: str, records: list) -> list[Finding]:
    """R6."""
    findings: list[Finding] = []
    for index, record in enumerate(records):
        if not isinstance(record, dict):
            continue
        where = _record_label(record, index)
        scaling = record.get("scaling")
        if not isinstance(scaling, dict):
            findings.append(Finding("R6", kind, where, "scaling is missing"))
            continue
        points = {}
        for point in INTENSITY_POINTS:
            value = scaling.get(point)
            if not isinstance(value, dict):
                findings.append(Finding("R6", kind, where, f"scaling.{point} is missing"))
            else:
                points[point] = value
        if len(points) != 3:
            continue

        work: dict[str, int] = {}
        for point, value in points.items():
            work_key, work_value = _work_of(value)
            if work_key is None:
                findings.append(
                    Finding("R6", kind, where,
                            f"scaling.{point} carries no repetitions or duration_seconds to scale")
                )
            else:
                work[point] = work_value
        if len(work) != 3:
            continue

        low, medium, high = work["low"], work["medium"], work["high"]
        if not (low <= medium <= high):
            findings.append(
                Finding("R6", kind, where,
                        f"work is not non-decreasing across the curve: low={low} medium={medium} high={high}")
            )
        if not high > low:
            findings.append(
                Finding("R6", kind, where,
                        f"work at high ({high}) is not greater than at low ({low}), so the three "
                        f"points are not genuinely different")
            )

        sets = [points[p].get("sets") for p in INTENSITY_POINTS]
        if all(isinstance(s, int) for s in sets) and not (sets[0] <= sets[1] <= sets[2]):
            findings.append(
                Finding("R6", kind, where, f"sets are not non-decreasing across the curve: {sets}")
            )

        rests = [points[p].get("rest_seconds") for p in INTENSITY_POINTS]
        if all(isinstance(r, int) for r in rests) and not (rests[0] >= rests[1] >= rests[2]):
            findings.append(
                Finding("R6", kind, where,
                        f"rest is not non-increasing across the curve: {rests} (less rest is more demanding)")
            )
    return findings


def rule_banned_terms(kind: str, data: Any) -> list[Finding]:
    """R7."""
    findings: list[Finding] = []
    for path, key, value in _walk(data):
        if key is not None:
            for hit in BANNED_RE.findall(key):
                findings.append(Finding("R7", kind, path, f"key contains the banned term {hit!r}"))
        if isinstance(value, str):
            for hit in BANNED_RE.findall(value):
                findings.append(
                    Finding("R7", kind, path,
                            f"value contains the banned term {hit!r} -- no endorsement, "
                            f"certification or approval claim may appear anywhere")
                )
    return findings


def rule_media(kind: str, data: Any) -> list[Finding]:
    """R8."""
    findings: list[Finding] = []
    for path, key, value in _walk(data):
        if key is not None:
            lowered = key.lower()
            for token in MEDIA_KEY_TOKENS:
                if token in lowered:
                    findings.append(
                        Finding("R8", kind, path,
                                f"key looks like a media or url reference (contains {token!r}); "
                                f"the app ships no pose imagery")
                    )
        if isinstance(value, str):
            if value.startswith("//"):
                findings.append(Finding("R8", kind, path, "value is a protocol-relative url"))
            hit = MEDIA_VALUE_RE.search(value)
            if hit:
                findings.append(
                    Finding("R8", kind, path,
                            f"value looks like a media path or url (matched {hit.group(0)!r})")
                )
    return findings


def rule_progression(kind: str, data: Any) -> list[Finding]:
    """R9."""
    findings: list[Finding] = []
    for path, key, value in _walk(data):
        if key is not None:
            lowered = key.lower()
            for token in PROGRESSION_KEY_TOKENS:
                if token in lowered:
                    findings.append(
                        Finding("R9", kind, path,
                                f"key contains {token!r}; the app never auto-progresses a routine, "
                                f"so no seed record may encode progression")
                    )
        if isinstance(value, str):
            for pattern in PROGRESSION_VALUE_RES:
                hit = pattern.search(value)
                if hit:
                    findings.append(
                        Finding("R9", kind, path,
                                f"value encodes week-over-week progression (matched {hit.group(0)!r})")
                    )
    return findings


def rule_speakable(kind: str, records: list) -> list[Finding]:
    """R10 -- exercise names only; they are read aloud during a session."""
    findings: list[Finding] = []
    for index, record in enumerate(records):
        if not isinstance(record, dict):
            continue
        name = record.get("name")
        if not isinstance(name, str):
            continue
        where = _record_label(record, index)
        if not SPEAKABLE_RE.match(name):
            findings.append(
                Finding("R10", kind, where,
                        f"name {name!r} is not speakable: letters and single spaces only, no "
                        f"digits, punctuation or parenthetical asides")
            )
        if "  " in name:
            findings.append(Finding("R10", kind, where, f"name {name!r} contains a double space"))
        for token in name.split():
            lowered = token.lower()
            if lowered in ABBREVIATION_TOKENS:
                findings.append(
                    Finding("R10", kind, where,
                            f"name {name!r} contains the abbreviation {token!r}; a speech "
                            f"synthesiser cannot read it aloud as a word")
                )
            elif len(lowered) == 1 and lowered not in ("a", "i"):
                findings.append(
                    Finding("R10", kind, where,
                            f"name {name!r} contains the bare letter {token!r}, which reads badly aloud")
                )
    return findings


def rule_pattern_name(kind: str, records: list) -> list[Finding]:
    """R11."""
    findings: list[Finding] = []
    for index, record in enumerate(records):
        if not isinstance(record, dict):
            continue
        name, sequence = record.get("name"), record.get("sequence")
        if not isinstance(name, str) or not isinstance(sequence, list):
            continue
        spelled = [t for t in re.split(r"[^A-Za-z]+", name.lower()) if t in INTENSITY_POINTS]
        if len(spelled) < 2:
            continue  # a descriptive label, not a spelled-out curve
        if spelled != sequence:
            findings.append(
                Finding("R11", kind, _record_label(record, index),
                        f"name spells out the curve {spelled} but sequence is {sequence}; the "
                        f"label on a button the coach presses must tell the truth")
            )
    return findings


def rule_provenance(kind: str, records: list) -> list[Finding]:
    """R12."""
    findings: list[Finding] = []
    for index, record in enumerate(records):
        if not isinstance(record, dict):
            continue
        value = record.get("provenance")
        if value != PROVENANCE_SEED:
            findings.append(
                Finding("R12", kind, _record_label(record, index),
                        f"provenance is {value!r}; every record in a shipped seed file must be "
                        f"{PROVENANCE_SEED!r} because that is what these files are")
            )
    return findings


# --------------------------------------------------------------------------------------
# Orchestration
# --------------------------------------------------------------------------------------


def load_schemas() -> dict[str, dict]:
    schemas = {}
    for kind, relative in SCHEMA_FILE.items():
        path = ROOT / relative
        if not path.is_file():
            raise SystemExit(f"FATAL: schema file is missing: {path}")
        with path.open(encoding="utf-8") as handle:
            schemas[kind] = json.load(handle)
    return schemas


def load_kind(kind: str, base: Path, required: bool) -> tuple[Any, list[Finding], bool]:
    """Return (data, findings, present)."""
    path = base / DATA_FILE[kind]
    if not path.is_file():
        if required:
            return None, [Finding("R0", kind, DATA_FILE[kind], "file does not exist")], False
        return None, [], False
    try:
        with path.open(encoding="utf-8") as handle:
            return json.load(handle), [], True
    except json.JSONDecodeError as error:
        return None, [Finding("R0", kind, DATA_FILE[kind], f"is not valid JSON: {error}")], True


def validate_datasets(datasets: dict[str, Any], schemas: dict[str, dict]) -> list[Finding]:
    """Run every rule over whatever kinds are present. Pure: no filesystem access."""
    findings: list[Finding] = []
    records: dict[str, list] = {}

    for kind, data in datasets.items():
        findings += rule_schema(kind, data, schemas[kind])
        if not isinstance(data, list):
            continue  # rule_schema already reported it; per-record rules cannot run
        records[kind] = data
        findings += rule_keys(kind, data)
        findings += rule_banned_terms(kind, data)
        findings += rule_media(kind, data)
        findings += rule_progression(kind, data)
        findings += rule_provenance(kind, data)
        if kind == "exercises":
            findings += rule_measurement(kind, data)
            findings += rule_scaling(kind, data)
            findings += rule_speakable(kind, data)
        elif kind == "intensity-patterns":
            findings += rule_pattern_name(kind, data)

    if "routines" in records and "exercises" in records:
        findings += rule_references(records["exercises"], records["routines"])
        findings += rule_override_measurement(records["exercises"], records["routines"])

    return findings


def report(findings: list[Finding], notes: list[str]) -> int:
    for note in notes:
        print(note)
    if not findings:
        print("\nOK -- no findings.")
        return 0
    order = {rule: index for index, rule in enumerate(RULES)}
    print(f"\n{len(findings)} finding(s):\n")
    for finding in sorted(findings, key=lambda f: (order.get(f.rule, 99), f.scope, f.where)):
        print(finding.render())
    print("\nRules that fired:")
    for rule in sorted({f.rule for f in findings}, key=lambda r: order.get(r, 99)):
        print(f"  {rule}  {RULES[rule]}")
    return 1


def run_files(only: str | None) -> int:
    schemas = load_schemas()
    wanted = (only,) if only else KINDS
    datasets: dict[str, Any] = {}
    findings: list[Finding] = []
    notes: list[str] = [f"Validating in {ROOT}"]

    for kind in wanted:
        data, load_findings, present = load_kind(kind, ROOT, required=only is not None)
        findings += load_findings
        if present and not load_findings:
            count = len(data) if isinstance(data, list) else "?"
            notes.append(f"  read    {DATA_FILE[kind]:<24} {count} record(s)")
            datasets[kind] = data
        elif not present and only is None:
            notes.append(f"  skipped {DATA_FILE[kind]:<24} absent -- not authored yet")

    if datasets:
        findings += validate_datasets(datasets, schemas)

    if only == "routines" and "exercises" not in datasets:
        notes.append(
            "  NOTE: exercises.json is absent, so cross-file reference checks (R4) and "
            "override-measurement checks (R5) were not run."
        )
    return report(findings, notes)


# --------------------------------------------------------------------------------------
# --self-test: validate the validator, not the content
# --------------------------------------------------------------------------------------


def _fixture_datasets() -> dict[str, list]:
    """A small, fully conforming fixture set. Must produce ZERO findings."""
    exercises = [
        {
            "id": "push-up",
            "name": "Push Up",
            "movement_pattern": "horizontal-push",
            "primary_muscles": ["chest"],
            "secondary_muscles": ["triceps", "front-deltoids"],
            "equipment": ["none"],
            "measurement": "repetitions",
            "default_prescription": {"sets": 3, "repetitions": 12},
            "default_rest_seconds": 60,
            "intensity": "medium",
            "scaling": {
                "low": {"sets": 2, "repetitions": 8, "rest_seconds": 90},
                "medium": {"sets": 3, "repetitions": 12, "rest_seconds": 60},
                "high": {"sets": 4, "repetitions": 18, "rest_seconds": 40},
            },
            "hiit_suitable": True,
            "coaching_cue": "Keep a straight line from head to heels and lower with control.",
            "provenance": "shipped-untouched",
        },
        {
            "id": "plank",
            "name": "Plank",
            "movement_pattern": "anti-extension",
            "primary_muscles": ["abdominals"],
            "secondary_muscles": ["obliques", "front-deltoids"],
            "equipment": ["mat"],
            "measurement": "time",
            "default_prescription": {"sets": 3, "duration_seconds": 30},
            "default_rest_seconds": 45,
            "intensity": "low",
            "scaling": {
                "low": {"sets": 2, "duration_seconds": 20, "rest_seconds": 60},
                "medium": {"sets": 3, "duration_seconds": 35, "rest_seconds": 45},
                "high": {"sets": 4, "duration_seconds": 50, "rest_seconds": 30},
            },
            "hiit_suitable": False,
            "coaching_cue": "Squeeze the glutes and stop the hips from sagging.",
            "provenance": "shipped-untouched",
        },
        {
            "id": "goblet-squat",
            "name": "Goblet Squat",
            "movement_pattern": "squat",
            "primary_muscles": ["quadriceps", "glutes"],
            "secondary_muscles": ["abdominals", "upper-back"],
            "equipment": ["kettlebell"],
            "measurement": "repetitions",
            "default_prescription": {"sets": 3, "repetitions": 10},
            "default_rest_seconds": 75,
            "intensity": "medium",
            "scaling": {
                "low": {"sets": 2, "repetitions": 8, "rest_seconds": 100},
                "medium": {"sets": 3, "repetitions": 10, "rest_seconds": 75},
                "high": {"sets": 4, "repetitions": 15, "rest_seconds": 50},
            },
            "hiit_suitable": False,
            "coaching_cue": "Sit down between the heels and keep the chest tall.",
            "provenance": "shipped-untouched",
        },
    ]
    routines = [
        {
            "id": "fixture-full-body",
            "name": "Fixture Full Body",
            "split_day": 1,
            "focus": "full-body",
            "body_regions": ["upper-body", "core"],
            "description": "A short fixture routine used only by the validator self test.",
            "entries": [
                {"exercise_id": "push-up", "sets": 4, "repetitions": 10, "rest_seconds": 60},
                {"exercise_id": "plank", "duration_seconds": 40},
            ],
            "provenance": "shipped-untouched",
        }
    ]
    patterns = [
        {
            "id": "low-medium-high-low",
            "name": "low medium high low",
            "sequence": ["low", "medium", "high", "low"],
            "mapping_rule": "stretch",
            "description": "Eases in, builds to the hardest work in the middle and comes back down.",
            "provenance": "shipped-untouched",
        }
    ]
    return {"exercises": exercises, "routines": routines, "intensity-patterns": patterns}


def _break_r1(d):  d["exercises"][0]["intensity"] = "extreme"
def _break_r2(d):  d["exercises"][1]["id"] = d["exercises"][0]["id"]
def _break_r3(d):  d["exercises"][2]["id"] = "Goblet_Squat"
def _break_r4(d):  d["routines"][0]["entries"][0]["exercise_id"] = "does-not-exist"
def _break_r5(d):  d["exercises"][1]["default_prescription"] = {"sets": 3, "repetitions": 10}
def _break_r6(d):  d["exercises"][0]["scaling"]["high"]["repetitions"] = 4
def _break_r7(d):  d["exercises"][0]["coaching_cue"] = "Endorsed by NASM as a certified movement."
def _break_r8(d):  d["exercises"][0]["long_name"] = "Push Up, see https://example.com/push-up.png"
def _break_r9(d):  d["routines"][0]["description"] = "Add two repetitions every week until week four."
def _break_r10(d): d["exercises"][0]["name"] = "Db Floor Press"
def _break_r11(d): d["intensity-patterns"][0]["name"] = "high low"
def _break_r12(d): d["exercises"][0]["provenance"] = "coach-created"


BROKEN_FIXTURES: tuple[tuple[str, str, Callable[[dict], None]], ...] = (
    ("R1", "an intensity outside the allowed vocabulary", _break_r1),
    ("R2", "two exercises sharing one content key", _break_r2),
    ("R3", "a content key that is not lowercase-hyphenated", _break_r3),
    ("R4", "a routine entry referencing a missing exercise", _break_r4),
    ("R5", "a time-based exercise prescribed in repetitions", _break_r5),
    ("R6", "scaling whose high point is easier than its low point", _break_r6),
    ("R7", "an endorsement claim naming a certifying body", _break_r7),
    ("R8", "an image url smuggled into a text field", _break_r8),
    ("R9", "a description encoding week-over-week progression", _break_r9),
    ("R10", "an exercise name containing an abbreviation", _break_r10),
    ("R11", "a pattern name that contradicts its own sequence", _break_r11),
    ("R12", "a seed record claiming the coach created it", _break_r12),
)


def self_test() -> int:
    schemas = load_schemas()
    failures: list[str] = []

    print(f"Self test -- validating the validator (schemas read from {ROOT / 'schema'})\n")

    # 1. The conforming fixture set must produce nothing at all.
    clean = validate_datasets(_fixture_datasets(), schemas)
    if clean:
        failures.append("the conforming fixture set produced findings")
        print("  FAIL  conforming fixture set -- expected no findings, got:")
        for finding in clean:
            print(finding.render())
    else:
        print("  ok    conforming fixture set produced no findings")

    # 2. Every rule must actually fire on a fixture broken specifically for it.
    covered = {"R0"}  # R0 is exercised separately below; it needs the filesystem.
    for rule, description, mutate in BROKEN_FIXTURES:
        datasets = _fixture_datasets()
        mutate(datasets)
        findings = validate_datasets(datasets, schemas)
        fired = {f.rule for f in findings}
        covered.add(rule)
        if rule in fired:
            print(f"  ok    {rule} fired on {description}")
        else:
            failures.append(f"{rule} did not fire on {description}")
            print(f"  FAIL  {rule} did NOT fire on {description}; rules that fired: {sorted(fired) or 'none'}")

    # 3. R0: a file requested by name but absent.
    with tempfile.TemporaryDirectory() as empty:
        _, findings, present = load_kind("exercises", Path(empty), required=True)
        if present:
            failures.append("R0 fixture directory was not empty")
        if any(f.rule == "R0" for f in findings):
            print("  ok    R0 fired on a requested file that does not exist")
        else:
            failures.append("R0 did not fire on a missing requested file")
            print("  FAIL  R0 did NOT fire on a requested file that does not exist")

    # 4. Every documented rule must be covered by a fixture -- adding a rule to RULES
    #    without a broken fixture is itself a self-test failure.
    uncovered = sorted(set(RULES) - covered, key=lambda r: int(r[1:]))
    if uncovered:
        failures.append(f"rules with no broken fixture: {uncovered}")
        print(f"  FAIL  documented rules with no deliberately broken fixture: {uncovered}")
    else:
        print(f"  ok    all {len(RULES)} documented rules have a broken fixture")

    print()
    if failures:
        print(f"SELF TEST FAILED -- {len(failures)} problem(s):")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print(f"SELF TEST PASSED -- {len(RULES)} rules, each proven to fire on a broken fixture,")
    print("and the conforming fixture set proven clean.")
    return 0


# --------------------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Validate the shipped seed content against SCHEMA.md.",
        epilog="Standard library only. Exit 0 clean, 1 findings, 2 bad usage.",
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--self-test", action="store_true",
                       help="validate the validator against inline fixtures and exit")
    group.add_argument("--only", choices=KINDS + tuple(KIND_ALIASES), metavar="KIND",
                       help=f"validate one file kind only ({', '.join(KINDS)}; "
                            f"short forms {', '.join(sorted(KIND_ALIASES))} are accepted)")
    group.add_argument("--list-rules", action="store_true", help="print the enforced rules and exit")
    args = parser.parse_args(argv)

    if args.list_rules:
        for rule, description in RULES.items():
            print(f"{rule:<4} {description}")
        return 0
    if args.self_test:
        return self_test()
    return run_files(KIND_ALIASES.get(args.only, args.only))


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as error:  # a crash must not read as a pass
        print(f"FATAL: {type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(2)
