CREATE TABLE flags (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
    key TEXT NOT NULL CHECK (key ~ '^[a-z][a-z0-9_-]{0,63}$'),
    environment TEXT NOT NULL CHECK (environment IN ('development','staging','production')),
    enabled BOOLEAN NOT NULL,
    default_value BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (environment, key)
);
CREATE TABLE rules (
    id BIGSERIAL PRIMARY KEY,
    flag_id BIGINT NOT NULL REFERENCES flags(id) ON DELETE CASCADE,
    attribute TEXT NOT NULL CHECK (attribute ~ '^[A-Za-z_][A-Za-z0-9_.-]{0,63}$'),
    operator TEXT NOT NULL CHECK (operator IN ('equals','in')),
    expected JSONB NOT NULL,
    result BOOLEAN NOT NULL,
    priority INTEGER NOT NULL CHECK (priority BETWEEN 0 AND 1000000),
    UNIQUE (flag_id, priority),
    CHECK ((operator = 'equals' AND jsonb_typeof(expected) IN ('string','number','boolean'))
        OR (operator = 'in' AND jsonb_typeof(expected) = 'array'
            AND jsonb_array_length(expected) BETWEEN 1 AND 100))
);
CREATE TABLE history (
    id BIGSERIAL PRIMARY KEY,
    flag_id BIGINT NOT NULL REFERENCES flags(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT 'demo-admin',
    summary TEXT NOT NULL,
    changes JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX history_flag_time ON history(flag_id, created_at DESC, id DESC);
