const TelegramBot = require('node-telegram-bot-api');

const TOKEN = '8713413829:AAHnUe4ww7fliDUQRzZ2ypBbUj5VnVWbe4c';

const STICKERS = {
  'Стикер 1': 'CAACAgIAAxkBAAFIiXFp9PLgOs0R52ZTKfqmsvVF82ES1AACYqAAAsRFgEvS2NkaVuG7iTsE',
  'Стикер 2': 'CAACAgIAAxkBAAFIiZJp9PVL_NJmzewy3EdITXpGqJVcuAACzp8AApAygEuTDC55WDxMMjsE',
  'Стикер 3': 'CAACAgIAAxkBAAFIiZRp9PVNTDHr2AqyL7N4LChWzoNEtgAC96QAAnqleEvUufcO2mc7AAE7BA',
};

const bot = new TelegramBot(TOKEN, { polling: true });

bot.onText(/\/start/, (msg) => {
  const keyboard = Object.keys(STICKERS).map(name => [{ text: name, callback_data: name }]);
  bot.sendMessage(msg.chat.id, 'Выбери стикер:', {
    reply_markup: { inline_keyboard: keyboard }
  });
});

bot.on('callback_query', (query) => {
  const fileId = STICKERS[query.data];
  if (fileId) {
    bot.sendSticker(query.message.chat.id, fileId);
    bot.answerCallbackQuery(query.id);
  }
});