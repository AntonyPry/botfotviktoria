import TelegramBot = require('node-telegram-bot-api');
const { config } = require('./config');
const { TEXTS } = require('./constants');
const { Application } = require('./database');

type UserStates = { [chatId: number]: any };

// Сообщение 1: Приветствие
function sendWelcomeMessage(bot: TelegramBot, chatId: number) {
  bot.sendMessage(
    chatId,
    `
Рады вашему интересу к тренингу!
Для участия вашего ребенка в тренинге необходимо соблюсти некоторые формальности:
- Ознакомиться и подписать юридические документы 
- Заполнить короткую анкету 
- Оплатить стоимость участия – 7000 руб (реквизиты для оплаты предоставим дополнительно)
    `,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Продолжить', callback_data: 'start_flow' }],
        ],
      },
    }
  );
}

// Сообщение 2: Юридические документы
function sendLegalDocuments(
  bot: TelegramBot,
  chatId: number,
  messageId: number
) {
  bot.editMessageText(TEXTS.legalBlock, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Ознакомлен и принимаю', callback_data: 'legal_accepted' }],
      ],
    },
  });
}

// Сообщение 3: Согласие на рассылку
function sendNewsletterQuestion(
  bot: TelegramBot,
  chatId: number,
  messageId: number
) {
  bot.editMessageText(TEXTS.newsletterConsent, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '✅ Да, согласен(на) на рассылку',
            callback_data: 'newsletter_yes',
          },
        ],
        [{ text: '❌ Нет, спасибо', callback_data: 'newsletter_no' }],
      ],
    },
  });
}

// Сообщение 4: Разрешение на отзыв
function sendPhotoQuestion(
  bot: TelegramBot,
  chatId: number,
  messageId: number
) {
  bot.editMessageText(TEXTS.photoConsent, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Разрешаю', callback_data: 'photo_yes' }],
        [{ text: '❌ Не разрешаю', callback_data: 'photo_no' }],
      ],
    },
  });
}

// Завершение регистрации и отправка данных
async function finishRegistration(
  bot: TelegramBot,
  chatId: number,
  userStates: UserStates
) {
  const state = userStates[chatId];
  if (!state) return;

  const applicationId = `${Date.now()}-${chatId}`;

  try {
    const user = await bot.getChat(chatId);
    const username = user.username ? `@${user.username}` : 'не указан';

    // ИЗМЕНЕНИЕ: Сохраняем имя и фамилию родителя в разные поля
    await Application.create({
      applicationId: applicationId,
      chatId: chatId,
      username: username,
      parentFirstName: state.data.parentFirstName,
      parentLastName: state.data.parentLastName,
      parentPhone: state.data.parentPhone,
      parentEmail: state.data.parentEmail,
      childFirstName: state.data.childFirstName,
      childLastName: state.data.childLastName,
      childAge: state.data.childAge,
      childContact: state.data.childContact,
      gadgetOpinion: state.data.gadgetOpinion,
      newsletterConsent: state.data.newsletterConsent,
      photoConsent: state.data.photoConsent,
      status: 'pending_payment',
    });
    console.log(`✅ Заявка ${applicationId} успешно сохранена в БД.`);
  } catch (error) {
    console.error(`❌ Ошибка сохранения заявки ${applicationId} в БД:`, error);
    await bot.sendMessage(
      config.adminChatId,
      `⚠️ Не удалось сохранить заявку №${applicationId} в базу данных!`
    );
    await bot.sendMessage(
      chatId,
      'Произошла ошибка при сохранении вашей заявки. Пожалуйста, попробуйте позже.'
    );
    delete userStates[chatId];
    return;
  }

  await bot.sendMessage(
    chatId,
    'Спасибо! Ваша анкета принята. Ожидайте реквизиты для оплаты от менеджера в личных сообщениях.'
  );

  // ИЗМЕНЕНИЕ: Отображаем имя и фамилию родителя в разных строках
  const adminMessage = `
*Новая заявка №${applicationId}*
*Дата:* ${new Date().toLocaleString('ru-RU')}
*Пользователь:* [Написать](tg://user?id=${chatId}) (ID: \`${chatId}\`)

*Данные родителя:*
- Имя: ${state.data.parentFirstName}
- Фамилия: ${state.data.parentLastName}
- Телефон: \`${state.data.parentPhone}\`
- Email: ${state.data.parentEmail}

*Данные ребенка:*
- Имя: ${state.data.childFirstName}
- Фамилия: ${state.data.childLastName}
- Возраст: ${state.data.childAge}
- Контакт: \`${state.data.childContact}\`

*Ответы:*
- Считает ребенка зависимым: ${state.data.gadgetOpinion}
- Согласие на рассылку: ${state.data.newsletterConsent ? 'Да' : 'Нет'}
- Разрешение на фото/отзыв: ${state.data.photoConsent ? 'Да' : 'Нет'}
    `;

  await bot.sendMessage(config.adminChatId, adminMessage, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '✏️ Отметить оплачено',
            callback_data: `mark_paid_${applicationId}_${chatId}`,
          },
        ],
      ],
    },
  });

  delete userStates[chatId];
}

module.exports = {
  sendWelcomeMessage,
  sendLegalDocuments,
  sendNewsletterQuestion,
  sendPhotoQuestion,
  finishRegistration,
};
