// store.js
const fs = require('fs');
const path = require('path');
const DB_PATH = path.join(__dirname, 'roles.json');

function load() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch (_) { return { roles: [] }; }
}
function save(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data));
}

const db = { data: load(), save() { save(this.data); } };

module.exports = {
  add(rec) {
    db.data.roles.push(rec); db.save();
  },
  listByGuild(guildId) {
    return db.data.roles.filter(r => r.guild_id === guildId);
  },
  get(roleId) {
    return db.data.roles.find(r => r.role_id === roleId);
  },
  remove(roleId) {
    db.data.roles = db.data.roles.filter(r => r.role_id !== roleId);
    db.save();
  }
};
