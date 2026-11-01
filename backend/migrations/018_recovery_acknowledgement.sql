-- Completed commands stay recoverable until their owner acknowledges the result.
ALTER TABLE pending_recovery_commands DROP CONSTRAINT pending_recovery_commands_status_check;
ALTER TABLE pending_recovery_commands ADD CONSTRAINT pending_recovery_commands_status_check CHECK (status IN ('pending','resolved','rejected','acknowledged'));
