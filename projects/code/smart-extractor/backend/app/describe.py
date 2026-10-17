"""Describe a Pydantic model as a simple field tree, so the React form can be drawn from it.

The browser never hard-codes the fields of an invoice. It asks the server what the fields are and draws them,
so adding a new document type needs no front-end change.
"""
from typing import Any

from pydantic import BaseModel


def label(name: str) -> str:
    return name.replace("_", " ").capitalize()


def _resolve(schema: dict, defs: dict) -> dict:
    return defs[schema["$ref"].split("/")[-1]] if "$ref" in schema else schema


# region: describe
def _node(name: str, schema: dict, defs: dict) -> dict:
    """Turn one JSON Schema property into {name, label, type, nullable, ...}."""
    nullable = False
    if "anyOf" in schema:                                         # Pydantic writes `X | None` as anyOf [X, null]
        options = [s for s in schema["anyOf"] if s.get("type") != "null"]
        nullable = len(options) != len(schema["anyOf"])
        description = schema.get("description", "")
        schema = {**_resolve(options[0], defs), "description": description}
    schema = _resolve(schema, defs)

    node: dict[str, Any] = {"name": name, "label": label(name), "nullable": nullable, "description": schema.get("description", "")}
    if "enum" in schema:
        return {**node, "type": "enum", "options": schema["enum"]}
    kind = schema.get("type")
    if kind == "string":
        return {**node, "type": "date" if schema.get("format") == "date" else "text"}
    if kind in ("number", "integer"):
        return {**node, "type": "number"}
    if kind == "boolean":
        return {**node, "type": "boolean"}
    if kind == "array":
        return {**node, "type": "list", "item": _node("item", schema["items"], defs)}
    if kind == "object":
        return {**node, "type": "object", "fields": [_node(n, s, defs) for n, s in schema["properties"].items()]}
    return {**node, "type": "text"}


def describe(model: type[BaseModel]) -> list[dict]:
    schema = model.model_json_schema()
    defs = schema.get("$defs", {})
    return [_node(name, prop, defs) for name, prop in schema["properties"].items()]
# endregion: describe
