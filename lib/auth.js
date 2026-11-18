const crypto = require('node:crypto');

const COOKIE_NAME = 'ga_admin_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function getConfiguredCredentials() {
  const envAdmin = (process.env.ADMIN || '').trim();
  const envPassword = (process.env.PASSWORD || '').trim();

  if (envAdmin && envPassword) {
    return {
      adminUser: envAdmin,
      adminPass: envPassword,
      usingPreviewDefaults: false
    };
  }

  return {
    adminUser: envAdmin || 'admin',
    adminPass: envPassword || 'chess2026',
    usingPreviewDefaults: true
  };
}

function getSigningSecret() {
  const { adminUser, adminPass } = getConfiguredCredentials();
  return crypto
    .createHash('sha256')
    .update(`grandmaster-arena:${adminUser}:${adminPass}:hmac-v1`)
    .digest('hex');
}

function safeEqual(a, b) {
  const digestA = crypto.createHash('sha256').update(String(a)).digest();
  const digestB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

function verifyCredentials(username, password) {
  const { adminUser, adminPass } = getConfiguredCredentials();
  if (!username || !password) return false;
  return safeEqual(String(username).trim(), adminUser) && safeEqual(String(password), adminPass);
}

function createSessionToken(username) {
  const payload = {
    sub: username,
    exp: Date.now() + SESSION_TTL_MS,
    nonce: crypto.randomBytes(8).toString('hex')
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encoded)
    .digest('base64url');
  if (!safeEqual(sig, expectedSig)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload || !payload.sub || !payload.exp || Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    try {
      cookies[key] = decodeURIComponent(val);
    } catch {
      cookies[key] = val;
    }
  }
  return cookies;
}

function extractToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookies = parseCookies(req.headers.cookie || '');
  return cookies[COOKIE_NAME] || null;
}

function getSessionFromRequest(req) {
  const token = extractToken(req);
  return verifySessionToken(token);
}

function isHttpsRequest(req) {
  if (!req) return false;
  if (req.secure) return true;
  const proto = String(req.headers?.['x-forwarded-proto'] || '').toLowerCase();
  return proto.includes('https');
}

function setSessionCookie(res, token, req) {
  const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
  const https = isHttpsRequest(req) || Boolean(process.env.VERCEL);
  const attrs = https ? '; SameSite=None; Secure' : '; SameSite=Lax';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Max-Age=${maxAgeSec}${attrs}`
  );
}

function clearSessionCookie(res, req) {
  const https = isHttpsRequest(req) || Boolean(process.env.VERCEL);
  const attrs = https ? '; SameSite=None; Secure' : '; SameSite=Lax';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0${attrs}`
  );
}

function requireAdmin(req, res, next) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid admin authentication is required.'
    });
  }
  req.adminUser = session.sub;
  return next();
}

module.exports = {
  COOKIE_NAME,
  getConfiguredCredentials,
  verifyCredentials,
  createSessionToken,
  verifySessionToken,
  getSessionFromRequest,
  setSessionCookie,
  clearSessionCookie,
  requireAdmin
};
