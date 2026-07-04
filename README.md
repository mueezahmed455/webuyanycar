# WeBuyAnyVehicle UK — Vercel Serverless Deployment

Production-ready Flask application for serverless deployment on Vercel. Stateless architecture using PostgreSQL (Vercel Postgres), JWT authentication, Vercel Blob storage, and secure form handling.

## Quick Deploy

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Login
vercel login

# 3. Set environment variables
vercel env add POSTGRES_URL
vercel env add POSTGRES_URL_NON_POOLING
vercel env add JWT_SECRET_KEY
vercel env add ADMIN_PASSWORD_HASH
vercel env add BLOB_READ_WRITE_TOKEN
vercel env add MAIL_SERVER
vercel env add MAIL_PORT
vercel env add MAIL_USERNAME
vercel env add MAIL_PASSWORD

# 4. Deploy
vercel --prod
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTGRES_URL` | Yes | Vercel Postgres connection string (pooled) |
| `POSTGRES_URL_NON_POOLING` | Yes | Non-pooled connection for migrations |
| `JWT_SECRET_KEY` | Yes | 32+ character random string |
| `ADMIN_PASSWORD_HASH` | Yes | Bcrypt hash of admin password |
| `BLOB_READ_WRITE_TOKEN` | Yes | Vercel Blob token for file uploads |
| `MAIL_SERVER` | Yes | SMTP server (e.g. smtp.gmail.com) |
| `MAIL_PORT` | Yes | SMTP port (587) |
| `MAIL_USERNAME` | Yes | SMTP username |
| `MAIL_PASSWORD` | Yes | SMTP app password |
| `MAIL_DEFAULT_SENDER` | No | Default from address |
| `QSTASH_TOKEN` | No | Upstash QStash token for async email |
| `QSTASH_CURRENT_SIGNING_KEY` | No | QStash signature verification |
| `REDIS_URL` | No | Upstash Redis URL for rate limiting |
| `SENTRY_DSN` | No | Error tracking |
| `RECAPTCHA_SECRET_KEY` | No | reCAPTCHA v3 secret |

## Database Setup

1. Create a Vercel Postgres database in the Vercel Dashboard (Storage tab)
2. Copy the connection strings to your environment variables
3. Run the migration:

```bash
psql $POSTGRES_URL_NON_POOLING -f migrations/001_init.sql
```

4. Generate admin password hash:

```bash
python -c "import bcrypt; print(bcrypt.hashpw(b'yourpassword', bcrypt.gensalt()).decode())"
```

## Local Development

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your credentials

# Run the Flask app
python api/index.py
```

## Architecture

| Component | Technology | Notes |
|-----------|-----------|-------|
| **Runtime** | Flask 3.x on Vercel Python | Serverless functions |
| **Database** | PostgreSQL via Vercel Postgres (Neon) | Connection pooling via psycopg2 |
| **Auth** | JWT (Flask-JWT-Extended) | httpOnly cookies, 8hr expiry |
| **File Storage** | Vercel Blob | CDN URLs stored in DB |
| **Email** | SMTP + QStash (optional) | Async queue via QStash, sync fallback |
| **Rate Limiting** | Flask-Limiter | Redis-backed (Upstash), memory fallback |
| **Security** | CSP, HSTS, CSRF tokens, input sanitization | Production-hardened headers |
| **Monitoring** | Structured JSON logging + Sentry (optional) | Vercel-compatible log format |

## Project Structure

```
/
├── api/
│   └── index.py              # Flask app entry point
├── templates/
│   ├── base.html              # Base template with nav/footer
│   ├── index.html             # Home page
│   ├── quote.html             # Quote form
│   ├── quote-success.html     # Quote success page
│   ├── how-it-works.html      # How it works
│   ├── what-we-buy.html       # What we buy
│   ├── about.html             # About us
│   ├── contact.html           # Contact form
│   ├── faq.html               # FAQ accordion
│   ├── privacy.html           # Privacy policy
│   ├── terms.html             # Terms & conditions
│   ├── 404.html               # 404 error
│   ├── 500.html               # 500 error
│   └── admin/
│       ├── login.html         # Admin login
│       ├── dashboard.html     # Admin dashboard
│       ├── quotes.html        # Quotes management
│       ├── quote_detail.html  # Quote detail view
│       └── contacts.html      # Contact messages
├── static/
│   ├── css/main.css           # Stylesheet
│   ├── js/main.js             # JavaScript
│   └── img/logo.svg           # SVG logo
├── migrations/
│   └── 001_init.sql           # Database schema
├── vercel.json                # Vercel configuration
├── requirements.txt           # Python dependencies
├── .env.example               # Environment variables template
└── README.md                  # This file
```

## API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/valuation` | POST | No | Calculate instant valuation |
| `/api/stats` | GET | No | Public quote statistics |
| `/api/health` | GET | No | Health check endpoint |
| `/api/send-email` | POST | QStash | Email sending (QStash callback) |

## Admin Access

- Login URL: `/admin/login`
- Default username: `admin`
- Password: Set via `ADMIN_PASSWORD_HASH` env var
- Generate hash: `python -c "import bcrypt; print(bcrypt.hashpw(b'yourpassword', bcrypt.gensalt()).decode())"`

## Custom Domain

```bash
# Add domain in Vercel dashboard
vercel domains add webuyanyvehicle.co.uk

# Or via CLI
vercel domains add yourdomain.com --project webuyanyvehicle
```

## Scaling

- Vercel automatically scales with traffic
- Configure function memory/timeout in `vercel.json`
- Add Redis via Vercel Storage for better rate limiting at scale
- Consider Vercel WAF for DDoS protection at the edge

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `503 Service Unavailable` | Database connection failed | Check `POSTGRES_URL` env var and VPC |
| `401 Unauthorized` | JWT token missing/expired | Clear cookies, re-login at `/admin/login` |
| `413 File too large` | Upload > 5MB | Resize images, max 5MB per file |
| `429 Too Many Requests` | Rate limit exceeded | Wait 1 minute, reduce request frequency |
| Module not found | Missing dependency | Run `pip install -r requirements.txt` |
| Static files 404 | Wrong path in templates | Files must be in `/static/` directory |

## License

Proprietary — WeBuyAnyVehicle UK Ltd
