CREATE TABLE IF NOT EXISTS driver_drafts (
 user_id uuid PRIMARY KEY REFERENCES users(id),
 vehicle_type text NOT NULL DEFAULT 'كوستر',
 plate text NOT NULL DEFAULT '',
 vehicle_year text NOT NULL DEFAULT '',
 seats text NOT NULL DEFAULT '',
 updated_at timestamptz NOT NULL DEFAULT now()
);
