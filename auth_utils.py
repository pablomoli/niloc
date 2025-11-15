import bcrypt
import ipaddress
from functools import wraps
from flask import session, redirect, request

def hash_password(plain):
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

def check_password(plain, hashed):
    return bcrypt.checkpw(plain.encode(), hashed.encode())

def get_client_ip():
    """
    Get the real client IP address from request headers.
    Checks X-Forwarded-For, X-Real-IP, CF-Connecting-IP (Cloudflare), etc.
    Falls back to request.remote_addr if no proxy headers are present.
    """
    # Check common proxy headers (in order of preference)
    headers_to_check = [
        'CF-Connecting-IP',  # Cloudflare
        'X-Real-IP',  # Nginx proxy
        'X-Forwarded-For',  # Most common proxy header
        'X-Client-IP',
        'X-Forwarded',
        'Forwarded-For',
        'Forwarded',
    ]
    
    for header in headers_to_check:
        ip = request.headers.get(header)
        if ip:
            # X-Forwarded-For can contain multiple IPs, take the first one
            if ',' in ip:
                ip = ip.split(',')[0].strip()
            if ip:
                return ip
    
    # Fall back to remote_addr
    return request.remote_addr or 'Unknown'

def is_private_ip(ip_str):
    """Check if an IP address is private/internal"""
    try:
        ip = ipaddress.ip_address(ip_str)
        return ip.is_private or ip.is_loopback or ip.is_link_local
    except (ValueError, AttributeError):
        return False

def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if 'user_id' not in session:
            return redirect('/login')
        return f(*args, **kwargs)
    return wrapper

