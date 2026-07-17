// =====================================================================
// CKH School Portal — Supabase-backed data layer
// This replaces the old localStorage version. Function names match the
// original wherever possible so pages barely change — every one of them
// is now ASYNC, so every call site needs `await` (and its enclosing
// function needs to be `async`).
// =====================================================================

// Table names (kept as DB_KEYS so `DB_KEYS.COURSES` etc. still works)
const DB_KEYS = {
  COURSES: 'courses',
  ROSTER: 'roster',
  ANNOUNCEMENTS: 'announcements',
  ASSIGNMENTS: 'assignments',
  SUBMISSIONS: 'submissions',
  GRADES: 'grades',
  GRADEBOOK: 'gradebook',
  LESSON_PLANS: 'lesson_plans',
  QUIZZES: 'quizzes',
  QUESTION_BANK: 'question_bank',
  ATTENDANCE_LOG: 'attendance_log',
  ATTENDANCE: 'attendance',
  PROGRAMMES: 'programmes',
  ADMISSIONS: 'admissions',
  CERT_COURSES: 'cert_courses',
  TEACHER_APPLICATIONS: 'teacher_applications'
};

// Tables whose primary key is a human-readable reference code (e.g.
// "ADM-4821") rather than a database-generated UUID.
const TEXT_ID_TABLES = new Set(['admissions', 'teacher_applications']);

// ---------------------------------------------------------------------
// camelCase <-> snake_case helpers, so pages can keep reading/writing
// dueDate / submittedAt / adminNote / programmeId etc. unchanged while
// Postgres columns stay snake_case.
// ---------------------------------------------------------------------
function camelToSnake(s) {
  return s.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
}
function snakeToCamel(s) {
  return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}
function rowToCamel(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const k in row) out[snakeToCamel(k)] = row[k];
  return out;
}
function rowToSnake(obj) {
  const out = {};
  for (const k in obj) {
    if (obj[k] === undefined) continue;
    out[k === 'id' ? 'id' : camelToSnake(k)] = obj[k];
  }
  return out;
}

// =====================================================================
// Generic table helpers (replace the old getDB/setDB/addToList/
// updateInList/removeFromList localStorage helpers)
// =====================================================================

// Fetch every row of a table (RLS decides what you're actually allowed
// to see). `attendance` is a special case: it's a single overview row,
// so this returns that object directly instead of an array.
async function getDB(table) {
  const { data, error } = await sb.from(table).select('*');
  if (error) {
    console.error('getDB error:', table, error.message);
    return table === 'attendance' ? null : [];
  }
  const rows = (data || []).map(rowToCamel);
  return table === 'attendance' ? (rows[0] || null) : rows;
}

// Insert a new row. Any client-side `id` is dropped for DB-generated-UUID
// tables (Postgres assigns the real id) but kept for reference-code
// tables like admissions/teacher_applications. Returns the inserted row
// (with its real id) or null on failure.
async function addToList(table, item) {
  const payload = rowToSnake(item);
  if (!TEXT_ID_TABLES.has(table)) delete payload.id;
  const { data, error } = await sb.from(table).insert(payload).select().single();
  if (error) {
    console.error('addToList error:', table, error.message);
    return null;
  }
  return rowToCamel(data);
}

// Same shape as the old localStorage helper: find the first row matching
// a JS predicate, then update it. (Fetches the table, applies the
// predicate client-side, then issues a targeted update by id — so every
// existing `updateInList(KEY, r => r.id === x, {...})` call site keeps
// working unchanged other than adding `await`.)
async function updateInList(table, matchFn, updates) {
  const rows = await getDB(table);
  const match = rows.find(matchFn);
  if (!match) return null;
  const { data, error } = await sb.from(table).update(rowToSnake(updates)).eq('id', match.id).select().single();
  if (error) {
    console.error('updateInList error:', table, error.message);
    return null;
  }
  return rowToCamel(data);
}

async function removeFromList(table, matchFn) {
  const rows = await getDB(table);
  const toRemove = rows.filter(matchFn);
  for (const r of toRemove) {
    const { error } = await sb.from(table).delete().eq('id', r.id);
    if (error) console.error('removeFromList error:', table, error.message);
  }
  return rows.filter(r => !toRemove.includes(r));
}

// =====================================================================
// Auth / current user
// =====================================================================

// Returns the logged-in user's profile (role, name, email, phone, grade,
// curriculum, subjects) or null if nobody is signed in.
async function getCurrentUser() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data: profile, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  if (error || !profile) return null;
  return rowToCamel(profile);
}

// Signs in with email + password and returns the profile on success, or
// null on failure — same shape as the old `getUser(email, password)`.
async function getUser(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.user) return null;
  return await getCurrentUser();
}

async function logout() {
  await sb.auth.signOut();
}

// Update the CURRENT user's own profile (e.g. a teacher adding a subject
// when they create a course). Admin-privileged changes to OTHER users
// (creating/resetting/removing teacher accounts) go through the Edge
// Function further down, since those need the service-role key.
async function updateMyProfile(updates) {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await sb.from('profiles').update(rowToSnake(updates)).eq('id', user.id).select().single();
  if (error) {
    console.error('updateMyProfile error:', error.message);
    return null;
  }
  return rowToCamel(data);
}

async function getAllTeachers() {
  const { data, error } = await sb.from('profiles').select('*').eq('role', 'teacher');
  if (error) {
    console.error('getAllTeachers error:', error.message);
    return [];
  }
  return data.map(rowToCamel);
}

async function getAllStudents() {
  const { data, error } = await sb.from('profiles').select('*').eq('role', 'student');
  if (error) {
    console.error('getAllStudents error:', error.message);
    return [];
  }
  return data.map(rowToCamel);
}

// ---------------------------------------------------------------------
// A prospective STUDENT creates their own portal account (their own
// password — unlike teachers, admins never generate a password for
// students) at the same time as submitting their admission application,
// so they can sign back in any time to follow up on its status.
// ---------------------------------------------------------------------
async function studentSignUpAndApply({ name, email, phone, password, programmeId, level, notes }) {
  const { data: signUpData, error: signUpError } = await sb.auth.signUp({
    email,
    password,
    options: { data: { role: 'student', name, phone } }
  });
  if (signUpError) {
    return { success: false, message: signUpError.message };
  }

  const programmes = await getOpenProgrammes();
  const programme = programmes.find(p => p.id === programmeId);
  const reference = generateAdmissionRef();

  const application = {
    id: reference,
    name,
    email,
    phone,
    programmeId: programmeId || null,
    programmeName: programme ? programme.name : 'Not specified',
    curriculum: programme ? programme.curriculum : '',
    level: level || (programme ? programme.level : ''),
    notes: notes || '',
    status: 'pending',
    studentId: signUpData.user ? signUpData.user.id : null
  };

  const { data, error } = await sb.from('admissions').insert(rowToSnake(application)).select().single();
  if (error) {
    return { success: false, message: error.message };
  }

  // If your Supabase project requires email confirmation, there's no
  // session yet at this point. Try a normal sign-in so "sign in to follow
  // up on your application" works immediately after applying. If email
  // confirmation is required this quietly fails and they'll confirm their
  // email first — that's fine, it's a normal Supabase Auth flow.
  if (!signUpData.session) {
    await sb.auth.signInWithPassword({ email, password }).catch(() => {});
  }

  return { success: true, application: rowToCamel(data) };
}

// =====================================================================
// Small pure helpers (unchanged from the original)
// =====================================================================

// Generate a readable random password, e.g. "Ckh-4821"
function generateTempPassword() {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `Ckh-${num}`;
}

// Normalize a phone number for wa.me links (digits only, keep leading country code)
function normalizePhoneForWhatsApp(phone) {
  return (phone || '').replace(/[^\d]/g, '');
}

// Build a wa.me link pre-filled with the teacher's login credentials
function buildWhatsAppCredentialsLink(teacher, password) {
  const phoneDigits = normalizePhoneForWhatsApp(teacher.phone);
  const message =
    `Hello ${teacher.name}, welcome to CKH International School.\n\n` +
    `Your Teacher Portal account has been created.\n` +
    `Login email: ${teacher.email}\n` +
    `Temporary password: ${password}\n\n` +
    `Please sign in at the school portal and change your password after your first login.`;
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
}

// Generate a short, human-friendly admission reference, e.g. "ADM-4821"
function generateAdmissionRef() {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `ADM-${num}`;
}

// Generate a short, human-friendly job application reference, e.g. "JOB-4821"
function generateJobApplicationRef() {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `JOB-${num}`;
}

// =====================================================================
// Teacher accounts — PRIVILEGED. Only an admin, generating a temporary
// password, can create/reset/remove a teacher's login. This can't be
// done with the public anon key (creating an auth user needs the
// service-role key), so it goes through the `manage-teacher-account`
// Edge Function, which checks the caller is an admin before doing
// anything. See supabase/functions/manage-teacher-account/index.ts.
// =====================================================================

async function createTeacherAccount({ name, email, phone, subjects }) {
  const { data, error } = await sb.functions.invoke('manage-teacher-account', {
    body: { action: 'create', name, email, phone, subjects }
  });
  if (error) return { success: false, message: error.message || 'Could not create the account.' };
  if (!data || !data.success) return { success: false, message: (data && data.message) || 'Could not create the account.' };
  const whatsappLink = buildWhatsAppCredentialsLink(data.teacher, data.tempPassword);
  return { success: true, user: data.teacher, tempPassword: data.tempPassword, whatsappLink };
}

async function resetTeacherPassword(teacherId) {
  const { data, error } = await sb.functions.invoke('manage-teacher-account', {
    body: { action: 'reset_password', teacherId }
  });
  if (error) return { success: false, message: error.message || 'Could not reset the password.' };
  if (!data || !data.success) return { success: false, message: (data && data.message) || 'Could not reset the password.' };
  const whatsappLink = buildWhatsAppCredentialsLink(data.teacher, data.tempPassword);
  return { success: true, user: data.teacher, tempPassword: data.tempPassword, whatsappLink };
}

async function removeTeacherAccount(teacherId) {
  const { data, error } = await sb.functions.invoke('manage-teacher-account', {
    body: { action: 'remove', teacherId }
  });
  if (error) return { success: false, message: error.message || 'Could not remove the account.' };
  return data || { success: true };
}

// ---------------------------------------------------------------------
// Admissions: programmes on offer + admission applications
// ---------------------------------------------------------------------
async function getProgrammes() {
  return await getDB('programmes');
}
async function getOpenProgrammes() {
  return (await getProgrammes()).filter(p => p.status !== 'closed');
}
async function getAdmissionApplications() {
  return await getDB('admissions');
}

async function approveAdmissionApplication(applicationId) {
  const { data: application, error: fetchErr } = await sb.from('admissions').select('*').eq('id', applicationId).single();
  if (fetchErr || !application) return { success: false, message: 'Application not found' };
  if (application.status === 'approved') return { success: false, message: 'This application has already been approved' };

  // Fill in the student's grade/curriculum now that they're accepted
  // (their account already exists — they self-registered when applying).
  if (application.student_id) {
    await sb.from('profiles').update({ grade: application.level, curriculum: application.curriculum }).eq('id', application.student_id);
  }

  // Decrement the programme's vacancy count, if tracked and available.
  if (application.programme_id) {
    const { data: programme } = await sb.from('programmes').select('*').eq('id', application.programme_id).single();
    if (programme && typeof programme.vacancies === 'number' && programme.vacancies > 0) {
      await sb.from('programmes').update({ vacancies: programme.vacancies - 1 }).eq('id', programme.id);
    }
  }

  const { data: updated, error } = await sb.from('admissions')
    .update({ status: 'approved', reviewed_at: new Date().toISOString() })
    .eq('id', applicationId).select().single();
  if (error) return { success: false, message: error.message };

  return { success: true, application: rowToCamel(updated) };
}

async function rejectAdmissionApplication(applicationId, reason) {
  const { data, error } = await sb.from('admissions')
    .update({ status: 'rejected', admin_note: reason || '', reviewed_at: new Date().toISOString() })
    .eq('id', applicationId).select().single();
  if (error) return { success: false, message: error.message };
  return { success: true, application: rowToCamel(data) };
}

async function requestMoreDocsForApplication(applicationId, note) {
  const { data, error } = await sb.from('admissions')
    .update({ status: 'more_info', admin_note: note || '', reviewed_at: new Date().toISOString() })
    .eq('id', applicationId).select().single();
  if (error) return { success: false, message: error.message };
  return { success: true, application: rowToCamel(data) };
}

// Look up whatever admission application(s) belong to the given email —
// used on the student side to show "your application is still pending".
async function getMyAdmissionApplications(email) {
  const { data, error } = await sb.from('admissions').select('*').eq('email', email);
  if (error) { console.error(error); return []; }
  return data.map(rowToCamel);
}

// ---------------------------------------------------------------------
// Teacher job applications: certificate courses + applications from
// prospective teachers wanting to teach one of those courses.
// ---------------------------------------------------------------------
async function getCertCourses() {
  return await getDB('cert_courses');
}
async function getOpenCertCourses() {
  return (await getCertCourses()).filter(c => c.status !== 'closed');
}

async function submitTeacherApplication({ name, email, phone, certCourseId, qualifications, notes }) {
  const certCourses = await getCertCourses();
  const certCourse = certCourses.find(c => c.id === certCourseId);
  const application = {
    id: generateJobApplicationRef(),
    name,
    email,
    phone,
    certCourseId: certCourseId || null,
    certCourseName: certCourse ? certCourse.name : 'Not specified',
    curriculum: certCourse ? certCourse.curriculum : '',
    qualifications: qualifications || '',
    notes: notes || '',
    status: 'pending'
  };
  const { data, error } = await sb.from('teacher_applications').insert(rowToSnake(application)).select().single();
  if (error) { console.error(error); return application; }
  return rowToCamel(data);
}

async function getTeacherApplications() {
  return await getDB('teacher_applications');
}

// Admin approves a teaching job application: creates the real teacher
// portal account (via the Edge Function, with a generated temp password)
// with the applied-for course as their subject.
async function approveTeacherApplication(applicationId) {
  const { data: application, error: fetchErr } = await sb.from('teacher_applications').select('*').eq('id', applicationId).single();
  if (fetchErr || !application) return { success: false, message: 'Application not found' };
  if (application.status === 'approved') return { success: false, message: 'This application has already been approved' };

  const result = await createTeacherAccount({
    name: application.name,
    email: application.email,
    phone: application.phone,
    subjects: application.cert_course_name ? [application.cert_course_name] : []
  });
  if (!result.success) return result;

  await sb.from('teacher_applications')
    .update({ status: 'approved', reviewed_at: new Date().toISOString() })
    .eq('id', applicationId);

  return result;
}

async function rejectTeacherApplication(applicationId, reason) {
  const { data, error } = await sb.from('teacher_applications')
    .update({ status: 'rejected', admin_note: reason || '', reviewed_at: new Date().toISOString() })
    .eq('id', applicationId).select().single();
  if (error) return { success: false, message: error.message };
  return { success: true, application: rowToCamel(data) };
}

async function requestMoreInfoForTeacherApplication(applicationId, note) {
  const { data, error } = await sb.from('teacher_applications')
    .update({ status: 'more_info', admin_note: note || '', reviewed_at: new Date().toISOString() })
    .eq('id', applicationId).select().single();
  if (error) return { success: false, message: error.message };
  return { success: true, application: rowToCamel(data) };
}
