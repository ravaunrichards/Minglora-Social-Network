export const JOB_EMPLOYMENT_TYPES = Object.freeze(['full_time','part_time','contract','temporary','internship','freelance']);
export const JOB_WORKPLACE_TYPES = Object.freeze(['onsite','hybrid','remote']);
export const JOB_CATEGORIES = Object.freeze(['technology','administration','customer_service','sales_marketing','finance','healthcare','education','construction_trades','transport_logistics','hospitality','creative_media','other']);
const clean = (value, max) => String(value ?? '').trim().slice(0, max);
const CURRENCIES = new Set(['JMD','USD','CAD','GBP','EUR','TTD','BBD','GYD']);
function parseMoney(value) {
  const raw = String(value).trim();
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(raw)) return null;
  const parts = raw.split('.');
  const result = Number(parts[0]) * 100 + Number((parts[1] || '').padEnd(2, '0'));
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}
export function validateJobPostingInput(input = {}, now = new Date()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { valid: false, error: 'Job details must be an object.' };
  const title = clean(input.title, 120), companyName = clean(input.companyName, 120);
  const description = clean(input.description, 6000), category = String(input.category || '');
  const employmentType = String(input.employmentType || ''), workplaceType = String(input.workplaceType || '');
  const location = clean(input.location, 160), applicationDeadline = new Date(input.applicationDeadline);
  if (title.length < 5) return { valid: false, error: 'Job title must contain at least 5 characters.' };
  if (companyName.length < 2) return { valid: false, error: 'Enter the employer or company name.' };
  if (description.length < 50) return { valid: false, error: 'Job description must contain at least 50 characters.' };
  if (!JOB_CATEGORIES.includes(category)) return { valid: false, error: 'Choose a valid job category.' };
  if (!JOB_EMPLOYMENT_TYPES.includes(employmentType)) return { valid: false, error: 'Choose a valid employment type.' };
  if (!JOB_WORKPLACE_TYPES.includes(workplaceType)) return { valid: false, error: 'Choose onsite, hybrid or remote.' };
  if (workplaceType !== 'remote' && location.length < 2) return { valid: false, error: 'Enter the job location.' };
  if (!Number.isFinite(applicationDeadline.getTime()) || applicationDeadline.getTime() <= now.getTime()) return { valid: false, error: 'Application deadline must be in the future.' };
  const currency = String(input.currency || 'JMD').toUpperCase();
  if (!CURRENCIES.has(currency)) return { valid: false, error: 'Choose a supported salary currency.' };
  const salaryMinMinor = input.salaryMin === '' || input.salaryMin == null ? null : parseMoney(input.salaryMin);
  const salaryMaxMinor = input.salaryMax === '' || input.salaryMax == null ? null : parseMoney(input.salaryMax);
  if (input.salaryMin != null && input.salaryMin !== '' && salaryMinMinor === null) return { valid: false, error: 'Enter a valid minimum salary.' };
  if (input.salaryMax != null && input.salaryMax !== '' && salaryMaxMinor === null) return { valid: false, error: 'Enter a valid maximum salary.' };
  if (salaryMinMinor != null && salaryMaxMinor != null && salaryMaxMinor < salaryMinMinor) return { valid: false, error: 'Maximum salary cannot be lower than minimum salary.' };
  return { valid: true, value: { title, companyName, description, category, employmentType, workplaceType, location, applicationDeadline: applicationDeadline.toISOString(), currency, salaryMinMinor, salaryMaxMinor } };
}
export function validateJobApplicationInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { valid: false, error: 'Application details must be an object.' };
  const coverLetter = clean(input.coverLetter, 5000);
  if (coverLetter.length < 30) return { valid: false, error: 'Add a cover letter of at least 30 characters.' };
  return { valid: true, value: { coverLetter } };
}
const APPLICATION_TRANSITIONS = Object.freeze({
  submitted: new Set(['reviewed','shortlisted','rejected','withdrawn']),
  reviewed: new Set(['shortlisted','rejected','withdrawn']),
  shortlisted: new Set(['hired','rejected','withdrawn']),
  rejected: new Set(), hired: new Set(), withdrawn: new Set()
});
export function transitionJobApplication(application, actorId, job, nextStatus) {
  if (!application || !job || !actorId) return { valid: false, error: 'Application, job and actor are required.' };
  const isApplicant = application.applicantId === actorId, isEmployer = job.employerId === actorId;
  if (!isApplicant && !isEmployer) return { valid: false, error: 'You are not permitted to manage this application.' };
  if (!APPLICATION_TRANSITIONS[application.status]?.has(nextStatus)) return { valid: false, error: 'This application cannot move from ' + application.status + ' to ' + nextStatus + '.' };
  if (nextStatus === 'withdrawn' && !isApplicant) return { valid: false, error: 'Only the applicant can withdraw this application.' };
  if (nextStatus !== 'withdrawn' && !isEmployer) return { valid: false, error: 'Only the employer can update hiring status.' };
  return { valid: true, value: { ...application, status: nextStatus, updatedAt: new Date().toISOString() } };
}
