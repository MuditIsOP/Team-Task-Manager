import { closestCorners, DndContext, PointerSensor, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import TaskCard from "./TaskCard";

const columns = [
  { id: "todo", label: "Todo", tone: "border-slate-300 bg-slate-100/80" },
  { id: "in_progress", label: "In Progress", tone: "border-sky-200 bg-sky-50" },
  { id: "review", label: "Review", tone: "border-amber-200 bg-amber-50" },
  { id: "done", label: "Done", tone: "border-emerald-200 bg-emerald-50" },
];

function Column({ column, tasks, onOpen }) {
  const { setNodeRef } = useDroppable({ id: column.id });

  return (
    <section className={`rounded-[1.75rem] border p-4 ${column.tone}`}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-700">{column.label}</h3>
          <p className="mt-1 text-xs text-slate-500">{tasks.length} tasks</p>
        </div>
      </div>

      <div ref={setNodeRef} className="min-h-[14rem] space-y-3">
        <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          {tasks.length ? (
            tasks.map((task) => <TaskCard key={task.id} task={task} onOpen={onOpen} />)
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white/65 px-4 py-10 text-center text-sm text-slate-500">
              No tasks yet.
            </div>
          )}
        </SortableContext>
      </div>
    </section>
  );
}

function KanbanBoard({ tasks, onStatusChange, onOpenTask }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function findContainer(taskId) {
    const found = tasks.find((task) => task.id === taskId);
    return found?.status ?? null;
  }

  async function handleDragEnd(event) {
    const { active, over } = event;
    if (!over) {
      return;
    }

    const activeTaskId = active.id;
    const fromColumn = findContainer(activeTaskId);
    const overId = over.id;
    const toColumn = columns.some((column) => column.id === overId) ? overId : findContainer(overId);

    if (!fromColumn || !toColumn || fromColumn === toColumn) {
      return;
    }

    await onStatusChange(String(activeTaskId), toColumn);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[1120px] gap-4 xl:grid-cols-4">
          {columns.map((column) => (
            <Column key={column.id} column={column} tasks={tasks.filter((task) => task.status === column.id)} onOpen={onOpenTask} />
          ))}
        </div>
      </div>
    </DndContext>
  );
}

export default KanbanBoard;
