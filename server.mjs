import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

const PORT = Number(process.env.PORT || 5173);
const PUBLIC_DIR = join(process.cwd(), 'public');

const getEnv = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const BASE_URL = process.env.BASE_URL || 'https://wonderful.app.demo.wonderful.ai';
const API_BASE_URL =
  process.env.API_BASE_URL || BASE_URL.replace('wonderful.app', 'api');

const WEBHOOK_URL = getEnv(
  'WEBHOOK_URL',
  'https://api.demo.wonderful.ai/api/v1/tasks/webhook/0e3ae512-4150-45d6-a66f-688c83bdddc4'
);
const WEBHOOK_SECRET = getEnv(
  'WEBHOOK_SECRET',
  '84455cf5-a8b6-4f3f-b080-332242eca6bd'
);
const STORAGE_URL = getEnv('STORAGE_URL', `${API_BASE_URL}/api/v1/storage`);
const STORAGE_API_KEY = getEnv(
  'STORAGE_API_KEY',
  'f2440f35-f26d-4145-8c15-295b40987ed6'
);
const TASK_TYPE = process.env.TASK_TYPE || 'process_application';
const TRIGGER_ID =
  process.env.TRIGGER_ID || '4fd88805-7cde-4a7a-9d99-5347e5fb308e';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const jsonResponse = (res, statusCode, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
};

const readBodyAsFormData = async (req, url) => {
  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: req,
    duplex: 'half',
  });
  return request.formData();
};

const uploadAttachment = async (file) => {
  const contentType = file.type || 'application/octet-stream';
  const filename = file.name || 'form17-medical-referral';

  const storageResponse = await fetch(STORAGE_URL, {
    method: 'POST',
    headers: {
      'X-API-Key': STORAGE_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filename, contentType }),
  });

  if (!storageResponse.ok) {
    const text = await storageResponse.text();
    throw new Error(`Storage init failed (${storageResponse.status}): ${text}`);
  }

  const storageJson = await storageResponse.json();
  const attachmentId = storageJson?.data?.id;
  const uploadUrl = storageJson?.data?.url;

  if (!attachmentId || !uploadUrl) {
    throw new Error('Storage response missing attachment id or upload url');
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: fileBuffer,
  });

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text();
    throw new Error(`Upload failed (${uploadResponse.status}): ${text}`);
  }

  return attachmentId;
};

const triggerWebhook = async ({ email, firstName, lastName, hospital, attachmentId }) => {
  const subject = `Form 17 Request - ${firstName} ${lastName}`.trim();

  const webhookResponse = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'x-webhook-secret': WEBHOOK_SECRET,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      trigger_id: TRIGGER_ID,
      task_type: TASK_TYPE,
      payload: {
        customer_email: email,
        subject,
        message: 'Process this Form 17 request',
        claim_attachment_id: attachmentId,
        customer_first_name: firstName,
        customer_last_name: lastName,
        requested_hospital: hospital,
      },
    }),
  });

  if (!webhookResponse.ok) {
    const text = await webhookResponse.text();
    throw new Error(`Webhook failed (${webhookResponse.status}): ${text}`);
  }

  return webhookResponse.json();
};

const serveStatic = async (req, res, url) => {
  const pathname = url.pathname === '/' ? 'index.html' : url.pathname;
  const safePath = pathname.replace(/^[/\\]+/, '');
  const publicRoot = normalize(PUBLIC_DIR);
  const resolvedPath = normalize(join(publicRoot, safePath));
  const normalizedRoot = publicRoot.endsWith(sep) ? publicRoot : `${publicRoot}${sep}`;

  if (!resolvedPath.startsWith(normalizedRoot)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const file = await readFile(resolvedPath);
    const extension = extname(resolvedPath).toLowerCase();
    const contentType = CONTENT_TYPES[extension] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(file);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'POST' && url.pathname === '/api/submit') {
    try {
      const formData = await readBodyAsFormData(req, url);
      const firstName = String(formData.get('first_name') || '').trim();
      const lastName = String(formData.get('last_name') || '').trim();
      const email = String(formData.get('email') || '').trim();
      const hospital = String(formData.get('hospital') || '').trim();
      const file = formData.get('claim_file');

      if (!firstName || !lastName || !email || !hospital) {
        jsonResponse(res, 400, { ok: false, error: 'missing_fields', message: 'Missing required form fields.' });
        return;
      }

      if (!file || typeof file === 'string') {
        jsonResponse(res, 400, { ok: false, error: 'missing_file', message: 'A medical referral attachment is required.' });
        return;
      }

      const attachmentId = await uploadAttachment(file);
      const webhookResult = await triggerWebhook({ email, firstName, lastName, hospital, attachmentId });
      jsonResponse(res, 200, { ok: true, attachment_id: attachmentId, webhook: webhookResult });
    } catch (error) {
      jsonResponse(res, 500, { ok: false, error: 'server_error', message: error instanceof Error ? error.message : 'Unknown error' });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    jsonResponse(res, 200, { ok: true });
    return;
  }

  await serveStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log(`Form 17 Healthcare UI server running at http://localhost:${PORT}`);
});
