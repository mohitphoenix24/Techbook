"""Two kinds of tool in one list. The web search tool is a SERVER tool: Anthropic runs it, and we only declare it. The calculator is a
CLIENT tool: Claude asks, and our code runs it, exactly as in the earlier projects."""
import logging
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field, ValidationError

from .calc import CalcError, calculate, show
from .config import Settings

log = logging.getLogger(__name__)


# region: inputs
class Calculate(BaseModel):
    expression: str = Field(min_length=1, max_length=200, description="Arithmetic such as '240000 * 0.15 / 12'. Numbers, + - * / // % **, brackets and sqrt, abs, round, min, max. No commas inside numbers and no words.")
# endregion: inputs


# region: definitions
def build_tools(settings: Settings) -> list[dict]:
    web_search: dict[str, Any] = {"type": "web_search_20250305", "name": "web_search", "max_uses": settings.max_searches}
    if settings.search_country:
        web_search["user_location"] = {"type": "approximate", "country": settings.search_country.upper()}
    calculator = {
        "name": "calculator",
        "description": "Evaluate an arithmetic expression exactly. Use it for any sum, percentage, average or conversion; do not work numbers out yourself.",
        "input_schema": {"type": "object", "properties": {"expression": {"type": "string", "description": Calculate.model_fields["expression"].description}}, "required": ["expression"]},
    }
    return [web_search, calculator]
# endregion: definitions


@dataclass
class ToolResult:
    content: str
    ok: bool = True
    summary: str = ""


# region: toolbox
def run_client_tool(name: str, raw_input: dict[str, Any]) -> ToolResult:
    """Run a tool the model asked for (only the calculator: the web search never reaches us). Untrusted input; every failure becomes a message. Nothing here raises."""
    if name != "calculator":
        return ToolResult(f"Error: there is no tool called '{name}'.", False, "unknown tool")
    try:
        expression = Calculate.model_validate(raw_input).expression
        result = show(calculate(expression))
    except ValidationError as exc:
        problems = "; ".join(f"{'.'.join(str(p) for p in e['loc']) or 'input'}: {e['msg']}" for e in exc.errors())
        return ToolResult(f"Error: invalid input. {problems}.", False, "invalid input")
    except CalcError as exc:
        return ToolResult(f"Error: {exc}", False, "not arithmetic")
    except Exception:                                      # a bug must not take the whole agent down
        log.exception("calculator failed")
        return ToolResult("Error: the calculator failed unexpectedly. Say that you could not work it out.", False, "tool failed")
    return ToolResult(f"{expression} = {result}", summary=f"= {result}")
# endregion: toolbox
