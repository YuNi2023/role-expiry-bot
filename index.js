require('dotenv').config();
require('./health'); // / で ok を返す

const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder } = require('discord.js');
const { DateTime } = require('luxon');
const Store = require('./store'); // ← 追加

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

function isAdmin(interaction) {
  return interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  setInterval(checkAndRevokeExpired, 60_000); // 60秒ごとに期限チェック
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (!isAdmin(interaction)) {
    return interaction.reply({ content: 'Admin権限が必要です。', ephemeral: true });
  }

  const { commandName } = interaction;

  if (commandName === 'grantaccess') {
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const roleName = interaction.options.getString('role_name', true);
      const chs = [
        interaction.options.getChannel('channel_1', true),
        interaction.options.getChannel('channel_2', false),
        interaction.options.getChannel('channel_3', false)
      ].filter(Boolean);

      const expiresInput = interaction.options.getString('expires_at', true);
      // "2025-11-01 00:00 JST" or "2025-11-01 00:00"
      let dt = DateTime.fromFormat(expiresInput.replace('JST','').trim(), 'yyyy-MM-dd HH:mm', { zone: 'Asia/Tokyo' });
      if (!dt.isValid) {
        return interaction.reply({ content: '期限の形式が不正です（例: 2025-11-01 00:00 JST）', ephemeral: true });
      }
      const expiresUtc = dt.toUTC();

      const guild = interaction.guild;
      const role = await guild.roles.create({ name: roleName, reason: `grantaccess by ${interaction.user.tag}` });

      // 閲覧のみ権限
      for (const ch of chs) {
        await ch.permissionOverwrites.edit(role, {
          ViewChannel: true,
          ReadMessageHistory: true,
          SendMessages: false,
          AddReactions: false,
          SendMessagesInThreads: false,
          CreatePublicThreads: false,
          CreatePrivateThreads: false,
          AttachFiles: false,
          EmbedLinks: false,
          MentionEveryone: false
        }).catch(() => {});
      }

      // JSONに登録
      Store.add({
        role_id: role.id,
        guild_id: guild.id,
        name: roleName,
        channel_ids: chs.map(c => c.id),
        expires_at_utc: expiresUtc.toISO(),
        created_by: interaction.user.id,
        created_at_utc: DateTime.utc().toISO()
      });

      // 初回付与（任意）
      const members = [
        interaction.options.getUser('member_1'),
        interaction.options.getUser('member_2'),
        interaction.options.getUser('member_3')
      ].filter(Boolean);
      for (const u of members) {
        const m = await guild.members.fetch(u.id).catch(() => null);
        if (m) await m.roles.add(role).catch(() => {});
      }

      const embed = new EmbedBuilder()
        .setTitle('ロール作成・付与 完了')
        .setDescription(`**${roleName}** を作成しました。`)
        .addFields(
          { name: '期限(UTC)', value: expiresUtc.toISO(), inline: true },
          { name: '期限(JST)', value: dt.toFormat('yyyy-LL-dd HH:mm ZZZZ'), inline: true },
          { name: '対象チャンネル', value: chs.map(c => `<#${c.id}>`).join(' ') || 'なし' }
        )
        .setColor(0x57F287);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'assign') {
      const role = interaction.options.getRole('role', true);
      const rec = Store.get(role.id);
      if (!rec) {
        return interaction.reply({ content: 'このロールはBOT管理外です。/grantaccess create で作成したロールのみ追加付与できます。', ephemeral: true });
      }
      const guild = interaction.guild;
      const members = [
        interaction.options.getUser('member_1'),
        interaction.options.getUser('member_2'),
        interaction.options.getUser('member_3')
      ].filter(Boolean);

      for (const u of members) {
        const m = await guild.members.fetch(u.id).catch(() => null);
        if (m) await m.roles.add(role).catch(() => {});
      }
      return interaction.reply({ content: `追加付与完了：${role.name}`, ephemeral: true });
    }
  }

  if (commandName === 'listaccess') {
    const rows = Store.listByGuild(interaction.guildId);
    if (!rows.length) return interaction.reply({ content: '管理対象ロールはありません。', ephemeral: true });
    const lines = rows.map(r => {
      const jst = DateTime.fromISO(r.expires_at_utc, { zone: 'utc' }).setZone('Asia/Tokyo').toFormat('yyyy-LL-dd HH:mm ZZZZ');
      const chans = r.channel_ids.map(id => `<#${id}>`).join(' ');
      return `• **${r.name}** (<@&${r.role_id}>) 期限: ${jst} / CH: ${chans}`;
    });
    return interaction.reply({ content: lines.join('\n'), ephemeral: true });
  }

  if (commandName === 'revokeexpired') {
    const n = await checkAndRevokeExpired();
    return interaction.reply({ content: `期限切れチェック完了：${n}件処理`, ephemeral: true });
  }
});

async function checkAndRevokeExpired() {
  const now = DateTime.utc();
  const rows = Store.listByGuild; // 使いやすいように下で全ギルド処理

  // 全ギルド分まとめて処理（単一サーバー運用想定）
  const all = require('./store').listByGuild; // ダミー参照回避用
  let processed = 0;

  // Storeに直接アクセスして全件取りたいので require し直さず、store.jsに補助を追加してもOK
  const fs = require('fs'); const path = require('path');
  const DB_PATH = path.join(__dirname, 'roles.json');
  const data = (() => { try { return JSON.parse(fs.readFileSync(DB_PATH,'utf8')); } catch { return {roles:[]}; } })();

  for (const r of data.roles.slice()) {
    if (DateTime.fromISO(r.expires_at_utc) > now) continue;

    const guild = await client.guilds.fetch(r.guild_id).catch(() => null);
    if (!guild) { removeRec(r.role_id); processed++; continue; }

    const role = await guild.roles.fetch(r.role_id).catch(() => null);
    if (role) {
      for (const [, member] of role.members) {
        await member.roles.remove(role).catch(() => {});
      }
      await role.delete('Expired & cleaned by bot').catch(() => {});
    }
    removeRec(r.role_id);
    processed++;
  }
  return processed;

  function removeRec(roleId) {
    const idx = data.roles.findIndex(x => x.role_id === roleId);
    if (idx >= 0) { data.roles.splice(idx, 1); fs.writeFileSync(DB_PATH, JSON.stringify(data)); }
  }
}

client.login(process.env.DISCORD_TOKEN);
