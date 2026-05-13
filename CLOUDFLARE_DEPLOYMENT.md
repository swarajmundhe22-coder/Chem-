# Cloudflare Pages Deployment Guide

## Build Command for Cloudflare Pages

```bash
npm.cmd run build
```

This command will:
1. Run TypeScript compilation (`tsc -b`)
2. Run Vite build to generate optimized production assets
3. Create output in the `dist/` folder

## Deployment Steps

### 1. Set Up Cloudflare Pages Project

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Select **Workers & Pages** → **Pages**
3. Click **Create application** → **Connect to Git**
4. Select your GitHub repository: `swarajmundhe22-coder/Chem-`
5. Configure build settings:
   - **Build command:** `npm.cmd run build`
   - **Build output directory:** `dist`
   - **Root directory:** `/` (default)

### 2. Environment Variables

Set these environment variables in Cloudflare Pages dashboard:

**Production Environment:**
```
GOOGLE_CLIENT_ID=1065078894672-rmp5kp8vfjns5rn9kp5psfp16g691043.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-secret>
GOOGLE_CALLBACK_URL=https://designarena.ai/api/auth/google/callback
FRONTEND_URL=https://designarena.ai
JWT_ACCESS_SECRET=<your-random-secret>
VITE_SUPABASE_URL=https://erhsqdengaewiflcqvze.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_JhZXXIUoPBE1NAFyk-ve6g_9Yj-Nes8
VITE_GOOGLE_CLIENT_ID=1065078894672-rmp5kp8vfjns5rn9kp5psfp16g691043.apps.googleusercontent.com
VITE_GOOGLE_AUTH_PROXY=https://designarena.ai/api/auth/google/callback
```

### 3. Google OAuth Configuration

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Update Authorized redirect URIs:
   ```
   https://designarena.ai/api/auth/google/callback
   ```
4. Copy Client ID and Client Secret to Cloudflare environment

### 4. Deployment

Once configuration is complete:
1. Push changes to GitHub main branch
2. Cloudflare will automatically trigger builds
3. Monitor deployment progress in Cloudflare dashboard
4. Check build logs if any issues occur

## Project Structure for Cloudflare Pages

- **Frontend:** React + TypeScript + Vite in `src/`
- **API Routes:** Standard Node.js handlers in `api/` (if using Cloudflare Workers)
- **Build Output:** `dist/` directory
- **Redirects:** `_redirects` file handles SPA routing

## Google OAuth Flow

### Authentication Flow:
1. User clicks "Sign in with Google" button
2. Frontend redirects to `/api/auth/google/login`
3. Backend generates OAuth URL and redirects to Google
4. User authorizes on Google
5. Google redirects to `/api/auth/google/callback`
6. Backend exchanges code for tokens and creates session
7. Backend redirects to frontend with auth cookie

### Files:
- `api/auth/google/login.js` - Initiates OAuth flow
- `api/auth/google/callback.js` - Handles OAuth callback
- `api/_auth.js` - User and session management

## Troubleshooting

### Build Fails
- Verify Node.js version compatibility (14+)
- Check for TypeScript errors: `npm.cmd run build`
- Ensure all environment variables are set

### Google Auth Not Working
- Verify Google Client ID and Secret are correct
- Check that redirect URI matches exactly in Google Cloud Console
- Verify environment variables in Cloudflare dashboard
- Check browser console for OAuth flow errors

### API Routes Not Working
- Ensure `_redirects` file is in root directory
- Check that API routes are in `api/` folder
- Verify API endpoint URLs in frontend code

## Local Development

```bash
npm.cmd install       # Install dependencies
npm.cmd run dev       # Start dev server (http://localhost:5173)
npm.cmd run build     # Build for production
npm.cmd run preview   # Preview production build locally
```

## Monitoring

After deployment:
1. Check Cloudflare Analytics dashboard
2. Monitor API response times
3. Track error rates in Google Cloud Console
4. Review security logs in Cloudflare dashboard

## Additional Resources

- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages/)
- [Vite Documentation](https://vitejs.dev/)
- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
