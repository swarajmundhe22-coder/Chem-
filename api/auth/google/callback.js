import { createSecureHandler, securityEventLog } from '../../_security.js';
import { issueSessionTokensEnhanced, serializeCookie, parseCookies, findUserByEmail, upsertGoogleUser } from '../../_auth.js';
import { authCookieBase } from '../_shared.js';

/**
 * Google OAuth Callback Endpoint
 * Exchanges authorization code for tokens and creates user session
 */

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || 'https://designarena.ai/api/auth/google/callback';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://designarena.ai';

export default createSecureHandler(
  {
    methods: ['GET', 'POST'],
    auth: 'none',
    csrf: false,
    bodySchema: undefined, // Will parse query params instead
    rateLimit: {
      windowMs: 60_000,
      max: 30,
    },
  },
  async (req, res, { requestId, ipAddress }) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      securityEventLog({
        severity: 'warn',
        event: 'google_oauth_not_configured',
        requestId,
        ipAddress,
      });
      return res.status(503).json({
        error: {
          code: 'GOOGLE_OAUTH_NOT_CONFIGURED',
          message: 'Google OAuth is not configured.',
          requestId,
        },
      });
    }

    try {
      // Parse code and state from query parameters
      const url = new URL(req.url, `http://${req.headers.host}`);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');

      // Check for OAuth errors from Google
      if (error) {
        securityEventLog({
          severity: 'warn',
          event: 'google_oauth_denied',
          requestId,
          ipAddress,
          detail: {
            error,
            errorDescription,
          },
        });

        return res.status(302).setHeader('Location', `${FRONTEND_URL}/auth?error=oauth_denied`).end();
      }

      // Validate code and state
      if (!code || !state) {
        securityEventLog({
          severity: 'warn',
          event: 'google_oauth_invalid_params',
          requestId,
          ipAddress,
        });
        return res.status(302).setHeader('Location', `${FRONTEND_URL}/auth?error=invalid_oauth_params`).end();
      }

      // Verify state matches what we stored
      const cookies = parseCookies(req.headers.cookie || '');
      const storedState = cookies.google_oauth_state;
      const codeVerifier = cookies.google_code_verifier;

      if (state !== storedState || !codeVerifier) {
        securityEventLog({
          severity: 'warn',
          event: 'google_oauth_state_mismatch',
          requestId,
          ipAddress,
        });
        return res.status(302).setHeader('Location', `${FRONTEND_URL}/auth?error=state_mismatch`).end();
      }

      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          code: code,
          redirect_uri: CALLBACK_URL,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        securityEventLog({
          severity: 'error',
          event: 'google_token_exchange_failed',
          requestId,
          ipAddress,
          detail: {
            status: tokenResponse.status,
            error: error.substring(0, 200),
          },
        });
        return res.status(302).setHeader('Location', `${FRONTEND_URL}/auth?error=token_exchange_failed`).end();
      }

      const tokenData = await tokenResponse.json();
      const idToken = tokenData.id_token;

      if (!idToken) {
        securityEventLog({
          severity: 'error',
          event: 'google_no_id_token',
          requestId,
          ipAddress,
        });
        return res.status(302).setHeader('Location', `${FRONTEND_URL}/auth?error=no_id_token`).end();
      }

      // Decode JWT without verification (in production, verify the signature)
      const parts = idToken.split('.');
      if (parts.length !== 3) {
        securityEventLog({
          severity: 'error',
          event: 'google_invalid_jwt',
          requestId,
          ipAddress,
        });
        return res.status(302).setHeader('Location', `${FRONTEND_URL}/auth?error=invalid_jwt`).end();
      }

      const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      const { email, name, picture, sub: googleId } = decoded;

      if (!email || !googleId) {
        securityEventLog({
          severity: 'warn',
          event: 'google_missing_email',
          requestId,
          ipAddress,
        });
        return res.status(302).setHeader('Location', `${FRONTEND_URL}/auth?error=missing_email`).end();
      }

      // Find or create user
      let user = findUserByEmail(email);
      if (!user) {
        user = upsertGoogleUser({
          googleId,
          email,
          name: name || email.split('@')[0],
          picture,
          ipAddress,
        });
      } else if (!user.googleId) {
        // Link Google account to existing user
        user.googleId = googleId;
      }

      // Issue session tokens
      const session = await issueSessionTokensEnhanced({
        userId: user.id,
        email: user.email,
        role: user.role || 'viewer',
        ipAddress,
        userAgent: req.headers['user-agent'] || '',
      });

      const cookieBase = authCookieBase(req);
      const maxAge = 14 * 24 * 60 * 60 * 1000; // 14 days

      const setCookieHeaders = [
        serializeCookie('refresh_token', session.refreshToken, {
          ...cookieBase,
          httpOnly: true,
          maxAge,
        }),
        serializeCookie('csrf_token', session.csrfToken, {
          ...cookieBase,
          httpOnly: false,
          maxAge,
        }),
        // Clear OAuth state cookies
        serializeCookie('google_oauth_state', '', {
          ...cookieBase,
          httpOnly: true,
          maxAge: 0,
        }),
        serializeCookie('google_code_verifier', '', {
          ...cookieBase,
          httpOnly: true,
          maxAge: 0,
        }),
      ];

      res.setHeader('Set-Cookie', setCookieHeaders);

      securityEventLog({
        severity: 'info',
        event: 'auth_google_success',
        requestId,
        ipAddress,
        detail: {
          email: email,
          userId: user.id,
        },
      });

      // Redirect to frontend
      return res.status(302).setHeader('Location', `${FRONTEND_URL}/?auth_success=true`).end();
        }),
      ]);

      // Redirect to frontend
      return res.status(302).setHeader('Location', `${FRONTEND_URL}/?auth_success=true`).end();
    } catch (error) {
      securityEventLog({
        severity: 'error',
        event: 'google_oauth_callback_error',
        requestId,
        ipAddress,
        detail: {
          error: error instanceof Error ? error.message : String(error),
        },
      });

      return res.status(302).setHeader('Location', `${FRONTEND_URL}/auth?error=callback_error`).end();
    }
  },
);
