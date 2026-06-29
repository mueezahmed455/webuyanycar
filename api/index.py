"""
WeBuyAnyCar UK - Vercel Serverless Entry Point
Production-ready Flask app for serverless deployment on Vercel.
Stateless: PostgreSQL + JWT + Vercel Blob + QStash queue.
"""

import os
import sys
import json
import re
import logging
import uuid
import smtplib
import hashlib
import hmac
import time
from email.mime.text import MIMEText
from datetime import datetime, timedelta
from functools import wraps

import bleach
import bcrypt
from email_validator import validate_email, EmailNotValidError
from werkzeug.utils import secure_filename
from PIL import Image

# Add parent to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import (
    Flask, render_template, request, redirect, url_for,
    flash, jsonify, make_response, send_from_directory, g
)
from flask_jwt_extended import (
    JWTManager, create_access_token, jwt_required,
    get_jwt_identity, set_access_cookies, unset_jwt_cookies,
    get_jwt
)
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.pool import SimpleConnectionPool

# Load .env.local for local development
try:
    from dotenv import load_dotenv
    load_dotenv('.env.local')
except ImportError:
    pass

# ─── STRUCTURED LOGGING ───

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_entry = {
            'timestamp': datetime.utcnow().isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'module': record.module,
            'function': record.funcName,
        }
        if hasattr(record, 'extra_data'):
            log_entry.update(record.extra_data)
        if record.exc_info and record.exc_info[0]:
            log_entry['exception'] = self.formatException(record.exc_info)
        return json.dumps(log_entry)

logger = logging.getLogger('webuyanycar')
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter())
    logger.addHandler(handler)

# ─── SENTRY (optional) ───

SENTRY_DSN = os.environ.get('SENTRY_DSN')
if SENTRY_DSN:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.flask import FlaskIntegration
        sentry_sdk.init(
            dsn=SENTRY_DSN,
            integrations=[FlaskIntegration()],
            traces_sample_rate=0.1,
        )
        logger.info("Sentry initialized")
    except ImportError:
        logger.warning("Sentry SDK not installed, skipping Sentry initialization")

# ─── INITIALISE APP ───

app = Flask(__name__, template_folder='../templates', static_folder='../static')

# Core config
app.config['SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'dev-key-change-me')
app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'dev-jwt-key-change-me')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=8)
app.config['JWT_TOKEN_LOCATION'] = ['cookies']
app.config['JWT_COOKIE_SECURE'] = True
app.config['JWT_COOKIE_CSRF_PROTECT'] = True
app.config['JWT_CSRF_IN_COOKIES'] = True
app.config['JWT_COOKIE_SAMESITE'] = 'Lax'
app.config['JWT_ACCESS_CSRF_HEADER_NAME'] = 'X-CSRF-TOKEN'

# Max upload size
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024  # 5MB

jwt = JWTManager(app)

# ─── RATE LIMITING ───

REDIS_URL = os.environ.get('REDIS_URL')
if REDIS_URL:
    storage_uri = REDIS_URL
else:
    storage_uri = "memory://"

limiter = Limiter(
    get_remote_address,
    app=app,
    storage_uri=storage_uri,
    default_limits=["200 per day", "50 per hour"],
    strategy="fixed-window",
)

# ─── DATABASE (PostgreSQL via Vercel Postgres / Neon) ───

DATABASE_URL = os.environ.get('POSTGRES_URL') or os.environ.get('DATABASE_URL')
POOL = None


def get_db():
    global POOL
    if POOL is None and DATABASE_URL:
        try:
            POOL = SimpleConnectionPool(1, 5, dsn=DATABASE_URL, sslmode='require')
            logger.info("Database connection pool initialized")
        except Exception as e:
            logger.error("Database pool init error", extra={'extra_data': {'error': str(e)}})
            return None
    if POOL:
        try:
            return POOL.getconn()
        except Exception as e:
            logger.error("Database connection error", extra={'extra_data': {'error': str(e)}})
            return None
    return None


def release_db(conn):
    if POOL and conn:
        POOL.putconn(conn)


def init_db():
    """Create tables if they don't exist. Run this once via migration."""
    conn = get_db()
    if not conn:
        logger.error("Cannot initialize database: no connection")
        return
    try:
        with conn.cursor() as c:
            c.execute("""
                CREATE TABLE IF NOT EXISTS quotes (
                    id SERIAL PRIMARY KEY,
                    quote_ref VARCHAR(20) UNIQUE NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    phone VARCHAR(50) NOT NULL,
                    email VARCHAR(255) NOT NULL,
                    address TEXT,
                    postcode VARCHAR(20),
                    make VARCHAR(100) NOT NULL,
                    model VARCHAR(255) NOT NULL,
                    year INTEGER NOT NULL,
                    mileage VARCHAR(50) NOT NULL,
                    reg_number VARCHAR(20),
                    fuel_type VARCHAR(50),
                    condition VARCHAR(255) NOT NULL,
                    mot_status VARCHAR(100),
                    photos TEXT,
                    additional_info TEXT,
                    valuation_amount DECIMAL(10,2),
                    status VARCHAR(50) DEFAULT 'new',
                    ip_address INET,
                    user_agent TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            c.execute("""
                CREATE TABLE IF NOT EXISTS contacts (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    email VARCHAR(255) NOT NULL,
                    phone VARCHAR(50),
                    subject VARCHAR(255),
                    message TEXT NOT NULL,
                    ip_address INET,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            c.execute("""
                CREATE TABLE IF NOT EXISTS admins (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(100) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # Check if default admin exists
            c.execute("SELECT COUNT(*) FROM admins")
            if c.fetchone()[0] == 0:
                default_hash = os.environ.get('ADMIN_PASSWORD_HASH')
                if not default_hash:
                    default_hash = bcrypt.hashpw(b'admin123', bcrypt.gensalt()).decode()
                    logger.warning("Using default admin password - set ADMIN_PASSWORD_HASH env var")
                c.execute(
                    "INSERT INTO admins (username, password_hash) VALUES (%s, %s)",
                    ('admin', default_hash)
                )
                logger.info("Default admin user created")
            conn.commit()
        logger.info("Database tables initialized")
    except Exception as e:
        logger.error("Database init error", extra={'extra_data': {'error': str(e)}})
    finally:
        release_db(conn)

# ─── VALUATION ENGINE ───

MAKE_PREMIUMS = {
    'Audi': 1.15, 'BMW': 1.15, 'Mercedes-Benz': 1.15,
    'Lexus': 1.10, 'Land Rover': 1.10, 'Jaguar': 1.05,
    'Volkswagen': 1.05, 'Toyota': 1.05, 'Honda': 1.05,
    'Ford': 1.0, 'Vauxhall': 0.95, 'Peugeot': 0.95,
    'Renault': 0.90, 'Citroen': 0.90, 'Fiat': 0.85,
    'Other': 1.0
}

CONDITION_MULTIPLIERS = {
    'Excellent - Like new, full service history': 1.0,
    'Good - Minor wear, runs perfectly': 0.85,
    'Fair - Some cosmetic/mechanical issues': 0.65,
    'Poor - Needs significant work': 0.40,
    'Damaged - Accident damage, write-off': 0.25,
    "Non-runner - Won't start or drive": 0.15,
    'Scrap - End of life, salvage only': 0.08,
    'MOT Failed - Failed recent test': 0.20
}


def calculate_valuation(make, model, year, mileage_str, condition):
    try:
        mileage = int(re.sub(r'[^0-9]', '', str(mileage_str)))
    except (ValueError, TypeError):
        mileage = 50000
    current_year = 2026
    age = max(0, current_year - int(year))
    base_value = 15000
    for y in range(1, age + 1):
        if y == 1:
            base_value *= 0.85
        elif y <= 3:
            base_value *= 0.90
        elif y <= 6:
            base_value *= 0.93
        elif y <= 10:
            base_value *= 0.95
        else:
            base_value *= 0.97
    excess_miles = max(0, mileage - 30000)
    mileage_penalty = 1 - (excess_miles / 10000) * 0.03
    mileage_penalty = max(0.3, mileage_penalty)
    make_mult = MAKE_PREMIUMS.get(make, 1.0)
    cond_mult = CONDITION_MULTIPLIERS.get(condition, 0.5)
    valuation = base_value * mileage_penalty * make_mult * cond_mult
    if cond_mult <= 0.15:
        valuation = max(valuation, 150)
    elif cond_mult <= 0.25:
        valuation = max(valuation, 300)
    elif age > 15:
        valuation = max(valuation, 200)
    else:
        valuation = max(valuation, 500)
    return round(valuation, 2)


# ─── SECURITY HELPERS ───

ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'webp'}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB


def sanitize_input(text, max_length=1000):
    if not text:
        return ''
    text = str(text)[:max_length]
    return bleach.clean(text, tags=[], strip=True)


def validate_phone(phone):
    if not phone:
        return None
    cleaned = re.sub(r'[^0-9+\s()-]', '', str(phone))
    return cleaned[:20] if len(re.sub(r'[^0-9]', '', cleaned)) >= 10 else None


def validate_postcode(postcode):
    if not postcode:
        return False
    pattern = r'^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$'
    return bool(re.match(pattern, str(postcode).upper().strip()))


def validate_file_upload(file_storage):
    """Validate uploaded file: check extension, content type, and size."""
    if not file_storage or not file_storage.filename:
        return False, "No file provided"

    ext = file_storage.filename.rsplit('.', 1)[-1].lower() if '.' in file_storage.filename else ''
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"File type .{ext} not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"

    # Check content type via Pillow
    try:
        img = Image.open(file_storage)
        img.verify()
        file_storage.seek(0)
    except Exception:
        return False, "Invalid image file"

    return True, None


def upload_to_blob(file_storage, quote_ref, index):
    """Upload a file to Vercel Blob and return the CDN URL."""
    blob_token = os.environ.get('BLOB_READ_WRITE_TOKEN')
    if not blob_token:
        logger.warning("BLOB_READ_WRITE_TOKEN not set, cannot upload files")
        return None

    ext = file_storage.filename.rsplit('.', 1)[-1].lower()
    safe_name = secure_filename(file_storage.filename)
    blob_path = f"quotes/{quote_ref}/{index}_{safe_name}"

    try:
        from vercel.blob import put
        result = put(
            path=blob_path,
            body=file_storage,
            access="public",
            content_type=f"image/{ext}",
            add_random_suffix=True
        )
        logger.info("File uploaded to Vercel Blob", extra={
            'extra_data': {'path': blob_path, 'url': result.url}
        })
        return result.url
    except ImportError:
        logger.warning("vercel package not installed, using fallback upload")
        return None
    except Exception as e:
        logger.error("Blob upload error", extra={'extra_data': {'error': str(e)}})
        return None


# ─── CSRF PROTECTION (Double-Submit Cookie Pattern) ───

def generate_csrf_token():
    token = hashlib.sha256(os.urandom(64)).hexdigest()
    return token


@app.before_request
def setup_csrf():
    if request.method in ('GET', 'HEAD', 'OPTIONS', 'TRACE'):
        return
    # For POST/PUT/DELETE, validate CSRF
    if request.method == 'POST':
        csrf_cookie = request.cookies.get('csrf_token')
        csrf_header = request.headers.get('X-CSRF-Token')
        if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
            # Skip CSRF check for API endpoints with JWT protection
            if request.path.startswith('/api/'):
                return
            return jsonify({'error': 'CSRF validation failed'}), 403


@app.after_request
def add_csrf_cookie(response):
    if not request.cookies.get('csrf_token'):
        token = generate_csrf_token()
        response.set_cookie('csrf_token', token, httponly=False, samesite='Lax',
                           secure=os.environ.get('FLASK_ENV') == 'production',
                           max_age=86400)
    return response


# ─── SECURITY HEADERS ───

@app.after_request
def add_security_headers(response):
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
    csp = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://kit.fontawesome.com https://www.google.com https://www.gstatic.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; "
        "img-src 'self' data: https://*.vercel-storage.com https://blob.vercel-storage.com; "
        "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; "
        "connect-src 'self'; "
        "frame-src 'self' https://www.google.com; "
        "object-src 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )
    response.headers['Content-Security-Policy'] = csp

    # Cache static assets
    if request.path.startswith('/static/'):
        response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    return response


# ─── EMAIL ───

def send_email_sync(subject, body, to_email):
    """Send email via SMTP synchronously."""
    try:
        server = os.environ.get('MAIL_SERVER', 'smtp.gmail.com')
        port = int(os.environ.get('MAIL_PORT', 587))
        username = os.environ.get('MAIL_USERNAME', '')
        password = os.environ.get('MAIL_PASSWORD', '')
        sender = os.environ.get('MAIL_DEFAULT_SENDER', 'quotes@webuyanycar.co.uk')

        if not all([username, password]):
            logger.warning("Email credentials not configured")
            return False

        msg = MIMEText(body, 'plain', 'utf-8')
        msg['Subject'] = subject
        msg['From'] = sender
        msg['To'] = to_email
        msg['X-Mailer'] = 'WeBuyAnyCar UK'

        with smtplib.SMTP(server, port) as s:
            s.starttls()
            s.login(username, password)
            s.send_message(msg)

        logger.info("Email sent", extra={
            'extra_data': {'to': to_email, 'subject': subject}
        })
        return True
    except Exception as e:
        logger.error("Email send error", extra={'extra_data': {'error': str(e)}})
        return False


def send_email_async(subject, body, to_email):
    """Send email via QStash queue, falling back to synchronous SMTP."""
    qstash_token = os.environ.get('QSTASH_TOKEN')
    base_url = request.host_url.rstrip('/') if request else os.environ.get('APP_URL', '')

    if qstash_token and base_url:
        try:
            callback_url = f"{base_url}/api/send-email"
            payload = {
                'subject': subject,
                'body': body,
                'to_email': to_email,
            }
            headers = {
                'Authorization': f'Bearer {qstash_token}',
                'Content-Type': 'application/json',
            }
            import requests as req
            resp = req.post(
                f'https://qstash.upstash.io/v2/publish/{callback_url}',
                json=payload,
                headers=headers,
                timeout=10,
            )
            if resp.ok:
                logger.info("Email queued via QStash", extra={
                    'extra_data': {'to': to_email}
                })
                return True
            else:
                logger.warning("QStash queue failed, falling back to sync",
                              extra={'extra_data': {'status': resp.status_code}})
        except Exception as e:
            logger.warning(f"QStash error: {e}, falling back to sync email")

    # Fallback to synchronous
    return send_email_sync(subject, body, to_email)


@app.route('/api/send-email', methods=['POST'])
def handle_send_email():
    """Endpoint for QStash to call for sending emails."""
    qstash_token = os.environ.get('QSTASH_TOKEN')
    if qstash_token:
        # Verify QStash signature
        signature = request.headers.get('Upstash-Signature', '')
        if not signature:
            return jsonify({'error': 'Missing signature'}), 401

        try:
            current_signing_key = os.environ.get('QSTASH_CURRENT_SIGNING_KEY', '')
            if current_signing_key:
                body = request.get_data()
                expected_sig = hmac.new(
                    current_signing_key.encode(),
                    body,
                    hashlib.sha256
                ).hexdigest()
                if signature != expected_sig:
                    logger.warning("Invalid QStash signature")
                    return jsonify({'error': 'Invalid signature'}), 401
        except Exception as e:
            logger.error("QStash signature verification error", extra={
                'extra_data': {'error': str(e)}
            })

    data = request.get_json() or {}
    subject = data.get('subject', 'Notification')
    body = data.get('body', '')
    to_email = data.get('to_email', '')

    if not to_email or not body:
        return jsonify({'error': 'Missing required fields'}), 400

    success = send_email_sync(subject, body, to_email)
    if success:
        return jsonify({'status': 'sent'}), 200
    return jsonify({'error': 'Failed to send email'}), 500


# ─── AUTH DECORATORS ───

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        try:
            jwt_required()(lambda: None)()
            identity = get_jwt_identity()
            if identity != 'admin':
                return redirect(url_for('admin_login'))
            return f(*args, **kwargs)
        except Exception:
            return redirect(url_for('admin_login'))
    return decorated


# ─── CONTEXT PROCESSORS ───

@app.context_processor
def inject_globals():
    return {
        'csrf_token': request.cookies.get('csrf_token', ''),
        'company_name': os.environ.get('COMPANY_NAME', 'WeBuyAnyCar UK'),
        'company_phone': os.environ.get('COMPANY_PHONE', '0800 123 4567'),
        'company_email': os.environ.get('COMPANY_EMAIL', 'quotes@webuyanycar.co.uk'),
        'company_address': os.environ.get('COMPANY_ADDRESS', 'Birmingham, UK'),
    }


# ─── ROUTES ───

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/about')
def about():
    return render_template('about.html')


@app.route('/how-it-works')
def how_it_works():
    return render_template('how-it-works.html')


@app.route('/what-we-buy')
def what_we_buy():
    return render_template('what-we-buy.html')


@app.route('/quote', methods=['GET', 'POST'])
@limiter.limit("10 per minute")
def quote():
    if request.method == 'POST':
        # Validate inputs
        name = sanitize_input(request.form.get('name'), 100)
        phone = validate_phone(request.form.get('phone'))
        if not phone:
            return jsonify({'error': 'Invalid phone number'}), 400

        email_raw = request.form.get('email', '').strip().lower()
        try:
            email = validate_email(email_raw).email
        except EmailNotValidError:
            return jsonify({'error': 'Invalid email address'}), 400

        address = sanitize_input(request.form.get('address'), 200)
        postcode = sanitize_input(request.form.get('postcode'), 20).upper()
        make = sanitize_input(request.form.get('make'), 50)
        model = sanitize_input(request.form.get('model'), 100)
        year = request.form.get('year')
        mileage = sanitize_input(request.form.get('mileage'), 50)
        reg = sanitize_input(request.form.get('reg_number', ''), 20).upper()
        fuel = sanitize_input(request.form.get('fuel_type', 'Petrol'), 50)
        condition = request.form.get('condition', '')
        mot = request.form.get('mot_status', 'Valid MOT')
        additional = sanitize_input(request.form.get('additional_info', ''), 2000)

        # Validate required fields
        if not all([name, make, model, year, mileage, condition]):
            return jsonify({'error': 'Please fill in all required fields'}), 400

        # Generate quote ref
        quote_ref = 'Q-' + uuid.uuid4().hex[:8].upper()

        # Calculate valuation
        valuation = calculate_valuation(make, model, year, mileage, condition)

        # Handle file uploads via Vercel Blob
        photo_urls = []
        if 'photos' in request.files:
            files = request.files.getlist('photos')
            for idx, file in enumerate(files):
                if file and file.filename:
                    # Validate file
                    is_valid, error = validate_file_upload(file)
                    if not is_valid:
                        continue
                    # Upload to Vercel Blob
                    url = upload_to_blob(file, quote_ref, idx)
                    if url:
                        photo_urls.append(url)

        photos_json = json.dumps(photo_urls)

        # Get IP and user agent
        ip_address = request.headers.get('X-Forwarded-For', request.remote_addr or '').split(',')[0].strip()
        user_agent = request.headers.get('User-Agent', '')[:255]

        # Save to database
        conn = get_db()
        if not conn:
            logger.error("Database unavailable for quote submission")
            return jsonify({'error': 'Service temporarily unavailable. Please try again.'}), 503

        try:
            with conn.cursor() as c:
                c.execute("""
                    INSERT INTO quotes (quote_ref, name, phone, email, address, postcode, make, model,
                                      year, mileage, reg_number, fuel_type, condition, mot_status,
                                      photos, additional_info, valuation_amount, ip_address, user_agent)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::inet, %s)
                """, (quote_ref, name, phone, email, address, postcode, make, model, int(year), mileage,
                      reg, fuel, condition, mot, photos_json, additional, float(valuation),
                      ip_address, user_agent))
                conn.commit()

            logger.info("Quote submitted", extra={
                'extra_data': {'quote_ref': quote_ref, 'valuation': valuation}
            })
        except Exception as e:
            logger.error("Quote database error", extra={
                'extra_data': {'error': str(e), 'quote_ref': quote_ref}
            })
            return jsonify({'error': 'Failed to save quote. Please try again.'}), 500
        finally:
            release_db(conn)

        # Send email notification (async via QStash or sync fallback)
        email_subject = f'New Quote Request - {quote_ref}'
        email_body = (
            f"New quote request received\n"
            f"Reference: {quote_ref}\n"
            f"Name: {name}\n"
            f"Phone: {phone}\n"
            f"Email: {email}\n"
            f"Vehicle: {year} {make} {model}\n"
            f"Valuation: £{valuation:,.2f}\n"
            f"IP: {ip_address}\n"
            f"Submitted: {datetime.utcnow().isoformat()}"
        )
        # Fire and forget email
        import threading
        t = threading.Thread(
            target=send_email_async,
            args=(email_subject, email_body, os.environ.get('MAIL_DEFAULT_SENDER', 'quotes@webuyanycar.co.uk'))
        )
        t.daemon = True
        t.start()

        return render_template('quote-success.html', quote_ref=quote_ref, valuation=valuation)

    return render_template('quote.html')


@app.route('/contact', methods=['GET', 'POST'])
@limiter.limit("5 per minute")
def contact():
    if request.method == 'POST':
        name = sanitize_input(request.form.get('name'), 100)
        email_raw = request.form.get('email', '').strip().lower()
        try:
            email = validate_email(email_raw).email
        except EmailNotValidError:
            flash('Please enter a valid email address', 'error')
            return redirect(url_for('contact'))

        phone = validate_phone(request.form.get('phone'))
        subject = sanitize_input(request.form.get('subject', 'General Enquiry'), 100)
        message = sanitize_input(request.form.get('message'), 5000)

        if not name or not message:
            flash('Please fill in all required fields', 'error')
            return redirect(url_for('contact'))

        ip_address = request.headers.get('X-Forwarded-For', request.remote_addr or '').split(',')[0].strip()

        conn = get_db()
        if conn:
            try:
                with conn.cursor() as c:
                    c.execute(
                        "INSERT INTO contacts (name, email, phone, subject, message, ip_address) VALUES (%s, %s, %s, %s, %s, %s::inet)",
                        (name, email, phone, subject, message, ip_address)
                    )
                    conn.commit()
            except Exception as e:
                logger.error("Contact database error", extra={'extra_data': {'error': str(e)}})
            finally:
                release_db(conn)

        # Notify via email
        email_subject = f'Contact Form: {subject}'
        email_body = f"From: {name} <{email}>\nPhone: {phone}\n\n{message}"
        import threading
        t = threading.Thread(
            target=send_email_async,
            args=(email_subject, email_body, os.environ.get('MAIL_DEFAULT_SENDER', 'quotes@webuyanycar.co.uk'))
        )
        t.daemon = True
        t.start()

        flash('Thank you for your message. We will respond within 24 hours.', 'success')
        return redirect(url_for('contact'))

    return render_template('contact.html')


@app.route('/faq')
def faq():
    return render_template('faq.html')


@app.route('/privacy')
def privacy():
    return render_template('privacy.html')


@app.route('/terms')
def terms():
    return render_template('terms.html')


# ─── ADMIN ROUTES ───

@app.route('/admin/login', methods=['GET', 'POST'])
@limiter.limit("10 per minute")
def admin_login():
    if request.method == 'POST':
        username = sanitize_input(request.form.get('username'), 50)
        password = request.form.get('password', '')

        conn = get_db()
        if not conn:
            flash('System error', 'error')
            return render_template('admin/login.html')

        try:
            with conn.cursor(cursor_factory=RealDictCursor) as c:
                c.execute("SELECT * FROM admins WHERE username = %s", (username,))
                admin = c.fetchone()
                if admin and bcrypt.checkpw(password.encode(), admin['password_hash'].encode()):
                    access_token = create_access_token(identity='admin')
                    resp = make_response(redirect(url_for('admin_dashboard')))
                    set_access_cookies(resp, access_token)
                    return resp
                flash('Invalid username or password', 'error')
        except Exception as e:
            logger.error("Admin login error", extra={'extra_data': {'error': str(e)}})
            flash('System error', 'error')
        finally:
            release_db(conn)

    return render_template('admin/login.html')


@app.route('/admin/logout')
def admin_logout():
    resp = make_response(redirect(url_for('admin_login')))
    unset_jwt_cookies(resp)
    return resp


@app.route('/admin')
@app.route('/admin/dashboard')
@admin_required
def admin_dashboard():
    conn = get_db()
    if not conn:
        return "Database error", 500
    stats = {}
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as c:
            c.execute("SELECT COUNT(*) as total FROM quotes")
            stats['total_quotes'] = c.fetchone()['total']
            c.execute("SELECT COUNT(*) as total FROM quotes WHERE status = 'new'")
            stats['new_quotes'] = c.fetchone()['total']
            c.execute("SELECT COUNT(*) as total FROM quotes WHERE created_at >= NOW() - INTERVAL '7 days'")
            stats['weekly_quotes'] = c.fetchone()['total']
            c.execute("SELECT COALESCE(SUM(valuation_amount), 0) as total FROM quotes")
            stats['total_valuation'] = c.fetchone()['total']
            c.execute("SELECT * FROM quotes ORDER BY created_at DESC LIMIT 10")
            stats['recent_quotes'] = c.fetchall()
            c.execute("SELECT COUNT(*) as total FROM contacts WHERE created_at >= NOW() - INTERVAL '7 days'")
            stats['weekly_contacts'] = c.fetchone()['total']
    except Exception as e:
        logger.error("Dashboard error", extra={'extra_data': {'error': str(e)}})
        return "Database error", 500
    finally:
        release_db(conn)
    return render_template('admin/dashboard.html', **stats)


@app.route('/admin/quotes')
@admin_required
def admin_quotes():
    status_filter = request.args.get('status', 'all')
    conn = get_db()
    if not conn:
        return "Database error", 500
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as c:
            if status_filter == 'all':
                c.execute("SELECT * FROM quotes ORDER BY created_at DESC")
            else:
                c.execute("SELECT * FROM quotes WHERE status = %s ORDER BY created_at DESC", (status_filter,))
            quotes = c.fetchall()
    except Exception as e:
        logger.error("Quotes list error", extra={'extra_data': {'error': str(e)}})
        return "Database error", 500
    finally:
        release_db(conn)
    return render_template('admin/quotes.html', quotes=quotes, status_filter=status_filter)


@app.route('/admin/quotes/<int:quote_id>')
@admin_required
def admin_quote_detail(quote_id):
    conn = get_db()
    if not conn:
        return "Database error", 500
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as c:
            c.execute("SELECT * FROM quotes WHERE id = %s", (quote_id,))
            quote = c.fetchone()
    except Exception as e:
        logger.error("Quote detail error", extra={'extra_data': {'error': str(e)}})
        return "Database error", 500
    finally:
        release_db(conn)
    if not quote:
        flash('Quote not found', 'error')
        return redirect(url_for('admin_quotes'))
    photos = json.loads(quote['photos']) if quote['photos'] else []
    return render_template('admin/quote_detail.html', quote=quote, photos=photos)


@app.route('/admin/quotes/<int:quote_id>/update', methods=['POST'])
@admin_required
def admin_quote_update(quote_id):
    status = sanitize_input(request.form.get('status'), 50)
    valuation = request.form.get('valuation_amount')
    conn = get_db()
    if conn:
        try:
            with conn.cursor() as c:
                c.execute(
                    "UPDATE quotes SET status = %s, valuation_amount = %s, updated_at = NOW() WHERE id = %s",
                    (status, valuation, quote_id)
                )
                conn.commit()
            logger.info("Quote updated", extra={
                'extra_data': {'quote_id': quote_id, 'status': status}
            })
        except Exception as e:
            logger.error("Quote update error", extra={'extra_data': {'error': str(e)}})
        finally:
            release_db(conn)
    flash('Quote updated successfully', 'success')
    return redirect(url_for('admin_quote_detail', quote_id=quote_id))


@app.route('/admin/contacts')
@admin_required
def admin_contacts():
    conn = get_db()
    if not conn:
        return "Database error", 500
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as c:
            c.execute("SELECT * FROM contacts ORDER BY created_at DESC")
            contacts = c.fetchall()
    except Exception as e:
        logger.error("Contacts list error", extra={'extra_data': {'error': str(e)}})
        return "Database error", 500
    finally:
        release_db(conn)
    return render_template('admin/contacts.html', contacts=contacts)


# ─── API ROUTES ───

@app.route('/api/valuation', methods=['POST'])
@limiter.limit("30 per minute")
def api_valuation():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    valuation = calculate_valuation(
        data.get('make', 'Other'),
        data.get('model', ''),
        data.get('year', 2015),
        data.get('mileage', '0'),
        data.get('condition', 'Good')
    )
    return jsonify({'valuation': valuation, 'currency': 'GBP'})


@app.route('/api/stats')
def api_stats():
    conn = get_db()
    if not conn:
        return jsonify({'error': 'Database unavailable'}), 503
    try:
        with conn.cursor() as c:
            c.execute("SELECT COUNT(*) FROM quotes")
            total = c.fetchone()[0]
            c.execute("SELECT COALESCE(SUM(valuation_amount), 0) FROM quotes")
            total_val = c.fetchone()[0]
            return jsonify({
                'total_quotes': total,
                'total_valuation': round(float(total_val), 2),
                'timestamp': datetime.utcnow().isoformat()
            })
    finally:
        release_db(conn)


@app.route('/api/health')
def health_check():
    conn = get_db()
    db_status = 'connected' if conn else 'disconnected'
    if conn:
        release_db(conn)
    return jsonify({
        'status': 'healthy',
        'database': db_status,
        'environment': os.environ.get('FLASK_ENV', 'production'),
        'timestamp': datetime.utcnow().isoformat()
    })


# ─── ERROR HANDLERS ───

@app.errorhandler(404)
def not_found(e):
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Not found'}), 404
    return render_template('404.html'), 404


@app.errorhandler(405)
def method_not_allowed(e):
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Method not allowed'}), 405
    return render_template('404.html'), 404


@app.errorhandler(413)
def too_large(e):
    return jsonify({'error': 'File too large. Maximum size is 5MB.'}), 413


@app.errorhandler(429)
def rate_limit_exceeded(e):
    return jsonify({'error': 'Too many requests. Please try again later.'}), 429


@app.errorhandler(500)
def server_error(e):
    logger.error("Server error", extra={'extra_data': {
        'error': str(e),
        'path': request.path,
        'method': request.method
    }})
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Internal server error'}), 500
    return render_template('500.html'), 500


# ─── INIT ───

@app.before_request
def ensure_db():
    """Ensure database is initialized on first request (Vercel serverless pattern)."""
    if not hasattr(app, '_db_initialized'):
        init_db()
        app._db_initialized = True


# Vercel handler
app = app

if __name__ == '__main__':
    app.run(debug=True)
