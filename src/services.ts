import TelegramBot = require('node-telegram-bot-api');
const { config } = require('./config');
const { Application } = require('./database');

type UserStates = { [chatId: number]: any };

const TEXTS = {
  newsletterConsent: `
*СОГЛАСИЕ НА РАССЫЛКУ*
Хотите ли вы получать полезную информацию о цифровой гигиене, развитии soft skills у подростков, анонсы новых тренингов и мероприятий? 

Нажимая «✅ Да, согласен(на) на рассылку», я даю разрешение (ИНН) направлять мне на указанный email и/или в мессенджер Telegram информационные и рекламные сообщения, содержащие информацию, в том числе, но не ограничиваясь, о продуктах и услугах  Исполнителя, о наличии специальных предложений, акций в отношении них, о проведении мероприятий, презентаций, а также рассылок, подготовленных в качестве личных рекомендаций.

Я понимаю, что могу в любой момент отписаться от рассылки, написав слово «Стоп» в ответ на любое из сообщений или направив соответствующее уведомление на адрес электронной почты ().
    `,
  photoConsent: `
*Разрешение на отзыв и публикацию*
Мы всегда рады честным отзывам о нашем тренинге! Это помогает другим родителям и подросткам принять решение. Поделитесь вашим мнением?


Нажимая «✅ Разрешаю», я даю согласие (ИНН) на сбор, обработку и публикацию моего отзыва, а также на использование (в том числе публикацию на сайтах, в социальных сетях и рекламных материалах) фотографий и видеозаписей с участием моего несовершеннолетнего ребёнка, сделанных во время проведения тренинга «Гаджеты в плюс», а также указанных мной имени и фамилии.

Состав данных для публикации: мой отзыв в текстовой форме, моё имя и фамилия. Иные персональные данные (телефон, email) публиковаться не будут.
Я понимаю, что мой отзыв и имя будут общедоступны в интернете, и предъявить претензии в связи с этим я не буду.

Я подтверждаю, что данное согласие является бессрочным и может быть отозвано мною в любое время путем направления письменного заявления по адресу электронной почты ()
    `,
  publicOffer: `
*Публичная оферта*
Здесь должен быть текст вашей публичной оферты...
    `,
};

function startRegistrationFlow(
  bot: TelegramBot,
  chatId: number,
  userStates: UserStates
) {
  delete userStates[chatId];
  userStates[chatId] = {
    step: 'awaiting_policy_agreement',
    data: {},
    policy: { pdConsent: false, policyAck: false },
  };
  sendPolicyAgreement(bot, chatId, userStates);
}

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
    await Application.create({
      applicationId: applicationId,
      chatId: chatId,
      username: username,
      firstName: state.data.firstName,
      lastName: state.data.lastName,
      phone: state.data.phone,
      email: state.data.email,
      product: state.data.product,
      newsletterConsent: state.data.newsletter,
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
    `Спасибо, ваша заявка №${applicationId} создана. Ожидайте счёт от менеджера.`
  );
  const adminMessage = `
*Новая заявка №${applicationId}*
*Дата:* ${new Date().toLocaleString('ru-RU')}
*Пользователь:*
- *ID:* \`${chatId}\`
- *Ссылка:* [Написать пользователю](tg://user?id=${chatId})
*Данные анкеты:*
- *Имя:* ${state.data.firstName}
- *Фамилия:* ${state.data.lastName}
- *Телефон:* \`${state.data.phone}\`
- *Email:* ${state.data.email}
- *Продукт/Тариф:* ${state.data.product}
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

function sendConfirmationMessage(
  bot: TelegramBot,
  chatId: number,
  userStates: UserStates
) {
  const state = userStates[chatId];
  if (!state || !state.data) return;
  const confirmationText = `
*Пожалуйста, проверьте ваши данные:*

- *Имя:* ${state.data.firstName}
- *Фамилия:* ${state.data.lastName}
- *Телефон:* ${state.data.phone}
- *Email:* ${state.data.email}
- *Выбранный тариф:* ${state.data.product}

Всё верно?
    `;
  bot.sendMessage(chatId, confirmationText, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '✅ Всё верно, отправить',
            callback_data: 'confirm_submission',
          },
        ],
        [{ text: '❌ Начать заново', callback_data: 'start_over' }],
      ],
    },
  });
}

function sendPolicyAgreement(
  bot: TelegramBot,
  chatId: number,
  userStates: UserStates
) {
  const state = userStates[chatId];
  if (!state) return;
  const fullMessage = `
Здравствуйте!
Для продолжения регистрации, пожалуйста, ознакомьтесь с условиями и дайте необходимые согласия.
-----------------------------------
${TEXTS.publicOffer}
-----------------------------------
${TEXTS.newsletterConsent}
-----------------------------------
${TEXTS.photoConsent}
-----------------------------------
Пожалуйста, подтвердите ваше согласие со всеми вышеизложенными пунктами, нажав на кнопки ниже:
    `;
  const pdButtonText = `${
    state.policy.pdConsent ? '✅' : '☑️'
  } Даю согласие на обработку ПД и принимаю условия`;
  const policyButtonText = `${
    state.policy.policyAck ? '✅' : '☑️'
  } Даю согласие на рассылку и использование материалов`;
  bot.sendMessage(chatId, fullMessage, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: pdButtonText, callback_data: 'toggle_pd_consent' }],
        [{ text: policyButtonText, callback_data: 'toggle_policy_ack' }],
        [{ text: 'Продолжить', callback_data: 'continue_to_form' }],
      ],
    },
  });
}

function editPolicyMessage(
  bot: TelegramBot,
  chatId: number,
  messageId: number,
  userStates: UserStates
) {
  const state = userStates[chatId];
  if (!state) return;
  const pdButtonText = `${
    state.policy.pdConsent ? '✅' : '☑️'
  } Даю согласие на обработку ПД и принимаю условия`;
  const policyButtonText = `${
    state.policy.policyAck ? '✅' : '☑️'
  } Даю согласие на рассылку и использование материалов`;
  bot.editMessageReplyMarkup(
    {
      inline_keyboard: [
        [{ text: pdButtonText, callback_data: 'toggle_pd_consent' }],
        [{ text: policyButtonText, callback_data: 'toggle_policy_ack' }],
        [{ text: 'Продолжить', callback_data: 'continue_to_form' }],
      ],
    },
    { chat_id: chatId, message_id: messageId }
  );
}

module.exports = {
  startRegistrationFlow,
  finishRegistration,
  sendPolicyAgreement,
  editPolicyMessage,
  sendConfirmationMessage,
};
