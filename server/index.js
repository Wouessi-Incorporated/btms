require('dotenv').config();
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');
const multer = require('multer');
const sanitize = require('sanitize-filename');
const basicAuth = require('basic-auth');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'bmts.sqlite');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(morgan('combined'));
app.use(cors({ origin: false }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static site
app.use(express.static(PUBLIC_DIR));

// Database
const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS registrations (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL,
    middle_temple_member TEXT NOT NULL,
    bmts_member_interest TEXT NOT NULL,
    title TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    company TEXT,
    po_box TEXT,
    city TEXT,
    telephone TEXT NOT NULL,
    email TEXT NOT NULL,
    practice_track TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    payment_file_name TEXT NOT NULL,
    payment_file_path TEXT NOT NULL,
    admin_notes TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_reg_created_at ON registrations(created_at);
  CREATE INDEX IF NOT EXISTS idx_reg_status ON registrations(status);
`);

function isValidFile(mimetype, filename) {
  const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
  const ext = (filename || '').toLowerCase();
  if (!allowed.includes(mimetype)) return false;
  if (!(ext.endsWith('.pdf') || ext.endsWith('.jpg') || ext.endsWith('.jpeg') || ext.endsWith('.png'))) return false;
  return true;
}

// File upload (max 10MB)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const id = req._reg_id || uuidv4();
    req._reg_id = id;
    const safe = sanitize(file.originalname || 'payment-proof');
    const ext = path.extname(safe) || '.bin';
    cb(null, `${id}${ext.toLowerCase()}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (isValidFile(file.mimetype, file.originalname)) cb(null, true);
    else cb(new Error('Invalid file type. Please upload PDF, JPG, JPEG, or PNG.'));
  }
});

// Email (optional)
function createTransport() {
  const host = process.env.SMTP_HOST ? String(process.env.SMTP_HOST).trim() : null;
  const user = process.env.SMTP_USER ? String(process.env.SMTP_USER).trim() : null;
  const pass = process.env.SMTP_PASS ? String(process.env.SMTP_PASS).trim() : null;
  const port = Number(process.env.SMTP_PORT || 587);

  console.log('[Email Config] Checking email configuration...');
  console.log('[Email Config] SMTP_HOST:', host ? 'SET' : 'NOT SET');
  console.log('[Email Config] SMTP_USER:', user ? 'SET' : 'NOT SET');
  console.log('[Email Config] SMTP_PASS:', pass ? 'SET' : 'NOT SET');
  console.log('[Email Config] SMTP_PORT:', port);

  if (!host || !user || !pass) {
    console.warn('[Email Config] Email not configured - some environment variables are missing');
    return null;
  }

  // Validate host format (should not contain '=' or other invalid characters)
  if (host.includes('=') || host.includes(' ')) {
    console.error('[Email Config Error] Invalid SMTP_HOST format. Remove any extra characters or spaces.');
    console.error(`[Email Config Error] Current SMTP_HOST value: "${host}"`);
    console.error('[Email Config Error] Expected format: SMTP_HOST=smtp.zoho.com (no spaces, no quotes, no duplicates)');
    return null;
  }

  try {
    const transport = nodemailer.createTransport({
      host, port,
      secure: port === 465,
      auth: { user, pass }
    });
    console.log('[Email Config] ✅ Email transporter created successfully');
    return transport;
  } catch (err) {
    console.error('[Email Config Error] Failed to create email transporter:', err.message);
    return null;
  }
}
const transporter = createTransport();

async function sendEmail(to, subject, text, html = null) {
  if (!transporter) {
    console.warn('[Email] Transporter not configured. Email not sent.');
    return;
  }
  try {
    const from = process.env.MAIL_FROM || 'bahamasmts@bmts-events.com';
    const replyTo = process.env.MAIL_FROM || 'bahamasmts@bmts-events.com';

    // Enhanced email options to improve deliverability
    const mailOptions = {
      from: `"The Bahamas Middle Temple Society" <${from}>`, // Friendly name
      to: to,
      replyTo: replyTo,
      subject: subject,
      text: text,
      headers: {
        'X-Mailer': 'BMTS Events Registration System',
        'X-Priority': '3', // Normal priority
        'X-MSMail-Priority': 'Normal',
        'Importance': 'Normal',
        'List-Unsubscribe': `<mailto:${from}?subject=Unsubscribe>`,
        'Organization': 'The Bahamas Middle Temple Society',
        'X-Auto-Response-Suppress': 'OOF, DR, RN, NRN, AutoReply'
      }
    };

    // Add HTML version if provided
    if (html) {
      mailOptions.html = html;
    }

    await transporter.sendMail(mailOptions);
    console.log(`[Email] Sent successfully to: ${to}`);
  } catch (err) {
    console.error('[Email Error] Failed to send email:', err.message);
    if (err.code === 'EBADNAME' || err.code === 'EDNS') {
      console.error('[Email Error] DNS/Hostname issue. Check SMTP_HOST value in .env file.');
      console.error('[Email Error] Make sure SMTP_HOST=smtp.zoho.com (no spaces, no quotes, no duplicates)');
    }
  }
}

// Professional email templates
function generateRegistrationConfirmationEmail(registration) {
  const registrationDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const subject = 'Registration Received – Bahamas Middle Temple Week 2026';

  const text = [
    `Dear ${registration.title} ${registration.last_name},`,
    ``,
    `Thank you for registering for The Bahamas Middle Temple Week 2026 – Advocacy Training Programme.`,
    ``,
    `We have successfully received your registration and payment proof. Your submission is currently under review by our administrative team.`,
    ``,
    `REGISTRATION CONFIRMATION`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `Registration ID: ${registration.id}`,
    `Registration Date: ${registrationDate}`,
    `Name: ${registration.title} ${registration.first_name} ${registration.last_name}`,
    `Practice Track: ${registration.practice_track} Advocacy`,
    `Payment Method: ${registration.payment_method}`,
    registration.company ? `Firm/Company: ${registration.company}` : '',
    `Email: ${registration.email}`,
    `Telephone: ${registration.telephone}`,
    ``,
    `EVENT DETAILS`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `Event: The Bahamas Middle Temple Week 2026`,
    `Date: 19–23 January 2026`,
    `Venue: British Colonial Hilton`,
    `Location: Nassau, New Providence, The Bahamas`,
    ``,
    `NEXT STEPS`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `1. Payment Verification: Our team will review your payment proof within 2-3 business days.`,
    `2. Confirmation Email: Once your payment is verified, you will receive a confirmation email with further instructions.`,
    `3. Programme Materials: Additional programme details and materials will be sent closer to the event date.`,
    ``,
    `Please retain this email and your Registration ID (${registration.id}) for your records.`,
    ``,
    `If you have any questions or need to update your registration, please contact us at bahamasmts@bmts-events.com.`,
    ``,
    `We look forward to welcoming you to Nassau in January 2026.`,
    ``,
    `Best regards,`,
    ``,
    `The Bahamas Middle Temple Society`,
    `Organising Committee`,
    `Bahamas Middle Temple Week 2026`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `This is an automated confirmation email. Please do not reply directly to this message.`,
    `For enquiries, contact: bahamasmts@bmts-events.com`
  ].filter(line => line !== '').join('\n');

  return { subject, text };
}

function generatePaymentVerifiedEmail(registration) {
  const subject = 'Registration Confirmed – Bahamas Middle Temple Week 2026';

  const text = [
    `Dear ${registration.title} ${registration.last_name},`,
    ``,
    `Congratulations! We are pleased to confirm that your registration for The Bahamas Middle Temple Week 2026 – Advocacy Training Programme has been successfully verified and approved.`,
    ``,
    `REGISTRATION CONFIRMED`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `Registration ID: ${registration.id}`,
    `Name: ${registration.title} ${registration.first_name} ${registration.last_name}`,
    `Practice Track: ${registration.practice_track} Advocacy`,
    `Payment Status: VERIFIED AND CONFIRMED`,
    registration.company ? `Firm/Company: ${registration.company}` : '',
    ``,
    `EVENT INFORMATION`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `Event: The Bahamas Middle Temple Week 2026`,
    `Date: 19–23 January 2026 (Sunday to Thursday)`,
    `Venue: British Colonial Hilton`,
    `Address: 1 Bay Street, Nassau, New Providence, The Bahamas`,
    ``,
    `PROGRAMME HIGHLIGHTS`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `• Intensive advocacy training sessions`,
    `• Expert-led workshops and seminars`,
    `• Networking opportunities with legal professionals`,
    `• Practical advocacy exercises and mock trials`,
    `• Certificate of completion`,
    ``,
    `WHAT'S NEXT`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `Your place has been secured for this intensive advocacy training programme. Over the coming weeks, you will receive:`,
    ``,
    `1. Detailed programme schedule and agenda`,
    `2. Pre-event materials and reading list`,
    `3. Venue information and local recommendations`,
    `4. Travel and accommodation guidance`,
    `5. Final event instructions`,
    ``,
    `IMPORTANT REMINDERS`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `• Please ensure you have made arrangements for travel and accommodation`,
    `• Bring valid identification and any required travel documents`,
    `• Business attire is required for all sessions`,
    `• Networking events will include both formal and casual opportunities`,
    ``,
    `We are excited to welcome you to Nassau for what promises to be an exceptional learning and networking experience.`,
    ``,
    `Best regards,`,
    ``,
    `The Bahamas Middle Temple Society`,
    `Organising Committee`,
    `Bahamas Middle Temple Week 2026`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `For enquiries, contact: bahamasmts@bmts-events.com`
  ].filter(line => line !== '').join('\n');

  return { subject, text };
}

function generatePaymentRejectedEmail(registration, adminNotes = '') {
  const subject = 'Action Required – Registration Payment Verification';

  const text = [
    `Dear ${registration.title} ${registration.last_name},`,
    ``,
    `Thank you for your interest in The Bahamas Middle Temple Week 2026 – Advocacy Training Programme.`,
    ``,
    `ACTION REQUIRED: PAYMENT VERIFICATION`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `We were unable to verify the payment proof document submitted with your registration. This may be due to:`,
    ``,
    `• The document being unclear or incomplete`,
    `• Missing payment details or reference numbers`,
    `• The document format not being readable`,
    `• Payment details not matching our records`,
    `• Incorrect payment amount or method`,
    ``,
    adminNotes ? `ADDITIONAL NOTES FROM OUR TEAM:` : '',
    adminNotes ? `${adminNotes}` : '',
    adminNotes ? `` : '',
    `REGISTRATION DETAILS`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `Registration ID: ${registration.id}`,
    `Name: ${registration.title} ${registration.first_name} ${registration.last_name}`,
    `Practice Track: ${registration.practice_track} Advocacy`,
    `Payment Method: ${registration.payment_method}`,
    `Current Status: Payment Verification Required`,
    ``,
    `WHAT TO DO NEXT`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `Please contact us at bahamasmts@bmts-events.com with the following information:`,
    ``,
    `1. Your Registration ID: ${registration.id}`,
    `2. A clear copy of your payment proof (bank transfer receipt or cheque copy)`,
    `3. Any additional payment details or reference numbers`,
    `4. Transaction date and amount`,
    ``,
    `PAYMENT REQUIREMENTS`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `For bank transfers, please ensure your receipt includes:`,
    `• Transaction reference number`,
    `• Date and time of transfer`,
    `• Amount transferred`,
    `• Recipient account details`,
    ``,
    `For cheque payments, please provide:`,
    `• Clear copy of the cheque (front and back if applicable)`,
    `• Cheque number and date`,
    `• Bank details`,
    ``,
    `Our team will review your updated payment proof and respond within 1-2 business days.`,
    ``,
    `We appreciate your patience and look forward to resolving this matter promptly so we can confirm your place at this prestigious event.`,
    ``,
    `Best regards,`,
    ``,
    `The Bahamas Middle Temple Society`,
    `Organising Committee`,
    `Bahamas Middle Temple Week 2026`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `For immediate assistance, contact: bahamasmts@bmts-events.com`
  ].filter(line => line !== '').join('\n');

  return { subject, text };
}

function generateAwaitingResubmissionEmail(registration, adminNotes = '') {
  const subject = 'Payment Resubmission Required – Bahamas Middle Temple Week 2026';

  const text = [
    `Dear ${registration.title} ${registration.last_name},`,
    ``,
    `We are writing regarding your registration for The Bahamas Middle Temple Week 2026 – Advocacy Training Programme.`,
    ``,
    `RESUBMISSION REQUIRED`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `After reviewing your payment documentation, we require additional information or a new payment proof document to complete your registration verification.`,
    ``,
    adminNotes ? `SPECIFIC REQUIREMENTS:` : '',
    adminNotes ? `${adminNotes}` : '',
    adminNotes ? `` : '',
    `REGISTRATION DETAILS`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `Registration ID: ${registration.id}`,
    `Name: ${registration.title} ${registration.first_name} ${registration.last_name}`,
    `Practice Track: ${registration.practice_track} Advocacy`,
    `Payment Method: ${registration.payment_method}`,
    `Current Status: Awaiting Payment Resubmission`,
    ``,
    `REQUIRED ACTIONS`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `Please email us at bahamasmts@bmts-events.com with:`,
    ``,
    `1. Your Registration ID: ${registration.id}`,
    `2. Updated or corrected payment proof document`,
    `3. Any additional documentation requested above`,
    `4. Your contact information for follow-up`,
    ``,
    `DOCUMENT REQUIREMENTS`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `• Documents must be clear and legible (PDF, JPG, or PNG format)`,
    `• Include all relevant transaction details`,
    `• Ensure payment amount matches registration fees`,
    `• Provide transaction reference numbers where applicable`,
    ``,
    `TIME SENSITIVITY`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `Please respond within 7 days to secure your place at the event. Late submissions may result in your registration being placed on a waiting list.`,
    ``,
    `Our team is standing by to assist you with this process. Once we receive the required documentation, we will process your registration promptly.`,
    ``,
    `Best regards,`,
    ``,
    `The Bahamas Middle Temple Society`,
    `Organising Committee`,
    `Bahamas Middle Temple Week 2026`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `For immediate assistance, contact: bahamasmts@bmts-events.com`
  ].filter(line => line !== '').join('\n');

  return { subject, text };
}

function generateAdminNotificationEmail(registration) {
  const subject = `New Registration: ${registration.first_name} ${registration.last_name} – Bahamas Middle Temple Week 2026`;

  const text = [
    `New Registration Received`,
    ``,
    `A new registration has been submitted for Bahamas Middle Temple Week 2026.`,
    ``,
    `REGISTRATION DETAILS`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `Registration ID: ${registration.id}`,
    `Registration Date: ${new Date().toLocaleString()}`,
    ``,
    `PARTICIPANT INFORMATION`,
    `Name: ${registration.title} ${registration.first_name} ${registration.last_name}`,
    `Email: ${registration.email}`,
    `Telephone: ${registration.telephone}`,
    registration.company ? `Company: ${registration.company}` : '',
    registration.city ? `City: ${registration.city}` : '',
    registration.po_box ? `PO Box: ${registration.po_box}` : '',
    ``,
    `PROGRAMME DETAILS`,
    `Practice Track: ${registration.practice_track} Advocacy`,
    `Payment Method: ${registration.payment_method}`,
    `Middle Temple Member: ${registration.middle_temple_member}`,
    `BMTS Member Interest: ${registration.bmts_member_interest}`,
    ``,
    `STATUS INFORMATION`,
    `Current Status: ${registration.status}`,
    `Payment File: ${registration.payment_file_name}`,
    ``,
    `ADMIN ACTIONS REQUIRED`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `1. Review payment proof document`,
    `2. Verify payment details and amount`,
    `3. Update registration status accordingly`,
    `4. Send appropriate confirmation email to participant`,
    ``,
    `Please review this registration in the admin panel and update the status as appropriate.`,
    ``,
    `Admin Panel: ${process.env.ADMIN_URL || 'https://your-domain.com/admin/'}`
  ].filter(line => line !== '').join('\n');

  return { subject, text };
}

function generateStatusChangeNotificationEmail(registration, newStatus, oldStatus, adminNotes = '') {
  const subject = `Registration Status Update – Bahamas Middle Temple Week 2026`;

  const text = [
    `Dear ${registration.title} ${registration.last_name},`,
    ``,
    `We are writing to update you on the status of your registration for The Bahamas Middle Temple Week 2026 – Advocacy Training Programme.`,
    ``,
    `STATUS UPDATE`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `Registration ID: ${registration.id}`,
    `Name: ${registration.title} ${registration.first_name} ${registration.last_name}`,
    `Previous Status: ${oldStatus}`,
    `Current Status: ${newStatus}`,
    ``,
    adminNotes ? `ADDITIONAL INFORMATION:` : '',
    adminNotes ? `${adminNotes}` : '',
    adminNotes ? `` : '',
    `REGISTRATION DETAILS`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `Practice Track: ${registration.practice_track} Advocacy`,
    `Payment Method: ${registration.payment_method}`,
    registration.company ? `Firm/Company: ${registration.company}` : '',
    ``,
    `EVENT INFORMATION`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `Event: The Bahamas Middle Temple Week 2026`,
    `Date: 19–23 January 2026`,
    `Venue: British Colonial Hilton`,
    `Location: Nassau, New Providence, The Bahamas`,
    ``,
    `If you have any questions about this status change or need further assistance, please contact us at bahamasmts@bmts-events.com.`,
    ``,
    `Best regards,`,
    ``,
    `The Bahamas Middle Temple Society`,
    `Organising Committee`,
    `Bahamas Middle Temple Week 2026`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `For enquiries, contact: bahamasmts@bmts-events.com`
  ].filter(line => line !== '').join('\n');

  return { subject, text };
}

// API registration
app.post('/api/register', upload.single('payment_proof'), async (req, res) => {
  try {
    const body = req.body || {};
    const file = req.file;

    if (!file) return res.status(400).json({ message: 'Payment proof is required.' });

    const required = ['middle_temple_member', 'bmts_member_interest', 'title', 'first_name', 'last_name', 'telephone', 'email', 'practice_track', 'payment_method', 'consent'];
    for (const k of required) {
      if (!body[k] || String(body[k]).trim() === '') {
        return res.status(400).json({ message: 'Please complete all required fields.' });
      }
    }

    const id = req._reg_id || uuidv4();
    const created_at = new Date().toISOString();
    const status = 'Pending Verification';

    const stmt = db.prepare(`
      INSERT INTO registrations (
        id, created_at, status,
        middle_temple_member, bmts_member_interest, title,
        first_name, last_name, company, po_box, city,
        telephone, email, practice_track, payment_method,
        payment_file_name, payment_file_path, admin_notes
      ) VALUES (
        @id, @created_at, @status,
        @middle_temple_member, @bmts_member_interest, @title,
        @first_name, @last_name, @company, @po_box, @city,
        @telephone, @email, @practice_track, @payment_method,
        @payment_file_name, @payment_file_path, @admin_notes
      )
    `);

    stmt.run({
      id, created_at, status,
      middle_temple_member: body.middle_temple_member,
      bmts_member_interest: body.bmts_member_interest,
      title: body.title,
      first_name: body.first_name,
      last_name: body.last_name,
      company: body.company || '',
      po_box: body.po_box || '',
      city: body.city || '',
      telephone: body.telephone,
      email: body.email,
      practice_track: body.practice_track,
      payment_method: body.payment_method,
      payment_file_name: file.originalname || file.filename,
      payment_file_path: file.path,
      admin_notes: ''
    });

    // Professional email: submission received
    const emailTemplate = generateRegistrationConfirmationEmail({
      id,
      title: body.title,
      first_name: body.first_name,
      last_name: body.last_name,
      email: body.email,
      telephone: body.telephone,
      company: body.company || '',
      practice_track: body.practice_track,
      payment_method: body.payment_method
    });

    await sendEmail(body.email, emailTemplate.subject, emailTemplate.text, emailTemplate.html);

    // Email notification to owner about new registration
    const ownerEmail = process.env.OWNER_EMAIL || 'bahamasmts@bmts-events.com';
    const adminEmailTemplate = generateAdminNotificationEmail({
      id,
      title: body.title,
      first_name: body.first_name,
      last_name: body.last_name,
      email: body.email,
      telephone: body.telephone,
      company: body.company || '',
      city: body.city || '',
      po_box: body.po_box || '',
      practice_track: body.practice_track,
      payment_method: body.payment_method,
      middle_temple_member: body.middle_temple_member,
      bmts_member_interest: body.bmts_member_interest,
      status,
      payment_file_name: file.originalname || file.filename
    });

    await sendEmail(ownerEmail, adminEmailTemplate.subject, adminEmailTemplate.text);

    return res.status(200).json({ registration_id: id });

  } catch (err) {
    return res.status(400).json({ message: err.message || 'Submission failed.' });
  }
});

// Admin auth
function requireAdmin(req, res, next) {
  const creds = basicAuth(req);
  const user = process.env.ADMIN_USER || 'admin';
  const pass = process.env.ADMIN_PASS || 'change-me-now';
  if (!creds || creds.name !== user || creds.pass !== pass) {
    res.set('WWW-Authenticate', 'Basic realm="BMTS Admin"');
    return res.status(401).send('Authentication required');
  }
  next();
}

// Admin pages
app.get('/admin/', requireAdmin, (req, res) => {
  const html = fs.readFileSync(path.join(__dirname, 'templates', 'admin.html'), 'utf-8');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

app.get('/admin/api/registrations', requireAdmin, (req, res) => {
  const status = req.query.status;
  let rows;
  if (status) {
    rows = db.prepare('SELECT id, created_at, status, first_name, last_name, email, telephone, practice_track, payment_method FROM registrations WHERE status = ? ORDER BY created_at DESC').all(status);
  } else {
    rows = db.prepare('SELECT id, created_at, status, first_name, last_name, email, telephone, practice_track, payment_method FROM registrations ORDER BY created_at DESC').all();
  }
  res.json({ rows });
});

app.get('/admin/api/registration/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ message: 'Not found' });
  res.json({ row });
});

app.post('/admin/api/registration/:id/status', requireAdmin, async (req, res) => {
  const id = req.params.id;
  const status = (req.body && req.body.status) ? String(req.body.status) : '';
  const notes = (req.body && req.body.admin_notes) ? String(req.body.admin_notes) : '';

  const allowed = ['Pending Verification', 'Payment Verified', 'Payment Rejected', 'Awaiting Resubmission', 'Cancelled', 'Waitlisted', 'Confirmed'];
  if (!allowed.includes(status)) return res.status(400).json({ message: 'Invalid status' });

  const row = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ message: 'Not found' });

  const oldStatus = row.status;

  db.prepare('UPDATE registrations SET status = ?, admin_notes = ? WHERE id = ?').run(status, notes, id);

  // Email based on status - only send if status actually changed
  if (status !== oldStatus) {
    if (status === 'Payment Verified') {
      const emailTemplate = generatePaymentVerifiedEmail(row);
      await sendEmail(row.email, emailTemplate.subject, emailTemplate.text);
    } else if (status === 'Payment Rejected') {
      const emailTemplate = generatePaymentRejectedEmail(row, notes);
      await sendEmail(row.email, emailTemplate.subject, emailTemplate.text);
    } else if (status === 'Awaiting Resubmission') {
      const emailTemplate = generateAwaitingResubmissionEmail(row, notes);
      await sendEmail(row.email, emailTemplate.subject, emailTemplate.text);
    } else {
      // For any other status changes, send a general status update email
      const emailTemplate = generateStatusChangeNotificationEmail(row, status, oldStatus, notes);
      await sendEmail(row.email, emailTemplate.subject, emailTemplate.text);
    }
  }

  res.json({ ok: true });
});

app.get('/admin/api/registration/:id/payment-proof', requireAdmin, (req, res) => {
  const id = req.params.id;
  const row = db.prepare('SELECT payment_file_path, payment_file_name FROM registrations WHERE id = ?').get(id);
  if (!row) return res.status(404).send('Not found');
  if (!fs.existsSync(row.payment_file_path)) return res.status(404).send('File missing');
  res.download(row.payment_file_path, row.payment_file_name);
});

app.get('/health', (req, res) => res.json({ ok: true }));

// Heartbeat mechanism to prevent instance spin-down - runs continuously
function startHeartbeat() {
  const heartbeatUrl = process.env.HEARTBEAT_URL || `http://localhost:${PORT}/health`;
  const heartbeatInterval = parseInt(process.env.HEARTBEAT_INTERVAL || '15000', 10); // Default: 15 seconds (15000ms)

  const pingHealth = () => {
    console.log(`[Heartbeat] Attempting to ping server at ${new Date().toISOString()}`);
    try {
      const url = new URL(heartbeatUrl);
      const isHttps = url.protocol === 'https:';
      const requestModule = isHttps ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'GET',
        timeout: 5000
      };

      const req = requestModule.request(options, (res) => {
        if (res.statusCode === 200) {
          console.log(`[Heartbeat] ✓ Ping successful - Server is active at ${new Date().toISOString()}`);
        } else {
          console.log(`[Heartbeat] ⚠ Ping returned status ${res.statusCode} at ${new Date().toISOString()}`);
        }
      });

      req.on('error', (err) => {
        // Errors are logged but don't stop the heartbeat
        console.error(`[Heartbeat] Error pinging server:`, err.message);
      });

      req.on('timeout', () => {
        req.destroy();
        console.error(`[Heartbeat] Request timeout`);
      });

      req.end();
    } catch (err) {
      // Errors are logged but don't stop the heartbeat
      console.error(`[Heartbeat] Failed to ping:`, err.message);
    }
  };

  // Ping immediately on start
  pingHealth();

  // Start continuous heartbeat - runs indefinitely every interval
  setInterval(pingHealth, heartbeatInterval);
  const intervalSeconds = heartbeatInterval / 1000;
  console.log(`[Heartbeat] Started - continuously pinging ${heartbeatUrl} every ${intervalSeconds} second(s)`);
}

app.listen(PORT, () => {
  console.log(`BMTS Events running on port ${PORT}`);
  startHeartbeat();
});
