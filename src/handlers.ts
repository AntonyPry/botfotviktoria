import TelegramBot = require('node-telegram-bot-api');
const { config } = require('./config');
const {
  sendWelcomeMessage,
  sendLegalDocuments,
  sendNewsletterQuestion,
  sendPhotoQuestion,
  finishRegistration,
} = require('./services');
const { Application } = require('./database');

type UserStates = { [chatId: number]: any };

function registerHandlers(bot: TelegramBot, userStates: UserStates) {
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    delete userStates[chatId];
    userStates[chatId] = {
      step: 'start',
      data: {},
    };
    sendWelcomeMessage(bot, msg.chat.id);
  });

  bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const state = userStates[chatId];
    if (!state || !state.step) return;

    const text = msg.text || '';

    switch (state.step) {
      // ИЗМЕНЕНИЕ: Запрашиваем сначала имя, потом фамилию
      case 'awaiting_parent_firstname':
        state.data.parentFirstName = text.trim();
        state.step = 'awaiting_parent_lastname';
        bot.sendMessage(chatId, 'Ваша Фамилия:');
        break;
      case 'awaiting_parent_lastname':
        state.data.parentLastName = text.trim();
        state.step = 'awaiting_parent_phone';
        bot.sendMessage(
          chatId,
          'Ваш телефон (можно использовать кнопку ниже):',
          {
            reply_markup: {
              keyboard: [
                [{ text: '📱 Поделиться контактом', request_contact: true }],
              ],
              one_time_keyboard: true,
              resize_keyboard: true,
            },
          }
        );
        break;
      case 'awaiting_parent_phone':
        if (msg.contact && msg.contact.phone_number) {
          state.data.parentPhone = msg.contact.phone_number;
        } else {
          state.data.parentPhone = text.trim();
        }
        state.step = 'awaiting_parent_email';
        bot.sendMessage(chatId, 'Ваш Email:', {
          reply_markup: { remove_keyboard: true },
        });
        break;
      case 'awaiting_parent_email':
        const emailRegex = /\S+@\S+\.\S+/;
        if (emailRegex.test(text.trim())) {
          state.data.parentEmail = text.trim();
          state.step = 'awaiting_child_firstname';
          bot.sendMessage(chatId, 'Имя Вашего ребенка:');
        } else {
          bot.sendMessage(
            chatId,
            'Кажется, это не похоже на email. Пожалуйста, проверьте и введите адрес еще раз.'
          );
        }
        break;
      case 'awaiting_child_firstname':
        state.data.childFirstName = text.trim();
        state.step = 'awaiting_child_lastname';
        bot.sendMessage(chatId, 'Фамилия Вашего ребенка:');
        break;
      case 'awaiting_child_lastname':
        state.data.childLastName = text.trim();
        state.step = 'awaiting_child_age';
        bot.sendMessage(chatId, 'Возраст ребенка:');
        break;
      case 'awaiting_child_age':
        state.data.childAge = text.trim();
        state.step = 'awaiting_child_contact';
        bot.sendMessage(chatId, 'Телефон или Никнейм ребенка в Telegram:');
        break;
      case 'awaiting_child_contact':
        state.data.childContact = text.trim();
        state.step = 'awaiting_gadget_opinion';
        bot.sendMessage(
          chatId,
          'Считаете ли Вы, что ваш ребенок зависим от гаджетов?',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Да', callback_data: 'opinion_yes' }],
                [{ text: 'Нет', callback_data: 'opinion_no' }],
                [{ text: 'Затрудняюсь ответить', callback_data: 'opinion_dk' }],
              ],
            },
          }
        );
        break;
    }
  });

  bot.on('callback_query', async (query) => {
    if (!query.data || !query.message) {
      bot.answerCallbackQuery(query.id);
      return;
    }
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const state = userStates[chatId];
    if (!state && !query.data.startsWith('mark_paid_')) {
      bot.answerCallbackQuery(query.id);
      return;
    }

    if (query.data === 'start_flow') {
      state.step = 'awaiting_legal_accept';
      sendLegalDocuments(bot, chatId, messageId);
    } else if (query.data === 'legal_accepted') {
      state.step = 'awaiting_newsletter_choice';
      sendNewsletterQuestion(bot, chatId, messageId);
    } else if (
      query.data === 'newsletter_yes' ||
      query.data === 'newsletter_no'
    ) {
      state.data.newsletterConsent = query.data === 'newsletter_yes';
      state.step = 'awaiting_photo_choice';
      sendPhotoQuestion(bot, chatId, messageId);
    } else if (query.data === 'photo_yes' || query.data === 'photo_no') {
      state.data.photoConsent = query.data === 'photo_yes';
      // ИЗМЕНЕНИЕ: Устанавливаем первый шаг анкеты и меняем текст
      state.step = 'awaiting_parent_firstname';
      await bot.deleteMessage(chatId, messageId);
      await bot.sendMessage(
        chatId,
        'Спасибо! Теперь заполним анкету.\n\nВаше Имя:'
      );
    } else if (query.data.startsWith('opinion_')) {
      const opinions: { [key: string]: string } = {
        opinion_yes: 'Да',
        opinion_no: 'Нет',
        opinion_dk: 'Затрудняюсь ответить',
      };
      state.data.gadgetOpinion = opinions[query.data];
      await bot.deleteMessage(chatId, messageId);
      await finishRegistration(bot, chatId, userStates);
    } else if (query.data.startsWith('mark_paid_')) {
      const parts = query.data.split('_');
      const applicationId = parts[2];

      const application = await Application.findByPk(applicationId);

      if (application) {
        application.set('status', 'paid');
        application.set('paidAt', new Date());
        await application.save();

        bot.editMessageReplyMarkup(
          {
            inline_keyboard: [
              [
                {
                  text: `✅ Оплачено ${new Date().toLocaleDateString()}`,
                  callback_data: 'already_paid',
                },
              ],
            ],
          },
          {
            chat_id: config.adminChatId,
            message_id: messageId,
          }
        );

        bot.sendMessage(
          application.get('chatId') as number,
          '✅ Оплата получена. Вы добавлены в группу. Дополнительно перед тренингом направим напоминание в личных сообщениях и все потребности'
        );
      } else {
        bot.answerCallbackQuery(query.id, {
          text: 'Заявка не найдена в базе данных.',
          show_alert: true,
        });
      }
    }

    bot.answerCallbackQuery(query.id);
  });

  bot.onText(/\/broadcast (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const text = match![1];

    if (!config.adminUserIds.includes(chatId)) {
      bot.sendMessage(chatId, 'У вас нет прав для выполнения этой команды.');
      return;
    }
    if (!text) {
      bot.sendMessage(
        chatId,
        'Пожалуйста, укажите текст для рассылки. Пример: /broadcast Привет всем!'
      );
      return;
    }

    const usersToSend = await Application.findAll({
      where: { status: 'paid', newsletterConsent: true },
    });

    if (usersToSend.length === 0) {
      bot.sendMessage(
        chatId,
        'В базе данных не найдено оплативших пользователей, давших согласие на рассылку.'
      );
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    bot.sendMessage(
      chatId,
      `Начинаю рассылку для ${usersToSend.length} пользователей из БД...`
    );

    for (const user of usersToSend) {
      try {
        await bot.sendMessage(user.get('chatId') as number, text);
        successCount++;
      } catch (error) {
        console.error(
          `Не удалось отправить сообщение пользователю ${user.get('chatId')}:`,
          error
        );
        errorCount++;
      }
    }
    bot.sendMessage(
      chatId,
      `Рассылка завершена!\n\n✅ Успешно отправлено: ${successCount}\n❌ Ошибок: ${errorCount}`
    );
  });
}

module.exports = { registerHandlers };
