# Quick Start Guide - BMTS Events

## 🚀 Get Running in 3 Steps

### Step 1: Install Dependencies
```bash
cd server
npm install
```

### Step 2: Configure Environment (if not already done)
The `.env` file should already be created. If not, copy the example:
```bash
copy .env.example .env
```

**Important**: Open `server/.env` and change `ADMIN_PASS` from `change-me-now` to something secure!

### Step 3: Start the Server
```bash
npm start
```

You should see: `BMTS Events running on port 3000`

## 🌐 Access the Application

- **Website**: http://localhost:3000
- **Admin Panel**: http://localhost:3000/admin/
  - Username: `admin` (or what you set in `.env`)
  - Password: (what you set in `.env`)

## 📝 What Happens Next?

1. The database (`server/data/bmts.sqlite`) will be created automatically
2. The uploads folder (`server/uploads/`) will be created automatically
3. You can start registering users and managing them through the admin panel

## ❓ Troubleshooting

**Port 3000 already in use?**
- Change `PORT=3000` to another port (e.g., `PORT=3001`) in `server/.env`
- Then access at `http://localhost:3001`

**npm install fails?**
- Make sure you have Node.js installed: `node --version`
- Try deleting `node_modules` folder and `package-lock.json`, then run `npm install` again

**Can't access admin panel?**
- Check your `.env` file has `ADMIN_USER` and `ADMIN_PASS` set
- The browser will prompt for Basic Auth credentials

For more details, see [README.md](README.md)

