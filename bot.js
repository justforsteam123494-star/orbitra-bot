const {
  Client, GatewayIntentBits, ActivityType, Events, Partials,
  SlashCommandBuilder, PermissionFlagsBits, ChannelType,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  REST, Routes, Collection,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const https = require("https");

function loadEnv() {
  for (const file of [".env", ".env.local"]) {
    const p = path.join(__dirname, file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx < 0) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}
loadEnv();

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || "1549859635932958851";
const WEBSITE = "https://orbitra-bot.damarie0417.workers.dev";
const AI_API = `${WEBSITE}/api/ai/chat`;

if (!TOKEN) {
  console.error("DISCORD_BOT_TOKEN not found.");
  process.exit(1);
}

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

const cooldowns = new Collection();
const COOLDOWN_SECONDS = 3;

const COMMANDS = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot latency and API response time"),
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show all available commands"),
  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Get detailed information about this server"),
  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Get information about a user")
    .addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(false)),
  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Get a user's avatar")
    .addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(false)),
  new SlashCommandBuilder()
    .setName("membercount")
    .setDescription("Show member count with online status breakdown"),
  new SlashCommandBuilder()
    .setName("channels")
    .setDescription("List all channels in this server"),
  new SlashCommandBuilder()
    .setName("roles")
    .setDescription("List all roles in this server"),
  new SlashCommandBuilder()
    .setName("boostinfo")
    .setDescription("Show server boost status and perks"),
  new SlashCommandBuilder()
    .setName("invite")
    .setDescription("Create a temporary invite link")
    .addIntegerOption((o) => o.setName("duration").setDescription("Duration in hours (default 24)").setMinValue(1).setMaxValue(720))
    .addChannelOption((o) => o.setName("channel").setDescription("Channel to invite to").setChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create a poll")
    .addStringOption((o) => o.setName("question").setDescription("Poll question").setRequired(true))
    .addStringOption((o) => o.setName("options").setDescription("Options separated by commas").setRequired(true)),
  new SlashCommandBuilder()
    .setName("remind")
    .setDescription("Set a reminder")
    .addStringOption((o) => o.setName("time").setDescription("Time (e.g., 10m, 2h, 1d)").setRequired(true))
    .addStringOption((o) => o.setName("message").setDescription("Reminder message").setRequired(true)),
  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Create an announcement embed")
    .addChannelOption((o) => o.setName("channel").setDescription("Channel to announce in").addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption((o) => o.setName("title").setDescription("Announcement title").setRequired(true))
    .addStringOption((o) => o.setName("message").setDescription("Announcement message").setRequired(true))
    .addStringOption((o) => o.setName("color").setDescription("Hex color (e.g., #ff0000)")),
  new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Create a custom embed")
    .addStringOption((o) => o.setName("title").setDescription("Embed title").setRequired(true))
    .addStringOption((o) => o.setName("description").setDescription("Embed description").setRequired(true))
    .addStringOption((o) => o.setName("color").setDescription("Hex color"))
    .addStringOption((o) => o.setName("footer").setDescription("Footer text"))
    .addChannelOption((o) => o.setName("channel").setDescription("Channel to send to").addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Make the bot say something")
    .addStringOption((o) => o.setName("message").setDescription("Message to say").setRequired(true))
    .addChannelOption((o) => o.setName("channel").setDescription("Channel to send to").addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("Ask the magic 8-ball a question")
    .addStringOption((o) => o.setName("question").setDescription("Your question").setRequired(true)),
  new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Flip a coin"),
  new SlashCommandBuilder()
    .setName("dice")
    .setDescription("Roll a dice")
    .addIntegerOption((o) => o.setName("sides").setDescription("Number of sides (default 6)").setMinValue(2).setMaxValue(100)),
  new SlashCommandBuilder()
    .setName("random")
    .setDescription("Generate a random number")
    .addIntegerOption((o) => o.setName("min").setDescription("Minimum value").setRequired(true))
    .addIntegerOption((o) => o.setName("max").setDescription("Maximum value").setRequired(true)),
  new SlashCommandBuilder()
    .setName("quote")
    .setDescription("Get a random inspirational quote"),
  new SlashCommandBuilder()
    .setName("uptime")
    .setDescription("Show bot uptime"),
  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Show bot statistics across all servers"),
  new SlashCommandBuilder()
    .setName("ai")
    .setDescription("Chat with Orbitra AI")
    .addStringOption((o) => o.setName("prompt").setDescription("Your message to the AI").setRequired(true)),
  new SlashCommandBuilder()
    .setName("ai-image")
    .setDescription("Ask AI to describe/generate an image prompt")
    .addStringOption((o) => o.setName("prompt").setDescription("Image description").setRequired(true)),
  new SlashCommandBuilder()
    .setName("ai-code")
    .setDescription("Get AI help with code")
    .addStringOption((o) => o.setName("language").setDescription("Programming language").setRequired(true))
    .addStringOption((o) => o.setName("prompt").setDescription("What you need help with").setRequired(true)),
  new SlashCommandBuilder()
    .setName("ai-translate")
    .setDescription("Translate text using AI")
    .addStringOption((o) => o.setName("text").setDescription("Text to translate").setRequired(true))
    .addStringOption((o) => o.setName("language").setDescription("Target language").setRequired(true)),
  new SlashCommandBuilder()
    .setName("ai-summarize")
    .setDescription("Summarize text using AI")
    .addStringOption((o) => o.setName("text").setDescription("Text to summarize").setRequired(true)),
  new SlashCommandBuilder()
    .setName("ai-creative")
    .setDescription("AI creative writing (story, poem, etc)")
    .addStringOption((o) => o.setName("type").setDescription("Type: story, poem, joke, riddle").setRequired(true))
    .addStringOption((o) => o.setName("prompt").setDescription("Your prompt").setRequired(true)),
  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member from the server")
    .addUserOption((o) => o.setName("user").setDescription("User to kick").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for kick"))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member from the server")
    .addUserOption((o) => o.setName("user").setDescription("User to ban").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for ban"))
    .addIntegerOption((o) => o.setName("days").setDescription("Delete messages from last N days").setMinValue(0).setMaxValue(7))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user")
    .addStringOption((o) => o.setName("userid").setDescription("User ID to unban").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Timeout a member")
    .addUserOption((o) => o.setName("user").setDescription("User to mute").setRequired(true))
    .addIntegerOption((o) => o.setName("minutes").setDescription("Duration in minutes (default 10)").setMinValue(1).setMaxValue(40320))
    .addStringOption((o) => o.setName("reason").setDescription("Reason"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Remove timeout from a member")
    .addUserOption((o) => o.setName("user").setDescription("User to unmute").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member")
    .addUserOption((o) => o.setName("user").setDescription("User to warn").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for warning").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set slowmode on a channel")
    .addChannelOption((o) => o.setName("channel").setDescription("Channel").addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addIntegerOption((o) => o.setName("seconds").setDescription("Slowmode seconds (0 to disable)").setMinValue(0).setMaxValue(21600).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock a channel")
    .addChannelOption((o) => o.setName("channel").setDescription("Channel to lock").addChannelTypes(ChannelType.GuildText))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock a channel")
    .addChannelOption((o) => o.setName("channel").setDescription("Channel to unlock").addChannelTypes(ChannelType.GuildText))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Bulk delete messages")
    .addIntegerOption((o) => o.setName("count").setDescription("Number of messages to delete (max 100)").setMinValue(1).setMaxValue(100).setRequired(true))
    .addUserOption((o) => o.setName("user").setDescription("Only delete from this user"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName("nick")
    .setDescription("Change a member's nickname")
    .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true))
    .addStringOption((o) => o.setName("nickname").setDescription("New nickname (empty to reset)").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),
  new SlashCommandBuilder()
    .setName("role-add")
    .setDescription("Add a role to a user")
    .addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(true))
    .addRoleOption((o) => o.setName("role").setDescription("Role to add").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder()
    .setName("role-remove")
    .setDescription("Remove a role from a user")
    .addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(true))
    .addRoleOption((o) => o.setName("role").setDescription("Role to remove").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder()
    .setName("vc-move")
    .setDescription("Move a user to another voice channel")
    .addUserOption((o) => o.setName("user").setDescription("User to move").setRequired(true))
    .addChannelOption((o) => o.setName("channel").setDescription("Target voice channel").addChannelTypes(ChannelType.GuildVoice).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers),
  new SlashCommandBuilder()
    .setName("vc-disconnect")
    .setDescription("Disconnect a user from voice")
    .addUserOption((o) => o.setName("user").setDescription("User to disconnect").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers),
  new SlashCommandBuilder()
    .setName("nuke")
    .setDescription("Clone and recreate a channel (removes all messages)")
    .addChannelOption((o) => o.setName("channel").setDescription("Channel to nuke").addChannelTypes(ChannelType.GuildText))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder()
    .setName("timeout-log")
    .setDescription("Show recent moderation actions"),
  new SlashCommandBuilder()
    .setName("orbitra-list")
    .setDescription("Search servers on Orbitra")
    .addStringOption((o) => o.setName("query").setDescription("Search query").setRequired(true)),
  new SlashCommandBuilder()
    .setName("orbitra-bump")
    .setDescription("Bump your server on Orbitra")
    .addStringOption((o) => o.setName("slug").setDescription("Your server's slug").setRequired(true)),
  new SlashCommandBuilder()
    .setName("orbitra-stats")
    .setDescription("Show your Orbitra listing stats")
    .addStringOption((o) => o.setName("slug").setDescription("Your server's slug").setRequired(true)),
  new SlashCommandBuilder()
    .setName("setup-orbitra")
    .setDescription("Set up Orbitra integration for this server")
    .addChannelOption((o) => o.setName("announcements").setDescription("Channel for Orbitra announcements").addChannelTypes(ChannelType.GuildText))
    .addChannelOption((o) => o.setName("logs").setDescription("Channel for Orbitra logs").addChannelTypes(ChannelType.GuildText))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("weather")
    .setDescription("Get weather info for a location")
    .addStringOption((o) => o.setName("location").setDescription("City name").setRequired(true)),
  new SlashCommandBuilder()
    .setName("define")
    .setDescription("Define a word")
    .addStringOption((o) => o.setName("word").setDescription("Word to define").setRequired(true)),
  new SlashCommandBuilder()
    .setName("calculate")
    .setDescription("Calculate a math expression")
    .addStringOption((o) => o.setName("expression").setDescription("Math expression").setRequired(true)),
  new SlashCommandBuilder()
    .setName("color")
    .setDescription("Show a color preview")
    .addStringOption((o) => o.setName("hex").setDescription("Hex color (e.g., #ff5733)").setRequired(true)),
  new SlashCommandBuilder()
    .setName("banner")
    .setDescription("Get the server banner"),
  new SlashCommandBuilder()
    .setName("icon")
    .setDescription("Get the server icon"),
  new SlashCommandBuilder()
    .setName("emojis")
    .setDescription("List all custom emojis"),
  new SlashCommandBuilder()
    .setName("snipe")
    .setDescription("Show the last deleted message in this channel"),
  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show server activity leaderboard"),
  new SlashCommandBuilder()
    .setName("level")
    .setDescription("Check your level/rank")
    .addUserOption((o) => o.setName("user").setDescription("Check another user").setRequired(false)),
  new SlashCommandBuilder()
    .setName("afk")
    .setDescription("Set your AFK status")
    .addStringOption((o) => o.setName("reason").setDescription("AFK reason")),
  new SlashCommandBuilder()
    .setName("serverboost")
    .setDescription("Show server boost leaderboard"),
  new SlashCommandBuilder()
    .setName("voiceStats")
    .setDescription("Show voice channel statistics"),
  new SlashCommandBuilder()
    .setName("textStats")
    .setDescription("Show text channel statistics"),
  new SlashCommandBuilder()
    .setName("topChatters")
    .setDescription("Show top chatters in the server"),
  new SlashCommandBuilder()
    .setName("modmail")
    .setDescription("Send a message to server moderators")
    .addStringOption((o) => o.setName("message").setDescription("Your message to mods").setRequired(true)),
  new SlashCommandBuilder()
    .setName("report")
    .setDescription("Report a user to moderators")
    .addUserOption((o) => o.setName("user").setDescription("User to report").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for report").setRequired(true)),
  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Create a support ticket")
    .addStringOption((o) => o.setName("subject").setDescription("Ticket subject").setRequired(true))
    .addStringOption((o) => o.setName("description").setDescription("Ticket description").setRequired(true)),
  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Start a giveaway")
    .addStringOption((o) => o.setName("prize").setDescription("Prize").setRequired(true))
    .addIntegerOption((o) => o.setName("winners").setDescription("Number of winners").setMinValue(1).setMaxValue(20).setRequired(true))
    .addStringOption((o) => o.setName("duration").setDescription("Duration (e.g., 1h, 1d)").setRequired(true))
    .addStringOption((o) => o.setName("description").setDescription("Additional description")),
  new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Configure welcome message settings")
    .addChannelOption((o) => o.setName("channel").setDescription("Welcome channel").addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption((o) => o.setName("message").setDescription("Welcome message (use {user} for mention, {server} for server name)").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("autorole")
    .setDescription("Set auto-role for new members")
    .addRoleOption((o) => o.setName("role").setDescription("Role to auto-assign").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("log")
    .setDescription("View the audit log")
    .addIntegerOption((o) => o.setName("count").setDescription("Number of entries (default 10)").setMinValue(1).setMaxValue(50))
    .setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog),
  new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Create a backup of server settings"),
  new SlashCommandBuilder()
    .setName("restore")
    .setDescription("Restore server from backup")
    .addStringOption((o) => o.setName("backup-id").setDescription("Backup ID to restore").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("automation")
    .setDescription("List available automations"),
  new SlashCommandBuilder()
    .setName("starboard")
    .setDescription("Configure the starboard")
    .addChannelOption((o) => o.setName("channel").setDescription("Starboard channel").addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addIntegerOption((o) => o.setName("threshold").setDescription("Star threshold (default 5)").setMinValue(1).setMaxValue(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Configure auto-moderation")
    .addStringOption((o) =>
      o.setName("setting")
        .setDescription("Setting to toggle")
        .setRequired(true)
        .addChoices(
          { name: "Anti-spam", value: "antispam" },
          { name: "Anti-link", value: "antilink" },
          { name: "Anti-raid", value: "antiraid" },
          { name: "Word filter", value: "wordfilter" },
          { name: "Capitals filter", value: "capitals" },
          { name: "Link whitelist", value: "linkwhitelist" },
        ),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("tag")
    .setDescription("Create or use custom tags")
    .addStringOption((o) =>
      o.setName("action")
        .setDescription("Action to perform")
        .setRequired(true)
        .addChoices(
          { name: "Create tag", value: "create" },
          { name: "Delete tag", value: "delete" },
          { name: "List tags", value: "list" },
        ),
    )
    .addStringOption((o) => o.setName("name").setDescription("Tag name"))
    .addStringOption((o) => o.setName("content").setDescription("Tag content")),
  new SlashCommandBuilder()
    .setName("autoforum")
    .setDescription("Create a forum-style discussion thread")
    .addStringOption((o) => o.setName("title").setDescription("Discussion title").setRequired(true))
    .addStringOption((o) => o.setName("description").setDescription("Discussion description").setRequired(true))
    .addChannelOption((o) => o.setName("channel").setDescription("Forum channel").addChannelTypes(ChannelType.GuildForum)),
  new SlashCommandBuilder()
    .setName("suggest")
    .setDescription("Submit a suggestion")
    .addStringOption((o) => o.setName("suggestion").setDescription("Your suggestion").setRequired(true)),
  new SlashCommandBuilder()
    .setName("apply")
    .setDescription("Apply for a staff position")
    .addStringOption((o) => o.setName("position").setDescription("Position you're applying for").setRequired(true))
    .addStringOption((o) => o.setName("experience").setDescription("Your experience").setRequired(true)),
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Set the bot's status")
    .addStringOption((o) =>
      o.setName("status")
        .setDescription("Status to set")
        .setRequired(true)
        .addChoices(
          { name: "Online", value: "online" },
          { name: "Idle", value: "idle" },
          { name: "DND", value: "dnd" },
          { name: "Invisible", value: "invisible" },
        ),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("eval")
    .setDescription("Evaluate JavaScript code (owner only)")
    .addStringOption((o) => o.setName("code").setDescription("Code to evaluate").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("shutdown")
    .setDescription("Shutdown the bot (owner only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("reload")
    .setDescription("Reload bot commands (owner only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("sync")
    .setDescription("Force sync server stats to Orbitra")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("orbitra-link")
    .setDescription("Link this server to an Orbitra listing")
    .addStringOption((o) => o.setName("listing-id").setDescription("Your Orbitra listing ID or slug").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("leaderboard-global")
    .setDescription("Show global Orbitra leaderboard"),
  new SlashCommandBuilder()
    .setName("trending")
    .setDescription("Show trending servers on Orbitra"),
  new SlashCommandBuilder()
    .setName("featured")
    .setDescription("Show featured servers on Orbitra"),
];

const QUOTES = [
  "The only way to do great work is to love what you do. - Steve Jobs",
  "Innovation distinguishes between a leader and a follower. - Steve Jobs",
  "Stay hungry, stay foolish. - Steve Jobs",
  "Life is what happens when you're busy making other plans. - John Lennon",
  "The future belongs to those who believe in the beauty of their dreams. - Eleanor Roosevelt",
  "It does not matter how slowly you go as long as you do not stop. - Confucius",
  "In the middle of difficulty lies opportunity. - Albert Einstein",
  "Success is not final, failure is not fatal: it is the courage to continue that counts. - Winston Churchill",
  "Believe you can and you're halfway there. - Theodore Roosevelt",
  "The only impossible journey is the one you never begin. - Tony Robbins",
  "Everything you can imagine is real. - Pablo Picasso",
  "Do what you can, with what you have, where you are. - Theodore Roosevelt",
];

const EIGHT_BALL = [
  "It is certain.", "It is decidedly so.", "Without a doubt.",
  "Yes, definitely.", "You may rely on it.", "As I see it, yes.",
  "Most likely.", "Outlook good.", "Yes.", "Signs point to yes.",
  "Reply hazy, try again.", "Ask again later.",
  "Better not tell you now.", "Cannot predict now.",
  "Concentrate and ask again.", "Don't count on it.",
  "My reply is no.", "My sources say no.",
  "Outlook not so good.", "Very doubtful.",
];

const lastDeleted = new Map();
const userStats = new Map();
const warnings = new Map();
const afkUsers = new Map();
const customTags = new Map();
const serverConfig = new Map();
const starMessages = new Map();

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "OrbitraBot/1.0" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
        "User-Agent": "OrbitraBot/1.0",
      },
    }, (res) => {
      let responseData = "";
      res.on("data", (chunk) => { responseData += chunk; });
      res.on("end", () => resolve(responseData));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(" ");
}

function checkCooldown(userId) {
  if (!cooldowns.has(userId)) cooldowns.set(userId, new Collection());
  const userCooldowns = cooldowns.get(userId);
  const now = Date.now();
  if (userCooldowns.has("global")) {
    const exp = userCooldowns.get("global");
    if (now < exp) return { onCooldown: true, retryAfter: Math.ceil((exp - now) / 1000) };
  }
  userCooldowns.set("global", now + COOLDOWN_SECONDS * 1000);
  return { onCooldown: false };
}

function incrementStat(userId, guildId) {
  const key = `${guildId}:${userId}`;
  const current = userStats.get(key) || { messages: 0, commands: 0, lastActive: 0 };
  current.messages++;
  current.lastActive = Date.now();
  userStats.set(key, current);
}

function makeEmbed(interaction, opts) {
  const embed = new EmbedBuilder();
  if (opts.title) embed.setTitle(opts.title);
  if (opts.description) embed.setDescription(opts.description);
  if (opts.color) embed.setColor(opts.color);
  if (opts.footer) embed.setFooter({ text: opts.footer });
  if (opts.thumbnail) embed.setThumbnail(opts.thumbnail);
  if (opts.image) embed.setImage(opts.image);
  if (opts.fields) embed.addFields(opts.fields);
  embed.setTimestamp();
  return embed;
}

async function callAI(prompt, extras = {}) {
  try {
    const body = {
      feature: "discord",
      serverId: "",
      message: prompt,
      extras,
    };
    const raw = await httpPost(AI_API, body);
    const parsed = JSON.parse(raw);
    return parsed.content || parsed.message || "AI didn't return a response.";
  } catch (err) {
    return `AI error: ${err.message}`;
  }
}

async function syncServerStats(guild) {
  try {
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) return null;

    const guildData = await new Promise((resolve, reject) => {
      https.get(`https://discord.com/api/v10/guilds/${guild.id}?with_counts=true`, {
        headers: { Authorization: `Bot ${botToken}` },
      }, (res) => {
        let d = "";
        res.on("data", (c) => { d += c; });
        res.on("end", () => resolve(JSON.parse(d)));
      }).on("error", reject);
    });

    const channels = await guild.channels.fetch();
    const roles = await guild.roles.fetch();
    const textChannels = channels.filter((c) => c.type === ChannelType.GuildText);
    let totalMessages = 0;
    let recentJoins = 0;
    const weekAgo = Date.now() - 604800000;

    for (const [, ch] of textChannels) {
      try {
        const msgs = await ch.messages.fetch({ limit: 100 });
        const dayAgo = Date.now() - 86400000;
        totalMessages += msgs.filter((m) => m.createdTimestamp > dayAgo).size;
        recentJoins += msgs.filter((m) => m.member?.joinedTimestamp && m.member.joinedTimestamp > weekAgo).size;
      } catch {}
    }

    const online = guild.members.cache.filter((m) => m.presence?.status !== "offline").size;

    const stats = {
      memberCount: guild.memberCount || guildData.approximate_member_count || 0,
      onlineCount: online,
      channelCount: channels.size,
      roleCount: roles.size - 1,
      emojiCount: guild.emojis.cache.size,
      boostLevel: guild.premiumTier,
      messagesPerDay: Math.round(totalMessages / Math.max(textChannels.size, 1)),
      newMembersWeek: recentJoins,
      name: guild.name,
      icon: guild.iconURL({ dynamic: true, size: 256 }),
      banner: guild.bannerURL({ size: 512 }),
    };

    // Push stats to website
    try {
      const syncUrl = `${WEBSITE}/api/webhooks/discord/sync`;
      const syncBody = JSON.stringify({ discordId: guild.id, stats });
      const parsed = new URL(syncUrl);
      await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: parsed.hostname,
          port: 443,
          path: parsed.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(syncBody),
            "Authorization": `Bearer ${process.env.DISCORD_WEBHOOK_SECRET || "orbitra-sync-secret"}`,
          },
        }, (res) => {
          let d = "";
          res.on("data", (c) => { d += c; });
          res.on("end", () => resolve(d));
        });
        req.on("error", reject);
        req.write(syncBody);
        req.end();
      });
    } catch (syncErr) {
      console.error(`Stats push failed for ${guild.name}:`, syncErr.message);
    }

    return stats;
  } catch (err) {
    console.error(`Stats sync failed for ${guild.name}:`, err.message);
    return null;
  }
}

function getWarningCount(userId, guildId) {
  const key = `${guildId}:${userId}`;
  return warnings.get(key) || 0;
}

function addWarning(userId, guildId) {
  const key = `${guildId}:${userId}`;
  const count = (warnings.get(key) || 0) + 1;
  warnings.set(key, count);
  return count;
}

async function handleCommand(interaction) {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user, guild, member } = interaction;
  const cd = checkCooldown(user.id);
  if (cd.onCooldown) {
    return interaction.reply({ content: `Cooldown! Try again in ${cd.retryAfter}s.`, ephemeral: true });
  }

  incrementStat(user.id, guild?.id);

  try {
    switch (commandName) {
      case "ping": {
        const sent = await interaction.reply({ content: "Pinging...", fetchReply: true });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        const apiLatency = Math.round(client.ws.ping);
        const embed = makeEmbed(interaction, {
          title: "Pong!",
          color: 0x00ff88,
          fields: [
            { name: "Bot Latency", value: `${latency}ms`, inline: true },
            { name: "API Latency", value: `${apiLatency}ms`, inline: true },
            { name: "Uptime", value: formatUptime(client.uptime), inline: true },
          ],
        });
        return interaction.editReply({ content: null, embeds: [embed] });
      }

      case "help": {
        const categories = {
          "Info": ["ping", "help", "serverinfo", "userinfo", "avatar", "membercount", "channels", "roles", "boostinfo", "uptime", "stats", "emoji"],
          "AI": ["ai", "ai-image", "ai-code", "ai-translate", "ai-summarize", "ai-creative"],
          "Moderation": ["kick", "ban", "unban", "mute", "unmute", "warn", "purge", "slowmode", "lock", "unlock", "nick", "role-add", "role-remove"],
          "Utility": ["announce", "embed", "say", "poll", "remind", "invite", "vc-move", "vc-disconnect", "nuke", "snipe", "leaderboard", "level", "afk"],
          "Fun": ["8ball", "coinflip", "dice", "random", "quote", "define", "calculate", "color", "weather"],
          "Server Mgmt": ["welcome", "autorole", "starboard", "automod", "tag", "autoforum", "backup", "restore", "automation", "log", "setup-orbitra", "sync", "status", "reload", "shutdown"],
          "Support": ["modmail", "report", "ticket", "suggest", "apply"],
          "Events": ["giveaway", "voiceStats", "textStats", "topChatters"],
          "Orbitra": ["orbitra-list", "orbitra-bump", "orbitra-stats", "orbitra-link", "leaderboard-global", "trending", "featured"],
        };
        let desc = "";
        for (const [cat, cmds] of Object.entries(categories)) {
          desc += `**${cat}**\n${cmds.map((c) => `\`/${c}\``).join(", ")}\n\n`;
        }
        const embed = makeEmbed(interaction, {
          title: "Orbitra Bot Commands",
          description: desc,
          color: 0x7c3aed,
          footer: `Total: ${COMMANDS.length} commands | Use /command for details`,
        });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      case "serverinfo": {
        const g = guild;
        const embed = makeEmbed(interaction, {
          title: g.name,
          color: g.hexAccentColor || 0x7c3aed,
          thumbnail: g.iconURL({ dynamic: true, size: 256 }),
          fields: [
            { name: "ID", value: g.id, inline: true },
            { name: "Owner", value: `<@${g.ownerId}>`, inline: true },
            { name: "Members", value: `${g.memberCount}`, inline: true },
            { name: "Channels", value: `${g.channels.cache.size}`, inline: true },
            { name: "Roles", value: `${g.roles.cache.size}`, inline: true },
            { name: "Emojis", value: `${g.emojis.cache.size}`, inline: true },
            { name: "Boost Level", value: `${g.premiumTier}`, inline: true },
            { name: "Boosts", value: `${g.premiumSubscriptionCount || 0}`, inline: true },
            { name: "Created", value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true },
            { name: "Verification", value: `${g.verificationLevel}`, inline: true },
            { name: "Vanity URL", value: g.vanityURLCode ? `discord.gg/${g.vanityURLCode}` : "None", inline: true },
          ],
          footer: `Requested by ${user.tag}`,
        });
        if (g.bannerURL()) embed.setImage(g.bannerURL({ size: 512 }));
        return interaction.reply({ embeds: [embed] });
      }

      case "userinfo": {
        const target = interaction.options.getUser("user") || user;
        const member = await guild.members.fetch(target.id);
        const embed = makeEmbed(interaction, {
          title: target.tag,
          color: member.displayColor || 0x7c3aed,
          thumbnail: target.displayAvatarURL({ dynamic: true, size: 256 }),
          fields: [
            { name: "ID", value: target.id, inline: true },
            { name: "Nickname", value: member.nickname || "None", inline: true },
            { name: "Joined Server", value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
            { name: "Account Created", value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`, inline: true },
            { name: "Roles", value: member.roles.cache.map((r) => `<@&${r.id}>`).join(", ").slice(0, 1024) || "None", inline: false },
            { name: "Top Role", value: member.roles.highest.id === guild.id ? "None" : `<@&${member.roles.highest.id}>`, inline: true },
            { name: "Permissions", value: member.permissions.has(PermissionFlagsBits.Administrator) ? "Administrator" : `${member.permissions.toArray().length} permissions`, inline: true },
          ],
          footer: `Requested by ${user.tag}`,
        });
        return interaction.reply({ embeds: [embed] });
      }

      case "avatar": {
        const target = interaction.options.getUser("user") || user;
        const embed = makeEmbed(interaction, {
          title: `${target.tag}'s Avatar`,
          color: 0x7c3aed,
          image: target.displayAvatarURL({ dynamic: true, size: 512 }),
          footer: `Requested by ${user.tag}`,
        });
        return interaction.reply({ embeds: [embed] });
      }

      case "membercount": {
        const online = guild.members.cache.filter((m) => m.presence?.status === "online").size;
        const idle = guild.members.cache.filter((m) => m.presence?.status === "idle").size;
        const dnd = guild.members.cache.filter((m) => m.presence?.status === "dnd").size;
        const bots = guild.members.cache.filter((m) => m.user.bot).size;
        const embed = makeEmbed(interaction, {
          title: "Member Count",
          color: 0x00ff88,
          fields: [
            { name: "Total", value: `${guild.memberCount}`, inline: true },
            { name: "Humans", value: `${guild.memberCount - bots}`, inline: true },
            { name: "Bots", value: `${bots}`, inline: true },
            { name: "Online", value: `${online}`, inline: true },
            { name: "Idle", value: `${idle}`, inline: true },
            { name: "DND", value: `${dnd}`, inline: true },
          ],
        });
        return interaction.reply({ embeds: [embed] });
      }

      case "channels": {
        const types = { 0: "Text", 2: "Voice", 4: "Category", 5: "Announcement", 13: "Stage", 15: "Forum" };
        const grouped = {};
        for (const [, ch] of guild.channels.cache) {
          const type = types[ch.type] || "Other";
          if (!grouped[type]) grouped[type] = [];
          grouped[type].push(`<#${ch.id}>`);
        }
        let desc = "";
        for (const [type, chs] of Object.entries(grouped)) {
          desc += `**${type} (${chs.length})**\n${chs.join(", ")}\n\n`;
        }
        const embed = makeEmbed(interaction, { title: "Channels", description: desc.slice(0, 4096), color: 0x7c3aed });
        return interaction.reply({ embeds: [embed] });
      }

      case "roles": {
        const sorted = guild.roles.cache.sort((a, b) => b.position - a.position);
        const roleList = sorted.map((r) => `${r.name} (${r.members.size} members)`).join("\n");
        const embed = makeEmbed(interaction, { title: `Roles (${sorted.size})`, description: roleList.slice(0, 4096), color: 0x7c3aed });
        return interaction.reply({ embeds: [embed] });
      }

      case "boostinfo": {
        const embed = makeEmbed(interaction, {
          title: "Boost Info",
          color: 0xf47fff,
          fields: [
            { name: "Boost Level", value: `${guild.premiumTier}`, inline: true },
            { name: "Total Boosts", value: `${guild.premiumSubscriptionCount || 0}`, inline: true },
            { name: "Boosters", value: `${guild.premiumSubscriptionCount || 0}`, inline: true },
          ],
        });
        return interaction.reply({ embeds: [embed] });
      }

      case "invite": {
        const duration = interaction.options.getInteger("duration") || 24;
        const channel = interaction.options.getChannel("channel") || interaction.channel;
        const invite = await channel.createInvite({ maxAge: duration * 3600, maxUses: 0 });
        const embed = makeEmbed(interaction, {
          title: "Invite Created",
          description: `Expires in ${duration} hours\n${invite.url}`,
          color: 0x00ff88,
        });
        return interaction.reply({ embeds: [embed] });
      }

      case "poll": {
        const question = interaction.options.getString("question");
        const options = interaction.options.getString("options").split(",").map((o) => o.trim()).filter(Boolean);
        if (options.length < 2 || options.length > 10) {
          return interaction.reply({ content: "Provide 2-10 options separated by commas.", ephemeral: true });
        }
        const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
        let desc = "";
        options.forEach((opt, i) => { desc += `${emojis[i]} ${opt}\n`; });
        const embed = makeEmbed(interaction, { title: question, description: desc, color: 0xffa500, footer: `Poll by ${user.tag}` });
        const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
        for (let i = 0; i < options.length; i++) {
          await msg.react(emojis[i]);
        }
        return;
      }

      case "remind": {
        const timeStr = interaction.options.getString("time");
        const message = interaction.options.getString("message");
        const ms = parseTime(timeStr);
        if (!ms || ms < 1000 || ms > 604800000) {
          return interaction.reply({ content: "Invalid time. Use formats like 10m, 2h, 1d. Max 7 days.", ephemeral: true });
        }
        await interaction.reply({ content: `Reminder set for ${timeStr} from now.`, ephemeral: true });
        setTimeout(async () => {
          try {
            const ch = await client.channels.fetch(interaction.channelId);
            if (ch) ch.send({ content: `<@${user.id}> Reminder: ${message}` });
          } catch {}
        }, ms);
        return;
      }

      case "announce": {
        if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
          return interaction.reply({ content: "You need Manage Messages permission.", ephemeral: true });
        }
        const channel = interaction.options.getChannel("channel");
        const title = interaction.options.getString("title");
        const msg = interaction.options.getString("message");
        const color = interaction.options.getString("color") || "#7c3aed";
        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(msg)
          .setColor(parseInt(color.replace("#", ""), 16) || 0x7c3aed)
          .setFooter({ text: `Announcement by ${user.tag}` })
          .setTimestamp();
        await channel.send({ embeds: [embed] });
        return interaction.reply({ content: `Announcement sent to <#${channel.id}>!`, ephemeral: true });
      }

      case "embed": {
        const title = interaction.options.getString("title");
        const desc = interaction.options.getString("description");
        const color = interaction.options.getString("color") || "#7c3aed";
        const footer = interaction.options.getString("footer");
        const channel = interaction.options.getChannel("channel") || interaction.channel;
        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(desc)
          .setColor(parseInt(color.replace("#", ""), 16) || 0x7c3aed)
          .setTimestamp();
        if (footer) embed.setFooter({ text: footer });
        await channel.send({ embeds: [embed] });
        return interaction.reply({ content: `Embed sent to <#${channel.id}>!`, ephemeral: true });
      }

      case "say": {
        const msg = interaction.options.getString("message");
        const channel = interaction.options.getChannel("channel") || interaction.channel;
        await channel.send(msg);
        return interaction.reply({ content: "Message sent!", ephemeral: true });
      }

      case "8ball": {
        const question = interaction.options.getString("question");
        const answer = EIGHT_BALL[Math.floor(Math.random() * EIGHT_BALL.length)];
        const embed = makeEmbed(interaction, {
          title: "Magic 8-Ball",
          fields: [
            { name: "Question", value: question, inline: false },
            { name: "Answer", value: answer, inline: false },
          ],
          color: 0x1a1a2e,
        });
        return interaction.reply({ embeds: [embed] });
      }

      case "coinflip": {
        const result = Math.random() < 0.5 ? "Heads" : "Tails";
        const embed = makeEmbed(interaction, { title: "Coin Flip", description: `The coin landed on **${result}**!`, color: 0xffd700 });
        return interaction.reply({ embeds: [embed] });
      }

      case "dice": {
        const sides = interaction.options.getInteger("sides") || 6;
        const result = Math.floor(Math.random() * sides) + 1;
        const embed = makeEmbed(interaction, { title: "Dice Roll", description: `🎲 You rolled a **${result}** (d${sides})`, color: 0xff6b6b });
        return interaction.reply({ embeds: [embed] });
      }

      case "random": {
        const min = interaction.options.getInteger("min");
        const max = interaction.options.getInteger("max");
        if (min >= max) return interaction.reply({ content: "Min must be less than max.", ephemeral: true });
        const result = Math.floor(Math.random() * (max - min + 1)) + min;
        const embed = makeEmbed(interaction, { title: "Random Number", description: `**${result}** (between ${min} and ${max})`, color: 0x00bfff });
        return interaction.reply({ embeds: [embed] });
      }

      case "quote": {
        const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
        const embed = makeEmbed(interaction, { title: "Inspirational Quote", description: `"${quote}"`, color: 0xffd700 });
        return interaction.reply({ embeds: [embed] });
      }

      case "uptime": {
        const embed = makeEmbed(interaction, { title: "Uptime", description: formatUptime(client.uptime), color: 0x00ff88 });
        return interaction.reply({ embeds: [embed] });
      }

      case "stats": {
        const embed = makeEmbed(interaction, {
          title: "Orbitra Bot Stats",
          color: 0x7c3aed,
          fields: [
            { name: "Servers", value: `${client.guilds.cache.size}`, inline: true },
            { name: "Users", value: `${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}`, inline: true },
            { name: "Channels", value: `${client.channels.cache.size}`, inline: true },
            { name: "Uptime", value: formatUptime(client.uptime), inline: true },
            { name: "Commands", value: `${COMMANDS.length}`, inline: true },
            { name: "Ping", value: `${Math.round(client.ws.ping)}ms`, inline: true },
          ],
          footer: `Orbitra - ${WEBSITE}`,
        });
        return interaction.reply({ embeds: [embed] });
      }

      case "ai":
      case "ai-image":
      case "ai-code":
      case "ai-translate":
      case "ai-summarize":
      case "ai-creative": {
        await interaction.deferReply();
        let prompt = interaction.options.getString("prompt");
        if (commandName === "ai-code") {
          const lang = interaction.options.getString("language");
          prompt = `Help me with ${lang} code: ${prompt}`;
        } else if (commandName === "ai-translate") {
          const lang = interaction.options.getString("language");
          prompt = `Translate to ${lang}: ${prompt}`;
        } else if (commandName === "ai-creative") {
          const type = interaction.options.getString("type");
          prompt = `Write a ${type}: ${prompt}`;
        }
        const response = await callAI(prompt, { source: "discord", userId: user.id, guildId: guild?.id });
        const chunks = response.match(/[\s\S]{1,1900}/g) || [response];
        await interaction.editReply({ content: chunks[0] || "No response." });
        for (let i = 1; i < chunks.length; i++) {
          await interaction.followUp({ content: chunks[i] });
        }
        return;
      }

      case "kick": {
        const target = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason") || "No reason provided";
        const targetMember = await guild.members.fetch(target.id).catch(() => null);
        if (!targetMember) return interaction.reply({ content: "User not found in this server.", ephemeral: true });
        if (!targetMember.kickable) return interaction.reply({ content: "I cannot kick this user.", ephemeral: true });
        await targetMember.kick(reason);
        const embed = makeEmbed(interaction, {
          title: "Member Kicked",
          color: 0xff6b6b,
          fields: [
            { name: "User", value: `${target.tag} (${target.id})`, inline: true },
            { name: "Moderator", value: `${user.tag}`, inline: true },
            { name: "Reason", value: reason, inline: false },
          ],
        });
        return interaction.reply({ embeds: [embed] });
      }

      case "ban": {
        const target = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason") || "No reason provided";
        const days = interaction.options.getInteger("days") || 0;
        const targetMember = await guild.members.fetch(target.id).catch(() => null);
        if (!targetMember) return interaction.reply({ content: "User not found in this server.", ephemeral: true });
        if (!targetMember.bannable) return interaction.reply({ content: "I cannot ban this user.", ephemeral: true });
        await targetMember.ban({ deleteMessageDays: days, reason });
        const embed = makeEmbed(interaction, {
          title: "Member Banned",
          color: 0xff0000,
          fields: [
            { name: "User", value: `${target.tag} (${target.id})`, inline: true },
            { name: "Moderator", value: `${user.tag}`, inline: true },
            { name: "Reason", value: reason, inline: false },
            { name: "Messages Deleted", value: `${days} days`, inline: true },
          ],
        });
        return interaction.reply({ embeds: [embed] });
      }

      case "unban": {
        const userId = interaction.options.getString("userid");
        await guild.members.unban(userId);
        return interaction.reply({ content: `User ${userId} has been unbanned.`, ephemeral: true });
      }

      case "mute": {
        const target = interaction.options.getUser("user");
        const minutes = interaction.options.getInteger("minutes") || 10;
        const reason = interaction.options.getString("reason") || "No reason provided";
        const targetMember = await guild.members.fetch(target.id).catch(() => null);
        if (!targetMember) return interaction.reply({ content: "User not found.", ephemeral: true });
        if (!targetMember.moderatable) return interaction.reply({ content: "I cannot mute this user.", ephemeral: true });
        await targetMember.timeout(minutes * 60 * 1000, reason);
        const embed = makeEmbed(interaction, {
          title: "Member Muted",
          color: 0xffa500,
          fields: [
            { name: "User", value: `${target.tag}`, inline: true },
            { name: "Duration", value: `${minutes} minutes`, inline: true },
            { name: "Reason", value: reason, inline: false },
          ],
        });
        return interaction.reply({ embeds: [embed] });
      }

      case "unmute": {
        const target = interaction.options.getUser("user");
        const targetMember = await guild.members.fetch(target.id).catch(() => null);
        if (!targetMember) return interaction.reply({ content: "User not found.", ephemeral: true });
        await targetMember.timeout(null);
        return interaction.reply({ content: `${target.tag} has been unmuted.`, ephemeral: true });
      }

      case "warn": {
        const target = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason");
        const count = addWarning(target.id, guild.id);
        const embed = makeEmbed(interaction, {
          title: "Member Warned",
          color: 0xffa500,
          fields: [
            { name: "User", value: `${target.tag}`, inline: true },
            { name: "Warnings", value: `${count}`, inline: true },
            { name: "Reason", value: reason, inline: false },
          ],
        });
        return interaction.reply({ embeds: [embed] });
      }

      case "slowmode": {
        const channel = interaction.options.getChannel("channel");
        const seconds = interaction.options.getInteger("seconds");
        await channel.setRateLimitPerUser(seconds);
        return interaction.reply({ content: `Slowmode set to ${seconds} seconds in <#${channel.id}>.`, ephemeral: true });
      }

      case "lock": {
        const channel = interaction.options.getChannel("channel") || interaction.channel;
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
        return interaction.reply({ content: `<#${channel.id}> has been locked.`, ephemeral: true });
      }

      case "unlock": {
        const channel = interaction.options.getChannel("channel") || interaction.channel;
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
        return interaction.reply({ content: `<#${channel.id}> has been unlocked.`, ephemeral: true });
      }

      case "purge": {
        const count = interaction.options.getInteger("count");
        const targetUser = interaction.options.getUser("user");
        await interaction.deferReply({ ephemeral: true });
        let deleted = 0;
        const fetchOpts = { limit: 100 };
        if (targetUser) fetchOpts.before = interaction.id;
        let messages = await interaction.channel.messages.fetch(fetchOpts);
        if (targetUser) messages = messages.filter((m) => m.author.id === targetUser.id);
        const toDelete = messages.first(count);
        if (toDelete && toDelete.length) {
          const deletedMsgs = await interaction.channel.bulkDelete(toDelete, true);
          deleted = deletedMsgs.size;
        }
        return interaction.editReply({ content: `Deleted ${deleted} messages.` });
      }

      case "nick": {
        const target = interaction.options.getUser("user");
        const nickname = interaction.options.getString("nickname");
        const targetMember = await guild.members.fetch(target.id).catch(() => null);
        if (!targetMember) return interaction.reply({ content: "User not found.", ephemeral: true });
        await targetMember.setNickname(nickname || null);
        return interaction.reply({ content: `Nickname updated for ${target.tag}.`, ephemeral: true });
      }

      case "role-add": {
        const target = interaction.options.getUser("user");
        const role = interaction.options.getRole("role");
        const targetMember = await guild.members.fetch(target.id).catch(() => null);
        if (!targetMember) return interaction.reply({ content: "User not found.", ephemeral: true });
        await targetMember.roles.add(role);
        return interaction.reply({ content: `Added <@&${role.id}> to ${target.tag}.`, ephemeral: true });
      }

      case "role-remove": {
        const target = interaction.options.getUser("user");
        const role = interaction.options.getRole("role");
        const targetMember = await guild.members.fetch(target.id).catch(() => null);
        if (!targetMember) return interaction.reply({ content: "User not found.", ephemeral: true });
        await targetMember.roles.remove(role);
        return interaction.reply({ content: `Removed <@&${role.id}> from ${target.tag}.`, ephemeral: true });
      }

      case "vc-move": {
        const target = interaction.options.getUser("user");
        const channel = interaction.options.getChannel("channel");
        const targetMember = await guild.members.fetch(target.id).catch(() => null);
        if (!targetMember) return interaction.reply({ content: "User not found.", ephemeral: true });
        if (!targetMember.voice.channel) return interaction.reply({ content: "User is not in a voice channel.", ephemeral: true });
        await targetMember.voice.setChannel(channel);
        return interaction.reply({ content: `Moved ${target.tag} to <#${channel.id}>.`, ephemeral: true });
      }

      case "vc-disconnect": {
        const target = interaction.options.getUser("user");
        const targetMember = await guild.members.fetch(target.id).catch(() => null);
        if (!targetMember) return interaction.reply({ content: "User not found.", ephemeral: true });
        if (!targetMember.voice.channel) return interaction.reply({ content: "User is not in a voice channel.", ephemeral: true });
        await targetMember.voice.disconnect();
        return interaction.reply({ content: `Disconnected ${target.tag}.`, ephemeral: true });
      }

      case "nuke": {
        const channel = interaction.options.getChannel("channel") || interaction.channel;
        const newChannel = await channel.clone();
        await channel.delete();
        await newChannel.send({ content: `Channel nuked by ${user.tag}` });
        return interaction.reply({ content: `Channel has been nuked.`, ephemeral: true });
      }

      case "snipe": {
        const deleted = lastDeleted.get(interaction.channelId);
        if (!deleted) return interaction.reply({ content: "No recently deleted messages found.", ephemeral: true });
        const embed = makeEmbed(interaction, {
          title: "Sniped Message",
          description: deleted.content || "No content",
          color: 0xff6b6b,
          fields: [
            { name: "Author", value: `<@${deleted.authorId}>`, inline: true },
            { name: "Deleted At", value: `<t:${Math.floor(deleted.timestamp / 1000)}:R>`, inline: true },
          ],
        });
        return interaction.reply({ embeds: [embed] });
      }

      case "leaderboard": {
        const guildStats = [];
        for (const [key, stats] of userStats) {
          const [gId, uId] = key.split(":");
          if (gId === guild.id) {
            guildStats.push({ userId: uId, ...stats });
          }
        }
        guildStats.sort((a, b) => b.messages - a.messages);
        const top10 = guildStats.slice(0, 10);
        if (!top10.length) return interaction.reply({ content: "No activity data yet.", ephemeral: true });
        let desc = "";
        top10.forEach((s, i) => {
          const medals = ["🥇", "🥈", "🥉"];
          desc += `${medals[i] || `${i + 1}.`} <@${s.userId}> — ${s.messages} messages, ${s.commands} commands\n`;
        });
        const embed = makeEmbed(interaction, { title: "Leaderboard", description: desc, color: 0xffd700 });
        return interaction.reply({ embeds: [embed] });
      }

      case "level": {
        const target = interaction.options.getUser("user") || user;
        const key = `${guild.id}:${target.id}`;
        const stats = userStats.get(key) || { messages: 0, commands: 0 };
        const level = Math.floor(Math.sqrt(stats.messages / 10));
        const embed = makeEmbed(interaction, {
          title: `${target.tag}'s Level`,
          color: 0x7c3aed,
          fields: [
            { name: "Level", value: `${level}`, inline: true },
            { name: "Messages", value: `${stats.messages}`, inline: true },
            { name: "Commands", value: `${stats.commands}`, inline: true },
          ],
        });
        return interaction.reply({ embeds: [embed] });
      }

      case "afk": {
        const reason = interaction.options.getString("reason") || "AFK";
        afkUsers.set(user.id, { reason, timestamp: Date.now() });
        return interaction.reply({ content: `You are now AFK: ${reason}`, ephemeral: true });
      }

      case "weather": {
        const location = interaction.options.getString("location");
        await interaction.deferReply();
        try {
          const data = JSON.parse(await httpGet(`https://wttr.in/${encodeURIComponent(location)}?format=j1`));
          const current = data.current_condition?.[0];
          if (!current) return interaction.editReply("Could not find weather data.");
          const embed = makeEmbed(interaction, {
            title: `Weather in ${location}`,
            color: 0x00bfff,
            fields: [
              { name: "Temperature", value: `${current.temp_C}°C / ${current.temp_F}°F`, inline: true },
              { name: "Feels Like", value: `${current.FeelsLikeC}°C`, inline: true },
              { name: "Condition", value: current.weatherDesc?.[0]?.value || "Unknown", inline: true },
              { name: "Humidity", value: `${current.humidity}%`, inline: true },
              { name: "Wind", value: `${current.windspeedKmph} km/h ${current.winddir16Point}`, inline: true },
            ],
          });
          return interaction.editReply({ embeds: [embed] });
        } catch {
          return interaction.editReply("Could not fetch weather data.");
        }
      }

      case "define": {
        const word = interaction.options.getString("word");
        await interaction.deferReply();
        try {
          const data = JSON.parse(await httpGet(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`));
          const entry = data[0];
          if (!entry) return interaction.editReply("Word not found.");
          const meaning = entry.meanings?.[0];
          const def = meaning?.definitions?.[0]?.definition || "No definition found.";
          const embed = makeEmbed(interaction, {
            title: entry.word,
            description: def,
            color: 0x7c3aed,
            fields: [
              { name: "Part of Speech", value: meaning?.partOfSpeech || "Unknown", inline: true },
              { name: "Phonetic", value: entry.phonetic || "N/A", inline: true },
            ],
          });
          return interaction.editReply({ embeds: [embed] });
        } catch {
          return interaction.editReply("Could not find that word.");
        }
      }

      case "calculate": {
        const expr = interaction.options.getString("expression");
        try {
          const sanitized = expr.replace(/[^0-9+\-*/().%\s]/g, "");
          if (!sanitized) return interaction.reply({ content: "Invalid expression.", ephemeral: true });
          const result = Function(`"use strict"; return (${sanitized})`)();
          const embed = makeEmbed(interaction, {
            title: "Calculator",
            color: 0x00bfff,
            fields: [
              { name: "Expression", value: expr, inline: false },
              { name: "Result", value: `${result}`, inline: false },
            ],
          });
          return interaction.reply({ embeds: [embed] });
        } catch {
          return interaction.reply({ content: "Invalid math expression.", ephemeral: true });
        }
      }

      case "color": {
        const hex = interaction.options.getString("hex");
        const clean = hex.replace("#", "");
        if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
          return interaction.reply({ content: "Invalid hex color. Use format: #ff5733", ephemeral: true });
        }
        const embed = new EmbedBuilder()
          .setTitle(`Color: #${clean}`)
          .setColor(parseInt(clean, 16))
          .setDescription(`RGB: ${parseInt(clean.slice(0, 2), 16)}, ${parseInt(clean.slice(2, 4), 16)}, ${parseInt(clean.slice(4, 6), 16)}`)
          .setImage(`https://singlecolorimage.com/get/${clean}/200x200`);
        return interaction.reply({ embeds: [embed] });
      }

      case "banner": {
        const embed = makeEmbed(interaction, {
          title: "Server Banner",
          color: 0x7c3aed,
          image: guild.bannerURL({ size: 512 }),
        });
        if (!guild.bannerURL()) return interaction.reply({ content: "This server has no banner.", ephemeral: true });
        return interaction.reply({ embeds: [embed] });
      }

      case "icon": {
        const embed = makeEmbed(interaction, {
          title: "Server Icon",
          color: 0x7c3aed,
          image: guild.iconURL({ dynamic: true, size: 512 }),
        });
        return interaction.reply({ embeds: [embed] });
      }

      case "emojis": {
        const emojiList = guild.emojis.cache.map((e) => `${e} :${e.name}:`).join("\n");
        if (!emojiList) return interaction.reply({ content: "No custom emojis.", ephemeral: true });
        const embed = makeEmbed(interaction, {
          title: `Emojis (${guild.emojis.cache.size})`,
          description: emojiList.slice(0, 4096),
          color: 0x7c3aed,
        });
        return interaction.reply({ embeds: [embed] });
      }

      case "orbitra-list": {
        await interaction.deferReply();
        const query = interaction.options.getString("query");
        const embed = makeEmbed(interaction, {
          title: "Search Orbitra",
          description: `Search for **${query}** on Orbitra:\n${WEBSITE}/discover?q=${encodeURIComponent(query)}`,
          color: 0x7c3aed,
        });
        return interaction.editReply({ embeds: [embed] });
      }

      case "orbitra-bump": {
        return interaction.reply({ content: `Bump your server at: ${WEBSITE}/dashboard/servers`, ephemeral: true });
      }

      case "orbitra-stats": {
        return interaction.reply({ content: `View your stats at: ${WEBSITE}/dashboard/servers`, ephemeral: true });
      }

      case "setup-orbitra": {
        if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          return interaction.reply({ content: "You need Manage Server permission.", ephemeral: true });
        }
        const annChannel = interaction.options.getChannel("announcements");
        const logChannel = interaction.options.getChannel("logs");
        serverConfig.set(guild.id, {
          announcements: annChannel?.id || null,
          logs: logChannel?.id || null,
        });
        const embed = makeEmbed(interaction, {
          title: "Orbitra Setup Complete",
          color: 0x00ff88,
          fields: [
            { name: "Announcements", value: annChannel ? `<#${annChannel.id}>` : "Not set", inline: true },
            { name: "Logs", value: logChannel ? `<#${logChannel.id}>` : "Not set", inline: true },
            { name: "Dashboard", value: `${WEBSITE}/dashboard/servers`, inline: false },
          ],
        });
        return interaction.reply({ embeds: [embed] });
      }

      case "sync": {
        if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          return interaction.reply({ content: "You need Manage Server permission.", ephemeral: true });
        }
        await interaction.deferReply();
        const stats = await syncServerStats(guild);
        if (!stats) return interaction.editReply("Failed to sync stats.");
        const embed = makeEmbed(interaction, {
          title: "Stats Synced",
          color: 0x00ff88,
          fields: [
            { name: "Members", value: `${stats.memberCount}`, inline: true },
            { name: "Online", value: `${stats.onlineCount}`, inline: true },
            { name: "Channels", value: `${stats.channelCount}`, inline: true },
            { name: "Roles", value: `${stats.roleCount}`, inline: true },
            { name: "Emojis", value: `${stats.emojiCount}`, inline: true },
            { name: "Boost Level", value: `${stats.boostLevel}`, inline: true },
            { name: "Messages/Day", value: `${stats.messagesPerDay}`, inline: true },
          ],
        });
        return interaction.editReply({ embeds: [embed] });
      }

      default: {
        return interaction.reply({ content: `Command \`${commandName}\` is under development.`, ephemeral: true });
      }
    }
  } catch (err) {
    console.error(`Command ${commandName} error:`, err);
    const reply = { content: "An error occurred executing this command.", ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
}

function parseTime(str) {
  const match = str.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;
  const val = parseInt(match[1]);
  const unit = match[2];
  switch (unit) {
    case "s": return val * 1000;
    case "m": return val * 60000;
    case "h": return val * 3600000;
    case "d": return val * 86400000;
    default: return null;
  }
}

let lastCount = 0;

async function updateActivity() {
  const guilds = client.guilds.cache.size;
  if (guilds === lastCount) return;
  lastCount = guilds;
  try {
    client.user.setPresence({
      activities: [{
        type: ActivityType.Watching,
        name: `${guilds} server${guilds !== 1 ? "s" : ""} | orbitra.gg`,
        url: WEBSITE,
      }],
      status: "online",
    });
    console.log(`[${new Date().toISOString()}] Watching ${guilds} servers | orbitra.gg`);
  } catch (err) {
    console.error("Activity error:", err.message);
  }
}

async function registerCommands() {
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    console.log(`Registering ${COMMANDS.length} slash commands...`);
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: COMMANDS.map((c) => c.toJSON()) });
    console.log(`Registered ${COMMANDS.length} commands successfully.`);
  } catch (err) {
    console.error("Command registration failed:", err.message);
  }
}

client.on(Events.MessageDelete, (msg) => {
  if (msg.author?.bot) return;
  lastDeleted.set(msg.channel.id, {
    content: msg.content,
    authorId: msg.author?.id,
    timestamp: Date.now(),
  });
  setTimeout(() => lastDeleted.delete(msg.channel.id), 300000);
});

client.on(Events.MessageCreate, (msg) => {
  if (msg.author.bot) return;
  incrementStat(msg.author.id, msg.guild?.id);

  const afk = afkUsers.get(msg.author.id);
  if (afk) {
    afkUsers.delete(msg.author.id);
    msg.reply(`Welcome back! You were AFK for ${formatUptime(Date.now() - afk.timestamp)}: ${afk.reason}`).catch(() => {});
  }

  if (msg.mentions.users.has(client.user.id)) {
    callAI(msg.content.replace(/<@!?\d+>/g, "").trim(), { source: "discord-mention", userId: msg.author.id, guildId: msg.guild?.id })
      .then((response) => {
        const chunks = response.match(/[\s\S]{1,1900}/g) || [response];
        msg.reply(chunks[0]).catch(() => {});
        for (let i = 1; i < chunks.length; i++) {
          msg.channel.send(chunks[i]).catch(() => {});
        }
      })
      .catch(() => msg.reply("AI is currently unavailable. Try again later.").catch(() => {}));
  }

  for (const [userId, afkData] of afkUsers) {
    if (msg.mentions.users.has(userId)) {
      msg.reply(`${(client.users.cache.get(userId))?.tag || "User"} is AFK: ${afkData.reason}`).catch(() => {});
    }
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  const config = serverConfig.get(member.guild.id);
  if (config?.announcements) {
    try {
      const ch = await member.guild.channels.fetch(config.announcements);
      if (ch) {
        const embed = new EmbedBuilder()
          .setTitle("Welcome!")
          .setDescription(`Welcome to **${member.guild.name}**, ${member}! You are member #${member.guild.memberCount}.`)
          .setColor(0x00ff88)
          .setThumbnail(member.displayAvatarURL({ dynamic: true }))
          .setTimestamp();
        ch.send({ embeds: [embed] }).catch(() => {});
      }
    } catch {}
  }
  syncServerStats(member.guild).catch(() => {});
});

client.on(Events.GuildMemberRemove, (member) => {
  syncServerStats(member.guild).catch(() => {});
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.emoji.name === "⭐" && reaction.message.channel.type === ChannelType.GuildText) {
    const count = reaction.count;
    if (count >= 5) {
      const config = serverConfig.get(reaction.message.guild?.id);
      if (config?.starboard) {
        try {
          const starChannel = await reaction.message.guild.channels.fetch(config.starboard);
          if (starChannel) {
            const embed = new EmbedBuilder()
              .setTitle("Starred Message")
              .setDescription(reaction.message.content || "No content")
              .setAuthor({ name: reaction.message.author.tag, iconURL: reaction.message.author.displayAvatarURL() })
              .setColor(0xffd700)
              .setFooter({ text: `${count} ⭐` })
              .setTimestamp();
            starChannel.send({ embeds: [embed] }).catch(() => {});
          }
        } catch {}
      }
    }
  }
});

client.once(Events.ClientReady, async () => {
  console.log(`[${new Date().toISOString()}] Logged in as ${client.user.tag}`);
  await registerCommands();
  updateActivity();
  setInterval(updateActivity, 30_000);

  setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      syncServerStats(guild).catch(() => {});
    }
  }, 300000);
});

client.on(Events.GuildCreate, () => updateActivity());
client.on(Events.GuildDelete, () => updateActivity());
client.on(Events.InteractionCreate, handleCommand);

process.on("unhandledRejection", (err) => {
  console.error("Unhandled:", err);
});

client.login(TOKEN).catch((err) => {
  console.error("Login failed:", err.message);
  process.exit(1);
});
