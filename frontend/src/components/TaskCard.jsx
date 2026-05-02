import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";

const priorityStyles = {
  low: "bg-slate-200 text-slate-700",
  medium: "bg-sky-100 text-sky-700",
  high: "bg-amber-100 text-amber-700",
  critical: "bg-rose-100 text-rose-700",
};

function initials(name) {
  if (!name) {
    return "?";
  }
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function isOverdue(task) {
  if (!task.due_date || task.status === "done") {
    return false;
  }
  return new Date(task.due_date) < new Date(new Date().toDateString());
}

function TaskCard({ task, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const overdue = isOverdue(task);

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      onClick={() => onOpen(task)}
      className={`w-full rounded-[1.5rem] border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        isDragging ? "border-amber-300 shadow-lg opacity-80" : "border-slate-200"
      }`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold leading-6 text-slate-950">{task.title}</h4>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] ${priorityStyles[task.priority] ?? priorityStyles.low}`}>
          {task.priority}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-slate-900 text-xs font-bold text-white">
            {task.assignee_avatar_url ? (
              <img src={task.assignee_avatar_url} alt={task.assignee_name || "Assignee"} className="h-full w-full object-cover" />
            ) : (
              initials(task.assignee_name || "Unassigned")
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-700">{task.assignee_name || "Unassigned"}</p>
            {task.due_date ? (
              <p className={`mt-0.5 flex items-center gap-1 text-xs ${overdue ? "font-semibold text-rose-600" : "text-slate-500"}`}>
                {overdue ? (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 9v4" strokeLinecap="round" />
                    <path d="M12 17h.01" strokeLinecap="round" />
                    <path d="M10.3 3.84 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.84a2 2 0 0 0-3.4 0Z" strokeLinejoin="round" />
                  </svg>
                ) : null}
                {new Date(task.due_date).toLocaleDateString()}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-slate-400">No due date</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {task.comment_count ?? 0}
          </span>
          <span className="inline-flex items-center gap-1">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.2-9.19a4 4 0 0 1 5.65 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.83l8.48-8.48" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {task.attachment_count ?? task.attachments?.length ?? 0}
          </span>
        </div>
      </div>
    </button>
  );
}

export default TaskCard;
