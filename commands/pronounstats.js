module.exports = {
  name: 'pronounstats',
  description: "Shows the stats for how many people are using pronoun roles on your server",
  usage: '',
  cooldown: 3,
  guildOnly: true,
  staffOnly: true,
  args: false,
async execute(message, args, client) {

  function round (number) {
    return Math.round(((number*100) + Number.EPSILON) * 100) / 100;
  }

  let pronounStats = new Map();
  let content = "__**Pronoun Role Usage:**__\n";
  let totalRolesApplied = 0;
  const fullMemberList = await message.guild.members.fetch();
  //Detect pronoun roles by searching for ones with a slash in them. Might update this later to let people exclude certain roles ig? This is fine for our purposes right now
  const pronounRoles = await message.guild.roles.cache.filter(role => role.name.includes("/") || role.name.toLowerCase().includes("pronoun")).sort((a, b) => a.name.localeCompare(b.name));
  //Get total # of members with and without at least one pronoun role
  const membersWithPronounRoles = await message.guild.members.cache.filter(u => u.roles.cache.find(r => pronounRoles.find(pronounRole => pronounRole === r)) && !u.user.bot).size;
  const membersWithoutPronounRoles = await message.guild.members.cache.filter(u => !u.roles.cache.find(r => pronounRoles.find(pronounRole => pronounRole === r)) && !u.user.bot).size;

  //Iterate through each pronoun role to get the stats for it
  for (curRole of pronounRoles) {
    curRole = curRole[1];
    //Create a new collection without the current role (for exclusive sizing)
    const otherRoles = pronounRoles.filter(r => r.name !== curRole.name);
    //Get the number of members with this pronoun role and no others
    const exclusiveSize = curRole.members.filter(user => !user.roles.cache.some(r => otherRoles.find(otherRole => otherRole === r))).size;
    //Increment the total # of roles applied (non-exclusive)
    totalRolesApplied += curRole.members.size;
    //Make sure we avoid any roles with pronoun in them that have 0 members
    if (curRole.members.size > 0) {
      //Assign each value to an object to retrieve below, so that we can print them once totalRolesApplied is done calculating
      pronounStats[curRole.id] = new Object();
      pronounStats[curRole.id]["Name"] = curRole.name;
      pronounStats[curRole.id]["Size"] = curRole.members.size;
      pronounStats[curRole.id]["Exclusive"] = exclusiveSize;
    }
  }
  //Print 'em out!
  for (role in pronounStats) {
    role = pronounStats[role];
    const member = (role.Size == 1) ? "member" : "members";
    const exclMembers = (role.Exclusive == 1) ? "member" : "members";
    content +=
    `> **${role["Name"]}**: ${role.Size} ${member} (${round(role.Size/totalRolesApplied)}%)
    > - Exclusive: ${role.Exclusive} ${exclMembers} (${round(role.Exclusive/membersWithPronounRoles)}%)\n\n`;
  }

  //More stats
  content += "__**Server Pronoun Role Stats:**__\n";
  content += 
  `> Total Applied: ${totalRolesApplied}
  > Members with: ${membersWithPronounRoles}
  > Members without: ${membersWithoutPronounRoles}
  > Total Server Members: ${fullMemberList.size}`;
  
  //And, send
  message.channel.send(content);
}
};