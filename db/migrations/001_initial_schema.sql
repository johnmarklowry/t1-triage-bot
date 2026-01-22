-- Migration: 001_initial_schema.sql
-- Create initial database schema for triage bot

-- Users table: stores user information and discipline assignments
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  slack_id VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  discipline VARCHAR(20) NOT NULL CHECK (discipline IN ('account', 'producer', 'po', 'uiEng', 'beEng')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sprints table: stores sprint schedule information
CREATE TABLE sprints (
  id SERIAL PRIMARY KEY,
  sprint_name VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  sprint_index INTEGER NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Current state table: tracks the current active sprint and role assignments
CREATE TABLE current_state (
  id SERIAL PRIMARY KEY,
  sprint_index INTEGER REFERENCES sprints(sprint_index),
  account_slack_id VARCHAR(50),
  producer_slack_id VARCHAR(50),
  po_slack_id VARCHAR(50),
  ui_eng_slack_id VARCHAR(50),
  be_eng_slack_id VARCHAR(50),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_current_state CHECK (id = 1) -- Only allow one current state record
);

-- Overrides table: stores coverage override requests and approvals
CREATE TABLE overrides (
  id SERIAL PRIMARY KEY,
  sprint_index INTEGER NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('account', 'producer', 'po', 'uiEng', 'beEng')),
  original_slack_id VARCHAR(50),
  replacement_slack_id VARCHAR(50) NOT NULL,
  replacement_name VARCHAR(100),
  requested_by VARCHAR(50) NOT NULL,
  approved BOOLEAN DEFAULT FALSE,
  approved_by VARCHAR(50),
  approval_timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit logs table: tracks all changes for compliance and debugging
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  table_name VARCHAR(50) NOT NULL,
  record_id INTEGER,
  operation VARCHAR(20) NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values JSONB,
  new_values JSONB,
  changed_by VARCHAR(50),
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reason TEXT
);

-- Create indexes for better performance
CREATE INDEX idx_users_discipline ON users(discipline);
CREATE INDEX idx_users_slack_id ON users(slack_id);
CREATE INDEX idx_sprints_dates ON sprints(start_date, end_date);
CREATE INDEX idx_sprints_index ON sprints(sprint_index);
CREATE INDEX idx_overrides_sprint_role ON overrides(sprint_index, role);
CREATE INDEX idx_overrides_approved ON overrides(approved);
CREATE INDEX idx_audit_logs_table_record ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_logs_changed_at ON audit_logs(changed_at);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sprints_updated_at BEFORE UPDATE ON sprints
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_current_state_updated_at BEFORE UPDATE ON current_state
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_overrides_updated_at BEFORE UPDATE ON overrides
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert initial current state record
INSERT INTO current_state (id, sprint_index) VALUES (1, NULL);
