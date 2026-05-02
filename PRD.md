# PRD — Team Task Manager

## STACK
- Frontend: React + Tailwind CSS + @dnd-kit (Kanban drag/drop)
- Backend: FastAPI (Python)
- Database: PostgreSQL (Railway plugin)
- Auth: Firebase Auth (Email/Password + Google OAuth)
- File Storage: Storj S3 (boto3, S3-compatible)
- Realtime: WebSockets (FastAPI native)
- Email: SendGrid
- Frontend Deploy: GitHub Pages (HashRouter, gh-pages package)
- Backend Deploy: Railway
- Containers: Dockerfile for backend + docker-compose.yml

---

## FOLDER STRUCTURE

```
team-task-manager/
├── backend/
│   ├── main.py
│   ├── database.py
│   ├── models.py
│   ├── schemas.py
│   ├── firebase.py
│   ├── storj.py
│   ├── websocket_manager.py
│   ├── routers/
│   │   ├── auth.py
│   │   ├── users.py
│   │   ├── projects.py
│   │   ├── tasks.py
│   │   ├── comments.py
│   │   ├── attachments.py
│   │   ├── dashboard.py
│   │   └── notifications.py
│   ├── tests/
│   │   ├── test_auth.py
│   │   ├── test_projects.py
│   │   └── test_tasks.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── ProjectBoard.jsx
│   │   │   └── Settings.jsx
│   │   ├── components/
│   │   │   ├── KanbanBoard.jsx
│   │   │   ├── TaskCard.jsx
│   │   │   ├── TaskModal.jsx
│   │   │   ├── ActivityFeed.jsx
│   │   │   ├── MemberList.jsx
│   │   │   └── Notifications.jsx
│   │   ├── context/
│   │   │   └── AuthContext.jsx
│   │   ├── hooks/
│   │   │   ├── useWebSocket.js
│   │   │   └── useProjects.js
│   │   └── api/
│   │       └── axios.js
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## DATABASE SCHEMA (PostgreSQL / SQLAlchemy)

### users
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| firebase_uid | string unique | from Firebase token |
| name | string | |
| email | string unique | |
| avatar_url | string nullable | |
| created_at | timestamp | |

### projects
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| name | string | |
| description | text nullable | |
| owner_id | UUID FK → users | |
| created_at | timestamp | |

### project_members
| column | type | notes |
|---|---|---|
| project_id | UUID FK → projects | composite PK |
| user_id | UUID FK → users | composite PK |
| role | enum: admin, member | |

### tasks
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| title | string | |
| description | text nullable | |
| status | enum: todo, in_progress, review, done | |
| priority | enum: low, medium, high, critical | |
| project_id | UUID FK → projects | |
| assignee_id | UUID FK → users nullable | |
| due_date | date nullable | |
| labels | ARRAY(string) | |
| attachments | JSON | array of {name, url, size} |
| created_at | timestamp | |

### comments
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| task_id | UUID FK → tasks | |
| user_id | UUID FK → users | |
| body | text | |
| created_at | timestamp | |

### activity_logs
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| project_id | UUID FK → projects | |
| user_id | UUID FK → users | |
| action | string | e.g. "task.created", "task.status_changed" |
| metadata | JSON | e.g. {task_id, from_status, to_status} |
| created_at | timestamp | |

### notifications
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK → users | |
| message | string | |
| link | string nullable | e.g. /project/123 |
| is_read | boolean default false | |
| created_at | timestamp | |

---

## AUTH FLOW (Firebase)

1. Frontend: user logs in via Firebase (Google or Email/Password)
2. Frontend: gets Firebase ID token → `user.getIdToken()`
3. Every API request: sends `Authorization: Bearer <firebase_id_token>` header
4. Backend middleware: verifies token using `firebase-admin` → `auth.verify_id_token(token)`
5. Backend: looks up user by `firebase_uid` in DB, creates if not exists
6. Backend: attaches `current_user` to request state for all protected routes

Firebase handles: password hashing, OAuth, email verification, password reset.
Backend does NOT store passwords.

---

## STORJ S3 FLOW

- Endpoint: `https://gateway.storjshare.io`
- Client: boto3 with custom endpoint_url
- Bucket path pattern: `attachments/{project_id}/{task_id}/{uuid}_{filename}`
- Upload flow:
  1. Frontend calls `POST /attachments/presigned-url` with `{filename, content_type, task_id}`
  2. Backend generates presigned PUT URL (expires 15 min) using boto3
  3. Frontend uploads file directly to Storj via PUT request
  4. Frontend calls `PATCH /tasks/{id}` to append `{name, url, size}` to attachments array
- Delete flow: backend calls `s3.delete_object` when task deleted or attachment removed

---

## API ENDPOINTS

### Auth
- `POST /auth/verify` — verify Firebase token, upsert user, return user object

### Users
- `GET /users/me` — current user profile
- `PATCH /users/me` — update name/avatar

### Projects
- `GET /projects/` — list projects where user is member or owner
- `POST /projects/` — create project (user becomes admin)
- `GET /projects/{id}` — get project details + members
- `PATCH /projects/{id}` — update name/description (admin only)
- `DELETE /projects/{id}` — delete project (admin only)
- `POST /projects/{id}/members` — add member by email (admin only)
- `DELETE /projects/{id}/members/{user_id}` — remove member (admin only)

### Tasks
- `GET /projects/{id}/tasks` — all tasks in project
- `POST /tasks/` — create task (admin only)
- `GET /tasks/{id}` — task detail
- `PATCH /tasks/{id}` — update task fields (admin only for most fields)
- `PATCH /tasks/{id}/status` — update status only (member allowed)
- `DELETE /tasks/{id}` — delete task (admin only)

### Comments
- `GET /tasks/{id}/comments` — list comments
- `POST /tasks/{id}/comments` — add comment (any member)
- `DELETE /comments/{id}` — delete own comment or admin

### Attachments
- `POST /attachments/presigned-url` — get Storj presigned upload URL
- `DELETE /attachments/` — delete file from Storj + remove from task

### Dashboard
- `GET /dashboard/stats` — total tasks, by status count, overdue count, per-member count
- `GET /dashboard/overdue` — tasks where due_date < today and status != done
- `GET /dashboard/activity` — recent activity_logs across all user's projects

### Notifications
- `GET /notifications/` — list unread + recent notifications for current user
- `PATCH /notifications/read-all` — mark all read
- `PATCH /notifications/{id}/read` — mark one read

### WebSocket
- `WS /ws/{project_id}` — join project room
- Events broadcast: `task.created`, `task.updated`, `task.deleted`, `comment.added`, `member.joined`
- Payload: `{ event: string, data: object, actor: {id, name, avatar} }`

---

## ROLE-BASED ACCESS CONTROL

| Action | Admin | Member |
|---|---|---|
| Create/delete project | ✅ | ❌ |
| Add/remove members | ✅ | ❌ |
| Create/delete tasks | ✅ | ❌ |
| Edit task fields (title, assignee, priority, due date) | ✅ | ❌ |
| Update task status | ✅ | ✅ |
| Add/delete own comments | ✅ | ✅ |
| Delete any comment | ✅ | ❌ |
| Upload attachments | ✅ | ✅ |
| View all project data | ✅ | ✅ |

Enforcement: backend checks `project_members.role` for the current user on every request.
Frontend hides UI elements based on role but backend is the source of truth.

---

## WEBSOCKET MANAGER (backend)

```python
# websocket_manager.py — connection pool per project_id
class ConnectionManager:
    rooms: dict[str, list[WebSocket]]  # project_id → connected sockets
    async def connect(project_id, websocket)
    async def disconnect(project_id, websocket)
    async def broadcast(project_id, message: dict)
```

Call `manager.broadcast(project_id, {...})` inside any task/comment router after DB write.

---

## ACTIVITY LOG RULES

Write to `activity_logs` after every mutating operation:
- task created → `action: "task.created"`, metadata: `{task_id, task_title}`
- task status changed → `action: "task.status_changed"`, metadata: `{task_id, from, to}`
- task assigned → `action: "task.assigned"`, metadata: `{task_id, assignee_name}`
- comment added → `action: "comment.added"`, metadata: `{task_id, task_title}`
- member added → `action: "member.joined"`, metadata: `{user_name}`

---

## NOTIFICATION TRIGGERS

Create a notification row whenever:
- A task is assigned to a user → notify that user
- A comment is added on a task → notify task assignee (if not commenter)
- A task becomes overdue → background job (APScheduler, runs daily at 8am)
- User is added to a project → notify that user

SendGrid email: send same triggers as email using `sendgrid` Python SDK. Use `SENDGRID_API_KEY` env var.

---

## FRONTEND ROUTING (HashRouter)

```
/#/                 → redirect to /#/dashboard if logged in, else /#/login
/#/login            → Login page (Firebase Google + Email)
/#/dashboard        → Dashboard (stats, overdue, activity feed)
/#/projects/:id     → Project board (Kanban)
/#/settings         → User settings
```

Protected routes: redirect to `/#/login` if no Firebase user in AuthContext.

---

## KANBAN BOARD

4 columns: `Todo`, `In Progress`, `Review`, `Done`
Library: `@dnd-kit/core` + `@dnd-kit/sortable`
- Drag TaskCard between columns → calls `PATCH /tasks/{id}/status`
- Optimistic update: update local state immediately, revert on API error
- TaskCard shows: title, priority badge (color-coded), assignee avatar, due date, overdue highlight (red if past due and not done), comment count, attachment count

---

## DASHBOARD

Components:
- Stats bar: Total Tasks / In Progress / Done / Overdue (4 cards)
- Burndown chart: tasks completed per day (last 14 days) — use Recharts LineChart
- Workload chart: tasks per member — Recharts BarChart
- Overdue list: table of overdue tasks with project name, assignee, days overdue
- Activity feed: last 20 activity_logs across all projects, human-readable strings

---

## ENV VARIABLES

### Backend
```
DATABASE_URL=postgresql://...
SECRET_KEY=random_string
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=
STORJ_ACCESS_KEY=
STORJ_SECRET_KEY=
STORJ_BUCKET_NAME=
STORJ_ENDPOINT=https://gateway.storjshare.io
SENDGRID_API_KEY=
FRONTEND_URL=https://yourusername.github.io/team-task-manager
```

### Frontend
```
VITE_API_URL=https://your-railway-backend.up.railway.app
VITE_WS_URL=wss://your-railway-backend.up.railway.app
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
```

---

## DEPLOYMENT

### Backend (Railway)
1. Connect GitHub repo to Railway
2. Set root directory to `/backend`
3. Add PostgreSQL plugin → auto-sets DATABASE_URL
4. Add all env vars in Railway dashboard
5. Railway auto-detects Dockerfile

### Frontend (GitHub Pages)
1. `npm install gh-pages --save-dev`
2. `package.json`: set `"homepage": "https://{username}.github.io/team-task-manager"`
3. Scripts: `"predeploy": "npm run build"`, `"deploy": "gh-pages -d dist"`
4. Set all `VITE_*` env vars in `.env.production` before build
5. Run `npm run deploy` → pushes to `gh-pages` branch

### CORS (backend main.py)
Allow origins: `["https://{username}.github.io", "http://localhost:5173"]`
Allow credentials: True, Allow all methods and headers.

---

## TESTING (pytest)

- `test_auth.py`: verify token endpoint, invalid token rejection
- `test_projects.py`: create, list, add member, role enforcement
- `test_tasks.py`: CRUD, status update by member, admin-only field update

Use FastAPI `TestClient`. Mock Firebase token verification with `pytest-mock`.

---

## DOCKER

### backend/Dockerfile
```
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### docker-compose.yml (local dev)
Services: backend, frontend, db (postgres:15)
Backend env: DATABASE_URL pointing to db service
Frontend env: VITE_API_URL=http://localhost:8000

---

## KEY PACKAGES

### Backend (requirements.txt)
```
fastapi
uvicorn[standard]
sqlalchemy
psycopg2-binary
alembic
pydantic[email]
firebase-admin
boto3
sendgrid
apscheduler
python-dotenv
pytest
httpx
pytest-mock
```

### Frontend (package.json)
```
react, react-dom, react-router-dom
@dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities
axios
firebase
recharts
gh-pages
tailwindcss
```
