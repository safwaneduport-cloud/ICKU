# Pilot reset — clearing test data after the pilot launch

One-time cleanup that wipes the clutter created while the team was testing ICKU:
all projects & tasks, project chat messages, checklists, OKRs, responsibilities,
and ICKU-scheduled meetings (cancelling their Teams events too). Real accounts,
departments, attendance, leave, payroll, assets, etc. are **not** touched.

> **⚠️ Irreversible.** Take a Supabase database snapshot/backup **before** you
> start (Supabase → Database → Backups / Point-in-time recovery). There is no undo.

## What gets deleted

| Area | Tables cleared |
|---|---|
| Projects & tasks | `Event` (→ tasks, comments, attachments, activity), `DirectTask` |
| Project messages | `Conversation` where `type='event'` (→ members, messages, reactions) |
| Responsibilities | `Duty` |
| OKRs | `Okr`, `OkrApproval` |
| Checklists | `ChecklistItem` (→ completions), `ChecklistActivity`, `ChecklistDeadline` |
| Meetings | `Meeting` (→ attendees, actions) + the linked Teams event is cancelled |

Meetings created **natively in Teams/Outlook** are never stored in ICKU, so they
are left alone.

## Run order

**1. Deploy the code first.** The commit that ships with these scripts removes the
auto-seeding of default checklists/OKRs/responsibilities. Without it, those
placeholder items regenerate the moment anyone reopens the page — so the wipe
would not stick. Push to `main`, wait for Render to finish deploying.

**2. Back up the database.** Snapshot in Supabase.

**3. Wipe projects, tasks, project messages, checklists, OKRs, responsibilities.**
Two equivalent ways — pick one:

   - **Render Shell (simplest — no password to copy):** open the API service →
     Shell tab and run
     ```bash
     node server/scripts/pilot-reset/01-wipe-work-and-planning.mjs            # dry run — counts only
     node server/scripts/pilot-reset/01-wipe-work-and-planning.mjs --confirm  # actually delete
     ```
   - **Supabase SQL Editor:** paste `01-wipe-work-and-planning.sql`, run the
     **STEP A** dry-run block, then the **STEP B** transaction; confirm the
     post-delete counts are all `0` and `COMMIT` (or `ROLLBACK`).

**4. Run `02-wipe-meetings.mjs`** from the **Render Shell** of the API service
(the Microsoft Graph env vars live there, so Teams events can be cancelled):
   ```bash
   node server/scripts/pilot-reset/02-wipe-meetings.mjs            # dry run — lists what it would do
   node server/scripts/pilot-reset/02-wipe-meetings.mjs --confirm  # cancels Teams events + deletes rows
   ```
   Cancelling a Teams event notifies its attendees, so expect cancellation
   notices on their calendars.

## After the cleanup

These scripts can be deleted from the repo once the reset is done — they serve no
purpose at runtime.
