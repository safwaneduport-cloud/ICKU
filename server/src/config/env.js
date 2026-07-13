import dotenv from 'dotenv';
dotenv.config();

export const env = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL,
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL || '7d',
  },
  // Optional site-wide access gate (HTTP Basic Auth). When both are set, the
  // whole app requires these credentials before anything loads — used to keep
  // the public URL from being openly browsable when it holds real employee data.
  siteAccessUser: process.env.SITE_ACCESS_USER || '',
  siteAccessPass: process.env.SITE_ACCESS_PASS || '',
  // Supabase Storage for file/image uploads. When set, uploads go to the bucket
  // and only the URL is stored in the DB; otherwise the app falls back to
  // embedding the file (data URL) so local dev works without any config.
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY || '',
    bucket: process.env.SUPABASE_BUCKET || 'uploads',
  },
};
