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

    const name = from.first_name ?? 'чемпион';

    if (parsed?.kind === 'invite') {
      const result = await acceptInvite(from.id, parsed.token);
      switch (result.status) {
        case 'bound':
          await ctx.reply(
            `${name}, добро пожаловать в команду. ✈️\n\n` +
              `Твой тренер уже готовит программу — открывай приложение и знакомься.`,
            { reply_markup: miniAppKeyboard() },
          );
          return;
        case 'already':
          await ctx.reply(
            `Ты уже тренируешься с этим тренером. Открывай приложение — продолжаем работу. ✈️`,
            { reply_markup: miniAppKeyboard() },
          );
          return;
        case 'expired':
          await ctx.reply(`Ссылка-приглашение недействительна или устарела. Попроси тренера прислать новую.`);
          return;
        case 'self':
          await ctx.reply(`Нельзя принять собственное приглашение 🙂`);
          return;
        case 'not_found':
          await ctx.reply(`Приглашение не найдено. Попроси тренера прислать новую ссылку.`);
          return;
      }
    }

    await ctx.reply(
      `С возвращением на борт, ${name}. ✈️\n\n` +
        `Всё готово к работе — тренер, план и твои цели ждут внутри.\n` +
        `Один тап по кнопке ниже, и начинаем. Погнали. 💪`,
      { reply_markup: miniAppKeyboard() },
    );
  });

  bot.command('app', async (ctx) => {
    await upsertUserFromContext(ctx);
    await ctx.reply('Твой Jet Fitness ждёт 👇', { reply_markup: miniAppKeyboard() });
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      `Jet Fitness ✈️\n\n` +
        `/start — запустить приложение / принять приглашение\n` +
        `/app — открыть приложение\n` +
        `/help — эта справка\n\n` +
        `Всё управление — внутри приложения: программы, техника с видео, питание, ` +
        `прогресс и чат с тренером.`,
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
    kb.webApp('Открыть Jet Fitness', env.miniAppUrl);
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
