-- ============================================================================
-- ICKU PILOT RESET — Part 1: Projects, Tasks, project messages, Checklists,
--                    OKRs, Responsibilities.
--
-- WHERE TO RUN:  Supabase Dashboard → SQL Editor (against the PROD database).
-- IRREVERSIBLE:  Take a database snapshot / backup BEFORE running.
-- MEETINGS:      handled separately by 02-wipe-meetings.mjs (they also need to
--                be cancelled in Teams, which SQL can't do). This file leaves
--                the Meeting table untouched.
--
-- Deploy the code change (removes checklist/OKR/duty auto-seeding) BEFORE this,
-- otherwise the default items regenerate the next time anyone opens the page.
-- ============================================================================

-- ── STEP A · DRY RUN — review what will be deleted, delete nothing ───────────
-- Run this block on its own first and sanity-check the numbers.
SELECT
  (SELECT count(*) FROM "Conversation" WHERE type = 'event')            AS project_chat_channels,
  (SELECT count(*) FROM "Message" m
     JOIN "Conversation" c ON c.id = m."conversationId"
     WHERE c.type = 'event')                                            AS project_chat_messages,
  (SELECT count(*) FROM "Event")                                        AS projects,
  (SELECT count(*) FROM "EventTask")                                    AS project_tasks,
  (SELECT count(*) FROM "EventComment")                                 AS project_comments,
  (SELECT count(*) FROM "DirectTask")                                   AS direct_tasks,
  (SELECT count(*) FROM "Duty")                                         AS responsibilities,
  (SELECT count(*) FROM "Okr")                                          AS okrs,
  (SELECT count(*) FROM "ChecklistItem")                                AS checklist_items,
  (SELECT count(*) FROM "ChecklistCompletion")                          AS checklist_completions,
  (SELECT count(*) FROM "ChecklistActivity")                            AS checklist_activity,
  (SELECT count(*) FROM "ChecklistDeadline")                            AS checklist_deadlines;

-- ── STEP B · THE WIPE — run this block once you're happy with STEP A ─────────
-- Wrapped in a transaction: if any statement errors, nothing is deleted.
-- Child rows (task assignees, comments, attachments, activity, chat members,
-- reactions, completions) are removed automatically by ON DELETE CASCADE.
BEGIN;

-- Projects & tasks -----------------------------------------------------------
-- Project chat channels first (cascades their members + messages + reactions);
-- these are the "messages sent tagging a project".
DELETE FROM "Conversation" WHERE type = 'event';
-- All projects — cascades EventTask → TaskAssignee, Attachment, EventComment,
-- EventActivity. (Meetings only lose their project tag; Part 2 deletes them.)
DELETE FROM "Event";
-- All standalone / ad-hoc tasks — cascades DirectTaskAssignee.
DELETE FROM "DirectTask";

-- Planning: responsibilities, OKRs, checklists (incl. seeded mockup data) -----
DELETE FROM "ChecklistItem";      -- cascades ChecklistCompletion
DELETE FROM "ChecklistActivity";  -- 7-day history log (no FK cascade)
DELETE FROM "ChecklistDeadline";  -- manager-set deadline config
DELETE FROM "Okr";
DELETE FROM "OkrApproval";
DELETE FROM "Duty";

-- Review the counts one more time — every number below should be 0.
SELECT
  (SELECT count(*) FROM "Conversation" WHERE type = 'event') AS project_chat_channels,
  (SELECT count(*) FROM "Event")                             AS projects,
  (SELECT count(*) FROM "EventTask")                         AS project_tasks,
  (SELECT count(*) FROM "DirectTask")                        AS direct_tasks,
  (SELECT count(*) FROM "Duty")                              AS responsibilities,
  (SELECT count(*) FROM "Okr")                               AS okrs,
  (SELECT count(*) FROM "ChecklistItem")                     AS checklist_items,
  (SELECT count(*) FROM "ChecklistActivity")                 AS checklist_activity,
  (SELECT count(*) FROM "ChecklistDeadline")                 AS checklist_deadlines;

-- If the numbers look right, COMMIT. If anything is off, run ROLLBACK instead.
COMMIT;
-- ROLLBACK;
