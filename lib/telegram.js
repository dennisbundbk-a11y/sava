import axios from 'axios';
import { config } from './config.js';

const TELEGRAM_MAX_LEN = 4096;

export async function sendTelegramMessage(text) {
  const chunks = splitIntoChunks(text, TELEGRAM_MAX_LEN - 100);
  const url = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;

  for (const [i, chunk] of chunks.entries()) {
    const suffix = chunks.length > 1 ? `\n\n(${i + 1}/${chunks.length})` : '';
    await axios.post(url, {
      chat_id: config.telegram.chatId,
      text: chunk + suffix,
      disable_web_page_preview: true,
    });
  }
}

function splitIntoChunks(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt <= 0) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  if (remaining.length) chunks.push(remaining);
  return chunks;
}
