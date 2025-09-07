const { Sequelize, DataTypes, Model } = require('sequelize');
const { config } = require('./config');

const sequelize = new Sequelize(
  config.db.database,
  config.db.username,
  config.db.password,
  {
    host: config.db.host,
    dialect: config.db.dialect,
    logging: false,
  }
);

class Application extends Model {}

Application.init(
  {
    applicationId: { type: DataTypes.STRING, primaryKey: true },
    chatId: { type: DataTypes.BIGINT, allowNull: false },
    username: DataTypes.STRING,

    // ИЗМЕНЕНИЕ: Разделили имя и фамилию родителя
    parentFirstName: DataTypes.STRING,
    parentLastName: DataTypes.STRING,
    parentPhone: DataTypes.STRING,
    parentEmail: DataTypes.STRING,

    // Данные ребенка
    childFirstName: DataTypes.STRING,
    childLastName: DataTypes.STRING,
    childAge: DataTypes.STRING,
    childContact: DataTypes.STRING,

    // Ответы
    gadgetOpinion: DataTypes.STRING,
    newsletterConsent: DataTypes.BOOLEAN,
    photoConsent: DataTypes.BOOLEAN,

    // Служебные поля
    status: {
      type: DataTypes.ENUM('pending_payment', 'paid'),
      defaultValue: 'pending_payment',
    },
    paidAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Application',
  }
);

const connectToDatabase = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Подключение к MySQL успешно установлено.');
    await sequelize.sync({ alter: true });
    console.log('✅ Модель Application синхронизирована с базой данных.');
  } catch (error) {
    console.error('❌ Не удалось подключиться к базе данных:', error);
    process.exit(1);
  }
};

module.exports = { Application, connectToDatabase };
