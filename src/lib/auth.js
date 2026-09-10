// Shared-password protection for the whole app.
//
// Off by default (nothing to configure while testing locally). Set
// KFOS_AUTH_PASSWORD (and optionally KFOS_AUTH_USERNAME) as environment
// variables to require an HTTP Basic Auth login on every request — this is
// the switch to flip before putting KFOS on a URL the internet can reach.

function basicAuth(req, res, next) {
  const password = process.env.KFOS_AUTH_PASSWORD;
  if (!password) return next(); // auth disabled — local/dev mode

  const username = process.env.KFOS_AUTH_USERNAME || 'keverd';
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');

  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const sepIndex = decoded.indexOf(':');
    const user = decoded.slice(0, sepIndex);
    const pass = decoded.slice(sepIndex + 1);
    if (user === username && pass === password) return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="KFOS"');
  res.status(401).send('Authentication required.');
}

module.exports = basicAuth;
