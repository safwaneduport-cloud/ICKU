// Seed — ports the prototype's DEPARTMENTS, USERS, ROLE_TIER and CREDENTIALS
// into real database rows. Run with:  npm run seed
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { seedDay, ymd } from '../src/modules/attendance/attendance.lib.js';
import { LEAVE_TYPES, leaveDays } from '../src/modules/leave/leave.lib.js';
import { monthlyGrossFor } from '../src/modules/payroll/payroll.lib.js';
import { TIER_CAPS } from '../src/lib/rbac.js';

const prisma = new PrismaClient();

// Prototype CSS palette tokens → hex (kept identical to ICKU.html)
const C = {
  pine: '#134535',
  steel: '#3F6075',
  ochre: '#9A6312',
  sage: '#2C7A57',
  brick: '#9C3A2A',
};

const DEPARTMENTS = [
  { id: 'exec', name: 'Executive', color: C.pine },
  { id: 'academics', name: 'Academics', color: C.steel },
  { id: 'product', name: 'Product', color: C.ochre },
  { id: 'tech', name: 'Technology', color: C.sage },
  { id: 'design', name: 'Design', color: C.sage },
  { id: 'finance', name: 'Finance', color: C.pine },
  { id: 'sales', name: 'Sales', color: C.brick },
  { id: 'hr', name: 'HR', color: C.brick },
  { id: 'ops', name: 'Operations', color: C.steel },
  { id: 'media', name: 'Media', color: C.ochre },
];

// role -> RBAC tier (from ROLE_TIER); anything not listed falls back to "Employee"
const ROLE_TIER = {
  CEO: 'Leadership', COO: 'Leadership', CGO: 'Leadership', 'Chief of Staff': 'Leadership',
  'Tech Head': 'Department Head', 'Product Head': 'Department Head', 'Design Head': 'Department Head',
  'Finance Head': 'Department Head', 'Academic Excellence Head': 'Department Head', 'Academic HOD': 'Department Head',
  'CRA Head': 'Department Head', 'HR Head': 'Department Head', 'Sales Head': 'Department Head',
  'Operations Head': 'Department Head', 'Media Head': 'Department Head', 'Backend Head': 'Department Head', 'Frontend Head': 'Department Head',
  'Category Manager': 'Manager', 'Category Manager (Marketing)': 'Manager', 'Course Manager': 'Manager',
  'Payment Manager': 'Manager', 'Studio Manager': 'Manager', 'Live Manager': 'Manager',
  'Project Lead': 'Manager', 'Academic Program Manager': 'Manager', BDM: 'Manager',
};
const tierOf = (role) => ROLE_TIER[role] || 'Employee';

const USERS = [
  // Executive
  { id: 'ceo', name: 'CEO', role: 'CEO', dept: 'exec', designation: 'Chief Executive Officer', reportsTo: null },
  { id: 'coo', name: 'COO', role: 'COO', dept: 'exec', designation: 'Chief Operating Officer', reportsTo: 'ceo' },
  { id: 'cgo', name: 'CGO', role: 'CGO', dept: 'exec', designation: 'Chief Growth Officer', reportsTo: 'ceo' },
  { id: 'cos', name: 'Chief of Staff', role: 'Chief of Staff', dept: 'exec', designation: 'Chief of Staff', reportsTo: 'ceo' },
  // Function heads (report to CEO)
  { id: 'tech', name: 'Tech Head', role: 'Tech Head', dept: 'tech', designation: 'Head of Technology', reportsTo: 'ceo' },
  { id: 'product', name: 'Product Head', role: 'Product Head', dept: 'product', designation: 'Head of Product', reportsTo: 'ceo' },
  { id: 'design', name: 'Design Head', role: 'Design Head', dept: 'design', designation: 'Head of Design', reportsTo: 'ceo' },
  { id: 'finance', name: 'Finance Head', role: 'Finance Head', dept: 'finance', designation: 'Head of Finance', reportsTo: 'ceo' },
  { id: 'aeh', name: 'Academic Excellence Head', role: 'Academic Excellence Head', dept: 'academics', designation: 'Head of Academic Excellence', reportsTo: 'ceo' },
  // Academic HODs (report to CEO)
  { id: 'avanya', name: 'HOD — Class 7,8', role: 'Academic HOD', dept: 'academics', designation: 'Academic HOD — Class 7,8', reportsTo: 'ceo' },
  { id: 'sadique', name: 'HOD — Class 4,5,6', role: 'Academic HOD', dept: 'academics', designation: 'Academic HOD — Class 4,5,6', reportsTo: 'ceo' },
  { id: 'dhanish', name: 'HOD — Class 9,10,11', role: 'Academic HOD', dept: 'academics', designation: 'Academic HOD — Class 9,10,11', reportsTo: 'ceo' },
  { id: 'haneena', name: 'HOD — Class 12 Science', role: 'Academic HOD', dept: 'academics', designation: 'Academic HOD — Class 12 Science', reportsTo: 'ceo' },
  { id: 'suhail', name: 'HOD — GCC', role: 'Academic HOD', dept: 'academics', designation: 'Academic HOD — GCC', reportsTo: 'ceo' },
  { id: 'ajith', name: 'HOD — CBSE', role: 'Academic HOD', dept: 'academics', designation: 'Academic HOD — CBSE', reportsTo: 'ceo' },
  { id: 'nihal', name: 'HOD — Commerce', role: 'Academic HOD', dept: 'academics', designation: 'Academic HOD — Commerce', reportsTo: 'ceo' },
  { id: 'hodhum', name: 'HOD — Humanities', role: 'Academic HOD', dept: 'academics', designation: 'Academic HOD — Humanities', reportsTo: 'ceo' },
  { id: 'hodoff', name: 'HOD — Offline', role: 'Academic HOD', dept: 'academics', designation: 'Academic HOD — Offline', reportsTo: 'ceo' },
  // Report to COO
  { id: 'cra', name: 'CRA Head', role: 'CRA Head', dept: 'sales', designation: 'Head of CRA', reportsTo: 'coo' },
  { id: 'hr', name: 'HR Head', role: 'HR Head', dept: 'hr', designation: 'Head of HR', reportsTo: 'coo' },
  { id: 'sales', name: 'Sales Head', role: 'Sales Head', dept: 'sales', designation: 'Head of Sales', reportsTo: 'coo' },
  { id: 'cmk12', name: 'Category Manager — K12', role: 'Category Manager', dept: 'product', designation: 'Category Manager — K12', reportsTo: 'coo' },
  { id: 'cmk10', name: 'Category Manager — K10', role: 'Category Manager', dept: 'product', designation: 'Category Manager — K10', reportsTo: 'coo' },
  { id: 'cmcbse', name: 'Category Manager — CBSE', role: 'Category Manager', dept: 'product', designation: 'Category Manager — CBSE', reportsTo: 'coo' },
  { id: 'pay', name: 'Payment Manager', role: 'Payment Manager', dept: 'finance', designation: 'Payment Manager', reportsTo: 'coo' },
  // Report to HOD Class 7,8 (avanya)
  { id: 'mentor', name: 'Course Manager — 7,8', role: 'Course Manager', dept: 'academics', designation: 'Course Manager — Class 7,8', reportsTo: 'avanya' },
  { id: 'cmm78', name: 'Cat. Manager (Mktg) — 7,8', role: 'Category Manager (Marketing)', dept: 'product', designation: 'Category Manager (Marketing) — 7,8', reportsTo: 'avanya' },
  { id: 'fac78', name: 'Faculty — 7,8', role: 'Faculty', dept: 'academics', designation: 'Faculty — Class 7,8', reportsTo: 'avanya' },
  // Report to Course Manager 7,8 (mentor)
  { id: 'de78', name: 'Data Entry — 7,8', role: 'Data Entry', dept: 'academics', designation: 'Data Entry Team', reportsTo: 'mentor' },
  // Report to Chief of Staff
  { id: 'offdir', name: 'Operations Head', role: 'Operations Head', dept: 'ops', designation: 'Head of Operations', reportsTo: 'cos' },
  { id: 'media', name: 'Media Head', role: 'Media Head', dept: 'media', designation: 'Head of Media', reportsTo: 'cos' },
  // Report to Media Head
  { id: 'studio', name: 'Studio Manager', role: 'Studio Manager', dept: 'media', designation: 'Studio Manager', reportsTo: 'media' },
  { id: 'live', name: 'Live Manager', role: 'Live Manager', dept: 'media', designation: 'Live Manager', reportsTo: 'media' },
  { id: 've1', name: 'Video Editor 1', role: 'Video Editor', dept: 'media', designation: 'Video Editor', reportsTo: 'studio' },
  { id: 've2', name: 'Video Editor 2', role: 'Video Editor', dept: 'media', designation: 'Video Editor', reportsTo: 'studio' },
  { id: 've3', name: 'Video Editor 3', role: 'Video Editor', dept: 'media', designation: 'Video Editor', reportsTo: 'studio' },
  { id: 've4', name: 'Video Editor 4', role: 'Video Editor', dept: 'media', designation: 'Video Editor', reportsTo: 'studio' },
  { id: 've5', name: 'Video Editor 5', role: 'Video Editor', dept: 'media', designation: 'Video Editor', reportsTo: 'studio' },
  { id: 'lt1', name: 'Live Team 1', role: 'Live Team', dept: 'media', designation: 'Live Team', reportsTo: 'live' },
  { id: 'lt2', name: 'Live Team 2', role: 'Live Team', dept: 'media', designation: 'Live Team', reportsTo: 'live' },
  { id: 'lt3', name: 'Live Team 3', role: 'Live Team', dept: 'media', designation: 'Live Team', reportsTo: 'live' },
  // Sales → BDMs → BDEs
  { id: 'bdm1', name: 'BDM 1', role: 'BDM', dept: 'sales', designation: 'Business Development Manager', reportsTo: 'sales' },
  { id: 'bdm2', name: 'BDM 2', role: 'BDM', dept: 'sales', designation: 'Business Development Manager', reportsTo: 'sales' },
  { id: 'bde1', name: 'BDE 1', role: 'BDE', dept: 'sales', designation: 'Business Development Executive', reportsTo: 'bdm1' },
  { id: 'bde2', name: 'BDE 2', role: 'BDE', dept: 'sales', designation: 'Business Development Executive', reportsTo: 'bdm1' },
  { id: 'bde3', name: 'BDE 3', role: 'BDE', dept: 'sales', designation: 'Business Development Executive', reportsTo: 'bdm2' },
  // Report to Academic Excellence Head
  { id: 'sme1', name: 'SME 1', role: 'SME', dept: 'academics', designation: 'Subject Matter Expert', reportsTo: 'aeh' },
  { id: 'sme2', name: 'SME 2', role: 'SME', dept: 'academics', designation: 'Subject Matter Expert', reportsTo: 'aeh' },
  { id: 'apm', name: 'Academic Program Manager', role: 'Academic Program Manager', dept: 'academics', designation: 'Academic Program Manager', reportsTo: 'aeh' },
  { id: 'apc', name: 'Academic Project Coordinator', role: 'Academic Project Coordinator', dept: 'academics', designation: 'Academic Project Coordinator', reportsTo: 'aeh' },
  // Report to Tech Head
  { id: 'be', name: 'Backend Head', role: 'Backend Head', dept: 'tech', designation: 'Backend Head', reportsTo: 'tech' },
  { id: 'fe', name: 'Frontend Head', role: 'Frontend Head', dept: 'tech', designation: 'Frontend Head', reportsTo: 'tech' },
  { id: 'pl', name: 'Project Lead', role: 'Project Lead', dept: 'tech', designation: 'Project Lead', reportsTo: 'tech' },
];

// username · password → userId (from CREDENTIALS)
const CREDENTIALS = [
  { username: 'ceo', password: 'ceo@123', userId: 'ceo' },
  { username: 'cos', password: 'cos@123', userId: 'cos' },
  { username: 'coursemgr', password: 'cm@123', userId: 'mentor' },
  { username: 'hod78', password: 'hod@123', userId: 'avanya' },
  { username: 'hrhead', password: 'hr@123', userId: 'hr' },
];

async function main() {
  console.log('Seeding departments…');
  for (const d of DEPARTMENTS) {
    await prisma.department.upsert({ where: { id: d.id }, update: d, create: d });
  }

  // Two-pass user insert so the self-referencing reportsTo FK never breaks:
  // pass 1 creates everyone without a manager, pass 2 wires up reportsTo.
  console.log('Seeding users (pass 1: create)…');
  for (const u of USERS) {
    const data = {
      id: u.id, name: u.name, role: u.role, tier: tierOf(u.role),
      designation: u.designation, departmentId: u.dept, status: 'active',
    };
    await prisma.user.upsert({ where: { id: u.id }, update: data, create: data });
  }

  console.log('Seeding users (pass 2: reporting lines)…');
  for (const u of USERS) {
    await prisma.user.update({ where: { id: u.id }, data: { reportsToId: u.reportsTo } });
  }

  console.log('Seeding login credentials (hashed)…');
  for (const c of CREDENTIALS) {
    const passwordHash = await bcrypt.hash(c.password, 10);
    await prisma.authCredential.upsert({
      where: { username: c.username },
      update: { passwordHash, userId: c.userId },
      create: { username: c.username, passwordHash, userId: c.userId },
    });
  }

  await seedAttendance();
  await seedLeave();
  await seedSalary();
  await seedServices();
  await seedEvents();
  await seedLifecycle();
  await seedAdmin();
  await seedKnowledge();
  await seedEngagement();
  await seedAnnouncements();
  await seedMeetings();
  await seedMessages();

  const [userCount, eventCount, onbCount, exitCount, knowCount] = await Promise.all([
    prisma.user.count(), prisma.event.count(), prisma.onboarding.count(), prisma.exit.count(), prisma.knowledgeDoc.count(),
  ]);
  console.log(`Done ✓  ${userCount} users, ${eventCount} events, ${onbCount} onboardings, ${exitCount} exits, ${knowCount} knowledge docs.`);
}

const KNOWLEDGE = [
  { title: 'Results Day — Standard Operating Procedure', type: 'SOP', dept: 'academics', owner: 'mentor', tags: ['results', 'academics', 'sop'], linkEvent: 'SSLC Result',
    body: 'Standard procedure for results day. 1) Mentors collect verified marks by 9 AM. 2) Tech confirms the app ingests the result file and load-tests the upload. 3) Design ships the congratulatory poster set to Media. Escalate blockers to Chief of Staff.',
    attachments: [{ kind: 'pdf', label: 'SSLC results SOP.pdf' }, { kind: 'link', label: 'Mentor result sheet (Drive)' }] },
  { title: 'Exam Timetable Release — Standard Operating Procedure', type: 'SOP', dept: 'academics', owner: 'cos', tags: ['exams', 'timetable', 'sop'],
    body: 'On timetable release: confirm the live-class calendar against the exam dates, lock studio slots, and publish the revision live plan to the app within 24 hours.' },
  { title: 'School Opening — Day Checklist', type: 'SOP', dept: 'ops', owner: 'coo', tags: ['operations', 'opening'],
    body: 'Opening-day runbook: confirm centre readiness, publish creatives to the app and social channels, brief front-desk and counsellors, and verify the student app is live for new batches. Escalate blockers to the Operations Head.' },
  { title: 'Counsellor Call SOP', type: 'SOP', dept: 'sales', owner: 'cra', tags: ['sales', 'cra'],
    body: "Open with the student's context, confirm the exam target, and map the right batch. Log every call outcome the same day. Follow up within 48 hours on warm leads. Escalate fee or scholarship exceptions to the CRA Head." },
  { title: 'Employee Onboarding Guide', type: 'Guide', dept: 'exec', owner: 'cos', tags: ['onboarding', 'hr', 'day-1'],
    body: 'Welcome to the organization. Day 1: collect your ICKU login, review your role duties, and read your department SOPs. Week 1: shadow your reporting manager, complete your profile, and set up your recurring checklist. Your manager confirms probation milestones at 30/60/90 days.' },
  { title: 'Leave & Attendance Policy', type: 'Policy', dept: 'exec', owner: 'cos', tags: ['policy', 'leave', 'hr'],
    body: 'Casual and earned leave accrue monthly. Apply for planned leave at least 3 working days in advance through HR. Unplanned leave must be intimated to your reporting manager before 9 AM. Public exam and results weeks are blackout periods for the academic and mentor teams.' },
  { title: 'Brand & Creative Guidelines', type: 'Guide', dept: 'design', owner: 'design', tags: ['design', 'brand'],
    body: 'Use the brand palette and Fraunces/IBM Plex type system for all public creatives. Result posters follow the approved template; never ship a creative without Design sign-off. Export at 2x for social and keep source files in the shared Design drive.' },
  { title: 'How do I request platform access?', type: 'FAQ', dept: 'tech', owner: 'tech', tags: ['tech', 'faq', 'access'],
    body: 'Raise an access request to the Tech Head with your role and the systems you need. Access is granted per role (RBAC) — you inherit the permissions of your role tier. Access is reviewed when you change roles or exit.' },
  { title: 'Batch Launch Playbook', type: 'Manual', dept: 'product', owner: 'cgo', tags: ['growth', 'launch'],
    body: 'Every batch launch follows the same beats: category manager confirms curriculum and pricing, growth locks the public-live schedule, design ships creatives, media schedules the campaign, and mentors prepare onboarding.' },
  { title: 'Studio & Live Class Setup', type: 'Manual', dept: 'media', owner: 'media', tags: ['media', 'live'],
    body: 'Confirm studio slots against the exam calendar 48 hours ahead. Check audio, lighting and the streaming key before every public live. Keep a backup encoder ready during results and public-exam windows. Publish the recording within 2 hours of wrap.' },
];

async function seedMeetings() {
  if ((await prisma.meeting.count()) > 0) { console.log('Meetings already present — skipping.'); return; }
  console.log('Seeding meetings…');
  const M = [
    { title: 'Weekly Leadership Sync', date: '2026-07-13', time: '10:00', ownerId: 'ceo', recurring: 'Weekly', attendees: ['ceo', 'coo', 'cgo', 'cos'],
      agenda: ['Review overdue institutional events', 'Batch launch readiness', 'Cross-department escalations'],
      minutes: 'Leadership reviewed the results backlog. Tech confirmed platform readiness for the SSLC upload. Growth flagged the Super Batch launch as on track.',
      actions: [{ text: 'Confirm studio slots for public live', ownerId: 'media', done: false }, { text: 'Publish revised revision plan to app', ownerId: 'mentor', done: true }] },
    { title: 'Academics HOD Review', date: '2026-07-14', time: '15:00', ownerId: 'cos', recurring: 'Weekly', attendees: ['cos', 'avanya', 'sadique', 'dhanish', 'haneena', 'suhail'],
      agenda: ['Syllabus completion status', 'Lock Onam exam timetable', 'Result publication SOP walkthrough'],
      minutes: '', actions: [{ text: 'Lock Onam exam timetable', ownerId: 'mentor', done: false }, { text: 'Circulate result SOP to HODs', ownerId: 'cos', done: false }] },
    { title: 'Growth & Launch Standup', date: '2026-07-09', time: '09:30', ownerId: 'cgo', recurring: 'Daily', attendees: ['cgo', 'cmk12', 'cmk10', 'cmcbse', 'media'],
      agenda: ['Super Batch launch', 'Public live schedule', 'Campaign creatives sign-off'],
      minutes: 'Creatives approved by design; media to schedule across channels this week.',
      actions: [{ text: 'Ship poster set to media', ownerId: 'design', done: true }] },
    { title: 'Tech Platform Review', date: '2026-07-08', time: '16:00', ownerId: 'tech', recurring: 'Weekly', attendees: ['tech', 'coo'],
      agenda: ['Result-upload load test', 'App reliability review', 'Release pipeline'],
      minutes: 'Load test passed at 3× expected results-day volume. No blockers for upload readiness.', actions: [] },
  ];
  for (const m of M) {
    await prisma.meeting.create({ data: {
      title: m.title, date: m.date, time: m.time, ownerId: m.ownerId, recurring: m.recurring, agenda: m.agenda, minutes: m.minutes,
      attendees: { create: [...new Set(m.attendees)].map((userId) => ({ userId })) },
      actions: { create: m.actions.map((a, i) => ({ text: a.text, ownerId: a.ownerId, done: a.done, sort: i })) },
    } });
  }
}

async function seedAnnouncements() {
  if ((await prisma.announcement.count()) > 0) { console.log('Announcements already present — skipping.'); return; }
  console.log('Seeding announcements…');
  const DATA = [
    { scope: 'Growth', title: 'Super Batch launch creatives approved', authorId: 'cgo', body: 'Design has signed off the Super Batch creative set. Media to schedule across app, social and YouTube this week ahead of the public live.' },
    { scope: 'Organization', title: 'Results week — all hands on deck', authorId: 'ceo', body: 'SSLC and public results land at the end of the month. Every department has a role in the runbook — check your tasks on Tasks & Events and clear anything overdue by Friday.' },
    { scope: 'Academics', title: 'Onam exam timetable locks Friday', authorId: 'cos', body: 'HODs, please finalise your subject timetables by Thursday EOD. The consolidated Onam exam timetable locks Friday and publishes to the app.' },
    { scope: 'Technology', title: 'Scheduled maintenance this weekend', authorId: 'tech', body: 'The student app has a maintenance window Saturday 1–3 AM. No impact expected to internal ICKU tools. Result-upload load testing completed successfully at 3× volume.' },
    { scope: 'Organization', title: 'ICKU platform now live for all teams', authorId: 'coo', body: 'ICKU is now the single place for our calendar, tasks, SOPs, people and knowledge. Please move your recurring work here and retire the old spreadsheets and WhatsApp threads.' },
  ];
  const users = await prisma.user.findMany({ select: { id: true } });
  for (const d of DATA) {
    const a = await prisma.announcement.create({ data: d });
    // deterministic acks so counts look real
    for (const { id } of users) {
      if (((id.charCodeAt(0) || 65) + id.length + a.title.length) % 3 === 0) {
        await prisma.announcementAck.create({ data: { announcementId: a.id, userId: id } }).catch(() => {});
      }
    }
  }
}

// Deterministic birthday/joinedOn per user + kudos + a poll with votes.
async function seedEngagement() {
  console.log('Seeding engagement (birthdays, kudos, poll)…');
  // Force a few into the current demo month (July) so the cards have content.
  const FORCED = {
    mentor: { birthday: '07-12' }, ceo: { birthday: '07-20' }, hr: { birthday: '07-03' },
    avanya: { joinedOn: '2022-07-05' }, media: { joinedOn: '2023-07-18' }, coo: { joinedOn: '2021-07-28' },
  };
  const users = await prisma.user.findMany({ select: { id: true } });
  for (const { id } of users) {
    const h = (id.charCodeAt(0) || 65) + id.length * 3;
    const bm = (h % 12) + 1, bd = ((h * 7) % 28) + 1;
    const jm = ((h * 5) % 12) + 1, jd = ((h * 3) % 28) + 1, jyAgo = (h % 6) + 1;
    const birthday = FORCED[id]?.birthday || `${String(bm).padStart(2, '0')}-${String(bd).padStart(2, '0')}`;
    const joinedOn = FORCED[id]?.joinedOn || `${2026 - jyAgo}-${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}`;
    await prisma.user.update({ where: { id }, data: { birthday, joinedOn } });
  }

  if ((await prisma.kudos.count()) === 0) {
    await prisma.kudos.createMany({ data: [
      { fromId: 'ceo', toId: 'mentor', message: 'Fantastic coordination on results day — mentors were fully prepped.' },
      { fromId: 'cos', toId: 'media', message: 'Studio setup was flawless this week. Zero downtime.' },
      { fromId: 'avanya', toId: 'tech', message: 'The result-upload load test gave everyone confidence. Thank you!' },
    ] });
  }

  if ((await prisma.poll.count()) === 0) {
    const poll = await prisma.poll.create({ data: {
      question: 'Preferred slot for the monthly town hall?',
      options: { create: [
        { label: 'Friday 4 PM', sort: 1 },
        { label: 'Monday 10 AM', sort: 2 },
        { label: 'Wednesday 6 PM', sort: 3 },
      ] },
    }, include: { options: true } });
    // seed ~half the org's votes, distributed deterministically
    const opts = poll.options;
    for (const { id } of users) {
      const h = (id.charCodeAt(0) || 65) + id.length;
      if (h % 2 !== 0) continue;
      await prisma.pollVote.create({ data: { pollId: poll.id, userId: id, optionId: opts[h % 3].id } }).catch(() => {});
    }
  }
}

async function seedKnowledge() {
  if ((await prisma.knowledgeDoc.count()) > 0) { console.log('Knowledge docs already present — skipping.'); return; }
  console.log('Seeding knowledge docs…');
  const sslc = await prisma.event.findFirst({ where: { name: 'SSLC Result' }, select: { id: true } });
  for (const k of KNOWLEDGE) {
    await prisma.knowledgeDoc.create({ data: {
      title: k.title, type: k.type, departmentId: k.dept, ownerId: k.owner,
      body: k.body, tags: k.tags, attachments: k.attachments || undefined,
      eventId: k.linkEvent === 'SSLC Result' ? sslc?.id || null : null,
    } });
  }
}

// HR lifecycle (Step 8) — onboardings + one exit. Guarded so real data isn't wiped.
async function seedLifecycle() {
  if ((await prisma.onboarding.count()) === 0) {
    console.log('Seeding onboardings…');
    await prisma.onboarding.createMany({ data: [
      { name: 'Priya Menon', designation: 'Faculty — Physics', departmentId: 'academics', joinDate: '2026-07-18', offer: 'Accepted',
        done: ['Offer accepted', 'Documents uploaded', 'Joining forms signed', 'Welcome email sent', 'Laptop allocated', 'ID card issued'] },
      { name: 'Rahul Nair', designation: 'Backend Engineer', departmentId: 'tech', joinDate: '2026-07-20', offer: 'Accepted',
        done: ['Offer accepted', 'Documents uploaded'] },
      { name: 'Sneha Raj', designation: 'BDE — Sales', departmentId: 'sales', joinDate: '2026-08-01', offer: 'Sent', done: [] },
    ] });
  }
  if ((await prisma.exit.count()) === 0) {
    console.log('Seeding exit…');
    await prisma.exit.create({ data: {
      userId: 'suhail', submitted: '2026-06-20', lastDay: '2026-08-05', reason: 'Higher studies abroad',
      exitInterview: false, clearance: ['Manager', 'IT / Assets'],
    } });
  }
}

const SETTINGS = [
  // Approval workflows
  { category: 'workflow', key: 'wf_leave', label: 'Leave approval', chain: 'Employee → Reporting manager', enabled: true, sort: 1 },
  { category: 'workflow', key: 'wf_expense', label: 'Expense reimbursement', chain: 'Employee → Manager → Finance → Payment', enabled: true, sort: 2 },
  { category: 'workflow', key: 'wf_regular', label: 'Attendance regularization', chain: 'Employee → Reporting manager', enabled: true, sort: 3 },
  { category: 'workflow', key: 'wf_event', label: 'Event creation', chain: 'Creator → Reporting manager', enabled: true, sort: 4 },
  { category: 'workflow', key: 'wf_exit', label: 'Resignation clearance', chain: 'Manager → IT → Finance → HR', enabled: true, sort: 5 },
  // Integrations
  { category: 'integration', key: 'int_bio', label: 'Biometric devices', description: 'Attendance punch sync', enabled: true, sort: 1 },
  { category: 'integration', key: 'int_acct', label: 'Accounting software', description: 'Payroll journal export', enabled: false, sort: 2 },
  { category: 'integration', key: 'int_sso', label: 'SSO / Identity provider', description: 'Single sign-on', enabled: false, sort: 3 },
  { category: 'integration', key: 'int_email', label: 'Email platform', description: 'Notifications & digests', enabled: true, sort: 4 },
  { category: 'integration', key: 'int_bank', label: 'Payroll & banking', description: 'Salary disbursement', enabled: false, sort: 5 },
  // Feature flags
  { category: 'flag', key: 'flag_ai', label: 'AI Copilot', description: 'Assistant across all modules', enabled: false, sort: 1 },
  { category: 'flag', key: 'flag_wa', label: 'WhatsApp notifications', description: 'Outbound reminders via WhatsApp', enabled: false, sort: 2 },
  { category: 'flag', key: 'flag_audit', label: 'Audit logging', description: 'Track all admin actions', enabled: true, sort: 3 },
];

async function seedAdmin() {
  // RBAC matrix from the default TIER_CAPS
  if ((await prisma.tierCapability.count()) === 0) {
    console.log('Seeding RBAC matrix…');
    const rows = [];
    for (const [tier, caps] of Object.entries(TIER_CAPS)) for (const capability of caps) rows.push({ tier, capability });
    await prisma.tierCapability.createMany({ data: rows });
  }
  // System settings
  for (const s of SETTINGS) {
    await prisma.setting.upsert({ where: { key: s.key }, update: {}, create: s });
  }
}

const SOP_RESULT = 'Standard procedure for results day. 1) Mentors collect verified marks by 9 AM. 2) Tech confirms the app ingests the result file and load-tests the upload. 3) Design ships the congratulatory poster set to Media. Escalate blockers to Chief of Staff.';
const SOP_TIMETABLE = 'On timetable release: confirm the live-class calendar against the exam dates, lock studio slots, and publish the revision live plan to the app within 24 hours.';

const resultTasks = (done = [false, false, false]) => [
  { name: 'SOP to collect result for mentors', assignees: ['mentor'], dueOffset: 5, completed: done[0] },
  { name: 'Platform readiness to upload result for students', assignees: ['tech'], dueOffset: 5, completed: done[1] },
  { name: 'Poster template to advertise results', assignees: ['design'], dueOffset: 5, completed: done[2] },
];

// Events covering every lifecycle state (real today = mid-2026, academic year 2026-27).
const EVENTS = [
  { name: 'SSLC Result', owner: 'offdir', status: 'confirmed', m: 4, d: 30, writeup: SOP_RESULT, tasks: resultTasks([true, true, false]),
    attachments: [{ kind: 'pdf', label: 'SSLC results SOP.pdf' }, { kind: 'link', label: 'Mentor result sheet (Drive)', url: 'https://drive.google.com' }] },
  { name: 'P1 Result', owner: 'avanya', status: 'confirmed', m: 4, d: 30, writeup: SOP_RESULT, tasks: resultTasks([true, true, true]) },
  { name: 'P2 Result', owner: 'mentor', status: 'confirmed', m: 4, d: 30, writeup: SOP_RESULT, tasks: resultTasks([false, false, false]) },
  { name: 'NEET Result', owner: 'mentor', status: 'confirmed', m: 5, d: 30, writeup: SOP_RESULT, tasks: resultTasks([true, false, false]) },
  { name: 'Onam Exam Timetable Out', owner: 'mentor', status: 'tbd', writeup: SOP_TIMETABLE,
    tasks: [{ name: 'YouTube Live plan', assignees: ['media'] }, { name: 'Lock studio slots', assignees: ['studio'] }] },
  { name: 'School Opening', owner: 'coo', status: 'confirmed', m: 5, d: 30,
    tasks: [{ name: 'Creatives to post in app and social media', assignees: ['design'], dueOffset: 0, completed: true }] },
  { name: 'Mid-term Prep Review', owner: 'mentor', status: 'confirmed', m: 7, d: 5,
    tasks: [{ name: 'Compile prep report', assignees: ['mentor'], dueOffset: 10 }, { name: 'Share with faculty', assignees: ['fac78'], dueOffset: 10 }] },
  { name: 'Onam Exam Start', owner: 'ajith', status: 'confirmed', m: 7, d: 30, tasks: [] },
  { name: 'Public Exam Start', owner: 'avanya', status: 'confirmed', m: 2, d: 15, tasks: [] },
  { name: 'ESAT Exam', owner: 'cos', status: 'multiple', tasks: [] },
  { name: 'Offline Admissions', owner: 'cos', status: 'multiple', tasks: [] },
  { name: 'Super Batch Launch', owner: 'cgo', status: 'confirmed', m: 4, d: 1, tasks: [] },
  { name: 'Extra Doubt Class Drive', owner: 'mentor', status: 'confirmed', m: 7, d: 20, approval: 'pending', approver: 'avanya',
    tasks: [{ name: 'Plan schedule', assignees: ['mentor'], dueOffset: 3 }] },
];

async function seedEvents() {
  if ((await prisma.event.count()) > 0) { console.log('Events already present — skipping.'); return; }
  console.log('Seeding events & tasks…');
  for (const e of EVENTS) {
    await prisma.event.create({ data: {
      name: e.name, ownerId: e.owner, status: e.status,
      triggerMonth: e.status === 'confirmed' ? e.m : null,
      triggerDay: e.status === 'confirmed' ? e.d : null,
      writeup: e.writeup || '',
      approval: e.approval || 'approved',
      approverId: e.approver || null,
      createdById: e.owner,
      tasks: { create: (e.tasks || []).map((t, i) => ({
        name: t.name, dueOffset: t.dueOffset ?? null, completed: !!t.completed, sort: i,
        assignees: { create: (t.assignees || []).map((uid) => ({ userId: uid })) },
      })) },
      attachments: e.attachments ? { create: e.attachments.map((a) => ({ kind: a.kind, label: a.label, url: a.url || null })) } : undefined,
    } });
  }
}

// Services (Step 6) — expenses, assets, tickets. Each guarded by count so real data isn't wiped.
async function seedServices() {
  if ((await prisma.expense.count()) === 0) {
    console.log('Seeding expenses…');
    await prisma.expense.createMany({ data: [
      { userId: 'mentor', category: 'Travel', amount: 4200, date: '2026-06-03', description: 'Client visit — cab + train', status: 'finance' },
      { userId: 'mentor', category: 'Food', amount: 850, date: '2026-06-07', description: 'Team lunch', status: 'paid' },
      { userId: 'avanya', category: 'Office purchase', amount: 2500, date: '2026-06-09', description: 'Whiteboard markers & stationery', status: 'manager' },
      { userId: 'media', category: 'Accommodation', amount: 6800, date: '2026-06-11', description: 'Shoot travel — 1 night stay', status: 'payment' },
      { userId: 'de78', category: 'Fuel', amount: 1200, date: '2026-07-05', description: 'Field data collection travel', status: 'manager' },
    ] });
  }
  if ((await prisma.asset.count()) === 0) {
    console.log('Seeding assets…');
    await prisma.asset.createMany({ data: [
      { type: 'Laptop', tag: 'LP-2041', assignedToId: 'mentor', assignedDate: '2026-01-10', condition: 'Good', warranty: 'Jan 2027' },
      { type: 'Mobile', tag: 'MB-118', assignedToId: 'cos', assignedDate: '2025-11-05', condition: 'Good', warranty: 'Nov 2026' },
      { type: 'Monitor', tag: 'MN-330', assignedToId: 'avanya', assignedDate: '2026-02-02', condition: 'Fair', warranty: 'Feb 2028' },
      { type: 'Access Card', tag: 'AC-902', assignedToId: 'mentor', assignedDate: '2026-01-10', condition: 'Good', warranty: '—' },
      { type: 'Laptop', tag: 'LP-2042', condition: 'Good', warranty: 'Mar 2028' },
      { type: 'Keyboard', tag: 'KB-77', assignedToId: 'media', assignedDate: '2026-03-01', condition: 'Good', warranty: '—' },
    ] });
  }
  if ((await prisma.ticket.count()) === 0) {
    console.log('Seeding tickets…');
    await prisma.ticket.createMany({ data: [
      { userId: 'mentor', category: 'Payroll issue', subject: 'TDS higher than expected this month', status: 'assigned', assigneeId: 'hr', raised: '2026-07-06' },
      { userId: 'avanya', category: 'Access request', subject: 'Need access to the analytics dashboard', status: 'open', raised: '2026-07-09' },
      { userId: 'media', category: 'IT support', subject: "Laptop won't connect to studio wifi", status: 'resolved', assigneeId: 'tech', raised: '2026-07-04' },
      { userId: 'de78', category: 'IT support', subject: 'Need a second monitor', status: 'open', raised: '2026-07-08' },
    ] });
  }
}

// Base compensation per user (deterministic by tier). Idempotent upsert.
async function seedSalary() {
  console.log('Seeding salaries…');
  for (const u of USERS) {
    const tier = tierOf(u.role);
    const monthlyGross = monthlyGrossFor(tier, u.id);
    await prisma.salary.upsert({
      where: { userId: u.id },
      update: { monthlyGross },
      create: { userId: u.id, monthlyGross },
    });
  }
}

// Leave types + a handful of sample requests (guarded so real requests aren't wiped).
const LEAVE_SEED = [
  { who: 'mentor', type: 'casual', from: '2026-06-02', to: '2026-06-02', half: false, reason: 'Personal work', status: 'approved' },
  { who: 'mentor', type: 'sick', from: '2026-06-20', to: '2026-06-21', half: false, reason: 'Fever', status: 'pending' },
  { who: 'avanya', type: 'earned', from: '2026-07-15', to: '2026-07-17', half: false, reason: 'Family function', status: 'pending' },
  { who: 'cos', type: 'casual', from: '2026-06-15', to: '2026-06-15', half: true, reason: 'Bank work', status: 'approved' },
  { who: 'media', type: 'earned', from: '2026-07-03', to: '2026-07-06', half: false, reason: 'Vacation', status: 'pending' },
  { who: 'offdir', type: 'sick', from: '2026-06-09', to: '2026-06-09', half: false, reason: 'Not well', status: 'approved' },
  { who: 'ceo', type: 'earned', from: '2026-05-11', to: '2026-05-13', half: false, reason: 'Offsite recovery', status: 'approved' },
  { who: 'ceo', type: 'casual', from: '2026-06-05', to: '2026-06-05', half: false, reason: 'Personal', status: 'approved' },
  { who: 'hr', type: 'sick', from: '2026-06-12', to: '2026-06-12', half: false, reason: 'Not well', status: 'approved' },
  { who: 'de78', type: 'casual', from: '2026-07-08', to: '2026-07-08', half: false, reason: 'Personal', status: 'pending' },
];

async function seedLeave() {
  console.log('Seeding leave types…');
  for (const t of LEAVE_TYPES) {
    await prisma.leaveType.upsert({ where: { id: t.id }, update: t, create: t });
  }
  const existing = await prisma.leaveRequest.count();
  if (existing > 0) { console.log('Leave requests already present — skipping sample requests.'); return; }
  console.log('Seeding sample leave requests…');
  const rows = LEAVE_SEED.map((l) => ({
    userId: l.who, typeId: l.type, fromDate: l.from, toDate: l.half ? l.from : l.to,
    days: leaveDays(l.from, l.half ? l.from : l.to, l.half), half: l.half, reason: l.reason, status: l.status,
  }));
  await prisma.leaveRequest.createMany({ data: rows });
}

// Generate deterministic attendance history for the last 60 days (past days only —
// today is left empty so real check-ins aren't overwritten). Idempotent via skipDuplicates.
async function seedAttendance() {
  console.log('Seeding attendance history (last 60 days)…');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rows = [];
  for (let back = 1; back <= 60; back++) {
    const date = new Date(today);
    date.setDate(today.getDate() - back);
    const dateStr = ymd(date);
    for (const u of USERS) {
      const gen = seedDay(u.id, date);
      if (!gen) continue; // weekly off / holiday → no row
      rows.push({ userId: u.id, date: dateStr, ...gen });
    }
  }
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await prisma.attendanceRecord.createMany({ data: rows.slice(i, i + CHUNK), skipDuplicates: true });
  }
}

// Messages (Stage 1) — a couple of demo groups + one DM so the screen isn't empty.
// Robust to missing users: only seeds members that actually exist. Idempotent
// via a conversation-count guard.
async function seedMessages() {
  const existing = await prisma.conversation.count();
  if (existing > 0) { console.log('Conversations already present — skipping message seed.'); return; }
  console.log('Seeding messages (groups + DM)…');

  const pick = async (ids) => {
    const found = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true } });
    const order = new Map(ids.map((id, i) => [id, i]));
    return found.map((u) => u.id).sort((a, b) => order.get(a) - order.get(b));
  };

  // "General" — everyone-ish
  const generalIds = await pick(['ceo', 'cos', 'avanya', 'mentor', 'hr', 'de78']);
  if (generalIds.length >= 2) {
    const owner = generalIds[0];
    const general = await prisma.conversation.create({
      data: {
        type: 'group', name: 'General', createdById: owner,
        members: { create: generalIds.map((id) => ({ userId: id, role: id === owner ? 'owner' : 'member' })) },
      },
    });
    const m1 = await prisma.message.create({ data: { conversationId: general.id, authorId: owner, body: 'Welcome to ICKU Messages, everyone! 👋' } });
    await prisma.message.create({ data: { conversationId: general.id, authorId: generalIds[1], body: 'Great to have this — no more scattered chats.' } });
    if (generalIds[2]) await prisma.message.create({ data: { conversationId: general.id, authorId: generalIds[2], parentId: m1.id, body: 'Love it. Can we pin announcements here too?' } });
  }

  // Academics · Class 7-8
  const acadIds = await pick(['avanya', 'mentor', 'cmm78', 'fac78', 'de78']);
  if (acadIds.length >= 2) {
    const owner = acadIds[0];
    const acad = await prisma.conversation.create({
      data: {
        type: 'group', name: 'Academics · Class 7-8', createdById: owner,
        members: { create: acadIds.map((id) => ({ userId: id, role: id === owner ? 'owner' : 'member' })) },
      },
    });
    await prisma.message.create({ data: { conversationId: acad.id, authorId: owner, body: 'Mid-term prep review is due next week — let’s align on the plan.' } });
  }

  // A 1:1 DM
  const dmIds = await pick(['ceo', 'mentor']);
  if (dmIds.length === 2) {
    const dm = await prisma.conversation.create({
      data: { type: 'dm', createdById: dmIds[0], members: { create: dmIds.map((id) => ({ userId: id })) } },
    });
    await prisma.message.create({ data: { conversationId: dm.id, authorId: dmIds[0], body: 'Hi — can you share the results-day summary?' } });
    await prisma.message.create({ data: { conversationId: dm.id, authorId: dmIds[1], body: 'Sure, sending it over shortly.' } });
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
