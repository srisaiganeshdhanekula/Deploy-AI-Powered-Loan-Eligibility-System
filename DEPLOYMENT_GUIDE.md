# 🚀 Render Deployment Guide - AI Loan Eligibility System

This guide will help you deploy the AI-Powered Loan Eligibility System to Render.

---

## 📋 Prerequisites

Before deploying, ensure you have:

1. **Render Account**: Sign up at [render.com](https://render.com)
2. **GitHub Repository**: Push your code to GitHub
3. **API Keys**: Gather the required API keys (see below)

---

## 🔑 Required Environment Variables

### ⚠️ CRITICAL - Must Configure in Render Dashboard

These environment variables are **required** and must be set manually in the Render dashboard:

#### 1. **GEMINI_API_KEY** (Required for AI Chat)
- Get from: [Google AI Studio](https://makersuite.google.com/app/apikey)
- Free tier available
- This is the primary LLM provider for chat features

#### 2. **SMTP_EMAIL** (Required for Email Features)
- Your Gmail address (e.g., `your-email@gmail.com`)
- Used for sending OTP and notifications

#### 3. **SMTP_PASSWORD** (Required for Email Features)
- **NOT your Gmail password!**
- Use a Gmail App Password
- How to generate:
  1. Go to Google Account Settings
  2. Security → 2-Step Verification (enable if not enabled)
  3. Security → App Passwords
  4. Generate a new app password for "Mail"
  5. Copy the 16-character password

### 🔧 Optional Environment Variables

#### For Alternative LLM Providers:

**Groq** (Fast inference, free tier):
- `GROQ_API_KEY` - Get from [console.groq.com](https://console.groq.com)

**OpenRouter** (Multi-model access):
- `OPENROUTER_API_KEY` - Get from [openrouter.ai](https://openrouter.ai/keys)

#### For Real-time Voice Features:

**Deepgram** (Real-time speech-to-text):
- `DEEPGRAM_API_KEY` - Get from [deepgram.com](https://console.deepgram.com)

---

## 📦 Deployment Steps

### Step 1: Prepare Your Repository

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Prepare for Render deployment"
   git push origin main
   ```

2. **Verify `render.yaml`** exists in the root directory (already configured)

### Step 2: Create Render Services

#### Option A: Using render.yaml (Recommended)

1. **Login to Render**: Go to [dashboard.render.com](https://dashboard.render.com)

2. **New Blueprint**:
   - Click "New" → "Blueprint"
   - Connect your GitHub repository
   - Select the repository with this project
   - Render will automatically detect `render.yaml`

3. **Review Services**:
   - Render will show:
     - `ai-loan-backend` (Web Service)
     - `ai-loan-frontend` (Web Service)
     - `ai-loan-db` (PostgreSQL Database)

4. **Click "Apply"** to create all services

#### Option B: Manual Setup

If you prefer manual setup, follow these steps:

**A. Create Database:**
1. Click "New" → "PostgreSQL"
2. Name: `ai-loan-db`
3. Database: `ai_loan_system`
4. User: `ai_loan_user`
5. Select "Free" plan
6. Click "Create Database"
7. **Save the Internal Database URL** (you'll need it)

**B. Create Backend Service:**
1. Click "New" → "Web Service"
2. Connect your GitHub repository
3. Configure:
   - **Name**: `ai-loan-backend`
   - **Runtime**: Python 3
   - **Build Command**: `cd backend && pip install -r requirements.txt`
   - **Start Command**: `cd backend && python main.py`
4. Add environment variables (see Step 3)
5. Click "Create Web Service"

**C. Create Frontend Service:**
1. Click "New" → "Web Service"
2. Connect your GitHub repository
3. Configure:
   - **Name**: `ai-loan-frontend`
   - **Runtime**: Node
   - **Build Command**: `cd frontend && npm install && npm run build`
   - **Start Command**: `cd frontend && npx serve -s build -l 3000`
4. Add environment variable:
   - `REACT_APP_API_URL`: `https://ai-loan-backend.onrender.com/api`
5. Click "Create Web Service"

### Step 3: Configure Environment Variables

#### For Backend Service (`ai-loan-backend`):

1. Go to your backend service dashboard
2. Navigate to "Environment" tab
3. Add the following variables:

**Required Variables:**
```bash
# Database (auto-filled if using Blueprint)
DATABASE_URL=<your-postgres-connection-string>
DB_SCHEMA=public

# Security (auto-generated if using Blueprint)
SECRET_KEY=<generate-random-string>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# LLM Provider (Gemini)
LLM_PROVIDER=gemini
GEMINI_API_KEY=<your-gemini-api-key>  # ⚠️ REQUIRED
GEMINI_MODEL=gemini-1.5-flash

# Email Configuration
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_EMAIL=<your-gmail-address>  # ⚠️ REQUIRED
SMTP_PASSWORD=<your-gmail-app-password>  # ⚠️ REQUIRED

# OTP Secret
OTP_SECRET=<generate-random-string>

# Voice Configuration
WHISPER_MODEL=tiny
WHISPER_LANGUAGE=en
PIPER_MODEL=en_US-amy-medium
PIPER_VOICE=en_US-amy-medium
```

**Optional Variables (if using):**
```bash
# Groq Provider
GROQ_API_KEY=<your-groq-api-key>
GROQ_MODEL=llama-3.3-70b-versatile

# OpenRouter Provider
OPENROUTER_API_KEY=<your-openrouter-api-key>
OPENROUTER_MODEL=meta-llama/llama-3.1-8b-instruct
OPENROUTER_SITE_URL=https://ai-loan-backend.onrender.com
OPENROUTER_APP_NAME=AI Loan System

# Deepgram for Real-time Voice
DEEPGRAM_API_KEY=<your-deepgram-api-key>
```

4. Click "Save Changes"

#### For Frontend Service (`ai-loan-frontend`):

1. Go to your frontend service dashboard
2. Navigate to "Environment" tab
3. Add:
```bash
REACT_APP_API_URL=https://ai-loan-backend.onrender.com/api
```
4. Click "Save Changes"

### Step 4: Deploy

1. **Automatic Deployment**: If using Blueprint, services will deploy automatically
2. **Manual Deployment**: Click "Manual Deploy" → "Deploy latest commit"
3. **Monitor Logs**: Check the "Logs" tab for deployment progress
4. **Wait for Build**: First deployment takes 5-10 minutes

### Step 5: Verify Deployment

1. **Backend Health Check**:
   - Visit: `https://ai-loan-backend.onrender.com/`
   - Should return: `{"message": "AI Loan System API"}`

2. **Frontend**:
   - Visit: `https://ai-loan-frontend.onrender.com/`
   - Should load the login/register page

3. **Database Connection**:
   - Check backend logs for "Database connected successfully"

---

## 🔧 Post-Deployment Configuration

### Initialize Database

The database tables will be created automatically on first run. If you need to create an initial admin user:

1. Go to backend service → "Shell" tab
2. Run:
```bash
cd backend
python create_users.py
```

### Update CORS Settings (if needed)

If you encounter CORS errors, update `backend/main.py`:

```python
origins = [
    "https://ai-loan-frontend.onrender.com",
    "http://localhost:3000",  # for local testing
]
```

Redeploy the backend after changes.

---

## 🌐 Custom Domain (Optional)

### Add Custom Domain to Frontend:
1. Go to frontend service → "Settings"
2. Scroll to "Custom Domain"
3. Click "Add Custom Domain"
4. Follow instructions to update DNS records

### Add Custom Domain to Backend:
1. Go to backend service → "Settings"
2. Add custom domain (e.g., `api.yourdomain.com`)
3. Update frontend environment variable:
   - `REACT_APP_API_URL=https://api.yourdomain.com/api`

---

## 📊 Monitoring & Logs

### View Logs:
1. Go to service dashboard
2. Click "Logs" tab
3. View real-time logs

### Metrics:
1. Click "Metrics" tab
2. Monitor CPU, Memory, and Request metrics

### Alerts:
1. Go to "Settings" → "Notifications"
2. Add email for deployment notifications

---

## 🐛 Troubleshooting

### Common Issues:

#### 1. **Build Fails - Python Dependencies**
**Error**: `No module named 'xyz'`

**Solution**:
- Ensure `backend/requirements.txt` has all dependencies
- Add missing packages:
```bash
cd backend
pip freeze > requirements.txt
git add requirements.txt
git commit -m "Update requirements"
git push
```

#### 2. **Database Connection Failed**
**Error**: `Could not connect to database`

**Solution**:
- Verify `DATABASE_URL` is set correctly
- Check database is in "Available" state
- Ensure database and backend are in same region

#### 3. **GEMINI_API_KEY Error**
**Error**: `GEMINI_API_KEY not configured`

**Solution**:
- Add `GEMINI_API_KEY` in Environment tab
- Verify key is valid at [Google AI Studio](https://makersuite.google.com/app/apikey)
- Redeploy service

#### 4. **Email Not Sending**
**Error**: `SMTPAuthenticationError`

**Solution**:
- Verify `SMTP_EMAIL` and `SMTP_PASSWORD` are correct
- Ensure you're using Gmail **App Password**, not regular password
- Check 2-Step Verification is enabled in Google Account

#### 5. **Frontend Can't Connect to Backend**
**Error**: `Network Error` or CORS errors

**Solution**:
- Verify `REACT_APP_API_URL` is correct
- Check backend is deployed and running
- Update CORS settings in `backend/main.py`
- Ensure both services are deployed successfully

#### 6. **Service Crashed/Exited**
**Solution**:
- Check logs for error messages
- Verify all required environment variables are set
- Check if free tier limits exceeded
- Restart service manually

#### 7. **Slow Performance**
**Cause**: Free tier has limited resources

**Solutions**:
- Upgrade to paid plan for better performance
- Optimize code and reduce database queries
- Use caching where possible
- Consider using lighter LLM models

---

## 💰 Cost Estimation

### Free Tier Limitations:
- **Web Services**: 750 hours/month (sleeps after 15 min inactivity)
- **PostgreSQL**: 1GB storage, 90-day expiration
- **Bandwidth**: Limited to 100GB/month

### When to Upgrade:
- High traffic application
- 24/7 availability needed
- Larger database requirements
- Better performance needed

---

## 🔄 Continuous Deployment

### Auto-Deploy on Git Push:
1. Go to service → "Settings"
2. Under "Build & Deploy"
3. Enable "Auto-Deploy" for your branch (e.g., `main`)
4. Every push to the branch triggers automatic deployment

### Manual Deploy:
1. Go to service dashboard
2. Click "Manual Deploy" → "Deploy latest commit"

---

## 📚 Additional Resources

- [Render Documentation](https://render.com/docs)
- [Render Community](https://community.render.com)
- [FastAPI Deployment Guide](https://fastapi.tiangolo.com/deployment/)
- [React Deployment Best Practices](https://create-react-app.dev/docs/deployment/)

---

## 🎯 Quick Reference - Environment Variables

### Backend Essential Keys:

| Variable | Required | Get From | Purpose |
|----------|----------|----------|---------|
| `GEMINI_API_KEY` | ✅ Yes | [Google AI Studio](https://makersuite.google.com/app/apikey) | AI Chat functionality |
| `SMTP_EMAIL` | ✅ Yes | Gmail | Email notifications |
| `SMTP_PASSWORD` | ✅ Yes | [Gmail App Passwords](https://myaccount.google.com/apppasswords) | Email authentication |
| `SECRET_KEY` | ✅ Yes | Auto-generated | JWT token security |
| `DATABASE_URL` | ✅ Yes | Auto-filled | Database connection |
| `GROQ_API_KEY` | ❌ No | [Groq Console](https://console.groq.com) | Alternative LLM |
| `DEEPGRAM_API_KEY` | ❌ No | [Deepgram](https://console.deepgram.com) | Real-time voice |
| `OPENROUTER_API_KEY` | ❌ No | [OpenRouter](https://openrouter.ai/keys) | Alternative LLM |

### Frontend Essential Keys:

| Variable | Required | Value |
|----------|----------|-------|
| `REACT_APP_API_URL` | ✅ Yes | `https://ai-loan-backend.onrender.com/api` |

---

## ✅ Deployment Checklist

- [ ] GitHub repository is up to date
- [ ] `render.yaml` exists in root directory
- [ ] Got Gemini API key from Google AI Studio
- [ ] Gmail App Password generated
- [ ] Render account created
- [ ] Blueprint deployed or services created manually
- [ ] All required environment variables set
- [ ] Backend deployed successfully
- [ ] Frontend deployed successfully
- [ ] Database connected
- [ ] Tested login/register functionality
- [ ] Tested AI chat functionality
- [ ] Tested email notifications (if applicable)
- [ ] Custom domain configured (optional)
- [ ] Auto-deploy enabled

---

## 🆘 Need Help?

If you encounter issues:

1. **Check Logs**: Always start with service logs
2. **Review Environment Variables**: Ensure all required keys are set
3. **Render Community**: [community.render.com](https://community.render.com)
4. **GitHub Issues**: Open an issue in your repository
5. **Documentation**: Review [Render Docs](https://render.com/docs)

---

**Good luck with your deployment! 🚀**
