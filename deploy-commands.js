require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, ChannelType } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('grantaccess')
    .setDescription('ロール作成/付与（Admin専用）')
    .addSubcommand(sc =>
      sc.setName('create')
        .setDescription('新規ロールを作成し、期限と閲覧チャンネルを設定して付与')
        // 必須は先に
        .addStringOption(o => o.setName('role_name').setDescription('ロール名（例: Active-2025-10）').setRequired(true))
        .addChannelOption(o => o.setName('channel_1').setDescription('対象チャンネル1').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addStringOption(o => o.setName('expires_at').setDescription('期限（例: 2025-11-01 00:00 JST）').setRequired(true))
        // 任意は後ろ
        .addChannelOption(o => o.setName('channel_2').setDescription('対象チャンネル2（任意）').addChannelTypes(ChannelType.GuildText))
        .addChannelOption(o => o.setName('channel_3').setDescription('対象チャンネル3（任意）').addChannelTypes(ChannelType.GuildText))
        .addUserOption(o => o.setName('member_1').setDescription('付与するメンバー1（任意）'))
        .addUserOption(o => o.setName('member_2').setDescription('付与するメンバー2（任意）'))
        .addUserOption(o => o.setName('member_3').setDescription('付与するメンバー3（任意）'))
    )
    .addSubcommand(sc =>
      sc.setName('assign')
        .setDescription('既存のBOT管理ロールを追加メンバーに付与')
        .addRoleOption(o => o.setName('role').setDescription('既存ロール').setRequired(true))
        .addUserOption(o => o.setName('member_1').setDescription('付与するメンバー1').setRequired(true))
        .addUserOption(o => o.setName('member_2').setDescription('付与するメンバー2'))
        .addUserOption(o => o.setName('member_3').setDescription('付与するメンバー3'))
    )
    .toJSON(),
  new SlashCommandBuilder().setName('listaccess').setDescription('BOT管理ロール一覧（Admin専用）').toJSON(),
  new SlashCommandBuilder().setName('revokeexpired').setDescription('期限切れロールの即時剥奪/削除を実行（Admin専用）').toJSON()
];

const rest = new (require('@discordjs/rest').REST)({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );
  console.log('Slash commands deployed.');
})();
