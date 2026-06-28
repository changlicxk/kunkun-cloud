const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const COS = require('cos-nodejs-sdk-v5');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const cos = new COS({
  SecretId: config.cos.secretId,
  SecretKey: config.cos.secretKey
});
const COS_BUCKET = config.cos.bucket;
const COS_REGION = config.cos.region;

const nodemailer = require('nodemailer');
const SUPER_ADMIN = config.superAdmin || 'changlicxk';

const mailer = nodemailer.createTransport({
  service: 'qq',
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass
  }
});

const app = express();
const PORT = config.port || 3000;
const BASE_DIR = __dirname;
const UPLOAD_DIR = path.join(BASE_DIR, 'uploads');
const DATA_DIR = path.join(BASE_DIR, 'data');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = {
  users: path.join(DATA_DIR, 'users.json'),
  sessions: path.join(DATA_DIR, 'sessions.json'),
  meta: path.join(DATA_DIR, 'meta.json')
};

function load(f) { try { var s = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''); return JSON.parse(s); } catch (e) { return {}; } }
function save(f, d) { fs.writeFileSync(f, JSON.stringify(d, null, 2), 'utf8'); }
function hash(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function genToken() { return crypto.randomBytes(32).toString('hex'); }

// Ensure super admin exists
(function initAdmin() {
  const users = load(db.users);
  if (!users[SUPER_ADMIN]) {
    users[SUPER_ADMIN] = { pw: hash('20230326lt'), email: '2779330680@qq.com', role: 'admin', createdAt: Date.now() };
    save(db.users, users);
    console.log('Super admin created');
  } else {
    users[SUPER_ADMIN].role = 'admin';
    save(db.users, users);
  }
})();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 * 1024 } });

app.use(express.static(path.join(BASE_DIR, 'public')));
app.use(express.json());

function checkAuth(req, res, next) {
  const t = (req.query && req.query.token) || (req.headers.authorization || '').replace('Bearer ', '');
  if (!t) return res.status(401).json({ error: 'no token' });
  const s = load(db.sessions);
  if (!s[t] || s[t].expiresAt < Date.now()) return res.status(401).json({ error: 'expired' });
  const users = load(db.users);
  const u = users[s[t].userId];
  req.userId = s[t].userId;
  req.userRole = (u && u.role) ? u.role : 'user';
  req.isAdmin = (req.userId === SUPER_ADMIN);
  req.isSubAdmin = (req.userRole === 'subadmin');
  req.isStaff = (req.isAdmin || req.isSubAdmin);
  next();
}

// --- Auth APIs ---

app.post('/api/auth/register', (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'required' });
  if (username.length < 3) return res.status(400).json({ error: 'min 3 chars' });
  if (password.length < 6) return res.status(400).json({ error: 'min 6 chars' });
  const u = load(db.users);
  if (u[username]) return res.status(400).json({ error: 'exists' });
  u[username] = { pw: hash(password), email: email || '', role: 'user', createdAt: Date.now(), lastLogin: null };
  save(db.users, u);
  res.json({ success: true });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const u = load(db.users);
  if (!u[username] || u[username].pw !== hash(password)) return res.status(401).json({ error: 'wrong' });
  const t = genToken();
  const s = load(db.sessions);
  s[t] = { userId: username, expiresAt: Date.now() + 7 * 86400000 };
  save(db.sessions, s);
  u[username].lastLogin = Date.now();
  save(db.users, u);
  const role = u[username].role || 'user';
  res.json({ success: true, token: t, username, isAdmin: (username === SUPER_ADMIN), isSubAdmin: (role === 'subadmin'), role: role });
});

app.post('/api/auth/logout', (req, res) => {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  const s = load(db.sessions);
  delete s[t];
  save(db.sessions, s);
  res.json({ success: true });
});

app.get('/api/auth/check', (req, res) => {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  if (!t) return res.json({ loggedIn: false });
  const s = load(db.sessions);
  if (!s[t] || s[t].expiresAt < Date.now()) return res.json({ loggedIn: false });
  const users = load(db.users);
  const u = users[s[t].userId];
  const role = (u && u.role) ? u.role : 'user';
  res.json({ loggedIn: true, username: s[t].userId, isAdmin: (s[t].userId === SUPER_ADMIN), isSubAdmin: (role === 'subadmin'), role: role });
});

app.post('/api/auth/reset-password', (req, res) => {
  const { username, email } = req.body;
  if (!username || !email) return res.status(400).json({ error: 'required' });
  const users = load(db.users);
  const user = users[username];
  if (!user || user.email !== email) return res.json({ success: true, message: 'if account exists, reset link sent' });
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  user.resetCode = code;
  user.resetExpires = Date.now() + 600000;
  save(db.users, users);
  const mailOptions = {
    from: '2779330680@qq.com',
    to: email,
    subject: '\u5766\u5766\u4e91 - \u9a8c\u8bc1\u7801',
    html: '<h2>\u5766\u5766\u4e91\u9a8c\u8bc1\u7801</h2><p>\u4f60\u597d ' + username + '\uff0c</p><p>\u4f60\u7684\u9a8c\u8bc1\u7801\u662f\uff1a</p><h1 style="color:#e8533e;font-size:32px;letter-spacing:8px">' + code + '</h1><p>\u9a8c\u8bc1\u780110\u5206\u949f\u5185\u6709\u6548\u3002</p><p>\u5982\u679c\u4e0d\u662f\u4f60\u672c\u4eba\u64cd\u4f5c\uff0c\u8bf7\u5ffd\u7565\u6b64\u90ae\u4ef6\u3002</p>'
  };
  mailer.sendMail(mailOptions, (err, info) => {
    if (err) {
      console.log('Email error:', err);
      return res.status(500).json({ error: 'failed to send email' });
    }
    console.log('Email sent:', info.response);
    res.json({ success: true, message: 'verification code sent to your email' });
  });
});

app.post('/api/auth/reset-password/confirm', (req, res) => {
  const { code, username, newPassword } = req.body;
  if (!code || !username || !newPassword) return res.status(400).json({ error: 'required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'min 6 chars' });
  const users = load(db.users);
  const user = users[username];
  if (!user || user.resetCode !== code || user.resetExpires < Date.now()) return res.status(400).json({ error: 'invalid or expired code' });
  user.pw = hash(newPassword);
  delete user.resetCode;
  delete user.resetExpires;
  save(db.users, users);
  res.json({ success: true, message: 'password reset' });
});

// --- Upload ---

app.post('/api/upload', checkAuth, upload.array('files', 20), (req, res) => {
  try {
    const m = load(db.meta);
    const space = req.body.space || 'personal';
    const results = [];
    const uploadTasks = req.files.map((f) => {
      return new Promise((resolve, reject) => {
        const id = uuidv4().substring(0, 8);
        var parsedNames = [];
          try { parsedNames = JSON.parse(decodeURIComponent(req.headers['x-file-names'] || '[]')); } catch(e) { try { parsedNames = JSON.parse(req.headers['x-file-names'] || '[]'); } catch(e2) {} }
          const nameIdx = req.files.indexOf(f);
          const correctName = (parsedNames[nameIdx]) || f.originalname;
          const cosKey = req.userId + '/' + id + '/' + correctName;
        const fileBuffer = fs.readFileSync(f.path);
        cos.putObject({
          Bucket: COS_BUCKET,
          Region: COS_REGION,
          Key: cosKey,
          Body: fileBuffer,
          ContentLength: f.size
        }, (err, data) => {
          if (err) { reject(err); return; }
          try { fs.unlinkSync(f.path); } catch (e) {}
          const expiryMs = parseInt(req.body.expiry) || 86400000;
          const rec = {
            id,
            originalName: correctName,
            cosKey,
            size: f.size,
            space,
            uploadedBy: req.userId,
            uploadedAt: Date.now(),
            expiresAt: Date.now() + expiryMs
          };
          m[id] = rec;
          results.push(rec);
          resolve();
        });
      });
    });
    Promise.all(uploadTasks).then(() => {
      save(db.meta, m);
      console.log('Upload OK:', req.userId, results.length, 'files');
      res.json({ success: true, files: results });
    }).catch((err) => {
      console.error('Upload COS error:', err);
      res.status(500).json({ error: 'Upload failed: ' + err.message });
    });
  } catch (e) {
    console.error('Upload error:', e);
    res.status(500).json({ error: e.message });
  }
});

// --- File list ---

app.get('/api/files', checkAuth, (req, res) => {
  const m = load(db.meta);
  const now = Date.now();
  const space = req.query.space || 'personal';
  const files = Object.values(m).filter(f => {
    if (f.expiresAt < now) return false;
    if (space === 'shared') return f.space === 'shared';
    return f.uploadedBy === req.userId && f.space !== 'shared';
  });
  res.json(files);
});

// --- Download with proper Chinese filename ---

app.get('/api/download-url/:id', (req, res) => {
  const m = load(db.meta);
  const r = m[req.params.id];
  if (!r || Date.now() > r.expiresAt) return res.status(404).json({ error: 'not found' });
  if (r.cosKey) {
    cos.getObject({
      Bucket: COS_BUCKET,
      Region: COS_REGION,
      Key: r.cosKey,
    }, (err, data) => {
      if (err) return res.status(500).json({ error: 'download error' });
      const encodedName = encodeURIComponent(r.originalName);
      res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodedName);
      res.setHeader('Content-Type', (data.headers && data.headers['content-type']) || 'application/octet-stream');
      res.setHeader('Content-Length', data.ContentLength || (data.Body && data.Body.length) || 0);
      res.end(data.Body);
    });
  } else if (r.filename) {
    const fp = require('path').join(__dirname, 'uploads', r.filename);
    if (require('fs').existsSync(fp)) {
      res.download(fp, r.originalName);
    } else {
      res.status(404).json({ error: 'not found' });
    }
  } else {
    res.status(404).json({ error: 'not found' });
  }
});

app.get('/api/download/:id', (req, res) => {
  const m = load(db.meta);
  const r = m[req.params.id];
  if (!r || Date.now() > r.expiresAt) return res.status(404).json({ error: 'not found' });

  if (r.cosKey) {
      const encodedName = encodeURIComponent(r.originalName);
      res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodedName);
      cos.getObject({
        Bucket: COS_BUCKET,
        Region: COS_REGION,
        Key: r.cosKey,
      }, (err, data) => {
        if (err) return res.status(500).json({ error: 'download error' });
        res.setHeader('Content-Type', (data.headers && data.headers['content-type']) || 'application/octet-stream');
        res.setHeader('Content-Length', data.ContentLength || (data.Body && data.Body.length) || 0);
        res.end(data.Body);
      });
  } else if (r.filename) {
    const fp = path.join(UPLOAD_DIR, r.filename);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'not found' });
    res.download(fp, r.originalName);
  } else {
    return res.status(404).json({ error: 'not found' });
  }
});

// --- Delete with role check ---

app.delete('/api/delete/:id', checkAuth, (req, res) => {
  const m = load(db.meta);
  const r = m[req.params.id];
  if (!r) return res.status(404).json({ error: 'not found' });

  let canDelete = false;
  if (req.isAdmin) {
    canDelete = true;
  } else if (req.isSubAdmin) {
    if (r.uploadedBy === req.userId) {
      canDelete = true;
    } else {
      const users = load(db.users);
      const uploaderRole = (users[r.uploadedBy] && users[r.uploadedBy].role) || 'user';
      canDelete = (uploaderRole !== 'admin');
    }
  } else {
    canDelete = (r.uploadedBy === req.userId);
  }

  if (!canDelete) return res.status(403).json({ error: 'no permission' });

  if (r.cosKey) {
    cos.deleteObject({ Bucket: COS_BUCKET, Region: COS_REGION, Key: r.cosKey }, () => {});
  }
  if (r.filename) {
    const fp = path.join(UPLOAD_DIR, r.filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
  delete m[req.params.id];
  save(db.meta, m);
  res.json({ success: true });
});

// --- Admin APIs ---

app.get('/api/admin/users', checkAuth, (req, res) => {
  if (!req.isStaff) return res.status(403).json({ error: 'no permission' });
  const users = load(db.users);
  const m = load(db.meta);
  const result = [];
  for (const [name, u] of Object.entries(users)) {
    let usageBytes = 0;
    let fileCount = 0;
    for (const f of Object.values(m)) {
      if (f.uploadedBy === name && f.expiresAt > Date.now()) {
        usageBytes += f.size || 0;
        fileCount++;
      }
    }
    result.push({
      username: name,
      email: u.email || '',
      role: u.role || 'user',
      createdAt: u.createdAt || null,
      lastLogin: u.lastLogin || null,
      usageBytes: usageBytes,
      fileCount: fileCount
    });
  }
  res.json(result);
});

app.post('/api/admin/set-role', checkAuth, (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'only super admin' });
  const { username, role } = req.body;
  if (!username) return res.status(400).json({ error: 'required' });
  if (username === SUPER_ADMIN) return res.status(400).json({ error: 'cannot change super admin' });
  const users = load(db.users);
  if (!users[username]) return res.status(404).json({ error: 'user not found' });
  users[username].role = (role === 'subadmin') ? 'subadmin' : 'user';
  save(db.users, users);
  res.json({ success: true, role: users[username].role });
});

app.post('/api/admin/delete-user', checkAuth, (req, res) => {
  if (!req.isStaff) return res.status(403).json({ error: 'no permission' });
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'required' });
  if (username === SUPER_ADMIN) return res.status(400).json({ error: 'cannot delete super admin' });
  if (req.isSubAdmin) {
    const users = load(db.users);
    const targetRole = (users[username] && users[username].role) || 'user';
    if (targetRole === 'admin' || targetRole === 'subadmin') return res.status(403).json({ error: 'sub admin cannot delete admin users' });
  }
  const users = load(db.users);
  if (!users[username]) return res.status(404).json({ error: 'user not found' });
  delete users[username];
  save(db.users, users);
  const sessions = load(db.sessions);
  for (const [t, s] of Object.entries(sessions)) {
    if (s.userId === username) delete sessions[t];
  }
  save(db.sessions, sessions);
  const m = load(db.meta);
  for (const [id, f] of Object.entries(m)) {
    if (f.uploadedBy === username) {
      if (f.cosKey) cos.deleteObject({ Bucket: COS_BUCKET, Region: COS_REGION, Key: f.cosKey }, () => {});
      if (f.filename) {
        const fp = path.join(UPLOAD_DIR, f.filename);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      }
      delete m[id];
    }
  }
  save(db.meta, m);
  res.json({ success: true });
});

// --- Expired file cleanup ---

setInterval(() => {
  const m = load(db.meta);
  let changed = false;
  for (const [id, r] of Object.entries(m)) {
    if (r.expiresAt < Date.now()) {
      if (r.filename) {
        const fp = path.join(UPLOAD_DIR, r.filename);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      }
      if (r.cosKey) {
        cos.deleteObject({ Bucket: COS_BUCKET, Region: COS_REGION, Key: r.cosKey }, () => {});
      }
      delete m[id];
      changed = true;
    }
  }
  if (changed) save(db.meta, m);
}, 3600000);

app.listen(PORT, '0.0.0.0', () => console.log('Server running on port ' + PORT));




