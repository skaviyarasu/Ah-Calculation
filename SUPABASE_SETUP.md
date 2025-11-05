# 🚀 Supabase Integration Setup Guide

## 📋 Overview

Your AH Balancer now integrates with Supabase for:
- ✅ **User Authentication** (email/password with verification)
- ✅ **Database Storage** (jobs and cell data)
- ✅ **Real-time Updates** (future feature)
- ✅ **Secure Row Level Security** (users see only their data)

## 🔧 Setup Instructions

### 1. Create Supabase Account
1. Go to [https://supabase.com](https://supabase.com)
2. Click "Start your project" (free tier available)
3. Sign up with GitHub, Google, or email
4. Create a new project

### 2. Configure Environment Variables
1. Copy `.env.example` to `.env.local`:
   ```bash
   copy .env.example .env.local
   ```

2. In your Supabase project dashboard:
   - Go to **Settings** → **API**
   - Copy the **Project URL**
   - Copy the **Project API Key** (anon, public)

3. Update `.env.local` with your credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
   ```

### 3. Create Database Schema
1. In your Supabase project, go to **SQL Editor**
2. Copy and paste the entire contents of `database-schema.sql`
3. Click **Run** to create all tables and security policies

### 4. Configure Authentication
1. Go to **Authentication** → **Settings**
2. Disable **Enable email confirmations** if you want immediate login (development)
3. Or keep it enabled for production security
4. Configure **Site URL** to your app domain (e.g., `http://localhost:5173`)

### 5. Test the Integration
1. Restart your development server:
   ```bash
   npm run dev
   ```
2. Try registering a new account
3. Check your email for verification (if enabled)
4. Login and test creating/saving jobs

## 📊 Database Structure

### Tables Created:
- **`jobs`** - Stores AH optimization projects
- **`cell_data`** - Stores individual cell capacity values

### Security Features:
- **Row Level Security (RLS)** - Users only see their own data
- **Foreign Key Constraints** - Data integrity protection
- **Automatic Timestamps** - Track creation/modification times

## 🔐 Security Features

### Authentication:
- ✅ Email/password with verification
- ✅ Secure JWT tokens
- ✅ Session management
- ✅ Password requirements (6+ characters)

### Data Protection:
- ✅ Row Level Security policies
- ✅ User-specific data isolation
- ✅ SQL injection prevention
- ✅ HTTPS encryption

## 📱 New Features Available

### Enhanced Authentication:
- **Email-based registration** (more professional)
- **Email verification** (optional security)
- **Full name storage** (better user experience)
- **Secure session management**

### Data Persistence:
- **Cross-device sync** - Access jobs from any device
- **Automatic backups** - Never lose your work
- **Job history** - Track all your optimization projects
- **Secure storage** - Enterprise-grade security

### Future Capabilities:
- **Team collaboration** (share jobs with colleagues)
- **Real-time updates** (see changes instantly)
- **Advanced analytics** (optimization trends)
- **API integration** (connect with other tools)

## 🚨 Migration Notes

### Existing localStorage Data:
Your current localStorage authentication and data will still work until you:
1. Complete Supabase setup
2. Register new accounts via Supabase
3. Re-enter job data (or create migration script if needed)

### Gradual Migration:
The app will seamlessly switch to Supabase once properly configured. No data loss during transition.

## 🛠️ Troubleshooting

### Common Issues:

**1. "Environment variables not found"**
- Ensure `.env.local` exists and has correct values
- Restart development server after creating `.env.local`

**2. "Failed to authenticate"**
- Check Supabase URL and API key are correct
- Verify Site URL is configured in Supabase dashboard

**3. "Database errors"**
- Ensure `database-schema.sql` was run successfully
- Check RLS policies are enabled

**4. "Email verification not working"**
- Check spam folder
- Disable email confirmations in Supabase Auth settings for development

### Getting Help:
- Check Supabase docs: [https://supabase.com/docs](https://supabase.com/docs)
- Supabase Discord community
- GitHub issues for this project

## 🎉 What's Next?

After setup, you'll have:
- **Professional user management**
- **Secure data storage**
- **Cross-device synchronization**
- **Foundation for advanced features**

Your AH Balancer is now enterprise-ready! 🚀
