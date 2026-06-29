-- WeBuyAnyCar UK - PostgreSQL Migration Script
-- Run once via: psql $POSTGRES_URL_NON_POOLING -f migrations/001_init.sql

-- Create extension for UUID generation if not available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Quotes table
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
);

-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    subject VARCHAR(255),
    message TEXT NOT NULL,
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admins table
CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_created ON quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_ref ON quotes(quote_ref);
CREATE INDEX IF NOT EXISTS idx_contacts_created ON contacts(created_at DESC);

-- Insert default admin (change password after first login)
-- Generate hash with: python -c "import bcrypt; print(bcrypt.hashpw(b'yourpassword', bcrypt.gensalt()).decode())"
INSERT INTO admins (username, password_hash)
SELECT 'admin', '$2b$12$vI2a41BhSBkRThIqkm.L4uFdG8X2dGzT4qhqkYUGYhKqX5L/eFW6G'
WHERE NOT EXISTS (SELECT 1 FROM admins WHERE username = 'admin');
