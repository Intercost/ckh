/**
 * CKH International School — EmailJS Service
 * Handles confirmation emails for student and teacher applications.
 *
 * Template variables used (set these in your EmailJS template):
 *   {{to_name}}           — recipient's name
 *   {{to_email}}          — recipient's email address
 *   {{ref_number}}        — application reference number  e.g. ADM-1234 / JOB-5678
 *   {{application_type}}  — e.g. "Student Application" or "Teacher Application"
 *   {{message}}           — body paragraph (varies per recipient)
 *   {{extra_details}}     — optional extra line (programme, grade, etc.)
 *   {{reply_to}}          — reply-to address
 */

const EMAILJS_PUBLIC_KEY  = 'qgK5ln7VTxefX0Ciw';
const EMAILJS_SERVICE_ID  = 'service_viyd67t';
const EMAILJS_TEMPLATE_ID = 'template_7reiyko';
const ADMIN_EMAIL         = 'admin@ckhinternationalschool.com';

/** Initialise EmailJS (v4 syntax). Called on DOMContentLoaded. */
function initEmailJS() {
    if (typeof emailjs !== 'undefined') {
        // EmailJS v4 requires an object — NOT a bare string
        emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
        console.log('[EmailJS] Initialised.');
    } else {
        console.warn('[EmailJS] SDK not loaded yet.');
    }
}

// Initialise as soon as the DOM (and therefore the CDN script) is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEmailJS);
} else {
    initEmailJS(); // already loaded
}

/**
 * Sends two emails:
 *   1. A confirmation to the applicant.
 *   2. A new-application notification to the admin.
 *
 * @param {object} opts
 * @param {string} opts.toName           - Applicant's full name
 * @param {string} opts.toEmail          - Applicant's email address
 * @param {string} opts.refNumber        - Application reference  e.g. "ADM-1234"
 * @param {string} opts.applicationType  - "Student Application" | "Teacher Application"
 * @param {string} [opts.extraDetails]   - Optional extra line shown in both emails
 */
async function sendApplicationEmails({ toName, toEmail, refNumber, applicationType, extraDetails = '' }) {
    if (typeof emailjs === 'undefined') {
        console.warn('[EmailJS] SDK not available — skipping email send.');
        return;
    }

    // ── 1. Applicant confirmation ──────────────────────────────────────────────
    const applicantParams = {
        to_name:          toName,
        to_email:         toEmail,
        ref_number:       refNumber,
        application_type: applicationType,
        message:          `Thank you for applying to CKH International School! We have received your ${applicationType.toLowerCase()} and our admissions team will review it shortly. You can expect to hear from us within 3 working days.`,
        extra_details:    extraDetails,
        reply_to:         ADMIN_EMAIL
    };

    try {
        // Pass publicKey as 4th arg — works even if init() hasn't fired yet (v4)
        await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, applicantParams, { publicKey: EMAILJS_PUBLIC_KEY });
        console.log(`[EmailJS] Confirmation sent to applicant: ${toEmail}`);
    } catch (err) {
        console.error('[EmailJS] Failed to send applicant confirmation:', err);
    }

    // ── 2. Admin notification ──────────────────────────────────────────────────
    const adminParams = {
        to_name:          'Admissions Team',
        to_email:         ADMIN_EMAIL,
        ref_number:       refNumber,
        application_type: applicationType,
        message:          `A new ${applicationType} has just been submitted on the CKH portal.\n\nApplicant: ${toName}\nEmail: ${toEmail}\nReference: ${refNumber}`,
        extra_details:    extraDetails,
        reply_to:         toEmail
    };

    try {
        await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, adminParams, { publicKey: EMAILJS_PUBLIC_KEY });
        console.log(`[EmailJS] Admin notification sent to: ${ADMIN_EMAIL}`);
    } catch (err) {
        console.error('[EmailJS] Failed to send admin notification:', err);
    }
}
