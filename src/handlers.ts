import TelegramBot = require('node-telegram-bot-api');
const { config } = require('./config');
const {
  startRegistrationFlow,
  finishRegistration,
  editPolicyMessage,
  sendConfirmationMessage,
} = require('./services');
const { Application } = require('./database');

type UserStates = { [chatId: number]: any };

function registerHandlers(bot: TelegramBot, userStates: UserStates) {
  // --- ОБРАБОТЧИК КОМАНДЫ /start ---
  bot.onText(/\/start/, (msg) => {
    startRegistrationFlow(bot, msg.chat.id, userStates);
  });

  // --- ОСНОВНОЙ ОБРАБОТЧИК СООБЩЕНИЙ ДЛЯ ЗАПОЛНЕНИЯ АНКЕТЫ ---
  bot.on('message', (msg) => {
    // ... этот код остается без изменений ...
    const chatId = msg.chat.id;
    const state = userStates[chatId];
    if (!state || !state.step) return;
    switch (state.step) {
      case 'awaiting_first_name':
        if (msg.text && msg.text.trim().length > 1) {
          state.data.firstName = msg.text.trim();
          state.step = 'awaiting_last_name';
          bot.sendMessage(chatId, 'Отлично! Теперь введите вашу Фамилию:');
        } else {
          bot.sendMessage(chatId, 'Пожалуйста, введите корректное имя.');
        }
        break;
      case 'awaiting_last_name':
        if (msg.text && msg.text.trim().length > 1) {
          state.data.lastName = msg.text.trim();
          state.step = 'awaiting_phone';
          bot.sendMessage(
            chatId,
            'Спасибо! Теперь, пожалуйста, поделитесь вашим контактом.',
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
        } else {
          bot.sendMessage(chatId, 'Пожалуйста, введите корректную фамилию.');
        }
        break;
      case 'awaiting_phone':
        if (msg.contact && msg.contact.phone_number) {
          state.data.phone = msg.contact.phone_number;
          state.step = 'awaiting_email';
          bot.sendMessage(chatId, 'Спасибо! Теперь введите ваш Email.', {
            reply_markup: { remove_keyboard: true },
          });
        } else {
          bot.sendMessage(
            chatId,
            'Пожалуйста, используйте кнопку "Поделиться контактом".'
          );
        }
        break;
      case 'awaiting_email':
        if (msg.text && /\S+@\S+\.\S+/.test(msg.text)) {
          state.data.email = msg.text;
          state.step = 'awaiting_product';
          bot.sendMessage(
            chatId,
            'Email принят. Теперь выберите продукт или тариф:',
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: 'Тариф "Стандарт"',
                      callback_data: 'product_standard',
                    },
                  ],
                  [{ text: 'Тариф "Профи"', callback_data: 'product_pro' }],
                  [{ text: 'Тариф "VIP"', callback_data: 'product_vip' }],
                ],
              },
            }
          );
        } else {
          bot.sendMessage(
            chatId,
            'Кажется, это не похоже на Email. Попробуйте еще раз.'
          );
        }
        break;
    }
  });

  // --- ОБРАБОТЧИК НАЖАТИЙ НА INLINE-КНОПКИ ---
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

    // Логика для первого шага (согласия)
    if (query.data === 'toggle_pd_consent') {
      state.policy.pdConsent = !state.policy.pdConsent;
      bot.answerCallbackQuery(query.id);
      editPolicyMessage(bot, chatId, messageId, userStates);
      return;
    }
    if (query.data === 'toggle_policy_ack') {
      state.policy.policyAck = !state.policy.policyAck;
      bot.answerCallbackQuery(query.id);
      editPolicyMessage(bot, chatId, messageId, userStates);
      return;
    }
    if (query.data === 'continue_to_form') {
      if (state && state.policy.pdConsent && state.policy.policyAck) {
        state.data.newsletter = true;
        state.data.photoConsent = true;
        await bot.deleteMessage(chatId, messageId);
        state.step = 'awaiting_first_name';
        await bot.sendMessage(
          chatId,
          'Спасибо за согласие! Давайте начнем. Введите ваше Имя:'
        );
      } else {
        bot.answerCallbackQuery(query.id, {
          text: 'Пожалуйста, подтвердите оба пункта.',
          show_alert: true,
        });
      }
      return;
    }

    // Логика выбора продукта и перехода к подтверждению
    if (query.data.startsWith('product_')) {
      if (!state) return;
      state.data.product = query.data.replace('product_', '');
      await bot.deleteMessage(chatId, messageId);
      state.step = 'awaiting_confirmation';
      sendConfirmationMessage(bot, chatId, userStates);
      return;
    }

    // Новая логика для кнопок подтверждения
    if (query.data === 'confirm_submission') {
      if (!state) return;
      await bot.editMessageText('✅ Спасибо! Ваша заявка отправляется...', {
        chat_id: chatId,
        message_id: messageId,
      });
      await finishRegistration(bot, chatId, userStates);
      return;
    }
    if (query.data === 'start_over') {
      await bot.editMessageText('Начинаем заново...', {
        chat_id: chatId,
        message_id: messageId,
      });
      startRegistrationFlow(bot, chatId, userStates);
      return;
    }

    // Логика для админов с БД
    if (query.data.startsWith('mark_paid_')) {
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
        bot.answerCallbackQuery(query.id, {
          text: 'Статус заявки обновлен в БД!',
        });
        bot.sendMessage(
          application.get('chatId') as number,
          '✅ Оплата получена. Вы добавлены в базу.'
        );
      } else {
        bot.answerCallbackQuery(query.id, {
          text: 'Заявка не найдена в базе данных.',
          show_alert: true,
        });
      }
    }
  });

  // --- ОБРАБОТЧИК КОМАНДЫ /broadcast ---
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
