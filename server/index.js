require('dotenv').config();
const path = require('path');
const fs = require('fs');
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
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT || 587);
  if(!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host, port,
    secure: port === 465,
    auth: { user, pass }
  });
}
const transporter = createTransport();

async function sendEmail(to, subject, text){
  if(!transporter) return;
  const from = process.env.MAIL_FROM || 'bahamasmts@gmail.com';
  await transporter.sendMail({ from, to, subject, text });
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

    // Email: submission received
    const msg = [
      `Dear ${body.first_name},`,
      ``,
      `Thank you for submitting your registration for Bahamas Middle Temple Week 2026.`,
      `Your registration and payment proof have been received and are currently under review.`,
      `You will receive a confirmation email once your payment has been verified.`,
      ``,
      `Registration ID: ${id}`,
      ``,
      `Kind regards,`,
      `Bahamas Middle Temple Society`
    ].join('\n');

    await sendEmail(body.email, 'Registration Received – Bahamas Middle Temple Week 2026', msg);

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
      `Dear ${row.first_name},`,
      ``,
      `We are pleased to confirm that your registration for Bahamas Middle Temple Week 2026 has been successfully verified.`,
      `We look forward to welcoming you to Nassau in January 2026.`,
      ``,
      `Registration ID: ${row.id}`,
      ``,
      `Kind regards,`,
      `Bahamas Middle Temple Society`
    ].join('\n');
    await sendEmail(row.email, 'Registration Confirmed – Bahamas Middle Temple Week 2026', msg);
  }

  if(status === 'Payment Rejected' || status === 'Awaiting Resubmission'){
    const msg = [
      `Dear ${row.first_name},`,
      ``,
      `We were unable to verify the payment proof submitted with your registration.`,
      `Please contact the organisers at bahamasmts@gmail.com if you need assistance.`,
      ``,
      `Registration ID: ${row.id}`,
      ``,
      `Kind regards,`,
      `Bahamas Middle Temple Society`
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

app.listen(PORT, () => {
  console.log(`BMTS Events running on port ${PORT}`);
});
