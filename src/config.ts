import dotenv = require('dotenv');

dotenv.config();

const parseAdminIds = (ids?: string): number[] => {
  if (!ids) return [];
  return ids.split(',').map((id) => parseInt(id.trim(), 10));
};

const config = {
  botToken: process.env.BOT_TOKEN || '',
  adminChatId: parseInt(process.env.ADMIN_CHAT_ID || '0', 10),
  adminUserIds: parseAdminIds(process.env.ADMIN_USER_IDS),
  contactEmail: process.env.CONTACT_EMAIL || '',
  db: {
    database: process.env.DB_NAME || 'telegram_bot_db',
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    host: process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
  },
};

if (!config.botToken) {
  console.error(
    'Ошибка: BOT_TOKEN не найден в .env файле. Пожалуйста, добавьте его.'
  );
  process.exit(1);
}

// ИЗМЕНЕНО: Используем 'module.exports' вместо 'export'
module.exports = { config };
