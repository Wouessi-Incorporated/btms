# BMTS Events - Local Development Setup

This is a Node.js/Express application for the Bahamas Middle Temple Week 2026 event registration system.

## Prerequisites

Before you begin, make sure you have the following installed:

- **Node.js** (version 14 or higher) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)

To verify your installation, run:
```bash
node --version
npm --version
```

## Quick Start Guide

### Step 1: Install Dependencies

Navigate to the `server` directory and install the required packages:

```bash
cd server
npm install
```

This will install all the dependencies listed in `package.json`.

### Step 2: Configure Environment Variables

1. Copy the example environment file:
   ```bash
   copy .env.example .env
   ```
   (On Linux/Mac: `cp .env.example .env`)

2. Open the `.env` file and update the following values:
   - `ADMIN_USER`: Your admin username (default: `admin`)
   - `ADMIN_PASS`: Your admin password (default: `change-me-now`) - **IMPORTANT: Change this!**
   - Optional: Configure SMTP settings if you want email functionality

### Step 3: Run the Application

Start the server:

```bash
npm start
```

Or for development mode:

```bash
npm run dev
```

You should see:
```
BMTS Events running on port 3000
```

### Step 4: Access the Application

- **Main Website**: Open your browser and go to `http://localhost:3000`
- **Admin Dashboard**: Go to `http://localhost:3000/admin/`
  - Use the credentials you set in the `.env` file (ADMIN_USER and ADMIN_PASS)

## Project Structure

```
bmts-events/
├── public/              # Static website files (HTML, CSS, JS, images)
│   ├── index.html      # Main landing page
│   ├── privacy.html    # Privacy policy
│   ├── terms.html      # Terms and conditions
│   ├── thank-you.html  # Thank you page after registration
│   └── assets/         # CSS, JavaScript, and images
├── server/              # Backend application
│   ├── index.js        # Main server file
│   ├── package.json    # Dependencies and scripts
│   ├── .env            # Environment variables (create from .env.example)
│   ├── data/           # SQLite database (created automatically)
│   ├── uploads/        # Payment proof uploads (created automatically)
│   └── templates/      # Admin dashboard template
└── deploy/             # Docker deployment files
```

## Features

- ✅ Public landing page with event information
- ✅ Registration form with payment proof upload
- ✅ Admin dashboard to review registrations
- ✅ Manual payment verification workflow
- ✅ Optional email notifications (if SMTP configured)
- ✅ SQLite database for data storage

## Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `PORT` | No | Server port | `3000` |
| `DB_PATH` | No | Path to SQLite database | `./data/bmts.sqlite` |
| `UPLOAD_DIR` | No | Directory for file uploads | `./uploads` |
| `ADMIN_USER` | Yes | Admin username | `admin` |
| `ADMIN_PASS` | Yes | Admin password | `change-me-now` |
| `SMTP_HOST` | No | SMTP server host | - |
| `SMTP_PORT` | No | SMTP server port | `587` |
| `SMTP_USER` | No | SMTP username | - |
| `SMTP_PASS` | No | SMTP password | - |
| `MAIL_FROM` | No | Email sender address | `bahamasmts@gmail.com` |

## Admin Dashboard

The admin dashboard allows you to:
- View all registrations
- Filter by status (Pending Verification, Payment Verified, etc.)
- View registration details
- Download payment proof files
- Update registration status and add admin notes
- Send automated emails (if SMTP is configured)

## Database

The application uses SQLite, which is automatically created when you first run the server. The database file will be located at:
- `server/data/bmts.sqlite`

**Important**: Back up this file regularly, especially before updates!

## File Uploads

Payment proof files are stored in:
- `server/uploads/`

Files are automatically renamed with UUIDs for security. Only PDF, JPG, JPEG, and PNG files up to 10MB are accepted.

## Troubleshooting

### Port Already in Use
If port 3000 is already in use, change the `PORT` value in your `.env` file.

### Database Errors
If you encounter database errors:
1. Make sure the `server/data/` directory exists (it's created automatically)
2. Delete `server/data/bmts.sqlite` to start fresh (⚠️ This will delete all data!)

### File Upload Issues
1. Make sure the `server/uploads/` directory exists (it's created automatically)
2. Check file permissions on the uploads directory

### Email Not Working
Email functionality is optional. If you haven't configured SMTP settings, the application will run normally but won't send emails. This is fine for local development.

## Development Tips

- The server automatically restarts when you make changes (if using `npm run dev`)
- Check the console for error messages
- Use the `/health` endpoint (`http://localhost:3000/health`) to verify the server is running

## Production Deployment

For production deployment, see the `deploy/` folder for Docker configuration. Refer to `README.txt` for production deployment instructions.

## Support

For issues or questions, contact: bahamasmts@gmail.com

