# FlowForm — React + NestJS/Prisma rewrite

Rewrite of FlowFormDemo (ASP.NET Core MVC) as React (frontend) + NestJS/Prisma REST API (backend),
SQLite for now (SQL Server planned later once this stack is stable).

## Prerequisites

- Node.js 18+ (this project was built against Node 20)

## First-time setup

```bash
# Backend
cd backend
npm install
npx prisma generate      # generates the Prisma client from prisma/schema.prisma
npx prisma db push       # creates backend/prisma/dev.db and applies the schema
npx prisma db seed       # seeds 4 demo users, master data (Plant/Area/Unit), Leave/Purchase request types
```

```bash
# Frontend (separate terminal)
cd frontend
npm install
```

## Running (every time after)

**Terminal 1 — backend** (NestJS API on http://localhost:3000):
```bash
cd backend
npm run start:dev
```

**Terminal 2 — frontend** (Vite dev server on http://localhost:5173):
```bash
cd frontend
npm run dev
```

Then open **http://localhost:5173** in a browser.

## Demo login

All seeded users share the password `1`:

| Email | Role | Tag |
|---|---|---|
| admin@yopmail.com | admin | admin |
| pm@yopmail.com | user | project_manager |
| dev1@yopmail.com | user | developer |
| dev2@yopmail.com | user | developer |

## Project layout

- `backend/` — NestJS + Prisma + Socket.IO + `@nestjs/schedule`. `.env` holds `DATABASE_URL`,
  `JWT_SECRET`, `PORT`, `CORS_ORIGIN`. SQLite file lives at `backend/prisma/dev.db`.
- `frontend/` — Vite + React + TypeScript + Bootstrap 5. `.env` holds `VITE_API_URL` /
  `VITE_SOCKET_URL` (both point at the backend).

## Notes

- No EF-style migrations — schema changes go through `npx prisma db push` (dev) or a real
  `prisma migrate` workflow if this ever needs a production migration history.
- Uploaded files land in `backend/uploads/`, served statically at `/uploads/...`.
- SQL Server swap (planned, not yet done): change `datasource db` in `prisma/schema.prisma`,
  convert the `String`-as-enum columns to real Prisma `enum`s, re-run `prisma db push`/migrate,
  and write a one-time data copy script from the SQLite file.
