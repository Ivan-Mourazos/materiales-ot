import dotenv from 'dotenv';

dotenv.config();

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  port: numberFromEnv('PORT', 3000),
  exportDirectory: process.env.EXPORT_DIRECTORY || '',
  orderArchiveRoot: process.env.ORDER_ARCHIVE_ROOT || '',
  // Documentos de RPS (rpsDocuments.js): la carpeta de red tal como la escribe RPS y dónde se ve
  // desde este servidor. En Windows se usa la propia ruta de red; en Linux, donde IT la monte.
  rpsShareUnc: process.env.RPS_SHARE_UNC || '\\\\192.168.0.128\\RPS',
  rpsShareRoot: process.env.RPS_SHARE_ROOT || (process.platform === 'win32' ? '\\\\192.168.0.128\\RPS' : ''),
  db: {
    server: process.env.DB_SERVER || 'localhost',
    port: numberFromEnv('DB_PORT', 1433),
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || '',
    company: process.env.DB_COMPANY || '001'
  }
};
