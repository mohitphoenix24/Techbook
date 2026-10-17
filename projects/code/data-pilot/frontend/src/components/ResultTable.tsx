import { useMemo, useState } from "react";
import { formatCell, sortRows, toCsv } from "../format";
import type { TableData } from "../types";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

// region: table
export function ResultTable({ data }: { data: TableData }) {
  const [sort, setSort] = useState<{ column: number; direction: "asc" | "desc" } | null>(null);
  const rows = useMemo(() => (sort ? sortRows(data.rows, sort.column, sort.direction) : data.rows), [data.rows, sort]);

  function toggle(column: number) {                                   // click: ascending, again: descending, again: original order
    setSort((s) => (!s || s.column !== column ? { column, direction: "asc" } : s.direction === "asc" ? { column, direction: "desc" } : null));
  }

  return (
    <div className="result">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {data.columns.map((c, i) => (
                <th key={c} aria-sort={sort?.column === i ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <button onClick={() => toggle(i)}>{c.replace(/_/g, " ")}{sort?.column === i ? (sort.direction === "asc" ? " ▲" : " ▼") : ""}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>{row.map((cell, c) => <td key={c} className={typeof cell === "number" ? "num" : ""}>{formatCell(cell, data.columns[c])}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="meta">
        {data.row_count} row{data.row_count === 1 ? "" : "s"}{data.truncated ? " (more were cut off)" : ""} · {data.ms} ms ·{" "}
        <button className="link" onClick={() => download("result.csv", toCsv(data.columns, data.rows))}>Download CSV</button>
      </p>
    </div>
  );
}
// endregion: table
