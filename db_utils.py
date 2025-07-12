# db_utils.py - Database utilities for connection handling and retries
import time
from functools import wraps
from sqlalchemy.exc import OperationalError, DisconnectionError
from flask import jsonify
import logging

logger = logging.getLogger(__name__)

def with_db_retry(max_retries=3, delay=0.5):
    """
    Decorator to retry database operations on connection errors.
    
    Args:
        max_retries: Maximum number of retry attempts (default 3)
        delay: Initial delay between retries in seconds (exponential backoff)
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except (OperationalError, DisconnectionError) as e:
                    last_exception = e
                    
                    # Check if it's a connection error we should retry
                    error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)
                    if any(msg in error_msg.lower() for msg in [
                        'server closed the connection',
                        'connection refused',
                        'connection reset',
                        'broken pipe',
                        'connection timeout'
                    ]):
                        if attempt < max_retries - 1:
                            wait_time = delay * (2 ** attempt)  # Exponential backoff
                            logger.warning(
                                f"Database connection error on attempt {attempt + 1}/{max_retries}. "
                                f"Retrying in {wait_time}s... Error: {error_msg}"
                            )
                            time.sleep(wait_time)
                            
                            # Force session rollback to clear any bad state
                            from models import db
                            db.session.rollback()
                            continue
                    
                    # If it's not a retryable error, raise immediately
                    raise
                
            # If we've exhausted all retries, log and raise the last exception
            logger.error(f"Database operation failed after {max_retries} attempts: {last_exception}")
            raise last_exception
            
        return wrapper
    return decorator

def handle_db_error(e):
    """
    Standard error handler for database errors in API endpoints.
    
    Args:
        e: The exception that was raised
        
    Returns:
        Flask JSON response with appropriate error message and status code
    """
    from models import db
    db.session.rollback()
    
    error_msg = str(e)
    
    # Check for specific database errors
    if isinstance(e, (OperationalError, DisconnectionError)):
        if 'server closed the connection' in error_msg.lower():
            return jsonify({
                "error": "Database connection lost. Please try again.",
                "details": "The server is experiencing connection issues."
            }), 503  # Service Unavailable
        else:
            from flask import current_app
            return jsonify({
                "error": "Database error occurred",
                "details": error_msg if current_app.debug else "An internal database error occurred"
            }), 500
    
    # Generic error
    logger.error(f"Unexpected database error: {e}")
    from flask import current_app
    return jsonify({
        "error": "Internal server error",
        "details": str(e) if current_app.debug else "An unexpected error occurred"
    }), 500