-- Personal machine favorites share the existing actor/site isolation.
ALTER TABLE workspace_preferences DROP CONSTRAINT workspace_preferences_view_name_check;
ALTER TABLE workspace_preferences ADD CONSTRAINT workspace_preferences_view_name_check
 CHECK(view_name IN ('orders','jobs','compensations','machine-planning'));
