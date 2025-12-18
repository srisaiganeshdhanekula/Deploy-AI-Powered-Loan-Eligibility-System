from app.models.database import SessionLocal, User
from app.utils.security import hash_password

db = SessionLocal()

# Check if users exist
if db.query(User).first():
    print("Users already exist.")
else:
    # Create Admin
    admin = User(
        email="admin@example.com",
        password_hash=hash_password("admin123"),
        full_name="Admin User",
        role="manager"
    )
    db.add(admin)
    
    # Create Applicant
    applicant = User(
        email="user@example.com",
        password_hash=hash_password("user123"),
        full_name="Test Applicant",
        role="applicant"
    )
    db.add(applicant)
    
    db.commit()
    print("Created default users: admin@example.com / admin123, user@example.com / user123")

db.close()
