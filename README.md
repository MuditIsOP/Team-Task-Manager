# Team Task Manager

Realtime team collaboration app for projects, kanban planning, files, notifications, and analytics.

## Live Links

- Frontend: [https://yourusername.github.io/team-task-manager](https://yourusername.github.io/team-task-manager)
- Backend: [https://your-railway-backend.up.railway.app](https://your-railway-backend.up.railway.app)
- API docs: [https://your-railway-backend.up.railway.app/docs](https://your-railway-backend.up.railway.app/docs)

## Tech Stack

- Frontend: React, Vite, Tailwind CSS, React Router, Recharts, Firebase Auth
- Backend: FastAPI, SQLAlchemy, Alembic, PostgreSQL
- Realtime: FastAPI WebSockets
- File storage: Storj S3-compatible object storage
- Email and notifications: SendGrid, APScheduler
- Deployment: GitHub Pages, Railway, Docker, docker-compose

## Features

- Firebase authentication with Google and email/password login
- Project and membership management with admin/member role enforcement
- Drag-and-drop kanban board with optimistic updates
- Realtime task and comment updates over WebSockets
- Storj-backed file uploads for task attachments and avatars
- Activity logging for task, comment, and membership changes
- In-app notifications with unread state and polling
- Dashboard analytics for task status, workload, overdue work, and activity

## Local Setup

1. Clone the repository.
2. Copy `backend/.env.example` into `backend/.env`.
3. Copy `frontend/.env.production.example` into `frontend/.env.production` and set the `VITE_*` values.
4. Build the frontend locally so nginx can serve `frontend/dist`.
5. Start the stack:

```bash
docker-compose up --build
```

6. Open:

- Frontend: `http://localhost:5173`
- Backend docs: `http://localhost:8000/docs`

## Deployment Notes

- Backend deploy target is Railway with `/backend` as the root directory.
- Add a PostgreSQL plugin in Railway so `DATABASE_URL` is provided automatically.
- Set every backend env var from the PRD before first boot.
- Run `alembic upgrade head` from the Railway console after deploy.
- Frontend deploy target is GitHub Pages using `HashRouter` and `gh-pages`.
- Rebuild and deploy the frontend after updating `VITE_API_URL`, `VITE_WS_URL`, and Firebase values.

## Screenshots

- Add screenshots here after deploy.
