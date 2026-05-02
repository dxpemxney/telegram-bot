const TelegramBot = require('node-telegram-bot-api');

// Пытаемся найти токен под любым из популярных имен
const TOKEN = process.env.TOKEN || process.env.BOT_TOKEN || process.env.TELEGRAM_TOKEN;

if (!TOKEN) {
  console.error("❌ ОШИБКА: Токен не найден в переменных Railway!");
  console.log("Доступные переменные в системе:", Object.keys(process.env));
  process.exit(1); 
}

const bot = new TelegramBot(TOKEN, { polling: true });
console.log("✅ Бот успешно авторизован и запущен!");

const LOOT_TABLE = [
  {
    id: 'sticker_common_1',
    fileId: 'CAACAgIAAxkBAAFIiXFp9PLgOs0R52ZTKfqmsvVF82ES1AACYqAAAsRFgEvS2NkaVuG7iTsE',
    name: 'Стикер 1', rarity: 'Обычный', emoji: '⚪', coins: 10, weight: 60,
  },
  {
    id: 'sticker_rare_1',
    fileId: 'CAACAgIAAxkBAAFIiZJp9PVL_NJmzewy3EdITXpGqJVcuAACzp8AApAygEuTDC55WDxMMjsE',
    name: 'Стикер 2', rarity: 'Редкий', emoji: '🔵', coins: 20, weight: 30,
  },
  {
    id: 'sticker_epic_1',
    fileId: 'CAACAgIAAxkBAAFIiZRp9PVNTDHr2AqyL7N4LChWzoNEtgAC96QAAnqleEvUufcO2mc7AAE7BA',
    name: 'Стикер 3', rarity: 'Эпический', emoji: '🟣', coins: 30, weight: 10,
  },
];

const CHEST_ROUNDS = 5;
const DUEL_TIMEOUT = 5000;
const MSG_DELAY = 700; // Немного увеличил задержку для безопасности

const duels = {};
const queues = {};

// ─── СИСТЕМА ОЧЕРЕДИ ──────────────────────────────────────────────────────────

async function callWithRetry(fn) {
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (err.message?.includes('message is not modified')) return;
      const match = err.message?.match(/retry after (\d+)/i);
      if (match) {
        const wait = (parseInt(match[1]) + 1) * 1000;
        console.warn(`Rate limited, waiting ${wait}ms...`);
        await sleep(wait);
      } else {
        console.error('Send error:', err.message);
        return;
      }
    }
  }
}

function enqueue(chatId, fn) {
  if (!queues[chatId]) queues[chatId] = Promise.resolve();
  queues[chatId] = queues[chatId].then(async () => {
    await callWithRetry(fn);
    await sleep(MSG_DELAY);
  });
  return queues[chatId];
}

// ─── УТИЛИТЫ ──────────────────────────────────────────────────────────────────

function rollLoot() {
  const total = LOOT_TABLE.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of LOOT_TABLE) { r -= item.weight; if (r <= 0) return item; }
  return LOOT_TABLE[LOOT_TABLE.length - 1];
}

function getUserName(u) {
  if (u.username) return `@${u.username}`;
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Неизвестный';
}

function getThreadId(msg) {
  return msg.is_topic_message ? msg.message_thread_id : undefined;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const CHEST_KEYBOARD = {
  reply_markup: { inline_keyboard: [[{ text: '🎁 Открыть сундук', callback_data: 'open_chest' }]] },
};

// ─── ЛОГИКА ДУЭЛИ ─────────────────────────────────────────────────────────────

function clearDuelTimer(chatId) {
  if (duels[chatId]?.timer) {
    clearTimeout(duels[chatId].timer);
    duels[chatId].timer = null;
  }
}

async function playBotRound(bot, chatId, threadId) {
  const duel = duels[chatId];
  if (!duel) return;

  clearDuelTimer(chatId);
  
  // Бот просчитывает все свои ходы сразу и забивает их в очередь сообщений
  for (let r = 1; r <= CHEST_ROUNDS; r++) {
    const item = rollLoot();
    duel.scores.opponent += item.coins;
    duel.emojis.opponent.push(item.emoji);
    duel.rounds.opponent++;

    const roundNum = r; 
    
    enqueue(chatId, () => bot.sendMessage(
      chatId,
      `🤖 <b>Бот</b> открывает сундук ${roundNum} из ${CHEST_ROUNDS}...`,
      { parse_mode: 'HTML', message_thread_id: threadId }
    ));
    enqueue(chatId, () => bot.sendSticker(chatId, item.fileId, { message_thread_id: threadId }));
    enqueue(chatId, () => bot.sendMessage(
      chatId,
      `${item.emoji} <b>${item.rarity}</b> — <b>+${item.coins} монет</b>`,
      { parse_mode: 'HTML', message_thread_id: threadId }
    ));
  }

  // Финальный результат ставится в конец очереди после всех стикеров бота
  enqueue(chatId, () => finishDuel(bot, chatId, threadId));
}

async function sendNextChest(bot, chatId, threadId) {
  const duel = duels[chatId];
  if (!duel) return;
  const player = duel.currentPlayer;

  if (player === 'opponent' && duel.vsBot) {
    await playBotRound(bot, chatId, threadId);
    return;
  }

  const round = duel.rounds[player] + 1;
  await enqueue(chatId, () => bot.sendMessage(
    chatId,
    `🎁 <b>${duel[player].name}</b>, открывай сундук ${round} из ${CHEST_ROUNDS}!\n⏰ У тебя 5 секунд...`,
    {
      parse_mode: 'HTML',
      message_thread_id: threadId,
      reply_markup: { inline_keyboard: [[{
        text: '🎁 Открыть сундук',
        callback_data: `duel_open:${duel[player].id}:${chatId}`,
      }]] },
    }
  ));

  clearDuelTimer(chatId);
  duel.timer = setTimeout(() => handleDuelTimeout(bot, chatId, threadId), DUEL_TIMEOUT);
}

async function handleDuelTimeout(bot, chatId, threadId) {
  const duel = duels[chatId];
  if (!duel || duel.processing) return;
  
  duel.processing = true;
  const name = duel[duel.currentPlayer].name;
  duel.emojis[duel.currentPlayer].push('🔥');
  duel.rounds[duel.currentPlayer]++;

  await enqueue(chatId, () => bot.sendMessage(
    chatId,
    `⏰ Время вышло! <b>${name}</b> зазевался — сундук сгорел.`,
    { parse_mode: 'HTML', message_thread_id: threadId }
  ));

  duel.processing = false;
  await advanceDuel(bot, chatId, threadId);
}

async function advanceDuel(bot, chatId, threadId) {
  const duel = duels[chatId];
  if (!duel) return;
  const player = duel.currentPlayer;

  if (duel.rounds[player] < CHEST_ROUNDS) {
    await sendNextChest(bot, chatId, threadId);
    return;
  }

  if (player === 'challenger') {
    await enqueue(chatId, () => bot.sendMessage(
      chatId,
      `✅ <b>${duel.challenger.name}</b> закончил — <b>${duel.scores.challenger} монет</b>!\n\nТеперь очередь <b>${duel.opponent.name}</b>!`,
      { parse_mode: 'HTML', message_thread_id: threadId }
    ));
    duel.currentPlayer = 'opponent';
    await sendNextChest(bot, chatId, threadId);
    return;
  }

  await finishDuel(bot, chatId, threadId);
}

async function finishDuel(bot, chatId, threadId) {
  const duel = duels[chatId];
  if (!duel) return;
  clearDuelTimer(chatId);

  const { challenger: ch, opponent: op, scores, emojis } = duel;
  const ce = emojis.challenger.join('');
  const oe = emojis.opponent.join('');
  const cs = scores.challenger;
  const os = scores.opponent;

  const result = cs > os
    ? `🏆 Победил <b>${ch.name}</b>!`
    : os > cs
      ? `🏆 Победил <b>${op.name}</b>!`
      : `🤝 Ничья!`;

  await enqueue(chatId, () => bot.sendMessage(
    chatId,
    `📊 <b>Итог дуэли:</b>\n\n${ch.name} — ${ce} = <b>${cs}</b>\n${op.name} — ${oe} = <b>${os}</b>\n\n${result}`,
    { parse_mode: 'HTML', message_thread_id: threadId }
  ));

  delete duels[chatId];
}

// ─── ОБРАБОТКА КОМАНД ─────────────────────────────────────────────────────────

const bot = new TelegramBot(TOKEN, { polling: true });

bot.onText(/\/start/, (msg) => {
  enqueue(msg.chat.id, () => bot.sendMessage(
    msg.chat.id,
    '<b>/chest</b> — выставить сундук\n<b>/duel</b> — вызвать на дуэль',
    { parse_mode: 'HTML' }
  ));
});

bot.onText(/\/chest/, (msg) => {
  enqueue(msg.chat.id, () => bot.sendMessage(
    msg.chat.id,
    '🎁 <b>Сундук Perfect World</b>\nКто рискнёт открыть?',
    { parse_mode: 'HTML', ...CHEST_KEYBOARD }
  ));
});

bot.onText(/\/duel/, (msg) => {
  const chatId = msg.chat.id;
  const threadId = getThreadId(msg);

  if (duels[chatId]) {
    enqueue(chatId, () => bot.sendMessage(chatId, '⚔️ Дуэль уже идёт!', { message_thread_id: threadId }));
    return;
  }

  const challenger = { id: msg.from.id, name: getUserName(msg.from) };
  duels[chatId] = {
    state: 'waiting', challenger, opponent: null, vsBot: false,
    currentPlayer: 'challenger',
    rounds: { challenger: 0, opponent: 0 },
    scores: { challenger: 0, opponent: 0 },
    emojis: { challenger: [], opponent: [] },
    threadId, timer: null, processing: false
  };

  enqueue(chatId, () => bot.sendMessage(
    chatId,
    `⚔️ <b>${challenger.name}</b> вызывает на дуэль!`,
    {
      parse_mode: 'HTML',
      message_thread_id: threadId,
      reply_markup: { inline_keyboard: [[
        { text: '⚔️ Принять', callback_data: `duel_accept:${chatId}` },
        { text: '🤖 С ботом', callback_data: `duel_bot:${chatId}` },
      ]] },
    }
  ));
});

bot.on('callback_query', async (query) => {
  const { data, from: user, message: msg } = query;
  const userId = user.id;
  const chatId = msg.chat.id;

  if (data === 'open_chest') {
    await bot.answerCallbackQuery(query.id);
    const item = rollLoot();
    enqueue(chatId, () => bot.sendSticker(chatId, item.fileId));
    enqueue(chatId, () => bot.sendMessage(
      chatId,
      `${item.emoji} <b>${item.rarity}!</b>\n${getUserName(user)} вытащил: ${item.name}\n\n🎁 <b>Сундук Perfect World</b>`,
      { parse_mode: 'HTML', ...CHEST_KEYBOARD }
    ));
    return;
  }

  const duel = duels[chatId];

  if (data.startsWith('duel_accept:')) {
    if (!duel || duel.state !== 'waiting') return bot.answerCallbackQuery(query.id, { text: 'Дуэль недоступна' });
    if (userId === duel.challenger.id) return bot.answerCallbackQuery(query.id, { text: 'Нельзя играть с собой!' });

    duel.opponent = { id: userId, name: getUserName(user) };
    duel.state = 'active';
    await bot.answerCallbackQuery(query.id);
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msg.message_id }).catch(() => {});

    await enqueue(chatId, () => bot.sendMessage(
      chatId,
      `⚔️ <b>${duel.challenger.name}</b> vs <b>${duel.opponent.name}</b>\nНачинает challenger!`,
      { parse_mode: 'HTML', message_thread_id: duel.threadId }
    ));
    await sendNextChest(bot, chatId, duel.threadId);
  }

  if (data.startsWith('duel_bot:')) {
    if (!duel || duel.state !== 'waiting') return bot.answerCallbackQuery(query.id, { text: 'Дуэль недоступна' });
    if (userId !== duel.challenger.id) return bot.answerCallbackQuery(query.id, { text: 'Только автор может выбрать бота' });

    duel.opponent = { id: 0, name: '🤖 Бот' };
    duel.state = 'active';
    duel.vsBot = true;
    await bot.answerCallbackQuery(query.id);
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msg.message_id }).catch(() => {});

    await sendNextChest(bot, chatId, duel.threadId);
  }

  if (data.startsWith('duel_open:')) {
    const expectedUserId = parseInt(data.split(':')[1]);
    if (!duel || userId !== expectedUserId || duel.processing) return bot.answerCallbackQuery(query.id);

    duel.processing = true;
    clearDuelTimer(chatId);
    await bot.answerCallbackQuery(query.id);
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msg.message_id }).catch(() => {});

    const item = rollLoot();
    duel.scores[duel.currentPlayer] += item.coins;
    duel.emojis[duel.currentPlayer].push(item.emoji);
    duel.rounds[duel.currentPlayer]++;

    await enqueue(chatId, () => bot.sendSticker(chatId, item.fileId, { message_thread_id: duel.threadId }));
    await enqueue(chatId, () => bot.sendMessage(
      chatId,
      `${item.emoji} <b>${item.rarity}</b> — <b>+${item.coins}</b>`,
      { parse_mode: 'HTML', message_thread_id: duel.threadId }
    ));

    duel.processing = false;
    await advanceDuel(bot, chatId, duel.threadId);
  }
});

bot.on('polling_error', (err) => console.error('Polling error:', err.message));
