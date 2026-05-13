import crypto from 'node:crypto';
import { createSecureHandler, securityEventLog } from '../../_security.js';

/**
 * Google OAuth Login Endpoint
 * Redirects user to Google OAuth consent screen
 */

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || 'https://designarena.ai/api/auth/google/callback';

const generateState = () => {
  return crypto.randomBytes(32).toString('hex');
};

const generateCodeChallenge = (codeVerifier) => {
  const hash = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest();
  return hash
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

const serializeCookie = (name, value, options) => {
  let cookieString = `${name}=${encodeURIComponent(value)}`;
  if (options.maxAge) cookieString += `; Max-Age=${Math.floor(options.maxAge / 1000)}`;
  if (options.httpOnly) cookieString += '; HttpOnly';
  if (options.secure) cookieString += '; Secure';
  if (options.sameSite) cookieString += `; SameSite=${options.sameSite}`;
  return cookieString;
};

export default createSecureHandler(
  {
    methods: ['GET'],
    auth: 'none',
    rateLimit: {
      windowMs: 60_000,
      max: 50,
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
      const state = generateState();
      const codeVerifier = generateState();
      const codeChallenge = generateCodeChallenge(codeVerifier);

      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: CALLBACK_URL,
        response_type: 'code',
        scope: 'openid profile email',
        state: state,
        access_type: 'online',
        prompt: 'consent',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      // Store state and code_verifier in secure HTTP-only cookie for verification
      const cookieMaxAge = 10 * 60 * 1000; // 10 minutes
      const cookieOptions = {
        httpOnly: true,
        secure: req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        maxAge: cookieMaxAge,
      };

      const cookieHeaders = [
        serializeCookie('google_oauth_state', state, cookieOptions),
        serializeCookie('google_code_verifier', codeVerifier, cookieOptions),
      ];

      res.setHeader('Set-Cookie', cookieHeaders);

      securityEventLog({
        severity: 'info',
        event: 'google_oauth_initiated',
        requestId,
        ipAddress,
      });

      return res.status(302).setHeader('Location', `https://accounts.google.com/o/oauth2/v2/auth?${params}`).end();
    } catch (error) {
      securityEventLog({
        severity: 'error',
        event: 'google_oauth_error',
        requestId,
        ipAddress,
        detail: {
          error: error instanceof Error ? error.message : String(error),
        },
      });

      return res.status(500).json({
        error: {
          code: 'GOOGLE_OAUTH_ERROR',
          message: 'An error occurred during OAuth initialization.',
          requestId,
        },
      });
    }
  },
);
