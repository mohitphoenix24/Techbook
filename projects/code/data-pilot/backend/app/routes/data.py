from fastapi import APIRouter, Depends, HTTPException, Request

from ..config import Settings
from ..deps import get_app_settings
from ..schemas import SqlRequest
from ..sqlguard import QueryError, run_query
from ..tools import ToolBox

router = APIRouter(prefix="/api", tags=["data"])


@router.get("/health")
def health(request: Request) -> dict:
    llm = request.app.state.llm
    return {"status": "ok", "provider": llm.name, "model": llm.model}


@router.get("/schema")
def schema(settings: Settings = Depends(get_app_settings)):
    """The tables, their columns and a few sample rows, for the schema panel."""
    box = ToolBox(settings.database_path)
    out = []
    for table in box._list_tables().ui["tables"]:
        detail = box._describe_table(table["table"]).ui
        out.append({**table, "columns": detail["columns"]})
    return out


# region: sql-route
@router.post("/sql")
def run_sql(body: SqlRequest, settings: Settings = Depends(get_app_settings)):
    """Run a query directly, through exactly the same guard the agent's queries go through."""
    try:
        r = run_query(settings.database_path, body.query, settings.max_rows, settings.query_timeout_seconds)
    except QueryError as exc:
        raise HTTPException(400, detail={"message": exc.message, "hint": exc.hint}) from exc
    return {"columns": r.columns, "rows": r.rows, "row_count": r.row_count, "truncated": r.truncated, "ms": r.ms}
# endregion: sql-route
