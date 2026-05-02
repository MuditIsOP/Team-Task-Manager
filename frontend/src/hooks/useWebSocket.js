import { useEffect, useRef } from "react";

import { auth } from "../context/AuthContext";

function normalizeTask(task, previousTask) {
  return {
    ...previousTask,
    ...task,
    comment_count: task.comment_count ?? previousTask?.comment_count ?? 0,
    attachment_count:
      task.attachment_count ??
      task.attachments?.length ??
      previousTask?.attachment_count ??
      previousTask?.attachments?.length ??
      0,
  };
}

export function useWebSocket(projectId, { setTasks, setMembers, onTaskAssigned } = {}) {
  const socketRef = useRef(null);

  useEffect(() => {
    let isCancelled = false;

    async function connect() {
      if (!projectId || !import.meta.env.VITE_WS_URL || !auth.currentUser) {
        return;
      }

      const token = await auth.currentUser.getIdToken();
      const socket = new WebSocket(`${import.meta.env.VITE_WS_URL}/ws/${projectId}?token=${token}`);

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data);

        if (payload.event === "task.created" && setTasks) {
          if (payload.data.assignee_id) {
            onTaskAssigned?.(payload.data);
          }
          setTasks((current) => {
            const exists = current.some((task) => task.id === payload.data.id);
            if (exists) {
              return current.map((task) => (task.id === payload.data.id ? normalizeTask(payload.data, task) : task));
            }
            return [...current, normalizeTask(payload.data)];
          });
        }

        if (payload.event === "task.updated" && setTasks) {
          if (payload.data.assignee_id) {
            onTaskAssigned?.(payload.data);
          }
          setTasks((current) => current.map((task) => (task.id === payload.data.id ? normalizeTask(payload.data, task) : task)));
        }

        if (payload.event === "task.deleted" && setTasks) {
          setTasks((current) => current.filter((task) => task.id !== payload.data.id));
        }

        if (payload.event === "comment.added" && setTasks) {
          setTasks((current) =>
            current.map((task) =>
              task.id === payload.data.task_id
                ? { ...task, comment_count: (task.comment_count ?? 0) + 1 }
                : task,
            ),
          );
        }

        if (payload.event === "comment.deleted" && setTasks) {
          setTasks((current) =>
            current.map((task) =>
              task.id === payload.data.task_id
                ? { ...task, comment_count: Math.max(0, (task.comment_count ?? 0) - 1) }
                : task,
            ),
          );
        }

        if (payload.event === "member.joined" && setMembers) {
          setMembers((current) => {
            const exists = current.some((member) => member.user_id === payload.data.user_id);
            if (exists) {
              return current;
            }
            return [
              ...current,
              {
                project_id: payload.data.project_id,
                user_id: payload.data.user_id,
                role: payload.data.role,
                user: {
                  id: payload.data.user_id,
                  name: payload.data.name,
                  email: payload.data.email,
                  avatar_url: null,
                },
              },
            ];
          });
        }
      };

      if (!isCancelled) {
        socketRef.current = socket;
      } else {
        socket.close();
      }
    }

    connect();

    return () => {
      isCancelled = true;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [onTaskAssigned, projectId, setMembers, setTasks]);

  return socketRef;
}
