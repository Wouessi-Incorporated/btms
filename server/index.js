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

function isValidFile(mimetype, filename){
  const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
  const ext = (filename || '').toLowerCase();
  if(!allowed.includes(mimetype)) return false;
  if(!(ext.endsWith('.pdf') || ext.endsWith('.jpg') || ext.endsWith('.jpeg') || ext.endsWith('.png'))) return false;
  return true;
}

// File upload (max 10MB)
const storage = multer.diskStorage({
  destination: function(req, file, cb){
    cb(null, UPLOAD_DIR);
  },
  filename: function(req, file, cb){
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
  fileFilter: function(req, file, cb){
    if(isValidFile(file.mimetype, file.originalname)) cb(null, true);
    else cb(new Error('Invalid file type. Please upload PDF, JPG, JPEG, or PNG.'));
  }
});

// Email (optional)
function createTransport(){
  const host = process.env.SMTP_HOST ? String(process.env.SMTP_HOST).trim() : null;
  const user = process.env.SMTP_USER ? String(process.env.SMTP_USER).trim() : null;
  const pass = process.env.SMTP_PASS ? String(process.env.SMTP_PASS).trim() : null;
  const port = Number(process.env.SMTP_PORT || 587);
  if(!host || !user || !pass) return null;

  // Validate host format (should not contain '=' or other invalid characters)
  if(host.includes('=') || host.includes(' ')){
    console.error('[Email Config Error] Invalid SMTP_HOST format. Remove any extra characters or spaces.');
    console.error(`[Email Config Error] Current SMTP_HOST value: "${host}"`);
    console.error('[Email Config Error] Expected format: SMTP_HOST=smtp.zoho.com (no spaces, no quotes, no duplicates)');
    return null;
  }

  try {
    return nodemailer.createTransport({
      host, port,
      secure: port === 465,
      auth: { user, pass }
    });
  } catch(err){
    console.error('[Email Config Error] Failed to create email transporter:', err.message);
    return null;
  }
}
const transporter = createTransport();

async function sendEmail(to, subject, text){
  if(!transporter) {
    console.warn('[Email] Transporter not configured. Email not sent.');
    return;
  }
  try {
    const from = process.env.MAIL_FROM || 'bahamasmts@bmts-events.com';
    await transporter.sendMail({ from, to, subject, text });
    console.log(`[Email] Sent successfully to: ${to}`);
  } catch(err){
    console.error('[Email Error] Failed to send email:', err.message);
    if(err.code === 'EBADNAME' || err.code === 'EDNS'){
      console.error('[Email Error] DNS/Hostname issue. Check SMTP_HOST value in .env file.');
      console.error('[Email Error] Make sure SMTP_HOST=smtp.zoho.com (no spaces, no quotes, no duplicates)');
    }
  }
}

// API registration
app.post('/api/register', upload.single('payment_proof'), async (req, res) => {
  try{
    const body = req.body || {};
    const file = req.file;

    if(!file) return res.status(400).json({ message: 'Payment proof is required.' });

    const required = ['middle_temple_member','bmts_member_interest','title','first_name','last_name','telephone','email','practice_track','payment_method','consent'];
    for(const k of required){
      if(!body[k] || String(body[k]).trim() === ''){
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
    const registrationDate = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    const msg = [
      `Dear ${body.title} ${body.last_name},`,
      ``,
      `Thank you for registering for The Bahamas Middle Temple Week 2026 – Advocacy Training Programme.`,
      ``,
      `We have successfully received your registration and payment proof. Your submission is currently under review by our administrative team.`,
      ``,
      `REGISTRATION CONFIRMATION`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `Registration ID: ${id}`,
      `Registration Date: ${registrationDate}`,
      `Name: ${body.title} ${body.first_name} ${body.last_name}`,
      `Practice Track: ${body.practice_track} Advocacy`,
      `Payment Method: ${body.payment_method}`,
      body.company ? `Firm/Company: ${body.company}` : '',
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
      `Please retain this email and your Registration ID (${id}) for your records.`,
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

    await sendEmail(body.email, 'Registration Received – Bahamas Middle Temple Week 2026', msg);

    // Email notification to owner about new registration
    const ownerEmail = process.env.OWNER_EMAIL || 'bahamasmts@bmts-events.com';
    const ownerMsg = [
      `New Registration Received`,
      ``,
      `A new registration has been submitted for Bahamas Middle Temple Week 2026.`,
      ``,
      `Registration Details:`,
      `- Registration ID: ${id}`,
      `- Name: ${body.title} ${body.first_name} ${body.last_name}`,
      `- Email: ${body.email}`,
      `- Telephone: ${body.telephone}`,
      `- Practice Track: ${body.practice_track}`,
      `- Payment Method: ${body.payment_method}`,
      `- Middle Temple Member: ${body.middle_temple_member}`,
      `- BMTS Member Interest: ${body.bmts_member_interest}`,
      body.company ? `- Company: ${body.company}` : '',
      body.city ? `- City: ${body.city}` : '',
      ``,
      `Status: ${status}`,
      ``,
      `Please review this registration in the admin panel.`,
      `Admin Panel: ${req.protocol}://${req.get('host')}/admin/`
    ].filter(line => line !== '').join('\n');

    await sendEmail(ownerEmail, `New Registration: ${body.first_name} ${body.last_name} – Bahamas Middle Temple Week 2026`, ownerMsg);

    return res.status(200).json({ registration_id: id });

  }catch(err){
    return res.status(400).json({ message: err.message || 'Submission failed.' });
  }
});

// Admin auth
function requireAdmin(req, res, next){
  const creds = basicAuth(req);
  const user = process.env.ADMIN_USER || 'admin';
  const pass = process.env.ADMIN_PASS || 'change-me-now';
  if(!creds || creds.name !== user || creds.pass !== pass){
    res.set('WWW-Authenticate', 'Basic realm="BMTS Admin"');
    return res.status(401).send('Authentication required');
  }
  next();
}

// Admin pages
app.get('/admin/', requireAdmin, (req, res) => {
  const html = fs.readFileSync(path.join(__dirname, 'templates', 'admin.html'), 'utf-8');
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.send(html);
});

app.get('/admin/api/registrations', requireAdmin, (req, res) => {
  const status = req.query.status;
  let rows;
  if(status){
    rows = db.prepare('SELECT id, created_at, status, first_name, last_name, email, telephone, practice_track, payment_method FROM registrations WHERE status = ? ORDER BY created_at DESC').all(status);
  }else{
    rows = db.prepare('SELECT id, created_at, status, first_name, last_name, email, telephone, practice_track, payment_method FROM registrations ORDER BY created_at DESC').all();
  }
  res.json({ rows });
});

app.get('/admin/api/registration/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);
  if(!row) return res.status(404).json({ message:'Not found' });
  res.json({ row });
});

app.post('/admin/api/registration/:id/status', requireAdmin, async (req, res) => {
  const id = req.params.id;
  const status = (req.body && req.body.status) ? String(req.body.status) : '';
  const notes = (req.body && req.body.admin_notes) ? String(req.body.admin_notes) : '';

  const allowed = ['Pending Verification','Payment Verified','Payment Rejected','Awaiting Resubmission'];
  if(!allowed.includes(status)) return res.status(400).json({ message:'Invalid status' });

  const row = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);
  if(!row) return res.status(404).json({ message:'Not found' });

  db.prepare('UPDATE registrations SET status = ?, admin_notes = ? WHERE id = ?').run(status, notes, id);

  // Email based on status
  if(status === 'Payment Verified'){
    const msg = [
      `Dear ${row.title} ${row.last_name},`,
      ``,
      `We are pleased to confirm that your registration for The Bahamas Middle Temple Week 2026 – Advocacy Training Programme has been successfully verified.`,
      ``,
      `REGISTRATION CONFIRMED`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `Registration ID: ${row.id}`,
      `Name: ${row.title} ${row.first_name} ${row.last_name}`,
      `Practice Track: ${row.practice_track} Advocacy`,
      ``,
      `EVENT INFORMATION`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `Event: The Bahamas Middle Temple Week 2026`,
      `Date: 19–23 January 2026`,
      `Venue: British Colonial Hilton`,
      `Location: Nassau, New Providence, The Bahamas`,
      ``,
      `WHAT'S NEXT`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `Your place has been secured for this intensive advocacy training programme. You will receive additional programme materials, detailed schedules, and venue information closer to the event date.`,
      ``,
      `Please ensure you have made arrangements for travel and accommodation. If you require assistance with accommodation recommendations, please do not hesitate to contact us.`,
      ``,
      `We look forward to welcoming you to Nassau in January 2026 for what promises to be an exceptional learning experience.`,
      ``,
      `Best regards,`,
      ``,
      `The Bahamas Middle Temple Society`,
      `Organising Committee`,
      `Bahamas Middle Temple Week 2026`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `For enquiries, contact: bahamasmts@bmts-events.com`
    ].join('\n');
    await sendEmail(row.email, 'Registration Confirmed – Bahamas Middle Temple Week 2026', msg);
  }

  if(status === 'Payment Rejected' || status === 'Awaiting Resubmission'){
    const msg = [
      `Dear ${row.title} ${row.last_name},`,
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
      ``,
      `REGISTRATION DETAILS`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `Registration ID: ${row.id}`,
      `Name: ${row.title} ${row.first_name} ${row.last_name}`,
      `Practice Track: ${row.practice_track} Advocacy`,
      `Payment Method: ${row.payment_method}`,
      ``,
      `WHAT TO DO NEXT`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `Please contact us at bahamasmts@bmts-events.com with the following information:`,
      ``,
      `1. Your Registration ID: ${row.id}`,
      `2. A clear copy of your payment proof (bank transfer receipt or cheque copy)`,
      `3. Any additional payment details or reference numbers`,
      ``,
      `Our team will review your payment proof and update your registration status accordingly.`,
      ``,
      `If you have already made payment, please ensure you have submitted the correct proof of payment document. For bank transfers, please include the transaction reference number. For cheques, please provide a clear copy showing the cheque details.`,
      ``,
      `We appreciate your patience and look forward to resolving this matter promptly.`,
      ``,
      `Best regards,`,
      ``,
      `The Bahamas Middle Temple Society`,
      `Organising Committee`,
      `Bahamas Middle Temple Week 2026`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `For immediate assistance, contact: bahamasmts@bmts-events.com`
    ].join('\n');
    await sendEmail(row.email, 'Action Required – Registration Payment Verification', msg);
  }

  res.json({ ok:true });
});

app.get('/admin/api/registration/:id/payment-proof', requireAdmin, (req, res) => {
  const id = req.params.id;
  const row = db.prepare('SELECT payment_file_path, payment_file_name FROM registrations WHERE id = ?').get(id);
  if(!row) return res.status(404).send('Not found');
  if(!fs.existsSync(row.payment_file_path)) return res.status(404).send('File missing');
  res.download(row.payment_file_path, row.payment_file_name);
});

app.get('/health', (req,res)=>res.json({ ok:true }));

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
