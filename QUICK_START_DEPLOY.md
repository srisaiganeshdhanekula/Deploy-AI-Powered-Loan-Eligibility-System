# 🚀 Quick Start - Render Deployment

## ⚡ TL;DR - 5 Minute Deploy

### 1️⃣ Get Your API Keys (2 minutes)

**Required:**
- **Gemini API Key**: https://makersuite.google.com/app/apikey
- **Gmail App Password**: https://myaccount.google.com/apppasswords
  - Enable 2-Step Verification first
  - Generate app password for "Mail"

### 2️⃣ Push to GitHub (1 minute)

```bash
git add .
git commit -m "Ready for Render deployment"
git push origin main
```

### 3️⃣ Deploy on Render (2 minutes)

1. Go to https://dashboard.render.com
2. Click **"New"** → **"Blueprint"**
3. Connect your GitHub repo
4. Click **"Apply"** (Render will create 3 services automatically)

### 4️⃣ Set Required Environment Variables

**Backend Service** → Environment tab → Add:

```
GEMINI_API_KEY = <your-gemini-key>
SMTP_EMAIL = <your-gmail-address>
SMTP_PASSWORD = <your-gmail-app-password>
```

Click **"Save Changes"** → Services redeploy automatically

### 5️⃣ Done! 🎉

- **Frontend**: `https://ai-loan-frontend.onrender.com`
- **Backend API**: `https://ai-loan-backend.onrender.com`

---

## 📚 Detailed Documentation

- **Full Guide**: See `DEPLOYMENT_GUIDE.md`
- **Environment Variables**: See `ENV_VARIABLES.md`
- **Pre-Check**: Run `./pre-deploy-check.sh`

---

## 🔑 Required Environment Variables Summary

### Backend (3 Required):

| Variable | Get From | Purpose |
|----------|----------|---------|
| `GEMINI_API_KEY` | [Google AI Studio](https://makersuite.google.com/app/apikey) | AI Chat |
| `SMTP_EMAIL` | Gmail | Email notifications |
| `SMTP_PASSWORD` | [Gmail App Passwords](https://myaccount.google.com/apppasswords) | Email auth |

### Frontend (Auto-configured):

| Variable | Value |
|----------|-------|
| `REACT_APP_API_URL` | `https://ai-loan-backend.onrender.com/api` |

**All other variables** are auto-generated or have defaults in `render.yaml`.

---

## 🎯 What Gets Deployed

### Services Created:
1. **ai-loan-backend** (Python/FastAPI) - Backend API
2. **ai-loan-frontend** (Node/React) - Web Interface  
3. **ai-loan-db** (PostgreSQL) - Database

### Auto-Configured:
- ✅ Database connection (`DATABASE_URL`)
- ✅ Security keys (`SECRET_KEY`, `OTP_SECRET`)
- ✅ CORS settings
- ✅ Build & deployment commands
- ✅ Health checks

### You Configure:
- ⚠️ Gemini API key (for AI chat)
- ⚠️ Gmail credentials (for emails)

---

## 🐛 Quick Troubleshooting

### Backend won't start?
→ Check you added all 3 required environment variables

### Chat not working?
→ Verify `GEMINI_API_KEY` is valid and has quota

### Emails not sending?
→ Use Gmail **App Password**, not regular password

### Frontend shows network error?
→ Wait 5-10 minutes for first deployment to complete

---

## 💰 Cost

**100% FREE** with Render free tier:
- 750 hours/month per service
- 1GB PostgreSQL database
- 100GB bandwidth/month

**Limitations:**
- Services sleep after 15 min inactivity
- First request after sleep takes ~30 seconds

---

## 🔄 Making Updates

1. Make changes to your code
2. Commit and push to GitHub:
   ```bash
   git add .
   git commit -m "Your changes"
   git push
   ```
3. Render auto-deploys (if auto-deploy enabled)
4. Or manually deploy from Render dashboard

---

## 📞 Support

**Documentation:**
- Full guide: `DEPLOYMENT_GUIDE.md`
- Environment vars: `ENV_VARIABLES.md`

**Issues?**
- Check Render logs (Logs tab)
- Review environment variables
- See troubleshooting section in deployment guide

**Render Support:**
- Community: https://community.render.com
- Docs: https://render.com/docs

---

## ✅ Deployment Checklist

- [ ] Gemini API key obtained
- [ ] Gmail App Password generated  
- [ ] Code pushed to GitHub
- [ ] Render Blueprint deployed
- [ ] 3 required env vars added to backend
- [ ] Services deployed successfully
- [ ] Tested login/register
- [ ] Tested AI chat

---

**Questions?** Check `DEPLOYMENT_GUIDE.md` for detailed instructions.

**Ready?** Push to GitHub and deploy! 🚀
