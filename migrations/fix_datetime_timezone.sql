-- Migration: Fix DateTime columns to use TIMESTAMP WITH TIME ZONE
-- Date: 2025-01-29
-- Purpose: Fix timezone issue causing negative relative time displays in admin dashboard
--
-- IMPORTANT: This migration converts all TIMESTAMP columns to TIMESTAMP WITH TIME ZONE
-- and assumes existing timestamps are stored in UTC.
--
-- To run this migration:
-- 1. Log into your Supabase dashboard
-- 2. Navigate to SQL Editor
-- 3. Paste and execute this script

-- ============================================================================
-- BEGIN TRANSACTION (optional - remove if running in Supabase SQL Editor)
-- ============================================================================
-- BEGIN;

-- ============================================================================
-- Convert FieldWork table
-- ============================================================================
ALTER TABLE fieldwork
  ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE
  USING created_at AT TIME ZONE 'UTC';

-- ============================================================================
-- Convert Jobs table
-- ============================================================================
ALTER TABLE jobs
  ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE
  USING created_at AT TIME ZONE 'UTC';

ALTER TABLE jobs
  ALTER COLUMN deleted_at TYPE TIMESTAMP WITH TIME ZONE
  USING deleted_at AT TIME ZONE 'UTC';

-- ============================================================================
-- Convert Users table
-- ============================================================================
ALTER TABLE users
  ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE
  USING created_at AT TIME ZONE 'UTC';

ALTER TABLE users
  ALTER COLUMN last_login TYPE TIMESTAMP WITH TIME ZONE
  USING last_login AT TIME ZONE 'UTC';

-- ============================================================================
-- Convert Tags table
-- ============================================================================
ALTER TABLE tags
  ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE
  USING created_at AT TIME ZONE 'UTC';

-- ============================================================================
-- COMMIT TRANSACTION (optional - remove if running in Supabase SQL Editor)
-- ============================================================================
-- COMMIT;

-- ============================================================================
-- Verification Queries
-- ============================================================================
-- Run these queries to verify the migration was successful:

-- Check FieldWork table
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'fieldwork' AND column_name = 'created_at';

-- Check Jobs table
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'jobs' AND column_name IN ('created_at', 'deleted_at');

-- Check Users table
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'users' AND column_name IN ('created_at', 'last_login');

-- Check Tags table
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'tags' AND column_name = 'created_at';

-- Expected result: data_type should be 'timestamp with time zone' for all columns
