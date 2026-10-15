var jwt = require('jsonwebtoken');

var JWT_SECRET = process.env.JWT_SECRET || 'newtechmed_secret_key_2026';
var JWT_EXPIRES = '7d';

function authenticateToken(req, res, next) {
  var authHeader = req.headers['authorization'];
  var token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    var decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function optionalAuth(req, res, next) {
  var authHeader = req.headers['authorization'];
  var token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      var decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch (err) {
      // Token invalid, continue without user
    }
  }
  next();
}

function requireRole() {
  var roles = Array.prototype.slice.call(arguments);
  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    // 'admin' role always bypasses role check
    if (req.user.role === 'admin' || roles.indexOf(req.user.role) !== -1) {
      return next();
    }
    return res.status(403).json({ error: 'Insufficient permissions for role: ' + req.user.role });
  };
}

function requireStoreAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  // Admin has access to all stores
  if (req.user.role === 'admin' || !req.user.store_id) {
    return next();
  }
  var requestedStoreId = req.query.store_id || (req.body && req.body.store_id) || req.params.store_id;
  if (requestedStoreId && String(requestedStoreId) !== String(req.user.store_id)) {
    return res.status(403).json({ error: 'Access denied: You can only access your assigned store #' + req.user.store_id });
  }
  next();
}

module.exports = {
  authenticateToken: authenticateToken,
  optionalAuth: optionalAuth,
  requireRole: requireRole,
  requireStoreAccess: requireStoreAccess,
  JWT_SECRET: JWT_SECRET,
  JWT_EXPIRES: JWT_EXPIRES
};

