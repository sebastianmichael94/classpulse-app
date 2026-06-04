import secrets
import string
from .models import QuizSession

def generate_unique_access_code(length=4):
    """
    Generates a secure, random uppercase alphanumeric code.
    Checks the database to ensure it's 100% unique and not currently active.
    """
    # Exclude confusing characters like O, 0, I, 1
    allowed_chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    
    while True:
        code = ''.join(secrets.choice(allowed_chars) for _ in range(length))
        # Ensure this code isn't actively being used by another live class session
        if not QuizSession.objects.filter(access_code=code, is_active=True).exists():
            return code