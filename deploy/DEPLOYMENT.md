# Docker Deployment Guide - BMTS Events

This guide will help you deploy the BMTS Events application using Docker.

## Prerequisites

- Docker installed (version 20.10 or higher)
- Docker Compose installed (version 2.0 or higher)
- A VPS/server with at least 1GB RAM
- Domain name (optional, but recommended)

## Quick Deployment Steps

### 1. Prepare the Environment File

Navigate to the `deploy` directory and create your `.env` file:

```bash
cd deploy
cp .env.example .env
```

### 2. Configure Environment Variables

Edit the `.env` file and set the following **REQUIRED** variables:

```env
ADMIN_USER=your-admin-username
ADMIN_PASS=your-secure-password
```

**Optional** email configuration (if you want email notifications):

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
MAIL_FROM=bcrousseau@hotmail.com
```

### 3. Build and Start the Container

From the `deploy` directory, run:

```bash
docker compose up -d --build
```

This will:
- Build the Docker image
- Create and start the container
- Set up volume mounts for data persistence
- Expose the application on port 3000

### 4. Verify Deployment

Check if the container is running:

```bash
docker compose ps
```

Test the health endpoint:

```bash
curl http://localhost:3000/health
```

Or visit in your browser:
- **Main Site**: http://YOUR_SERVER_IP:3000
- **Admin Panel**: http://YOUR_SERVER_IP:3000/admin/

### 5. Set Up Nginx Reverse Proxy (Optional but Recommended)

For production, set up Nginx as a reverse proxy:

1. Copy the example Nginx config:
   ```bash
   sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/bmts-events.com
   ```

2. Edit the config file and update the server name:
   ```bash
   sudo nano /etc/nginx/sites-available/bmts-events.com
   ```

3. Enable the site:
   ```bash
   sudo ln -s /etc/nginx/sites-available/bmts-events.com /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

4. Set up SSL with Let's Encrypt:
   ```bash
   sudo certbot --nginx -d BMTS-events.com -d www.BMTS-events.com
   ```

## Container Management

### View Logs

```bash
docker compose logs -f
```

### Stop the Container

```bash
docker compose down
```

### Restart the Container

```bash
docker compose restart
```

### Update the Application

1. Pull the latest code
2. Rebuild and restart:
   ```bash
   docker compose up -d --build
   ```

## Data Persistence

The following directories are mounted as volumes to persist data:

- **Database**: `server/data/bmts.sqlite` → `/app/server/data/bmts.sqlite`
- **Uploads**: `server/uploads/` → `/app/server/uploads/`

**Important**: Back up these directories regularly!

### Backup Database

```bash
cp server/data/bmts.sqlite server/data/bmts.sqlite.backup
```

### Backup Uploads

```bash
tar -czf uploads-backup.tar.gz server/uploads/
```

## Troubleshooting

### Container Won't Start

1. Check logs:
   ```bash
   docker compose logs
   ```

2. Verify environment variables are set correctly in `.env`

3. Check if port 3000 is already in use:
   ```bash
   netstat -tulpn | grep 3000
   ```

### Can't Access Admin Panel

1. Verify `ADMIN_USER` and `ADMIN_PASS` are set in `.env`
2. Restart the container:
   ```bash
   docker compose restart
   ```

### Database Issues

If the database becomes corrupted:

1. Stop the container
2. Backup the current database
3. Delete `server/data/bmts.sqlite`
4. Restart the container (a new database will be created)

### Email Not Working

Email is optional. If SMTP is not configured, the application will run normally but won't send emails. To enable:

1. Configure SMTP settings in `.env`
2. Restart the container:
   ```bash
   docker compose restart
   ```

## Security Checklist

Before going live:

- [ ] Change `ADMIN_PASS` to a strong password
- [ ] Change `ADMIN_USER` from default
- [ ] Set up HTTPS with Let's Encrypt
- [ ] Configure firewall (only allow ports 80, 443, and SSH)
- [ ] Set up regular backups
- [ ] Review Nginx security headers
- [ ] Keep Docker and system packages updated

## Monitoring

### Check Container Status

```bash
docker compose ps
```

### View Resource Usage

```bash
docker stats bmts-events
```

### Check Application Health

```bash
curl http://localhost:3000/health
```

## Support

For issues or questions, contact: bcrousseau@hotmail.com


