const TelegramBot = require('node-telegram-bot-api');

const TOKEN = '8713413829:AAHnUe4ww7fliDUQRzZ2ypBbUj5VnVWbe4c';

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
const MSG_DELAY = 1200;

const duels = {};

// ─── ОЧЕРЕДЬ ──────────────────────────────────────────────────────────────────
// enqueue возвращает Promise который резолвится когда ЭТОТ конкретный
// элемент очереди отправлен и пауза после него выдержана.
const queues = {};

function enqueue(chatId, fn) {
  if (!queues[chatId]) queues[chatId] = Promise.resolve();
  const result = queues[chatId].then(() =>
    fn().catch(err => console.error('Send error:', err.message))
  ).then(() => sleep(MSG_DELAY));
  queues[chatId] = result;
  return result; // <-- возвращаем Promise этого конкретного элемента
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

// ─── ДУЭЛЬ ────────────────────────────────────────────────────────────────────

function clearDuelTimer(chatId) {
  if (duels[chatId]?.timer) { clearTimeout(duels[chatId].timer); duels[chatId].timer = null; }
}

async function sendNextChest(bot, chatId, threadId) {
  const duel = duels[chatId];
  if (!duel) return;
  const player = duel.currentPlayer;

  if (player === 'opponent' && duel.vsBot) {
    await openBotChest(bot, chatId, threadId);
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

async function openBotChest(bot, chatId, threadId) {
  const duel = duels[chatId];
  if (!duel) return;

  const item = rollLoot();
  duel.scores.opponent += item.coins;
  duel.emojis.opponent.push(item.emoji);
  duel.rounds.opponent++;

  await enqueue(chatId, () => bot.sendMessage(
    chatId,
    `🤖 <b>Бот</b> открывает сундук ${duel.rounds.opponent} из ${CHEST_ROUNDS}...`,
    { parse_mode: 'HTML', message_thread_id: threadId }
  ));
  await enqueue(chatId, () => bot.sendSticker(chatId, item.fileId, { message_thread_id: threadId }));
  await enqueue(chatId, () => bot.sendMessage(
    chatId,
    `${item.emoji} <b>${item.rarity}</b> — <b>+${item.coins} монет</b>`,
    { parse_mode: 'HTML', message_thread_id: threadId }
  ));

  // Все три сообщения отправлены — идём дальше
  await advanceDuel(bot, chatId, threadId);
}

async function handleDuelTimeout(bot, chatId, threadId) {
  const duel = duels[chatId];
  if (!duel) return;
  const name = duel[duel.currentPlayer].name;
  duel.emojis[duel.currentPlayer].push('🔥');
  duel.rounds[duel.currentPlayer]++;

  await enqueue(chatId, () => bot.sendMessage(
    chatId,
    `⏰ Время вышло! <b>${name}</b> зазевался — сундук сгорел, 0 монет.`,
    { parse_mode: 'HTML', message_thread_id: threadId }
  ));
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

  if (player === 'challenger' && duel.rounds.opponent < CHEST_ROUNDS) {
    await enqueue(chatId, () => bot.sendMessage(
      chatId,
      `✅ <b>${duel.challenger.name}</b> закончил — <b>${duel.scores.challenger} монет</b>!\n\nТеперь <b>${duel.opponent.name}</b>!`,
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
    `📊 <b>Итог дуэли:</b>\n\n${ch.name} — ${ce} = <b>${cs} монет</b>\n${op.name} — ${oe} = <b>${os} монет</b>\n\n${result}`,
    { parse_mode: 'HTML', message_thread_id: threadId }
  ));

  delete duels[chatId];
}

// ─── БОТ ──────────────────────────────────────────────────────────────────────

const bot = new TelegramBot(TOKEN, { polling: true });

bot.onText(/\/start/, (msg) => {
  enqueue(msg.chat.id, () => bot.sendMessage(
    msg.chat.id,
    '👋 Привет!\n\n<b>/chest</b> — выставить сундук\n<b>/duel</b> — вызвать на дуэль',
    { parse_mode: 'HTML' }
  ));
});

bot.onText(/\/chest/, (msg) => {
  enqueue(msg.chat.id, () => bot.sendMessage(
    msg.chat.id,
    '🎁 <b>Сундук Perfect World</b>\n\nКто рискнёт открыть?',
    { parse_mode: 'HTML', ...CHEST_KEYBOARD }
  ));
});

bot.onText(/\/duel/, (msg) => {
  const chatId = msg.chat.id;
  const threadId = getThreadId(msg);

  if (duels[chatId]) {
    enqueue(chatId, () => bot.sendMessage(chatId, '⚔️ Дуэль уже идёт! Дождитесь конца.', { message_thread_id: threadId }));
    return;
  }

  const challenger = { id: msg.from.id, name: getUserName(msg.from) };
  duels[chatId] = {
    state: 'waiting', challenger, opponent: null, vsBot: false,
    currentPlayer: 'challenger',
    rounds: { challenger: 0, opponent: 0 },
    scores: { challenger: 0, opponent: 0 },
    emojis: { challenger: [], opponent: [] },
    threadId, timer: null,
  };

  enqueue(chatId, () => bot.sendMessage(
    chatId,
    `⚔️ <b>${challenger.name}</b> вызывает на дуэль!\n\nКто примет вызов?`,
    {
      parse_mode: 'HTML',
      message_thread_id: threadId,
      reply_markup: { inline_keyboard: [[
        { text: '⚔️ Принять дуэль', callback_data: `duel_accept:${chatId}` },
        { text: '🤖 Сразиться с ботом', callback_data: `duel_bot:${chatId}` },
      ]] },
    }
  ));
});

bot.on('callback_query', async (query) => {
  const { data, from: user, message: msg } = query;
  const userId = user.id;

  if (data === 'open_chest') {
    await bot.answerCallbackQuery(query.id);
    const chatId = msg.chat.id;
    const item = rollLoot();
    enqueue(chatId, () => bot.sendSticker(chatId, item.fileId));
    enqueue(chatId, () => bot.sendMessage(
      chatId,
      `${item.emoji} <b>${item.rarity}!</b>\n${getUserName(user)} вытащил: <b>${item.name}</b>\n\n🎁 <b>Сундук Perfect World</b>\nКто рискнёт открыть?`,
      { parse_mode: 'HTML', ...CHEST_KEYBOARD }
    ));
    return;
  }

  if (data.startsWith('duel_accept:')) {
    const chatId = parseInt(data.split(':')[1]);
    const duel = duels[chatId];
    if (!duel || duel.state !== 'waiting') { await bot.answerCallbackQuery(query.id, { text: 'Дуэль уже началась.' }); return; }
    if (userId === duel.challenger.id) { await bot.answerCallbackQuery(query.id, { text: 'Нельзя принять свою дуэль!' }); return; }

    duel.opponent = { id: userId, name: getUserName(user) };
    duel.state = 'active';
    await bot.answerCallbackQuery(query.id);
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msg.message_id });

    await enqueue(chatId, () => bot.sendMessage(
      chatId,
      `⚔️ <b>${duel.challenger.name}</b> vs <b>${duel.opponent.name}</b>\n\nДуэль началась! Каждый открывает ${CHEST_ROUNDS} сундуков.\nНачинает <b>${duel.challenger.name}</b>!`,
      { parse_mode: 'HTML', message_thread_id: duel.threadId }
    ));
    await sendNextChest(bot, chatId, duel.threadId);
    return;
  }

  if (data.startsWith('duel_bot:')) {
    const chatId = parseInt(data.split(':')[1]);
    const duel = duels[chatId];
    if (!duel || duel.state !== 'waiting') { await bot.answerCallbackQuery(query.id, { text: 'Дуэль уже началась.' }); return; }
    if (userId !== duel.challenger.id) { await bot.answerCallbackQuery(query.id, { text: 'Только вызвавший может играть с ботом!' }); return; }

    duel.opponent = { id: 0, name: '🤖 Бот' };
    duel.state = 'active';
    duel.vsBot = true;
    await bot.answerCallbackQuery(query.id);
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msg.message_id });

    await enqueue(chatId, () => bot.sendMessage(
      chatId,
      `⚔️ <b>${duel.challenger.name}</b> vs <b>🤖 Бот</b>\n\nДуэль началась! Каждый открывает ${CHEST_ROUNDS} сундуков.\nНачинает <b>${duel.challenger.name}</b>!`,
      { parse_mode: 'HTML', message_thread_id: duel.threadId }
    ));
    await sendNextChest(bot, chatId, duel.threadId);
    return;
  }

  if (data.startsWith('duel_open:')) {
    const parts = data.split(':');
    const expectedUserId = parseInt(parts[1]);
    const chatId = parseInt(parts[2]);
    const duel = duels[chatId];

    if (!duel) { await bot.answerCallbackQuery(query.id, { text: 'Дуэль уже закончилась.' }); return; }
    if (userId !== expectedUserId) { await bot.answerCallbackQuery(query.id, { text: 'Это не твой сундук! 👀' }); return; }

    clearDuelTimer(chatId);
    await bot.answerCallbackQuery(query.id);
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msg.message_id });

    const player = duel.currentPlayer;
    const item = rollLoot();
    duel.scores[player] += item.coins;
    duel.emojis[player].push(item.emoji);
    duel.rounds[player]++;

    await enqueue(chatId, () => bot.sendSticker(chatId, item.fileId, { message_thread_id: duel.threadId }));
    await enqueue(chatId, () => bot.sendMessage(
      chatId,
      `${item.emoji} <b>${item.rarity}</b> — <b>+${item.coins} монет</b>`,
      { parse_mode: 'HTML', message_thread_id: duel.threadId }
    ));
    await advanceDuel(bot, chatId, duel.threadId);
    return;
  }
});

bot.on('polling_error', (err) => console.error('Polling error:', err.message));
