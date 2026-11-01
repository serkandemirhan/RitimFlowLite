-- A confirmed rejected command remains in history and cannot later be executed with the same key.
ALTER TABLE pending_recovery_commands DROP CONSTRAINT pending_recovery_commands_status_check;
ALTER TABLE pending_recovery_commands ADD CONSTRAINT pending_recovery_commands_status_check CHECK (status IN ('pending','resolved','rejected'));
