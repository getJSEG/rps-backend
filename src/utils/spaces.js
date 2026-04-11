const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');

/** @typedef {{ region: string, bucket: string, accessKey: string, secretKey: string, endpoint: string, publicBase: string | null, objectAcl: string | null }} SpacesConfig */

/**
 * ACL on PutObject so public URLs work in the browser (fixes AccessDenied on direct GET).
 * Default: public-read. Set DO_SPACES_OBJECT_ACL=none to skip ACL (use a Spaces bucket policy instead).
 */
function resolveObjectAcl() {
  const raw = process.env.DO_SPACES_OBJECT_ACL;
  if (raw === undefined || raw === '') return 'public-read';
  const t = String(raw).trim();
  if (!t || /^none$/i.test(t) || t === '-') return null;
  return t;
}

/** @returns {SpacesConfig | null} */
function getConfig() {
  const region = (process.env.DO_SPACES_REGION || '').trim();
  const bucket = (process.env.DO_SPACES_BUCKET || '').trim();
  const accessKey = (process.env.DO_SPACES_ACCESS_KEY || '').trim();
  const secretKey = (process.env.DO_SPACES_SECRET_KEY || '').trim();
  const endpointRaw = (process.env.DO_SPACES_ENDPOINT || '').trim();
  const publicBase = (process.env.DO_SPACES_PUBLIC_URL || '').trim() || null;
  const objectAcl = resolveObjectAcl();

  if (!region || !bucket || !accessKey || !secretKey) return null;

  const endpoint =
    endpointRaw || `https://${region}.digitaloceanspaces.com`;

  return { region, bucket, accessKey, secretKey, endpoint, publicBase, objectAcl };
}

let _client = null;
/** @returns {S3Client | null} */
function getClient() {
  const cfg = getConfig();
  if (!cfg) return null;
  if (!_client) {
    _client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      credentials: {
        accessKeyId: cfg.accessKey,
        secretAccessKey: cfg.secretKey,
      },
      forcePathStyle: false,
    });
  }
  return _client;
}

function extFromMime(mime) {
  const m = (mime || '').toLowerCase();
  if (m === 'image/png') return '.png';
  if (m === 'image/webp') return '.webp';
  if (m === 'image/gif') return '.gif';
  if (m === 'image/jpeg' || m === 'image/jpg') return '.jpg';
  return '.jpg';
}

/**
 * Public URL for an object key (virtual-hosted style if no CDN base set).
 * @param {string} key
 * @param {SpacesConfig} cfg
 */
function publicUrlForKey(key, cfg) {
  const k = key.replace(/^\/+/, '');
  if (cfg.publicBase) {
    const base = cfg.publicBase.replace(/\/+$/, '');
    return `${base}/${k}`;
  }
  return `https://${cfg.bucket}.${cfg.region}.digitaloceanspaces.com/${k}`;
}

/**
 * Upload image buffer to DigitalOcean Spaces (S3-compatible).
 * @param {Buffer} buffer
 * @param {string} folderPrefix - e.g. 'elmer/products' (no leading/trailing slashes)
 * @param {{ contentType?: string }} [opts]
 * @returns {Promise<string>} public HTTPS URL
 */
async function uploadFromBuffer(buffer, folderPrefix = 'elmer', opts = {}) {
  const cfg = getConfig();
  if (!cfg) {
    throw new Error(
      'Spaces not configured. Set DO_SPACES_REGION, DO_SPACES_BUCKET, DO_SPACES_ACCESS_KEY, DO_SPACES_SECRET_KEY (and optionally DO_SPACES_ENDPOINT, DO_SPACES_PUBLIC_URL).'
    );
  }
  const client = getClient();
  if (!client) {
    throw new Error('Spaces S3 client could not be created.');
  }

  const ext = extFromMime(opts.contentType);
  const safeFolder = folderPrefix.replace(/^\/+|\/+$/g, '');
  const key = `${safeFolder}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  const contentType = opts.contentType || 'image/jpeg';

  const input = {
    Bucket: cfg.bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  };
  if (cfg.objectAcl) input.ACL = cfg.objectAcl;

  await client.send(new PutObjectCommand(input));
  return publicUrlForKey(key, cfg);
}

function isConfigured() {
  return !!getConfig();
}

module.exports = { uploadFromBuffer, isConfigured, getConfig };
