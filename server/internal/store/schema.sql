-- Applied at service start, in order, inside one transaction. Every statement
-- must be idempotent: the service runs this on every boot and on every replica.

CREATE TABLE IF NOT EXISTS users (
    id            uuid PRIMARY KEY,
    email         text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
    token      text PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

-- Projects keep the client-facing string id ('ozx', 'workout', ...) but are
-- unique per user, so two accounts can both own a project called 'ozx'.
CREATE TABLE IF NOT EXISTS projects (
    user_id                  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    id                       text NOT NULL,
    name                     text NOT NULL,
    color                    text NOT NULL,
    icon                     text NOT NULL,
    intensity_target_minutes integer NOT NULL CHECK (intensity_target_minutes > 0),
    is_archived              boolean NOT NULL DEFAULT false,
    sort_order               integer NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS plans (
    id              uuid PRIMARY KEY,
    user_id         uuid NOT NULL,
    project_id      text NOT NULL,
    date            date NOT NULL,
    planned_minutes integer NOT NULL CHECK (planned_minutes BETWEEN 1 AND 1440),
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (user_id, project_id) REFERENCES projects (user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS activities (
    id               uuid PRIMARY KEY,
    user_id          uuid NOT NULL,
    project_id       text NOT NULL,
    date             date NOT NULL,
    duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
    note             text,
    source           text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'timer', 'import')),
    started_at       timestamptz,
    ended_at         timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (user_id, project_id) REFERENCES projects (user_id, id) ON DELETE CASCADE
);

-- Month reads are range scans over these, mirroring the by-date index the
-- browser adapter used.
CREATE INDEX IF NOT EXISTS plans_user_date_idx ON plans (user_id, date);
CREATE INDEX IF NOT EXISTS activities_user_date_idx ON activities (user_id, date);
