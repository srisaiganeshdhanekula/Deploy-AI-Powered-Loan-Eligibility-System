# 🆓 Render Free Deployment Guide (No Credit Card)

## ✅ Deploy Your App for FREE - Step by Step

Follow these exact steps to deploy without entering credit card information.

---

## 📝 Before You Start

### Get Your API Keys Ready:

1. **Gemini API Key** (Required):
   - Go to: https://makersuite.google.com/app/apikey
   - Click "Create API Key"
   - Copy the key

2. **Gmail App Password** (Required):
   - Go to: https://myaccount.google.com/apppasswords
   - Generate password for "Mail"
   - Copy the 16-character password

3. **Generate Random Strings** (for SECRET_KEY and OTP_SECRET):
   - Use: https://www.random.org/strings/?num=2&len=32&digits=on&upperalpha=on&loweralpha=on&unique=on&format=html&rnd=new
   - Or run in terminal: `openssl rand -hex 32`

---

## 🗄️ STEP 1: Create PostgreSQL Database

1. **Go to Render Dashboard**: https://dashboard.render.com

2. **Click "New +"** (top right) → Select **"PostgreSQL"**

3. **Fill in the form**:
   ```
   Name: ai-loan-db
   Database: ai_loan_system
   User: ai_loan_user
   Region: Oregon (US West) or closest to you
   ```

4. **PostgreSQL Version**: Leave default (latest)

5. **Datadog API Key**: Leave empty

6. **Instance Type**: Select **"Free"** ⚠️ IMPORTANT!

7. **Click "Create Database"**

8. **⚠️ CRITICAL - Save Database URL**:
   - After creation, you'll see "Info" tab
   - Find **"Internal Database URL"** (starts with `postgresql://`)
   - **COPY THIS ENTIRE URL** - you'll need it for backend!
   - Example: `postgresql://ai_loan_user:xxx@dpg-xxx.oregon-postgres.render.com/ai_loan_system`

---

## 🐍 STEP 2: Create Backend Service

1. **Click "New +"** → Select **"Web Service"**

2. **Connect GitHub**:
   - Click "Connect account" or select existing
   - Choose repository: **Deploy-AI-Powered-Loan-Eligibility-System**
   - Click "Connect"

3. **Fill in the form**:
   ```
   Name: ai-loan-backend
   Region: Same as your database (e.g., Oregon)
   Branch: main
   Root Directory: (leave empty)
   Runtime: Python
   Build Command: cd backend && pip install -r requirements.txt
   Start Command: cd backend && python main.py
   ```

4. **Instance Type**: Select **"Free"** ⚠️ IMPORTANT!

5. **Environment Variables** - Click "Add Environment Variable" for each:

   ```bash
   # Database (use the URL you copied from Step 1)
   DATABASE_URL = postgresql://ai_loan_user:YOUR_PASSWORD@dpg-xxx.oregon-postgres.render.com/ai_loan_system
   
   # Schema
   DB_SCHEMA = public
   
   # Security (use random 32-char strings)
   SECRET_KEY = your-random-32-character-string-here
   ALGORITHM = HS256
   ACCESS_TOKEN_EXPIRE_MINUTES = 30
   
   # OTP
   OTP_SECRET = another-random-32-character-string
   
   # LLM Configuration
   LLM_PROVIDER = gemini
   GEMINI_API_KEY = your-gemini-api-key-from-google
   GEMINI_MODEL = gemini-1.5-flash
   
   # Email Configuration
   SMTP_SERVER = smtp.gmail.com
   SMTP_PORT = 587
   SMTP_EMAIL = your-email@gmail.com
   SMTP_PASSWORD = your-gmail-app-password-16-chars
   
   # Voice Configuration
   WHISPER_MODEL = tiny
   WHISPER_LANGUAGE = en
   PIPER_MODEL = en_US-amy-medium
   PIPER_VOICE = en_US-amy-medium
   ```

6. **Auto-Deploy**: Yes (keep enabled)

7. **Click "Create Web Service"**

8. **Wait for deployment** (~5-10 minutes):
   - Watch the "Logs" tab
   - Wait until you see "Build succeeded" and service is "Live"
   - **Copy your backend URL**: `https://ai-loan-backend.onrender.com`

---

## ⚛️ STEP 3: Create Frontend Service

1. **Click "New +"** → Select **"Web Service"**

2. **Connect GitHub**:
   - Select same repository: **Deploy-AI-Powered-Loan-Eligibility-System**

3. **Fill in the form**:
   ```
   Name: ai-loan-frontend
   Region: Same as backend (e.g., Oregon)
   Branch: main
   Root Directory: (leave empty)
   Runtime: Node
   Build Command: cd frontend && npm install && npm run build
   Start Command: cd frontend && npx serve -s build -l 3000
   ```

4. **Instance Type**: Select **"Free"** ⚠️ IMPORTANT!

5. **Environment Variables** - Add this ONE variable:

   ```bash
   # Replace with YOUR actual backend URL from Step 2
   REACT_APP_API_URL = https://ai-loan-backend.onrender.com/api
   ```
   
   ⚠️ **Make sure to add `/api` at the end!**

6. **Auto-Deploy**: Yes (keep enabled)

7. **Click "Create Web Service"**

8. **Wait for deployment** (~3-5 minutes):
   - Watch the "Logs" tab
   - Wait until you see "Build succeeded" and service is "Live"
   - **Your frontend URL**: `https://ai-loan-frontend.onrender.com`

---

## ✅ STEP 4: Verify Deployment

### Test Backend:
1. Visit: `https://ai-loan-backend.onrender.com/`
2. Should see: `{"message": "AI Loan System API"}`

### Test API Docs:
1. Visit: `https://ai-loan-backend.onrender.com/docs`
2. Should see interactive API documentation

### Test Frontend:
1. Visit: `https://ai-loan-frontend.onrender.com/`
2. Should see the login/register page
3. Try creating an account and logging in

---

## 🎉 SUCCESS!

Your app is now deployed for **100% FREE**!

**Your URLs:**
- Frontend: `https://ai-loan-frontend.onrender.com`
- Backend API: `https://ai-loan-backend.onrender.com`
- API Docs: `https://ai-loan-backend.onrender.com/docs`
- Database: Connected internally

---

## 📊 Monitor Your Services

1. Go to Render Dashboard
2. See all 3 services (Backend, Frontend, Database)
3. Click on each to view:
   - Logs (for debugging)
   - Metrics (CPU, Memory usage)
   - Environment variables

---

## 🐛 Troubleshooting

### Backend won't start?
1. Check logs in Render dashboard
2. Verify all environment variables are set correctly
3. Make sure `DATABASE_URL` is the Internal URL from database

### Frontend shows "Network Error"?
1. Check backend is deployed and running
2. Verify `REACT_APP_API_URL` has correct backend URL
3. Make sure URL ends with `/api`

### Database connection failed?
1. Use **Internal Database URL**, not External
2. Copy the entire URL including password
3. Make sure backend and database are in same region

---

## 💡 Important Notes

### Free Tier Limitations:
- Services sleep after 15 min of inactivity
- First request takes ~30 seconds to wake up
- 750 hours/month per service (more than enough!)
- Database expires after 90 days (can export and recreate)

### Keeping It Free:
- ✅ Don't change instance type from "Free"
- ✅ Monitor usage in dashboard
- ✅ Services auto-sleep when not used (this is good!)

---

## 🔄 Making Updates

When you push code changes to GitHub:

1. Services automatically redeploy (if auto-deploy enabled)
2. Or manually deploy: Click service → "Manual Deploy" → "Deploy latest commit"

---

## 📞 Need Help?

- Check service logs for errors
- Review environment variables
- See main DEPLOYMENT_GUIDE.md for more details

---

**Congratulations! Your AI Loan System is LIVE! 🎊**
