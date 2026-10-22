import { dueLabel, groupTasks, localToday } from "../format";
import type { Task } from "../types";

interface Props { tasks: Task[]; onToggle: (task: Task) => void; loading: boolean }

// region: board
export function TaskBoard({ tasks, onToggle, loading }: Props) {
  const today = localToday();
  const groups = groupTasks(tasks, today);
  return (
    <aside className="board" aria-label="Your tasks">
      <h2>Your tasks</h2>
      {!loading && groups.length === 0 && <p className="muted empty">Nothing here yet. Ask TaskPal to add something.</p>}
      {groups.map((g) => (
        <section key={g.key} className={`group ${g.key}`}>
          <h3>{g.title} <span className="count">{g.tasks.length}</span></h3>
          <ul>
            {g.tasks.map((t) => (
              <li key={t.id} className={`task ${t.done ? "is-done" : ""} p-${t.priority}`}>
                <input type="checkbox" checked={t.done} onChange={() => onToggle(t)} aria-label={`Mark "${t.title}" ${t.done ? "not done" : "done"}`} />
                <span className="title">{t.title}</span>
                <span className="meta">
                  {t.priority === "high" && <b className="flag-high">high</b>}
                  {t.due && <span className={t.due < today && !t.done ? "late" : ""}>{dueLabel(t.due, today)}</span>}
                  <span className="id">#{t.id}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}
// endregion: board
