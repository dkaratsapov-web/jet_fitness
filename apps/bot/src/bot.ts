// grammY bot (spec §9). Phase 0 responsibilities:
//   - /start (incl. deep-link invite: start=invite_<token>)
//   - /app  — launch the Mini App
//   - /help — basic help
//
// Invite flow (spec §2): a client opens t.me/<bot>?start=invite_<token>. The bot
// resolves the token, binds the client to the coach, then offers a button that
// opens the client Mini App.

import { Bot, InlineKeyboard, type Context } from 'grammy';
import { prisma } from '@jet/db';
import { parseStartParam } from '@jet/shared';
import { env } from './env.js';

export function createBot(): Bot {
  // apiRoot routes all outbound Telegram calls through the configured endpoint
  // (Cloudflare Worker relay when api.telegram.org is unreachable from RF).
  const bot = new Bot(env.botToken, {
    client: { apiRoot: env.telegramApiRoot },
  });

  bot.command('start', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    await upsertUserFromContext(ctx);

    // /start may carry a deep-link payload: "/start invite_<token>".
    const payload = ctx.match?.toString().trim() || undefined;
    const parsed = parseStartParam(payload);

    if (parsed?.kind === 'invite') {
      const result = await acceptInvite(from.id, parsed.token);
      switch (result.status) {
        case 'bound':
          await ctx.reply(
            `Готово! Вы привязаны к тренеру. Откройте приложение, чтобы начать.`,
            { reply_markup: miniAppKeyboard() },
          );
          return;
        case 'already':
          await ctx.reply(`Вы уже работаете с этим тренером. Откройте приложение.`, {
            reply_markup: miniAppKeyboard(),
          });
          return;
        case 'expired':
          await ctx.reply(`Ссылка-приглашение недействительна или устарела. Попросите тренера прислать новую.`);
          return;
        case 'self':
          await ctx.reply(`Нельзя принять собственное приглашение.`);
          return;
        case 'not_found':
          await ctx.reply(`Приглашение не найдено. Попросите тренера прислать новую ссылку.`);
          return;
      }
    }

    await ctx.reply(
      `Привет, ${from.first_name ?? 'друг'}! Это фитнес-приложение «тренер ↔ подопечный».\n\n` +
        `Откройте приложение кнопкой ниже. Тренеры ведут клиентов, клиенты — тренируются, ` +
        `логируют питание и прогресс прямо в Telegram.`,
      { reply_markup: miniAppKeyboard() },
    );
  });

  bot.command('app', async (ctx) => {
    await upsertUserFromContext(ctx);
    await ctx.reply('Открыть приложение:', { reply_markup: miniAppKeyboard() });
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      `Команды:\n` +
        `/start — начать / принять приглашение\n` +
        `/app — открыть приложение\n` +
        `/help — эта справка`,
    );
  });

  bot.catch((err) => {
    console.error('[bot] error while handling update', err.error);
  });

  return bot;
}

function miniAppKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (env.miniAppUrl) {
    kb.webApp('Открыть приложение', env.miniAppUrl);
  }
  return kb;
}

async function upsertUserFromContext(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  await prisma.user.upsert({
    where: { telegramId: BigInt(from.id) },
    update: {
      username: from.username ?? undefined,
      firstName: from.first_name ?? undefined,
    },
    create: {
      telegramId: BigInt(from.id),
      username: from.username ?? null,
      firstName: from.first_name ?? null,
    },
  });
}

type InviteResult = { status: 'bound' | 'already' | 'expired' | 'self' | 'not_found' };

/** Consume a one-time invite token and bind the client to the coach. Idempotent. */
async function acceptInvite(telegramId: number, token: string): Promise<InviteResult> {
  const invite = await prisma.coachInvite.findUnique({ where: { token } });
  if (!invite) return { status: 'not_found' };
  if (invite.expiresAt < new Date()) return { status: 'expired' };

  const client = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
  });
  if (!client) return { status: 'not_found' };
  if (invite.coachId === client.id) return { status: 'self' };

  // If already bound (token reused, or relationship already exists), report gracefully.
  const existing = await prisma.coachClient.findUnique({
    where: { coachId_clientId: { coachId: invite.coachId, clientId: client.id } },
  });
  if (invite.usedAt && existing) return { status: 'already' };
  if (invite.usedAt && !existing) return { status: 'expired' };

  await prisma.$transaction([
    prisma.coachInvite.update({
      where: { id: invite.id },
      data: { usedAt: new Date(), usedById: client.id },
    }),
    prisma.coachClient.upsert({
      where: { coachId_clientId: { coachId: invite.coachId, clientId: client.id } },
      update: { status: 'active', startedAt: new Date() },
      create: {
        coachId: invite.coachId,
        clientId: client.id,
        status: 'active',
        startedAt: new Date(),
      },
    }),
    prisma.clientProfile.upsert({
      where: { userId: client.id },
      update: {},
      create: { userId: client.id },
    }),
  ]);

  return { status: 'bound' };
}
