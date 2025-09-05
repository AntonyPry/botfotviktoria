import TelegramBot = require('node-telegram-bot-api');
const { config } = require('./config');
const { registerHandlers } = require('./handlers');
const { connectToDatabase } = require('./database');

const userStates: { [chatId: number]: any } = {};

async function startBot() {
  await connectToDatabase();

  const bot = new TelegramBot(config.botToken, { polling: true });

  registerHandlers(bot, userStates);

  console.log('🚀 Бот успешно запущен и подключен к БД...');
}

startBot();
