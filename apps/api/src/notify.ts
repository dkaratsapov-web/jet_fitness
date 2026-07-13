// Best-effort Telegram notifications from the API.
//
// Outbound Telegram calls go through the same relay (apiRoot) the bot uses, so
// they work from Yandex Cloud where api.telegram.org is unreachable. Every send
// is wrapped so a failure never breaks the originating request. In serverless
// mode the send is awaited (no background tasks), but errors are swallowed.

import { Bot } from 'grammy';
import { prisma } from '@jet/db';
import { env } from './env.js';

let bot: Bot | null = null;

function getBot(): Bot {
  if (!bot) {
    const apiRoot = process.env.TELEGRAM_API_ROOT || 'https://api.telegram.org';
    bot = new Bot(env.botToken, { client: { apiRoot } });
  }
  return bot;
}

/** Send a message to a Telegram user id. Never throws. */
export async function notify(telegramId: bigint | string, text: string): Promise<void> {
  try {
    await getBot().api.sendMessage(String(telegramId), text, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  } catch {
    // Best-effort: the relay may be unset (dev) or the user may have blocked
    // the bot. Notifications must never break the underlying action.
  }
}

/** Resolve a User id → Telegram id, then notify. */
export async function notifyUser(userId: string, text: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { telegramId: true },
  });
  if (user) await notify(user.telegramId, text);
}

/** Notify all of a client's active coaches. */
export async function notifyClientsCoaches(clientId: string, text: string): Promise<void> {
  const links = await prisma.coachClient.findMany({
    where: { clientId, status: 'active' },
    select: { coach: { select: { telegramId: true } } },
  });
  await Promise.all(links.map((l) => notify(l.coach.telegramId, text)));
}
