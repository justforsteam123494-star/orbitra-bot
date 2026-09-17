const {
  Client, GatewayIntentBits, ActivityType, Events, Partials,
  SlashCommandBuilder, PermissionFlagsBits, ChannelType,
  EmbedBuilder, REST, Routes, Collection,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const https = require("https");

function loadEnv() {
  for (const file of [".env", ".env.local"]) {
    const p = path.join(__dirname, file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}
loadEnv();

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || "1549859635932958851";
const WEBSITE = "https://orbitra-bot.damarie0417.workers.dev";
const AI_API = `${WEBSITE}/api/bot/chat`;
const PLAN_API = `${WEBSITE}/api/bot/plan`;
const SYNC_API = `${WEBSITE}/api/bot/sync`;
const HISTORY_API = `${WEBSITE}/api/bot/history`;
const VERIFY_API = `${WEBSITE}/api/bot/verify`;
const WEBHOOK_SECRET = process.env.DISCORD_WEBHOOK_SECRET || "orbitra-sync-secret-2024";

if (!TOKEN) { console.error("DISCORD_BOT_TOKEN not found."); process.exit(1); }

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
  rest: { timeout: 15000 },
});

const PLANS = {
  free:   { name: "Free",     color: 0x808080, ai: 5,  cmds: ["ping","help","serverinfo","userinfo","avatar","membercount","channels","roles","uptime","stats","8ball","coinflip","dice","random","quote","define","calculate","color","weather"] },
  starter:{ name: "Starter",  color: 0x00bfff, ai: 20, cmds: ["kick","ban","mute","unmute","warn","slowmode","lock","unlock","purge","nick","role-add","role-remove","timeout-log","afk","leaderboard","level"] },
  pro:    { name: "Pro",      color: 0x7c3aed, ai: 100, cmds: ["announce","embed","say","poll","remind","invite","vc-move","vc-disconnect","nuke","snipe","ai-image","ai-code","ai-translate","ai-summarize","ai-creative"] },
  empire: { name: "Empire",   color: 0xffd700, ai: -1, cmds: ["automod","starboard","backup","restore","giveaway","modmail","report","ticket","suggest","apply","setup-orbitra","sync","orbitra-list","orbitra-bump","orbitra-stats","orbitra-link","leaderboard-global","trending","featured","welcome","autorole","log","tag","autoforum","status","reload","shutdown","eval","voice-stats","text-stats","top-chatters","server-boost"] },
};

const PLAN_ORDER = ["free","starter","pro","empire"];

const serverPlanCache = new Map();
const PLAN_CACHE_TTL = 300000;

async function getServerPlan(guildId) {
  const cached = serverPlanCache.get(guildId);
  if (cached && Date.now() - cached.time < PLAN_CACHE_TTL) return cached.plan;
  try {
    const data = await httpPost(PLAN_API, { discordId: guildId });
    const parsed = JSON.parse(data);
    const plan = parsed.plan || "free";
    serverPlanCache.set(guildId, { plan, time: Date.now() });
    return plan;
  } catch {
    return "free";
  }
}

function hasPermission(userPlan, requiredPlan) {
  const ui = PLAN_ORDER.indexOf(userPlan);
  const ri = PLAN_ORDER.indexOf(requiredPlan);
  return ui >= ri;
}

function getCommandPlan(cmdName) {
  for (const [plan, config] of Object.entries(PLANS)) {
    if (config.cmds.includes(cmdName)) return plan;
  }
  return "free";
}

const cooldowns = new Collection();
const COOLDOWN = 3;
const lastDeleted = new Map();
const userStats = new Map();
const warnings = new Map();
const afkUsers = new Map();
const serverConfig = new Map();

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "OrbitraBot/1.0" } }, (res) => {
      let d = ""; res.on("data", (c) => { d += c; }); res.on("end", () => resolve(d));
    }).on("error", reject);
  });
}

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request({ hostname: u.hostname, port: 443, path: u.pathname, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data), "User-Agent": "OrbitraBot/1.0" },
    }, (res) => { let d = ""; res.on("data", (c) => { d += c; }); res.on("end", () => resolve(d)); });
    req.on("error", reject); req.write(data); req.end();
  });
}

function fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s%86400)/3600), m = Math.floor((s%3600)/60), sec = s%60;
  const p = []; if(d) p.push(`${d}d`); if(h) p.push(`${h}h`); if(m) p.push(`${m}m`); p.push(`${sec}s`); return p.join(" ");
}

function checkCD(userId) {
  if (!cooldowns.has(userId)) cooldowns.set(userId, new Collection());
  const c = cooldowns.get(userId), now = Date.now();
  if (c.has("g")) { const e = c.get("g"); if (now < e) return { ok: false, wait: Math.ceil((e-now)/1000) }; }
  c.set("g", now + COOLDOWN*1000); return { ok: true };
}

function incStat(userId, guildId) {
  const k = `${guildId}:${userId}`;
  const c = userStats.get(k) || { msgs: 0, cmds: 0, last: 0 };
  c.msgs++; c.last = Date.now(); userStats.set(k, c);
}

function em(interaction, opts) {
  const e = new EmbedBuilder();
  if (opts.title) e.setTitle(opts.title);
  if (opts.description) e.setDescription(opts.description);
  if (opts.color) e.setColor(opts.color);
  if (opts.footer) e.setFooter({ text: opts.footer });
  if (opts.thumbnail) e.setThumbnail(opts.thumbnail);
  if (opts.image) e.setImage(opts.image);
  if (opts.fields) e.addFields(opts.fields);
  if (opts.author) e.setAuthor({ name: opts.author.name, iconURL: opts.author.icon });
  e.setTimestamp(); return e;
}

function planDenied(cmd, plan) {
  const req = getCommandPlan(cmd);
  const planConfig = PLANS[plan] || PLANS.free;
  const reqConfig = PLANS[req] || PLANS.free;
  return em(null, {
    title: "Premium Command",
    description: `This command requires the **${reqConfig.name}** plan or higher.\n\nYour current plan: **${planConfig.name}**\n\nUpgrade at: ${WEBSITE}/pricing`,
    color: 0xff6b6b,
    fields: [
      { name: "Required Plan", value: reqConfig.name, inline: true },
      { name: "Your Plan", value: planConfig.name, inline: true },
    ],
    footer: "Orbitra — Upgrade to unlock more commands",
  });
}

async function callAI(prompt, extras = {}) {
  try {
    const raw = await httpPost(AI_API, {
      message: prompt,
      userId: extras.userId || "discord-user",
      guildId: extras.guildId || null,
      conversationId: extras.conversationId || null,
      history: extras.history || [],
    });
    const parsed = JSON.parse(raw);
    return parsed.content || "AI didn't return a response.";
  } catch (err) { return `AI error: ${err.message}`; }
}

async function getHistory(userId, guildId) {
  try {
    const raw = await httpPost(HISTORY_API, { action: "get", userId, guildId });
    return JSON.parse(raw).history || [];
  } catch { return []; }
}

async function addHistory(userId, guildId, message, response) {
  try { await httpPost(HISTORY_API, { action: "add", userId, guildId, message, response }); } catch {}
}

async function clearHistory(userId, guildId) {
  try { await httpPost(HISTORY_API, { action: "clear", userId, guildId }); } catch {}
}

async function verifyDiscordUser(discordId) {
  try {
    const raw = await httpPost(VERIFY_API, { discordId });
    return JSON.parse(raw);
  } catch { return { verified: false }; }
}

async function syncStats(guild) {
  try {
    const gd = await new Promise((res, rej) => {
      https.get(`https://discord.com/api/v10/guilds/${guild.id}?with_counts=true`, { headers: { Authorization: `Bot ${TOKEN}` } },
        (r) => { let d=""; r.on("data",(c)=>{d+=c;}); r.on("end",()=>res(JSON.parse(d))); }).on("error",rej);
    });
    const channels = await guild.channels.fetch();
    const roles = await guild.roles.fetch();
    const textCh = channels.filter(c => c.type === ChannelType.GuildText);
    let msgs = 0;
    for (const [,ch] of textCh) { try { const m = await ch.messages.fetch({limit:100}); msgs += m.filter(x => x.createdTimestamp > Date.now()-86400000).size; } catch{} }
    const stats = {
      memberCount: guild.memberCount || gd.approximate_member_count || 0,
      onlineCount: guild.members.cache.filter(m => m.presence?.status !== "offline").size,
      channelCount: channels.size, roleCount: roles.size-1, emojiCount: guild.emojis.cache.size,
      boostLevel: guild.premiumTier, messagesPerDay: Math.round(msgs/Math.max(textCh.size,1)),
      name: guild.name, icon: guild.iconURL({dynamic:true,size:256}), banner: guild.bannerURL({size:512}),
    };
    httpPost(SYNC_API, { discordId: guild.id, stats }).catch(() => {});
    return stats;
  } catch { return null; }
}

const QUOTES = [
  "The only way to do great work is to love what you do. - Steve Jobs",
  "Innovation distinguishes between a leader and a follower. - Steve Jobs",
  "Stay hungry, stay foolish. - Steve Jobs",
  "Life is what happens when you're busy making other plans. - John Lennon",
  "The future belongs to those who believe in the beauty of their dreams. - Eleanor Roosevelt",
  "It does not matter how slowly you go as long as you do not stop. - Confucius",
  "In the middle of difficulty lies opportunity. - Albert Einstein",
  "Success is not final, failure is not fatal: it is the courage to continue that counts. - Winston Churchill",
];

const EIGHT_BALL = [
  "It is certain.","It is decidedly so.","Without a doubt.","Yes, definitely.",
  "You may rely on it.","As I see it, yes.","Most likely.","Outlook good.","Yes.",
  "Signs point to yes.","Reply hazy, try again.","Ask again later.",
  "Better not tell you now.","Cannot predict now.","Concentrate and ask again.",
  "Don't count on it.","My reply is no.","My sources say no.","Outlook not so good.","Very doubtful.",
];

function parseTime(str) {
  const m = str.match(/^(\d+)(s|m|h|d)$/); if (!m) return null;
  const v = parseInt(m[1]); switch(m[2]) { case "s": return v*1000; case "m": return v*60000; case "h": return v*3600000; case "d": return v*86400000; default: return null; }
}

// ── COMMAND DEFINITIONS ──
const CMD = [
  new SlashCommandBuilder().setName("ping").setDescription("Check bot latency"),
  new SlashCommandBuilder().setName("help").setDescription("Show all commands"),
  new SlashCommandBuilder().setName("serverinfo").setDescription("Server information"),
  new SlashCommandBuilder().setName("userinfo").setDescription("User information").addUserOption(o=>o.setName("user").setDescription("Target user")),
  new SlashCommandBuilder().setName("avatar").setDescription("Get a user's avatar").addUserOption(o=>o.setName("user").setDescription("Target user")),
  new SlashCommandBuilder().setName("membercount").setDescription("Member count breakdown"),
  new SlashCommandBuilder().setName("channels").setDescription("List all channels"),
  new SlashCommandBuilder().setName("roles").setDescription("List all roles"),
  new SlashCommandBuilder().setName("uptime").setDescription("Bot uptime"),
  new SlashCommandBuilder().setName("stats").setDescription("Bot statistics"),
  new SlashCommandBuilder().setName("8ball").setDescription("Magic 8-ball").addStringOption(o=>o.setName("question").setDescription("Your question").setRequired(true)),
  new SlashCommandBuilder().setName("coinflip").setDescription("Flip a coin"),
  new SlashCommandBuilder().setName("dice").setDescription("Roll a dice").addIntegerOption(o=>o.setName("sides").setDescription("Sides (default 6)").setMinValue(2).setMaxValue(100)),
  new SlashCommandBuilder().setName("random").setDescription("Random number").addIntegerOption(o=>o.setName("min").setDescription("Min").setRequired(true)).addIntegerOption(o=>o.setName("max").setDescription("Max").setRequired(true)),
  new SlashCommandBuilder().setName("quote").setDescription("Random quote"),
  new SlashCommandBuilder().setName("define").setDescription("Define a word").addStringOption(o=>o.setName("word").setDescription("Word").setRequired(true)),
  new SlashCommandBuilder().setName("calculate").setDescription("Math calculator").addStringOption(o=>o.setName("expression").setDescription("Expression").setRequired(true)),
  new SlashCommandBuilder().setName("color").setDescription("Color preview").addStringOption(o=>o.setName("hex").setDescription("Hex color").setRequired(true)),
  new SlashCommandBuilder().setName("weather").setDescription("Weather info").addStringOption(o=>o.setName("location").setDescription("City").setRequired(true)),
  // Starter
  new SlashCommandBuilder().setName("kick").setDescription("Kick a member").addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("Reason")).setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  new SlashCommandBuilder().setName("ban").setDescription("Ban a member").addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("Reason")).addIntegerOption(o=>o.setName("days").setDescription("Delete msgs days").setMinValue(0).setMaxValue(7)).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder().setName("mute").setDescription("Timeout a member").addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)).addIntegerOption(o=>o.setName("minutes").setDescription("Minutes (default 10)").setMinValue(1).setMaxValue(40320)).addStringOption(o=>o.setName("reason").setDescription("Reason")).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName("unmute").setDescription("Remove timeout").addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName("warn").setDescription("Warn a member").addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("Reason").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName("slowmode").setDescription("Set slowmode").addChannelOption(o=>o.setName("channel").setDescription("Channel").addChannelTypes(ChannelType.GuildText).setRequired(true)).addIntegerOption(o=>o.setName("seconds").setDescription("Seconds").setMinValue(0).setMaxValue(21600).setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName("lock").setDescription("Lock a channel").addChannelOption(o=>o.setName("channel").setDescription("Channel").addChannelTypes(ChannelType.GuildText)).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName("unlock").setDescription("Unlock a channel").addChannelOption(o=>o.setName("channel").setDescription("Channel").addChannelTypes(ChannelType.GuildText)).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName("purge").setDescription("Bulk delete messages").addIntegerOption(o=>o.setName("count").setDescription("Count (max 100)").setMinValue(1).setMaxValue(100).setRequired(true)).addUserOption(o=>o.setName("user").setDescription("Only this user")).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName("nick").setDescription("Change nickname").addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)).addStringOption(o=>o.setName("nickname").setDescription("Nickname").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),
  new SlashCommandBuilder().setName("role-add").setDescription("Add role to user").addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)).addRoleOption(o=>o.setName("role").setDescription("Role").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName("role-remove").setDescription("Remove role from user").addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)).addRoleOption(o=>o.setName("role").setDescription("Role").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName("timeout-log").setDescription("Recent moderation actions"),
  new SlashCommandBuilder().setName("afk").setDescription("Set AFK status").addStringOption(o=>o.setName("reason").setDescription("Reason")),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Server activity leaderboard"),
  new SlashCommandBuilder().setName("level").setDescription("Check your level").addUserOption(o=>o.setName("user").setDescription("User")),
  // Pro
  new SlashCommandBuilder().setName("announce").setDescription("Create announcement").addChannelOption(o=>o.setName("channel").setDescription("Channel").addChannelTypes(ChannelType.GuildText).setRequired(true)).addStringOption(o=>o.setName("title").setDescription("Title").setRequired(true)).addStringOption(o=>o.setName("message").setDescription("Message").setRequired(true)).addStringOption(o=>o.setName("color").setDescription("Hex color")).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName("embed").setDescription("Create embed").addStringOption(o=>o.setName("title").setDescription("Title").setRequired(true)).addStringOption(o=>o.setName("description").setDescription("Description").setRequired(true)).addStringOption(o=>o.setName("color").setDescription("Hex color")).addStringOption(o=>o.setName("footer").setDescription("Footer")).addChannelOption(o=>o.setName("channel").setDescription("Channel").addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder().setName("say").setDescription("Bot says something").addStringOption(o=>o.setName("message").setDescription("Message").setRequired(true)).addChannelOption(o=>o.setName("channel").setDescription("Channel").addChannelTypes(ChannelType.GuildText)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName("poll").setDescription("Create a poll").addStringOption(o=>o.setName("question").setDescription("Question").setRequired(true)).addStringOption(o=>o.setName("options").setDescription("Options (comma separated)").setRequired(true)),
  new SlashCommandBuilder().setName("remind").setDescription("Set a reminder").addStringOption(o=>o.setName("time").setDescription("Time (10m, 2h, 1d)").setRequired(true)).addStringOption(o=>o.setName("message").setDescription("Message").setRequired(true)),
  new SlashCommandBuilder().setName("invite").setDescription("Create invite").addIntegerOption(o=>o.setName("duration").setDescription("Hours (default 24)").setMinValue(1).setMaxValue(720)).addChannelOption(o=>o.setName("channel").setDescription("Channel").addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder().setName("vc-move").setDescription("Move user in voice").addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)).addChannelOption(o=>o.setName("channel").setDescription("Target channel").addChannelTypes(ChannelType.GuildVoice).setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers),
  new SlashCommandBuilder().setName("vc-disconnect").setDescription("Disconnect user from voice").addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers),
  new SlashCommandBuilder().setName("nuke").setDescription("Recreate a channel").addChannelOption(o=>o.setName("channel").setDescription("Channel").addChannelTypes(ChannelType.GuildText)).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName("snipe").setDescription("Show last deleted message"),
  new SlashCommandBuilder().setName("ai").setDescription("Chat with Orbitra AI").addStringOption(o=>o.setName("prompt").setDescription("Your message").setRequired(true)),
  new SlashCommandBuilder().setName("ai-image").setDescription("AI image prompt").addStringOption(o=>o.setName("prompt").setDescription("Description").setRequired(true)),
  new SlashCommandBuilder().setName("ai-code").setDescription("AI code help").addStringOption(o=>o.setName("language").setDescription("Language").setRequired(true)).addStringOption(o=>o.setName("prompt").setDescription("What you need").setRequired(true)),
  new SlashCommandBuilder().setName("ai-translate").setDescription("AI translate").addStringOption(o=>o.setName("text").setDescription("Text").setRequired(true)).addStringOption(o=>o.setName("language").setDescription("Target language").setRequired(true)),
  new SlashCommandBuilder().setName("ai-summarize").setDescription("AI summarize").addStringOption(o=>o.setName("text").setDescription("Text").setRequired(true)),
  new SlashCommandBuilder().setName("ai-creative").setDescription("AI creative writing").addStringOption(o=>o.setName("type").setDescription("story, poem, joke, riddle").setRequired(true)).addStringOption(o=>o.setName("prompt").setDescription("Prompt").setRequired(true)),
  // Empire
  new SlashCommandBuilder().setName("automod").setDescription("Configure automod").addStringOption(o=>o.setName("setting").setDescription("Setting").setRequired(true).addChoices({name:"Anti-spam",value:"antispam"},{name:"Anti-link",value:"antilink"},{name:"Word filter",value:"wordfilter"},{name:"Capitals filter",value:"capitals"})).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName("starboard").setDescription("Configure starboard").addChannelOption(o=>o.setName("channel").setDescription("Channel").addChannelTypes(ChannelType.GuildText).setRequired(true)).addIntegerOption(o=>o.setName("threshold").setDescription("Star threshold (default 5)").setMinValue(1).setMaxValue(100)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName("welcome").setDescription("Set welcome message").addChannelOption(o=>o.setName("channel").setDescription("Channel").addChannelTypes(ChannelType.GuildText).setRequired(true)).addStringOption(o=>o.setName("message").setDescription("Message ({user}, {server})").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName("autorole").setDescription("Set auto-role").addRoleOption(o=>o.setName("role").setDescription("Role").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName("giveaway").setDescription("Start giveaway").addStringOption(o=>o.setName("prize").setDescription("Prize").setRequired(true)).addIntegerOption(o=>o.setName("winners").setDescription("Winners").setMinValue(1).setMaxValue(20).setRequired(true)).addStringOption(o=>o.setName("duration").setDescription("Duration (1h, 1d)").setRequired(true)).addStringOption(o=>o.setName("description").setDescription("Description")),
  new SlashCommandBuilder().setName("modmail").setDescription("Message moderators").addStringOption(o=>o.setName("message").setDescription("Message").setRequired(true)),
  new SlashCommandBuilder().setName("report").setDescription("Report a user").addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("Reason").setRequired(true)),
  new SlashCommandBuilder().setName("ticket").setDescription("Create support ticket").addStringOption(o=>o.setName("subject").setDescription("Subject").setRequired(true)).addStringOption(o=>o.setName("description").setDescription("Description").setRequired(true)),
  new SlashCommandBuilder().setName("suggest").setDescription("Submit suggestion").addStringOption(o=>o.setName("suggestion").setDescription("Suggestion").setRequired(true)),
  new SlashCommandBuilder().setName("setup-orbitra").setDescription("Set up Orbitra integration").addChannelOption(o=>o.setName("announcements").setDescription("Announcements channel").addChannelTypes(ChannelType.GuildText)).addChannelOption(o=>o.setName("logs").setDescription("Logs channel").addChannelTypes(ChannelType.GuildText)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName("sync").setDescription("Sync server stats to Orbitra").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName("orbitra-list").setDescription("Search Orbitra servers").addStringOption(o=>o.setName("query").setDescription("Query").setRequired(true)),
  new SlashCommandBuilder().setName("orbitra-bump").setDescription("Bump your server on Orbitra").addStringOption(o=>o.setName("slug").setDescription("Server slug").setRequired(true)),
  new SlashCommandBuilder().setName("orbitra-stats").setDescription("Your Orbitra listing stats").addStringOption(o=>o.setName("slug").setDescription("Server slug").setRequired(true)),
  new SlashCommandBuilder().setName("voice-stats").setDescription("Voice channel stats"),
  new SlashCommandBuilder().setName("text-stats").setDescription("Text channel stats"),
  new SlashCommandBuilder().setName("top-chatters").setDescription("Top chatters"),
  new SlashCommandBuilder().setName("server-boost").setDescription("Boost leaderboard"),
  new SlashCommandBuilder().setName("plan").setDescription("Check or upgrade your server plan"),
  new SlashCommandBuilder().setName("help-premium").setDescription("Show premium commands and plans"),
  new SlashCommandBuilder().setName("see-chats").setDescription("View your AI chat history"),
  new SlashCommandBuilder().setName("clear-chats").setDescription("Clear your AI chat history"),
  new SlashCommandBuilder().setName("verify").setDescription("Link your Orbitra account to the bot"),
];

// ── COMMAND HANDLER ──
async function handleCommand(interaction) {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, user, guild, member } = interaction;
  const cd = checkCD(user.id);
  if (!cd.ok) return interaction.reply({ embeds: [em(null,{title:"Cooldown",description:`Try again in ${cd.wait}s.`,color:0xffa500})], ephemeral: true });

  incStat(user.id, guild?.id);

  // Commands that require verified account
  const requiresAuth = ["ai","ai-image","ai-code","ai-translate","ai-summarize","ai-creative","see-chats","clear-chats","orbitra-bump","orbitra-stats","orbitra-link","sync"];
  if (requiresAuth.includes(commandName)) {
    const v = await verifyDiscordUser(user.id);
    if (!v.verified) {
      return interaction.reply({ embeds: [em(null,{title:"Account Required",description:`You need a free Orbitra account to use this command.\n\nCreate one at: ${WEBSITE}/register\nThen link it with \`/verify\``,color:0xff6b6b,fields:[{name:"Step 1",value:`Create account at ${WEBSITE}/register`,inline:true},{name:"Step 2",value:"Use `/verify` to link",inline:true}]})], ephemeral: true });
    }
  }

  // Plan check
  const plan = await getServerPlan(guild.id);
  const cmdPlan = getCommandPlan(commandName);
  if (cmdPlan !== "free" && !hasPermission(plan, cmdPlan)) {
    return interaction.reply({ embeds: [planDenied(commandName, plan)], ephemeral: true });
  }

  try {
    switch (commandName) {
      case "ping": {
        const sent = await interaction.reply({ embeds: [em(null,{title:"Pinging...",color:0x00ff88})], fetchReply: true });
        const lat = sent.createdTimestamp - interaction.createdTimestamp;
        return interaction.editReply({ embeds: [em(null,{title:"Pong!",color:0x00ff88,fields:[{name:"Latency",value:`${lat}ms`,inline:true},{name:"API",value:`${Math.round(client.ws.ping)}ms`,inline:true},{name:"Uptime",value:fmtUptime(client.uptime),inline:true}]})] });
      }
      case "help": {
        const p = PLANS[plan] || PLANS.free;
        const cats = {
          "Info": ["ping","help","serverinfo","userinfo","avatar","membercount","channels","roles","uptime","stats"],
          "Fun": ["8ball","coinflip","dice","random","quote","define","calculate","color","weather"],
        };
        if (hasPermission(plan,"starter")) cats["Moderation"] = ["kick","ban","mute","unmute","warn","slowmode","lock","unlock","purge","nick","role-add","role-remove","afk","leaderboard","level"];
        if (hasPermission(plan,"pro")) { cats["AI"] = ["ai","ai-image","ai-code","ai-translate","ai-summarize","ai-creative"]; cats["Utility"] = ["announce","embed","say","poll","remind","invite","vc-move","vc-disconnect","nuke","snipe"]; }
        if (hasPermission(plan,"empire")) cats["Server Management"] = ["automod","starboard","welcome","autorole","giveaway","modmail","report","ticket","suggest","setup-orbitra","sync","voice-stats","text-stats","top-chatters","server-boost"];
        let desc = "";
        for (const [cat,cmds] of Object.entries(cats)) desc += `**${cat}**\n${cmds.map(c=>`\`/${c}\``).join(", ")}\n\n`;
        desc += `\nYour plan: **${p.name}** | Upgrade: ${WEBSITE}/pricing`;
        return interaction.reply({ embeds: [em(null,{title:"Orbitra Bot Commands",description:desc.slice(0,4096),color:p.color,footer:`${CMD.length} commands total`})], ephemeral: true });
      }
      case "plan": {
        const p = PLANS[plan] || PLANS.free;
        const fields = PLAN_ORDER.map(pk => {
          const pc = PLANS[pk];
          const active = pk === plan;
          return { name: `${active ? "> " : ""}${pc.name}${active ? " (Current)" : ""}`, value: `AI: ${pc.ai === -1 ? "Unlimited" : pc.ai+"/day"} | ${pc.cmds.length + 19} commands`, inline: true };
        });
        return interaction.reply({ embeds: [em(null,{title:"Server Plan",description:`Current plan: **${p.name}**\n\nUpgrade at: ${WEBSITE}/pricing\n\nThe server owner must have the plan. Everyone in the server can then use the commands.`,color:p.color,fields})], ephemeral: true });
      }
      case "help-premium": {
        const descs = {
          free: "Basic commands: ping, help, server info, fun commands (8ball, dice, etc)",
          starter: "Moderation: kick, ban, mute, warn, purge, slowmode, roles, afk, leaderboard",
          pro: "AI chat + all AI commands, announcements, embeds, polls, reminders, voice control",
          empire: "Everything: automod, starboard, giveaways, tickets, Orbitra integration, analytics",
        };
        const fields = PLAN_ORDER.map(pk => ({ name: PLANS[pk].name, value: descs[pk], inline: false }));
        return interaction.reply({ embeds: [em(null,{title:"Premium Plans",description:`The server owner subscribes at ${WEBSITE}/pricing. Everyone in the server benefits.\n\n**Free** → **Starter** ($5/mo) → **Pro** ($15/mo) → **Empire** ($30/mo)`,color:0x7c3aed,fields})], ephemeral: true });
      }
      case "serverinfo": {
        const g = guild;
        return interaction.reply({ embeds: [em(null,{title:g.name,color:g.hexAccentColor||0x7c3aed,thumbnail:g.iconURL({dynamic:true,size:256}),fields:[
          {name:"ID",value:g.id,inline:true},{name:"Owner",value:`<@${g.ownerId}>`,inline:true},{name:"Members",value:`${g.memberCount}`,inline:true},
          {name:"Channels",value:`${g.channels.cache.size}`,inline:true},{name:"Roles",value:`${g.roles.cache.size}`,inline:true},{name:"Emojis",value:`${g.emojis.cache.size}`,inline:true},
          {name:"Boost Level",value:`${g.premiumTier}`,inline:true},{name:"Boosts",value:`${g.premiumSubscriptionCount||0}`,inline:true},{name:"Created",value:`<t:${Math.floor(g.createdTimestamp/1000)}:R>`,inline:true},
        ],footer:`Requested by ${user.tag}`})] });
      }
      case "userinfo": {
        const t = interaction.options.getUser("user") || user;
        const m = await guild.members.fetch(t.id);
        return interaction.reply({ embeds: [em(null,{title:t.tag,color:m.displayColor||0x7c3aed,thumbnail:t.displayAvatarURL({dynamic:true,size:256}),fields:[
          {name:"ID",value:t.id,inline:true},{name:"Nickname",value:m.nickname||"None",inline:true},{name:"Joined",value:`<t:${Math.floor(m.joinedTimestamp/1000)}:R>`,inline:true},
          {name:"Created",value:`<t:${Math.floor(t.createdTimestamp/1000)}:R>`,inline:true},{name:"Top Role",value:m.roles.highest.id===guild.id?"None":`<@&${m.roles.highest.id}>`,inline:true},
          {name:"Roles",value:m.roles.cache.map(r=>`<@&${r.id}>`).join(", ").slice(0,1024)||"None",inline:false},
        ],footer:`Requested by ${user.tag}`})] });
      }
      case "avatar": {
        const t = interaction.options.getUser("user") || user;
        return interaction.reply({ embeds: [em(null,{title:`${t.tag}'s Avatar`,color:0x7c3aed,image:t.displayAvatarURL({dynamic:true,size:512})})] });
      }
      case "membercount": {
        const bots = guild.members.cache.filter(m=>m.user.bot).size;
        return interaction.reply({ embeds: [em(null,{title:"Member Count",color:0x00ff88,fields:[
          {name:"Total",value:`${guild.memberCount}`,inline:true},{name:"Humans",value:`${guild.memberCount-bots}`,inline:true},{name:"Bots",value:`${bots}`,inline:true},
          {name:"Online",value:`${guild.members.cache.filter(m=>m.presence?.status==="online").size}`,inline:true},{name:"Idle",value:`${guild.members.cache.filter(m=>m.presence?.status==="idle").size}`,inline:true},{name:"DND",value:`${guild.members.cache.filter(m=>m.presence?.status==="dnd").size}`,inline:true},
        ]})] });
      }
      case "channels": {
        const types={0:"Text",2:"Voice",4:"Category",5:"Announcement",13:"Stage",15:"Forum"};
        const g2={}; for(const[,ch]of guild.channels.cache){const t=types[ch.type]||"Other";if(!g2[t])g2[t]=[];g2[t].push(`<#${ch.id}>`);}
        let d=""; for(const[t,cs]of Object.entries(g2))d+=`**${t} (${cs.length})**\n${cs.join(", ")}\n\n`;
        return interaction.reply({ embeds: [em(null,{title:"Channels",description:d.slice(0,4096),color:0x7c3aed})] });
      }
      case "roles": {
        const s=guild.roles.cache.sort((a,b)=>b.position-a.position);
        return interaction.reply({ embeds: [em(null,{title:`Roles (${s.size})`,description:s.map(r=>`${r.name} (${r.members.size})`).join("\n").slice(0,4096),color:0x7c3aed})] });
      }
      case "uptime": return interaction.reply({ embeds: [em(null,{title:"Uptime",description:fmtUptime(client.uptime),color:0x00ff88})] });
      case "stats": {
        return interaction.reply({ embeds: [em(null,{title:"Orbitra Bot Stats",color:0x7c3aed,fields:[
          {name:"Servers",value:`${client.guilds.cache.size}`,inline:true},{name:"Users",value:`${client.guilds.cache.reduce((a,g)=>a+g.memberCount,0)}`,inline:true},
          {name:"Channels",value:`${client.channels.cache.size}`,inline:true},{name:"Commands",value:`${CMD.length}`,inline:true},{name:"Ping",value:`${Math.round(client.ws.ping)}ms`,inline:true},{name:"Uptime",value:fmtUptime(client.uptime),inline:true},
        ],footer:WEBSITE})] });
      }
      case "8ball": {
        const q=interaction.options.getString("question"), a=EIGHT_BALL[Math.floor(Math.random()*EIGHT_BALL.length)];
        return interaction.reply({ embeds: [em(null,{title:"Magic 8-Ball",color:0x1a1a2e,fields:[{name:"Question",value:q},{name:"Answer",value:a}]})] });
      }
      case "coinflip": return interaction.reply({ embeds: [em(null,{title:"Coin Flip",description:`The coin landed on **${Math.random()<0.5?"Heads":"Tails"}**!`,color:0xffd700})] });
      case "dice": { const s=interaction.options.getInteger("sides")||6, r=Math.floor(Math.random()*s)+1; return interaction.reply({ embeds: [em(null,{title:"Dice Roll",description:`You rolled a **${r}** (d${s})`,color:0xff6b6b})] }); }
      case "random": { const mn=interaction.options.getInteger("min"),mx=interaction.options.getInteger("max"); if(mn>=mx)return interaction.reply({embeds:[em(null,{title:"Error",description:"Min must be less than max.",color:0xff6b6b})],ephemeral:true}); return interaction.reply({ embeds: [em(null,{title:"Random Number",description:`**${Math.floor(Math.random()*(mx-mn+1))+mn}** (between ${mn} and ${mx})`,color:0x00bfff})] }); }
      case "quote": return interaction.reply({ embeds: [em(null,{title:"Quote",description:`"${QUOTES[Math.floor(Math.random()*QUOTES.length)]}"`,color:0xffd700})] });
      case "define": {
        await interaction.deferReply();
        try { const d=JSON.parse(await httpGet(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(interaction.options.getString("word"))}`)); const e=d[0]; if(!e)return interaction.editReply({embeds:[em(null,{title:"Not Found",description:"Word not found.",color:0xff6b6b})]}); const m=e.meanings?.[0]; return interaction.editReply({embeds:[em(null,{title:e.word,description:m?.definitions?.[0]?.definition||"No definition.",color:0x7c3aed,fields:[{name:"Part of Speech",value:m?.partOfSpeech||"Unknown",inline:true},{name:"Phonetic",value:e.phonetic||"N/A",inline:true}]})]}); } catch { return interaction.editReply({embeds:[em(null,{title:"Error",description:"Could not find that word.",color:0xff6b6b})]}); }
      }
      case "calculate": { const expr=interaction.options.getString("expression"); try{const s=expr.replace(/[^0-9+\-*/().%\s]/g,"");if(!s)return interaction.reply({embeds:[em(null,{title:"Error",description:"Invalid expression.",color:0xff6b6b})],ephemeral:true});const r=Function(`"use strict";return(${s})`)();return interaction.reply({embeds:[em(null,{title:"Calculator",color:0x00bfff,fields:[{name:"Expression",value:expr},{name:"Result",value:`${r}`}]})]});}catch{return interaction.reply({embeds:[em(null,{title:"Error",description:"Invalid math expression.",color:0xff6b6b})],ephemeral:true});} }
      case "color": { const h=interaction.options.getString("hex").replace("#",""); if(!/^[0-9a-fA-F]{6}$/.test(h))return interaction.reply({embeds:[em(null,{title:"Error",description:"Invalid hex color. Use: #ff5733",color:0xff6b6b})],ephemeral:true}); return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`Color: #${h}`).setColor(parseInt(h,16)).setDescription(`RGB: ${parseInt(h.slice(0,2),16)}, ${parseInt(h.slice(2,4),16)}, ${parseInt(h.slice(4,6),16)}`).setImage(`https://singlecolorimage.com/get/${h}/200x200`).setTimestamp()] }); }
      case "weather": { const loc=interaction.options.getString("location"); await interaction.deferReply(); try{const d=JSON.parse(await httpGet(`https://wttr.in/${encodeURIComponent(loc)}?format=j1`));const c=d.current_condition?.[0];if(!c)return interaction.editReply({embeds:[em(null,{title:"Error",description:"Could not find weather.",color:0xff6b6b})]});return interaction.editReply({embeds:[em(null,{title:`Weather in ${loc}`,color:0x00bfff,fields:[{name:"Temp",value:`${c.temp_C}°C / ${c.temp_F}°F`,inline:true},{name:"Feels Like",value:`${c.FeelsLikeC}°C`,inline:true},{name:"Condition",value:c.weatherDesc?.[0]?.value||"Unknown",inline:true},{name:"Humidity",value:`${c.humidity}%`,inline:true},{name:"Wind",value:`${c.windspeedKmph} km/h ${c.winddir16Point}`,inline:true}]})]});}catch{return interaction.editReply({embeds:[em(null,{title:"Error",description:"Could not fetch weather.",color:0xff6b6b})]});} }
      // Moderation
      case "kick": { const t=interaction.options.getUser("user"),r=interaction.options.getString("reason")||"No reason";const tm=await guild.members.fetch(t.id).catch(()=>null);if(!tm)return interaction.reply({embeds:[em(null,{title:"Error",description:"User not found.",color:0xff6b6b})],ephemeral:true});if(!tm.kickable)return interaction.reply({embeds:[em(null,{title:"Error",description:"I cannot kick this user.",color:0xff6b6b})],ephemeral:true});await tm.kick(r);return interaction.reply({embeds:[em(null,{title:"Member Kicked",color:0xff6b6b,fields:[{name:"User",value:`${t.tag} (${t.id})`,inline:true},{name:"Moderator",value:user.tag,inline:true},{name:"Reason",value:r}]})]}); }
      case "ban": { const t=interaction.options.getUser("user"),r=interaction.options.getString("reason")||"No reason",d=interaction.options.getInteger("days")||0;const tm=await guild.members.fetch(t.id).catch(()=>null);if(!tm)return interaction.reply({embeds:[em(null,{title:"Error",description:"User not found.",color:0xff6b6b})],ephemeral:true});if(!tm.bannable)return interaction.reply({embeds:[em(null,{title:"Error",description:"I cannot ban this user.",color:0xff6b6b})],ephemeral:true});await tm.ban({deleteMessageDays:d,reason:r});return interaction.reply({embeds:[em(null,{title:"Member Banned",color:0xff0000,fields:[{name:"User",value:`${t.tag} (${t.id})`,inline:true},{name:"Moderator",value:user.tag,inline:true},{name:"Reason",value:r},{name:"Messages Deleted",value:`${d} days`,inline:true}]})]}); }
      case "mute": { const t=interaction.options.getUser("user"),min=interaction.options.getInteger("minutes")||10,r=interaction.options.getString("reason")||"No reason";const tm=await guild.members.fetch(t.id).catch(()=>null);if(!tm)return interaction.reply({embeds:[em(null,{title:"Error",description:"User not found.",color:0xff6b6b})],ephemeral:true});if(!tm.moderatable)return interaction.reply({embeds:[em(null,{title:"Error",description:"I cannot mute this user.",color:0xff6b6b})],ephemeral:true});await tm.timeout(min*60*1000,r);return interaction.reply({embeds:[em(null,{title:"Member Muted",color:0xffa500,fields:[{name:"User",value:t.tag,inline:true},{name:"Duration",value:`${min} minutes`,inline:true},{name:"Reason",value:r}]})]}); }
      case "unmute": { const t=interaction.options.getUser("user");const tm=await guild.members.fetch(t.id).catch(()=>null);if(!tm)return interaction.reply({embeds:[em(null,{title:"Error",description:"User not found.",color:0xff6b6b})],ephemeral:true});await tm.timeout(null);return interaction.reply({embeds:[em(null,{title:"Member Unmuted",description:`${t.tag} has been unmuted.`,color:0x00ff88})]}); }
      case "warn": { const t=interaction.options.getUser("user"),r=interaction.options.getString("reason");const k=`${guild.id}:${t.id}`;const c=(warnings.get(k)||0)+1;warnings.set(k,c);return interaction.reply({embeds:[em(null,{title:"Member Warned",color:0xffa500,fields:[{name:"User",value:t.tag,inline:true},{name:"Warnings",value:`${c}`,inline:true},{name:"Reason",value:r}]})]}); }
      case "slowmode": { const ch=interaction.options.getChannel("channel"),s=interaction.options.getInteger("seconds");await ch.setRateLimitPerUser(s);return interaction.reply({embeds:[em(null,{title:"Slowmode Updated",description:`Set to ${s} seconds in <#${ch.id}>`,color:0x00ff88})],ephemeral:true}); }
      case "lock": { const ch=interaction.options.getChannel("channel")||interaction.channel;await ch.permissionOverwrites.edit(guild.roles.everyone,{SendMessages:false});return interaction.reply({embeds:[em(null,{title:"Channel Locked",description:`<#${ch.id}> has been locked.`,color:0xff6b6b})],ephemeral:true}); }
      case "unlock": { const ch=interaction.options.getChannel("channel")||interaction.channel;await ch.permissionOverwrites.edit(guild.roles.everyone,{SendMessages:null});return interaction.reply({embeds:[em(null,{title:"Channel Unlocked",description:`<#${ch.id}> has been unlocked.`,color:0x00ff88})],ephemeral:true}); }
      case "purge": { const cnt=interaction.options.getInteger("count"),tu=interaction.options.getUser("user");await interaction.deferReply({ephemeral:true});let ms=await interaction.channel.messages.fetch({limit:100});if(tu)ms=ms.filter(m=>m.author.id===tu.id);const td=ms.first(cnt);let dl=0;if(td&&td.length){const d=await interaction.channel.bulkDelete(td,true);dl=d.size;}return interaction.editReply({embeds:[em(null,{title:"Messages Purged",description:`Deleted ${dl} messages.`,color:0x00ff88})]}); }
      case "nick": { const t=interaction.options.getUser("user"),n=interaction.options.getString("nickname");const tm=await guild.members.fetch(t.id).catch(()=>null);if(!tm)return interaction.reply({embeds:[em(null,{title:"Error",description:"User not found.",color:0xff6b6b})],ephemeral:true});await tm.setNickname(n||null);return interaction.reply({embeds:[em(null,{title:"Nickname Updated",description:`Updated for ${t.tag}.`,color:0x00ff88})],ephemeral:true}); }
      case "role-add": { const t=interaction.options.getUser("user"),r=interaction.options.getRole("role");const tm=await guild.members.fetch(t.id).catch(()=>null);if(!tm)return interaction.reply({embeds:[em(null,{title:"Error",description:"User not found.",color:0xff6b6b})],ephemeral:true});await tm.roles.add(r);return interaction.reply({embeds:[em(null,{title:"Role Added",description:`Added <@&${r.id}> to ${t.tag}.`,color:0x00ff88})],ephemeral:true}); }
      case "role-remove": { const t=interaction.options.getUser("user"),r=interaction.options.getRole("role");const tm=await guild.members.fetch(t.id).catch(()=>null);if(!tm)return interaction.reply({embeds:[em(null,{title:"Error",description:"User not found.",color:0xff6b6b})],ephemeral:true});await tm.roles.remove(r);return interaction.reply({embeds:[em(null,{title:"Role Removed",description:`Removed <@&${r.id}> from ${t.tag}.`,color:0xffa500})],ephemeral:true}); }
      case "afk": { const r=interaction.options.getString("reason")||"AFK";afkUsers.set(user.id,{reason:r,ts:Date.now()});return interaction.reply({embeds:[em(null,{title:"AFK Set",description:`You are now AFK: ${r}`,color:0x00bfff})],ephemeral:true}); }
      case "leaderboard": { const gs=[];for(const[k,s]of userStats){const[gid,uid]=k.split(":");if(gid===guild.id)gs.push({uid,...s});}gs.sort((a,b)=>b.msgs-a.msgs);const top=gs.slice(0,10);if(!top.length)return interaction.reply({embeds:[em(null,{title:"Leaderboard",description:"No activity data yet.",color:0xffd700})],ephemeral:true});let d="";const medals=["🥇","🥈","🥉"];top.forEach((s,i)=>{d+=`${medals[i]||`${i+1}.`} <@${s.uid}> — ${s.msgs} msgs, ${s.cmds} cmds\n`;});return interaction.reply({embeds:[em(null,{title:"Leaderboard",description:d,color:0xffd700})]}); }
      case "level": { const t=interaction.options.getUser("user")||user;const k=`${guild.id}:${t.id}`;const s=userStats.get(k)||{msgs:0,cmds:0};const lv=Math.floor(Math.sqrt(s.msgs/10));return interaction.reply({embeds:[em(null,{title:`${t.tag}'s Level`,color:0x7c3aed,fields:[{name:"Level",value:`${lv}`,inline:true},{name:"Messages",value:`${s.msgs}`,inline:true},{name:"Commands",value:`${s.cmds}`,inline:true}]})]}); }
      case "snipe": { const d=lastDeleted.get(interaction.channelId);if(!d)return interaction.reply({embeds:[em(null,{title:"Snipe",description:"No recently deleted messages.",color:0xff6b6b})],ephemeral:true});return interaction.reply({embeds:[em(null,{title:"Sniped Message",description:d.content||"No content",color:0xff6b6b,fields:[{name:"Author",value:`<@${d.authorId}>`,inline:true},{name:"Deleted",value:`<t:${Math.floor(d.ts/1000)}:R>`,inline:true}]})]}); }
      // AI
      case "ai": case "ai-image": case "ai-code": case "ai-translate": case "ai-summarize": case "ai-creative": {
        await interaction.deferReply();let p=interaction.options.getString("prompt");
        if(commandName==="ai-code")p=`Help me with ${interaction.options.getString("language")} code: ${p}`;
        else if(commandName==="ai-translate")p=`Translate to ${interaction.options.getString("language")}: ${p}`;
        else if(commandName==="ai-creative")p=`Write a ${interaction.options.getString("type")}: ${p}`;
        const history = await getHistory(user.id, guild?.id);
        const r=await callAI(p,{userId:user.id,guildId:guild?.id,history:history.slice(-20)});
        await addHistory(user.id, guild?.id, p, r);
        const chunks=r.match(/[\s\S]{1,1900}/g)||[r];
        await interaction.editReply({embeds:[em(null,{title:"Orbitra AI",description:chunks[0],color:0x7c3aed,footer:`Plan: ${(PLANS[plan]||PLANS.free).name} | Chat #${history.length/2+1}`})]});
        for(let i=1;i<chunks.length;i++)await interaction.followUp({embeds:[em(null,{description:chunks[i],color:0x7c3aed})]});
        return;
      }
      case "see-chats": {
        const history = await getHistory(user.id, guild?.id);
        if (!history.length) return interaction.reply({embeds:[em(null,{title:"Chat History",description:"No chats yet. Start chatting with `/ai`!",color:0x7c3aed})],ephemeral:true});
        const recent = history.slice(-20);
        let desc = "";
        for (let i = 0; i < recent.length; i += 2) {
          const msg = recent[i];
          const res = recent[i+1];
          if (msg && res) {
            desc += `**You:** ${msg.content.slice(0,80)}${msg.content.length>80?"...":""}\n**AI:** ${res.content.slice(0,80)}${res.content.length>80?"...":""}\n\n`;
          }
        }
        return interaction.reply({embeds:[em(null,{title:"Your AI Chats",description:desc.slice(0,4096)||"No chats found.",color:0x7c3aed,footer:`Total messages: ${history.length} | Use /clear-chats to reset`})],ephemeral:true});
      }
      case "clear-chats": {
        await clearHistory(user.id, guild?.id);
        return interaction.reply({embeds:[em(null,{title:"Chats Cleared",description:"Your AI chat history has been cleared.",color:0x00ff88})],ephemeral:true});
      }
      case "verify": {
        const v = await verifyDiscordUser(user.id);
        if (v.verified) {
          return interaction.reply({embeds:[em(null,{title:"Already Verified",description:`Your Discord account is linked to Orbitra.\n\nPlan: **${v.plan || "free"}**\n\nManage your account: ${WEBSITE}/account`,color:0x00ff88})],ephemeral:true});
        }
        return interaction.reply({embeds:[em(null,{title:"Link Your Account",description:`To link your Discord account to Orbitra:\n\n1. Create a free account at ${WEBSITE}/register\n2. Go to ${WEBSITE}/account\n3. Click "Link Discord"\n4. Come back and use \`/verify\` again`,color:0x7c3aed,fields:[{name:"Create Account",value:`${WEBSITE}/register`,inline:true},{name:"Link Discord",value:`${WEBSITE}/account`,inline:true}]})],ephemeral:true});
      }
      // Pro
      case "announce": { if(!member.permissions.has(PermissionFlagsBits.ManageMessages))return interaction.reply({embeds:[em(null,{title:"Error",description:"Need Manage Messages permission.",color:0xff6b6b})],ephemeral:true});const ch=interaction.options.getChannel("channel"),t=interaction.options.getString("title"),m=interaction.options.getString("message"),c=interaction.options.getString("color")||"#7c3aed";await ch.send({embeds:[new EmbedBuilder().setTitle(t).setDescription(m).setColor(parseInt(c.replace("#",""),16)||0x7c3aed).setFooter({text:`Announcement by ${user.tag}`}).setTimestamp()]});return interaction.reply({embeds:[em(null,{title:"Announcement Sent",description:`Sent to <#${ch.id}>`,color:0x00ff88})],ephemeral:true}); }
      case "embed": { const t=interaction.options.getString("title"),d=interaction.options.getString("description"),c=interaction.options.getString("color")||"#7c3aed",f=interaction.options.getString("footer"),ch=interaction.options.getChannel("channel")||interaction.channel;const e=new EmbedBuilder().setTitle(t).setDescription(d).setColor(parseInt(c.replace("#",""),16)||0x7c3aed).setTimestamp();if(f)e.setFooter({text:f});await ch.send({embeds:[e]});return interaction.reply({embeds:[em(null,{title:"Embed Sent",description:`Sent to <#${ch.id}>`,color:0x00ff88})],ephemeral:true}); }
      case "say": { const m=interaction.options.getString("message"),ch=interaction.options.getChannel("channel")||interaction.channel;await ch.send(m);return interaction.reply({embeds:[em(null,{title:"Sent",description:"Message delivered.",color:0x00ff88})],ephemeral:true}); }
      case "poll": { const q=interaction.options.getString("question"),opts=interaction.options.getString("options").split(",").map(o=>o.trim()).filter(Boolean);if(opts.length<2||opts.length>10)return interaction.reply({embeds:[em(null,{title:"Error",description:"Provide 2-10 options.",color:0xff6b6b})],ephemeral:true});const emojis=["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"];let d="";opts.forEach((o,i)=>{d+=`${emojis[i]} ${o}\n`;});const msg=await interaction.reply({embeds:[em(null,{title:q,description:d,color:0xffa500,footer:`Poll by ${user.tag}`})],fetchReply:true});for(let i=0;i<opts.length;i++)await msg.react(emojis[i]);return; }
      case "remind": { const ts=interaction.options.getString("time"),m=interaction.options.getString("message"),ms=parseTime(ts);if(!ms||ms<1000||ms>604800000)return interaction.reply({embeds:[em(null,{title:"Error",description:"Invalid time. Use 10m, 2h, 1d. Max 7 days.",color:0xff6b6b})],ephemeral:true});await interaction.reply({embeds:[em(null,{title:"Reminder Set",description:`I'll remind you in ${ts}.`,color:0x00ff88})],ephemeral:true});setTimeout(()=>{client.channels.fetch(interaction.channelId).then(ch=>{if(ch)ch.send({content:`<@${user.id}> Reminder: ${m}`});}).catch(()=>{});},ms);return; }
      case "invite": { const dur=interaction.options.getInteger("duration")||24,ch=interaction.options.getChannel("channel")||interaction.channel;const inv=await ch.createInvite({maxAge:dur*3600,maxUses:0});return interaction.reply({embeds:[em(null,{title:"Invite Created",description:`Expires in ${dur} hours\n${inv.url}`,color:0x00ff88})]}); }
      case "vc-move": { const t=interaction.options.getUser("user"),ch=interaction.options.getChannel("channel");const tm=await guild.members.fetch(t.id).catch(()=>null);if(!tm)return interaction.reply({embeds:[em(null,{title:"Error",description:"User not found.",color:0xff6b6b})],ephemeral:true});if(!tm.voice.channel)return interaction.reply({embeds:[em(null,{title:"Error",description:"User not in voice.",color:0xff6b6b})],ephemeral:true});await tm.voice.setChannel(ch);return interaction.reply({embeds:[em(null,{title:"Moved",description:`Moved ${t.tag} to <#${ch.id}>.`,color:0x00ff88})],ephemeral:true}); }
      case "vc-disconnect": { const t=interaction.options.getUser("user");const tm=await guild.members.fetch(t.id).catch(()=>null);if(!tm)return interaction.reply({embeds:[em(null,{title:"Error",description:"User not found.",color:0xff6b6b})],ephemeral:true});if(!tm.voice.channel)return interaction.reply({embeds:[em(null,{title:"Error",description:"User not in voice.",color:0xff6b6b})],ephemeral:true});await tm.voice.disconnect();return interaction.reply({embeds:[em(null,{title:"Disconnected",description:`Disconnected ${t.tag}.`,color:0xffa500})],ephemeral:true}); }
      case "nuke": { const ch=interaction.options.getChannel("channel")||interaction.channel;const nc=await ch.clone();await ch.delete();await nc.send({embeds:[em(null,{title:"Channel Nuked",description:`Nuked by ${user.tag}`,color:0xff6b6b})]});return interaction.reply({embeds:[em(null,{title:"Nuked",description:"Channel recreated.",color:0x00ff88})],ephemeral:true}); }
      // Empire
      case "automod": { const s=interaction.options.getString("setting");const labels={antispam:"Anti-spam",antilink:"Anti-link",wordfilter:"Word filter",capitals:"Capitals filter"};return interaction.reply({embeds:[em(null,{title:"Automod",description:`**${labels[s]||s}** is now enabled.\n\nConfigure detailed settings at: ${WEBSITE}/dashboard/servers`,color:0x00ff88})],ephemeral:true}); }
      case "starboard": { const ch=interaction.options.getChannel("channel"),t=interaction.options.getInteger("threshold")||5;serverConfig.set(guild.id,{...(serverConfig.get(guild.id)||{}),starboard:ch.id,starThreshold:t});return interaction.reply({embeds:[em(null,{title:"Starboard Configured",description:`Channel: <#${ch.id}>\nThreshold: ${t} stars`,color:0xffd700})],ephemeral:true}); }
      case "welcome": { const ch=interaction.options.getChannel("channel"),m=interaction.options.getString("message");serverConfig.set(guild.id,{...(serverConfig.get(guild.id)||{}),welcome:{channel:ch.id,message:m}});return interaction.reply({embeds:[em(null,{title:"Welcome Configured",description:`Channel: <#${ch.id}>\nMessage: ${m}`,color:0x00ff88})],ephemeral:true}); }
      case "autorole": { const r=interaction.options.getRole("role");serverConfig.set(guild.id,{...(serverConfig.get(guild.id)||{}),autorole:r.id});return interaction.reply({embeds:[em(null,{title:"Auto-Role Set",description:`New members will receive <@&${r.id}>`,color:0x00ff88})],ephemeral:true}); }
      case "giveaway": { const prize=interaction.options.getString("prize"),winners=interaction.options.getInteger("winners"),dur=interaction.options.getString("duration"),desc=interaction.options.getString("description")||"";const ms=parseTime(dur);if(!ms)return interaction.reply({embeds:[em(null,{title:"Error",description:"Invalid duration.",color:0xff6b6b})],ephemeral:true});const ch=interaction.channel;const e=new EmbedBuilder().setTitle("🎉 Giveaway 🎉").setDescription(`**${prize}**\n\n${desc}\n\nReact with 🎉 to enter!\nEnds: <t:${Math.floor((Date.now()+ms)/1000)}:R>\nHosted by: ${user}`).setColor(0xffd700).setFooter({text:`${winners} winner(s)`}).setTimestamp();const msg=await ch.send({embeds:[e]});await msg.react("🎉");setTimeout(async()=>{try{const m=await ch.messages.fetch(msg.id);const r=m.reactions.cache.get("🎉");if(!r)return;const users=await r.users.fetch();const entries=users.filter(u=>!u.bot).map(u=>u.id);const w=[];for(let i=0;i<Math.min(winners,entries.length);i++){const idx=Math.floor(Math.random()*entries.length);w.push(entries.splice(idx,1)[0]);}const winStr=w.length?w.map(u=>`<@${u}>`).join(", "):"No valid entries";const finalEmbed=EmbedBuilder.from(e).setDescription(`**${prize}**\n\nWinner(s): ${winStr}\nEnded by: ${user}`).setColor(0x00ff88);msg.edit({embeds:[finalEmbed]});ch.send({embeds:[em(null,{title:"Giveaway Ended",description:`Winner(s) for **${prize}**: ${winStr}`,color:0x00ff88})]});if(w.length)ch.send({content:w.join(" ")+" Congratulations!"});}catch{}},ms);return interaction.reply({embeds:[em(null,{title:"Giveaway Started",description:`Ends in ${dur}`,color:0xffd700})],ephemeral:true}); }
      case "setup-orbitra": { const ann=interaction.options.getChannel("announcements"),log2=interaction.options.getChannel("logs");serverConfig.set(guild.id,{...(serverConfig.get(guild.id)||{}),announcements:ann?.id,logs:log2?.id});return interaction.reply({embeds:[em(null,{title:"Orbitra Setup",color:0x00ff88,fields:[{name:"Announcements",value:ann?`<#${ann.id}>`:"Not set",inline:true},{name:"Logs",value:log2?`<#${log2.id}>`:"Not set",inline:true},{name:"Dashboard",value:`${WEBSITE}/dashboard/servers`}]})],ephemeral:true}); }
      case "sync": { await interaction.deferReply();const stats=await syncStats(guild);if(!stats)return interaction.editReply({embeds:[em(null,{title:"Error",description:"Failed to sync stats.",color:0xff6b6b})]});return interaction.editReply({embeds:[em(null,{title:"Stats Synced",color:0x00ff88,fields:[{name:"Members",value:`${stats.memberCount}`,inline:true},{name:"Online",value:`${stats.onlineCount}`,inline:true},{name:"Channels",value:`${stats.channelCount}`,inline:true},{name:"Roles",value:`${stats.roleCount}`,inline:true},{name:"Boost Level",value:`${stats.boostLevel}`,inline:true},{name:"Msgs/Day",value:`${stats.messagesPerDay}`,inline:true}]})] }); }
      case "orbitra-list": { const q=interaction.options.getString("query");return interaction.reply({embeds:[em(null,{title:"Search Orbitra",description:`Search **${q}** on Orbitra:\n${WEBSITE}/discover?q=${encodeURIComponent(q)}`,color:0x7c3aed})]}); }
      case "orbitra-bump": return interaction.reply({embeds:[em(null,{title:"Bump Server",description:`Bump at: ${WEBSITE}/dashboard/servers`,color:0x7c3aed})],ephemeral:true});
      case "orbitra-stats": return interaction.reply({embeds:[em(null,{title:"Orbitra Stats",description:`View at: ${WEBSITE}/dashboard/servers`,color:0x7c3aed})],ephemeral:true});
      default: return interaction.reply({embeds:[em(null,{title:"Coming Soon",description:`/${commandName} is under development.`,color:0x808080})],ephemeral:true});
    }
  } catch (err) {
    console.error(`Command ${commandName} error:`, err);
    const r={embeds:[em(null,{title:"Error",description:"An error occurred.",color:0xff6b6b})],ephemeral:true};
    if(interaction.replied||interaction.deferred)await interaction.followUp(r).catch(()=>{});
    else await interaction.reply(r).catch(()=>{});
  }
}

// ── EVENTS ──
let lastCount=0;
async function updateActivity() {
  const g=client.guilds.cache.size; if(g===lastCount)return; lastCount=g;
  try{client.user.setPresence({activities:[{type:ActivityType.Watching,name:`${g} server${g!==1?"s":""} | orbitra.gg`,url:WEBSITE}],status:"online"});console.log(`[${new Date().toISOString()}] Watching ${g} servers`);}catch{}
}

async function registerCommands() {
  try{const r=new REST({version:"10"}).setToken(TOKEN);console.log(`Registering ${CMD.length} commands...`);await r.put(Routes.applicationCommands(CLIENT_ID),{body:CMD.map(c=>c.toJSON())});console.log(`Registered ${CMD.length} commands.`);}catch(e){console.error("Command reg failed:",e.message);}
}

client.on(Events.MessageDelete,(msg)=>{if(msg.author?.bot)return;lastDeleted.set(msg.channel.id,{content:msg.content,authorId:msg.author?.id,ts:Date.now()});setTimeout(()=>lastDeleted.delete(msg.channel.id),300000);});

client.on(Events.MessageCreate,(msg)=>{
  if(msg.author.bot)return;incStat(msg.author.id,msg.guild?.id);
  const afk=afkUsers.get(msg.author.id);if(afk){afkUsers.delete(msg.author.id);msg.reply({embeds:[em(null,{title:"Welcome Back",description:`You were AFK for ${fmtUptime(Date.now()-afk.ts)}: ${afk.reason}`,color:0x00ff88})]}).catch(()=>{});}
  if(msg.mentions.users.has(client.user.id)){callAI(msg.content.replace(/<@!?\d+>/g,"").trim(),{source:"discord-mention",userId:msg.author.id,guildId:msg.guild?.id}).then(r=>{const c=r.match(/[\s\S]{1,1900}/g)||[r];msg.reply({embeds:[em(null,{title:"Orbitra AI",description:c[0],color:0x7c3aed})]}).catch(()=>{});for(let i=1;i<c.length;i++)msg.channel.send({embeds:[em(null,{description:c[i],color:0x7c3aed})]}).catch(()=>{});}).catch(()=>msg.reply({embeds:[em(null,{title:"AI Unavailable",description:"Try again later.",color:0xff6b6b})]}).catch(()=>{}));}
  for(const[uid,ad]of afkUsers){if(msg.mentions.users.has(uid)){msg.reply({embeds:[em(null,{title:"AFK",description:`${client.users.cache.get(uid)?.tag||"User"} is AFK: ${ad.reason}`,color:0xffa500})]}).catch(()=>{});}}
});

client.on(Events.GuildMemberAdd,async(m)=>{
  const cfg=serverConfig.get(m.guild.id);
  if(cfg?.announcements){try{const ch=await m.guild.channels.fetch(cfg.announcements);if(ch)ch.send({embeds:[em(null,{title:"Welcome!",description:`Welcome to **${m.guild.name}**, ${m}! You are member #${m.guild.memberCount}.`,color:0x00ff88,thumbnail:m.displayAvatarURL({dynamic:true})})]}).catch(()=>{});}catch{}}
  syncStats(m.guild).catch(()=>{});
});
client.on(Events.GuildMemberRemove,()=>{});

client.on(Events.MessageReactionAdd,async(r,u)=>{
  if(u.bot||!r.message.guild)return;
  if(r.emoji.name==="⭐"&&r.count>=5){const cfg=serverConfig.get(r.message.guild.id);if(cfg?.starboard){try{const ch=await r.message.guild.channels.fetch(cfg.starboard);if(ch)ch.send({embeds:[em(null,{title:"⭐ Starred",description:r.message.content||"No content",color:0xffd700,author:{name:r.message.author.tag,icon:r.message.author.displayAvatarURL()},footer:{text:`${r.count} ⭐`}})]}).catch(()=>{});}catch{}}}
});

client.once(Events.ClientReady,async()=>{console.log(`[${new Date().toISOString()}] Logged in as ${client.user.tag}`);await registerCommands();updateActivity();setInterval(updateActivity,30000);setInterval(()=>{for(const g of client.guilds.cache.values())syncStats(g).catch(()=>{});},300000);});
client.on(Events.GuildCreate,()=>updateActivity());
client.on(Events.GuildDelete,()=>updateActivity());
client.on(Events.InteractionCreate,handleCommand);

process.on("unhandledRejection",(e)=>console.error("Unhandled:",e));
client.login(TOKEN).catch((e)=>{console.error("Login failed:",e.message);process.exit(1);});
