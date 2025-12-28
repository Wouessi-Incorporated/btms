BMTS Events – Turnkey Landing Page + Registration System
Domain target: https://BMTS-events.com

What you get
1) Public landing page (SEO-ready) with the supplied images in the correct order
2) Registration form with secure upload of payment proof (PDF/JPG/JPEG/PNG, 10MB max)
3) Admin dashboard to review registrations and download payment proofs
4) Manual payment verification workflow with status updates
5) Optional automated emails (submission received, verified, action required)
6) Docker deployment for any VPS (recommended)

Folder map
/public        Static site (landing + privacy + terms + thank you)
/server        Node.js backend (API + admin + database)
/deploy        Docker + Nginx examples

Quick deploy (recommended)
Prerequisites
- A VPS (Ubuntu is fine)
- Docker and Docker Compose installed
- Domain BMTS-events.com pointed to your server IP (A record)

Steps
1) Upload this project folder to your server
2) Go to the deploy folder:
   cd bmts-events/deploy

3) Create an environment file:
   cp .env.example .env

4) Edit .env and set:
   ADMIN_USER
   ADMIN_PASS
   Optional SMTP fields for email sending

5) Build and run:
   docker compose up -d --build

6) Open:
   http://YOUR_SERVER_IP:3000

7) Set Nginx reverse proxy (optional but recommended for domain)
   Use deploy/nginx.conf.example as your starting point.

Admin
- URL: https://BMTS-events.com/admin/
- Browser will ask for login (Basic Auth)
- Use ADMIN_USER and ADMIN_PASS from .env

Data and files
- SQLite database: /server/data/bmts.sqlite
- Uploads: /server/uploads/
Make sure these folders are backed up.

Email (optional)
If SMTP is configured, the system sends:
- Submission Received
- Registration Confirmed (after admin sets Payment Verified)
- Action Required (after admin sets Payment Rejected or Awaiting Resubmission)

Security notes
- Change ADMIN_PASS before going live
- Keep admin credentials private
- Use HTTPS (LetsEncrypt) on your Nginx/Cloudflare/hosting layer
- Never share uploads publicly

Support contact shown on the site
bahamasmts@gmail.com
