const TelegramBot = require('node-telegram-bot-api');

const TOKEN = '8713413829:AAHnUe4ww7fliDUQRzZ2ypBbUj5VnVWbe4c';

// ─── ЛOOT ТАБЛИЦА ─────────────────────────────────────────────────────────────
const LOOT_TABLE = [
  {
    id: 'sticker_common_1',
    fileId: 'CAACAgIAAxkBAAFIiXFp9PLgOs0R52ZTKfqmsvVF82ES1AACYqAAAsRFgEvS2NkaVuG7iTsE',
    name: 'Стикер 1',
    rarity: 'Обычный',
    emoji: '⚪',
    weight: 60,
  },
  {
    id: 'sticker_rare_1',
    fileId: 'CAACAgIAAxkBAAFIiZJp9PVL_NJmzewy3EdITXpGqJVcuAACzp8AApAygEuTDC55WDxMMjsE',
    name: 'Стикер 2',
    rarity: 'Редкий',
    emoji: '🔵',
    weight: 30,
  },
  {
    id: 'sticker_epic_1',
    fileId: 'CAACAgIAAxkBAAFIiZRp9PVNTDHr2AqyL7N4LChWzoNEtgAC96QAAnqleEvUufcO2mc7AAE7BA',
    name: 'Стикер 3',
    rarity: 'Эпический',
    emoji: '🟣',
    weight: 10,
  },
];

// ─── ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ──────────────────────────────────────────────────

function rollLoot() {
  const totalWeight = LOOT_TABLE.reduce((sum, item) => sum + item.weight, 0);
  let rand = Math.random() * totalWeight;
  for (const item of LOOT_TABLE) {
    rand -= item.weight;
    if (rand <= 0) return item;
  }
  return LOOT_TABLE[LOOT_TABLE.length - 1];
}

const CHEST_KEYBOARD = {
  reply_markup: {
    inline_keyboard: [[{ text: '🎁 Открыть сундук', callback_data: 'open_chest' }]],
  },
};

function getUserName(user) {
  if (user.username) return `@${user.username}`;
  const full = [user.first_name, user.last_name].filter(Boolean).join(' ');
  return full || 'Неизвестный';
}

// ─── БОТ ──────────────────────────────────────────────────────────────────────

const bot = new TelegramBot(TOKEN, { polling: true });

// /start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    '👋 Привет! Напиши <b>/chest</b> чтобы выставить сундук в чат.',
    { parse_mode: 'HTML' }
  );
});

// /chest — выставляет сундук с кнопкой
bot.onText(/\/chest/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    '🎁 <b>Сундук Perfect World</b>\n\nКто рискнёт открыть?',
    { parse_mode: 'HTML', ...CHEST_KEYBOARD }
  );
});

// Нажатие кнопки сундука
bot.on('callback_query', async (query) => {
  if (query.data !== 'open_chest') return;

  await bot.answerCallbackQuery(query.id);

  const chatId = query.message.chat.id;
  const name = getUserName(query.from);
  const item = rollLoot();

  // Будущий шаг 2: await stats.recordDrop(query.from.id, chatId, item.id);

  // 1. Стикер
  await bot.sendSticker(chatId, item.fileId);

  // 2. Подпись с результатом + новый сундук с кнопкой
  await bot.sendMessage(
    chatId,
    `${item.emoji} <b>${item.rarity}!</b>\n${name} вытащил: <b>${item.name}</b>\n\n🎁 <b>Сундук Perfect World</b>\nКто рискнёт открыть?`,
    { parse_mode: 'HTML', ...CHEST_KEYBOARD }
  );
});

bot.on('polling_error', (err) => console.error('Polling error:', err.message));
