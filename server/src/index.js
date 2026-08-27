const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const db = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const requestRoutes = require('./routes/requestRoutes');
const requestAttachmentRoutes = require('./routes/requestAttachmentRoutes');
const attachmentRoutes = require('./routes/attachmentRoutes');
const referenceRoutes = require('./routes/referenceRoutes');
const userRoutes = require('./routes/userRoutes');
const fiscalYearRoutes = require('./routes/fiscalYearRoutes');
const assistantRoutes = require('./routes/assistantRoutes');

const REQUIRED_ENV = ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_NAME'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[startup] Nedostaje env varijabla: ${key}`);
    process.exit(1);
  }
}

if (process.env.JWT_SECRET.length < 32) {
  console.error('[startup] JWT_SECRET je prekratak — minimalno 32 znaka. Generiraj s: openssl rand -base64 48');
  process.exit(1);
}

const app = express();

// U Dockeru/produkciji Express sjedi iza nginx proxyja — bez ovoga svi
// zahtjevi izgledaju kao da dolaze s proxy IP-a pa rate limiter ne
// razlikuje korisnike (i express-rate-limit baca ValidationError).
app.set('trust proxy', 1);

app.use(helmet({
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: false,
  },
  contentSecurityPolicy: {
    directives: {
      defaultSrc:    ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
}));

// Limiti se mogu povisiti kroz env za lokalni razvoj i e2e testove (default = produkcijski)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Previše pokušaja prijave. Pokušajte ponovo za 15 minuta.' },
});

const setPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Previše pokušaja. Pokušajte ponovo za sat vremena.' },
});

const checkEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.CHECK_EMAIL_RATE_LIMIT_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Previše pokušaja. Pokušajte ponovo za 15 minuta.' },
});

const assistantChatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.ASSISTANT_CHAT_RATE_LIMIT_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Previše zahtjeva AI asistentu. Pokušajte ponovo za 15 minuta.' },
});

const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').map((o) => o.trim())
  : ['http://localhost:9000', 'http://localhost:8080'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin nije dozvoljen — ${origin}`));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/set-password', setPasswordLimiter);
app.use('/api/auth/check-email', checkEmailLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/attachments', attachmentRoutes);
app.use('/api/requests', requestAttachmentRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/reference', referenceRoutes);
app.use('/api/users', userRoutes);
app.use('/api/fiscal-years', fiscalYearRoutes);
app.use('/api/assistant/chat', assistantChatLimiter);
app.use('/api/assistant', assistantRoutes);

app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', uptime: Math.floor(process.uptime()) });
  } catch {
    res.status(503).json({ status: 'error', message: 'Baza podataka nije dostupna.' });
  }
});

app.use((req, res) => {
  res.status(404).json({ message: 'Ruta nije pronađena.' });
});

app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ message: 'Interna greška servera.' });
});

const PORT = process.env.PORT || 3000;

// Server se pokreće samo kad je datoteka izvršena direktno — integracijski
// testovi importaju `app` i gađaju ga supertestom bez otvaranja porta.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
    process.exit(1);
  });
}

module.exports = app;