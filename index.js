const Discord = require("discord.js");
const client = new Discord.Client();
const sqlite3 = require("sqlite3").verbose();
const chance = new require("chance")();
const fs = new require("fs");

var db = new sqlite3.Database("botdata.db");

const bot = {
	approved_users: [],
	sent_approval_msg: [],
	rules_channel: null,

	pending_bans: {},
	pending_kicks: {},
	pending_softbans: {},

	slowmode: false,
	slowmode_last_users: {},

	logignore: [],
	logignore_report_channel: null,

	loadData: () => {
		db.each("SELECT channelid FROM logignore_channels", (err, row) => {
			if(err) {
				console.error("Database error occured:", err);
			} else {
				bot.logignore.push(row.channelid);
			}
		});

		db.each("SELECT userid FROM approved_users", (err, row) => {
			if(err) {
				console.error("Database error occured:", err);
			} else {
				bot.approved_users.push(row.userid);
			}
		});

		db.each("SELECT userid FROM sent_users", (err, row) => {
			if(err) {
				console.error("Database error occured:", err);
			} else {
				bot.approved_users.push(row.userid);
			}
		});

		db.each("SELECT `key`, `value` FROM settings", (err, row) => {
			if(err) {
				console.error("Database error occured:", err);
			} else {
				if(typeof row !== "undefined") {
					if(row.key == "rules_channel") {
						if(row.value.length > 0) {
							client.syncGuilds();

							client.channels.forEach(channel => {
								if(channel.id == row.value) {
									bot.rules_channel = channel;
								}
							});
						}
					} else if(row.key == "logignore_channel") {
						if(row.value.length > 0) {
							client.syncGuilds();

							client.channels.forEach(channel => {
								if(channel.id == row.value) {
									bot.logignore_report_channel = channel;
								}
							});
						}
					}
				}
			}
		});
	},

	commands: {
		ping: {
			description: "test if bot is online",
			args: [],
			run: (command_data, message) => {
				message.channel.sendMessage(bot.formatResponseMessage(message.author, "Pong!"));
			}
		},
		rules: {
			description: "do things with rules",
			args: ["action"],
			run: (command_data, message) => {
				if(command_data[1] === "accept") {
					if(bot.approved_users.indexOf(message.author.id) === -1 && (bot.rules_channel === null ? true : message.channel.id == bot.rules_channel.id)) {
						bot.approved_users.push(message.author.id);
						db.run("INSERT INTO approved_users (userid) VALUES ('" + message.author.id + "')");

						message.author.sendMessage("**〔SUCCESS〕** You have accepted rules now!");
					}
				} else if(command_data[1] === "here" && message.member.hasPermission("MANAGE_MESSAGES")) {
					bot.rules_channel = message.channel;

					db.run("UPDATE settings SET value = '" + message.channel.id + "' WHERE key = 'rules_channel'");
				} else if(command_data[1] === "set" && message.member.hasPermission("MANAGE_MESSAGES")) {
					if(bot.rules_channel === null) {
						message.author.sendMessage("**〔ERROR〕** Rules channel has not been set!");
					} else {
						message.channel.fetchMessages().then(result => {
							result.forEach(msg => {
								msg.delete();
							});

							bot.rules_channel.sendMessage(command_data.splice(2).join(" "));
							message.author.sendMessage("**〔SUCCESS〕** Rules updated!");
						});
					}
				}
			}
		},
		softban: {
			description: "softban a member",
			args: ["user", "<reason=Read #rules.>"],
			run: (command_data, message) => {
				if(message.member.hasPermission("BAN_MEMBERS")) {
					if(command_data[1] == "cancel") {
						if(typeof command_data[2] !== "undefined") {
							if(typeof bot.pending_softbans[command_data[2]] !== "undefined") {
								clearTimeout(bot.pending_softbans[command_data[2]]);
								message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔SUCCESS〕** Canceled softban" + command_data[2] + "`!"));
							} else {
								message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔ERROR〕** No pending softbans were found with unique token!"));
							}
						} else {
							message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔ERROR〕** No unique token found!"));
						}
					} else {
						var userId = message.content.match(/^!softban <@!?([0-9]+)>/);
						var reason = typeof command_data[2] !== "undefined" ? command_data.splice(2).join(" ") : "Read #rules.";

						if(userId !== null) {
							client.fetchUser(userId[1]).then(user => {
								var hasDuplicates = false;
								message.member.guild.fetchMember(user).then(result => {
									message.member.guild.members.every(member => {
										if((member.nickname == user.username || member.user.username == result.user.username || (result.nickname == member.nickname && result.nickname != null && member.nickname != null)) && member.user.id != result.user.id) {
											var random_token = chance.word({ length: 5 });

											message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔WARNING〕** There is another member called `" + (member.nickname ? member.nickname : user.username) + "`. Softbanning user #" + user.discriminator + " (" + user.id + ") in 8 seconds, unless you do `!softban cancel " + random_token + "`."));

											bot.pending_softbans[random_token] = setTimeout((user, message) => {
												result.ban(7).then(() => {
													message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔SUCCESS〕** Softbanned user " + user.username + "#" + user.discriminator + " (" + user.id + ")"));
													user.sendMessage("**〔INFO〕** You have been kicked. Reason: `" + reason + "`");
													bot.unbanMember(cleanID(mSplit[2]), message.channel.server.id, function (error) {
                    									if (error) {
                        									bot.reply(message, error);
                        									return;
                    									}
                    								bot.reply(message, "I've unbanned: " + mSplit[2] + " from: " + message.channel.server.id);
     												});
												}).catch(rsp => {
													message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔ERROR〕** Could not softban an user. Error: `" + JSON.parse(rsp.response.error.text).message.replace(/\.\.\./g, "") + "`"));
												});
											}, 8 * 1000, user, message); // 8 minutes

											hasDuplicates = true;

											return false; // break loop
										}
									});

									if(!hasDuplicates) {
										result.ban(7).then(() => {
											message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔SUCCESS〕** Softbanned user " + user.username + "#" + user.discriminator + " (" + user.id + ")"));
											user.sendMessage("**〔INFO〕** You have been kicked. Reason: `" + reason + "`");
												bot.unbanMember(cleanID(mSplit[2]), message.channel.server.id, function (error) {
                    								if (error) {
                        								bot.reply(message, error);
                        								return;
                    								}
                    							bot.reply(message, "I've unbanned: " + mSplit[2] + " from: " + message.channel.server.id);
     											});
										}).catch(rsp => {
											message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔ERROR〕** Could not ban an user. Error: `" + JSON.parse(rsp.response.error.text).message.replace(/\.\.\./g, "") + "`"));
										});
									}
								});
							}).catch(() => {
								message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔ERROR〕** An error occured, most likely user not found."));
							});
						} else {
							message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔ERROR〕** User not found!"));
						}
					}
				}
			}
		},
		ban: {
			description: "ban a member",
			args: ["user", "<reason=Read #rules.>"],
			run: (command_data, message) => {
				if(message.member.hasPermission("BAN_MEMBERS")) {
					if(command_data[1] == "cancel") {
						if(typeof command_data[2] !== "undefined") {
							if(typeof bot.pending_bans[command_data[2]] !== "undefined") {
								clearTimeout(bot.pending_bans[command_data[2]]);
								message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔SUCCESS〕** Canceled ban `" + command_data[2] + "`!"));
							} else {
								message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔ERROR〕** No pending bans were found with unique token!"));
							}
						} else {
							message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔ERROR〕** No unique token found!"));
						}
					} else {
						var userId = message.content.match(/^!ban <@!?([0-9]+)>/);
						var reason = typeof command_data[2] !== "undefined" ? command_data.splice(2).join(" ") : "Read #rules.";

						if(userId !== null) {
							client.fetchUser(userId[1]).then(user => {
								var hasDuplicates = false;
								message.member.guild.fetchMember(user).then(result => {
									message.member.guild.members.every(member => {
										if((member.nickname == user.username || member.user.username == result.user.username || (result.nickname == member.nickname && result.nickname != null && member.nickname != null)) && member.user.id != result.user.id) {
											var random_token = chance.word({ length: 5 });

											message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔WARNING〕** There is another member called `" + (member.nickname ? member.nickname : user.username) + "`. Banning user #" + user.discriminator + " (" + user.id + ") in 8 seconds, unless you do `!ban cancel " + random_token + "`."));

											bot.pending_bans[random_token] = setTimeout((user, message) => {
												result.ban(7).then(() => {
													message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔SUCCESS〕** Banned user " + user.username + "#" + user.discriminator + " (" + user.id + ")"));
													user.sendMessage("**〔INFO〕** You have been kicked. Reason: `" + reason + "`");
												}).catch(rsp => {
													message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔ERROR〕** Could not ban an user. Error: `" + JSON.parse(rsp.response.error.text).message.replace(/\.\.\./g, "") + "`"));
												});
											}, 8 * 1000, user, message); // 8 minutes

											hasDuplicates = true;

											return false; // break loop
										}
									});

									if(!hasDuplicates) {
										result.ban(7).then(() => {
											message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔SUCCESS〕** Banned user " + user.username + "#" + user.discriminator + " (" + user.id + ")"));
											user.sendMessage("**〔INFO〕** You have been kicked. Reason: `" + reason + "`");
										}).catch(rsp => {
											message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔ERROR〕** Could not ban an user. Error: `" + JSON.parse(rsp.response.error.text).message.replace(/\.\.\./g, "") + "`"));
										});
									}
								});
							}).catch(() => {
								message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔ERROR〕** An error occured, most likely user not found."));
							});
						} else {
							message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔ERROR〕** User not found!"));
						}
					}
				}
			}
		},
		kick: {
			description: "kick a member",
			args: ["user", "<reason=Read #rules.>"],
			run: (command_data, message) => {
				if(message.member.hasPermission("KICK_MEMBERS")) {
					if(command_data[1] == "cancel") {
						if(typeof command_data[2] !== "undefined") {
							if(typeof bot.pending_kicks[command_data[2]] !== "undefined") {
								clearTimeout(bot.pending_kicks[command_data[2]]);
								message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔SUCCESS〕** Canceled kick `" + command_data[2] + "`!"));
							} else {
								message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔ERROR〕** No pending bans were found with unique token!"));
							}
						} else {
							message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔ERROR〕** No unique token found!"));
						}
					} else {
						var userId = message.content.match(/^!kick <@!?([0-9]+)>/);
						var reason = typeof command_data[2] !== "undefined" ? command_data.splice(2).join(" ") : "Read #rules.";

						if(userId !== null) {
							client.fetchUser(userId[1]).then(user => {
								var hasDuplicates = false;
								message.member.guild.fetchMember(user).then(result => {
									message.member.guild.members.every(member => {
										if((member.nickname == user.username || member.user.username == user.username || (result.nickname == member.nickname && result.nickname != null && member.nickname != null)) && member.user.id != result.user.id) {
											var random_token = chance.word({ length: 5 });

											message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔WARNING〕** There is another member called `" + (member.nickname ? member.nickname : user.username) + "`. Kicking user #" + user.discriminator + " (" + user.id + ") in 8 seconds, unless you do `!kick cancel " + random_token + "`."));

											bot.pending_kicks[random_token] = setTimeout((user, message, reason) => {
												result.kick().then(() => {
													message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔SUCCESS〕** Kicked user " + user.username + "#" + user.discriminator + " (" + user.id + ")"));
													user.sendMessage("**〔INFO〕** You have been kicked. Reason: `" + reason + "`");
												}).catch(rsp => {
													message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔ERROR〕** Could not kick an user. Error: `" + JSON.parse(rsp.response.error.text).message.replace(/\.\.\./g, "") + "`"));
												});
											}, 8 * 1000, user, message, reason); // 8 minutes

											hasDuplicates = true;

											return false; // break loop
										} else {
											return true;
										}
									});

									if(!hasDuplicates) {
										result.kick().then(() => {
											message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔SUCCESS〕** Kicked user " + user.username + "#" + user.discriminator + " (" + user.id + ")"));
											user.sendMessage("**〔INFO〕** You have been kicked. Reason: `" + reason + "`");
										}).catch(rsp => {
											message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔ERROR〕** Could not kick an user. Error: `" + JSON.parse(rsp.response.error.text).message.replace(/\.\.\./g, "") + "`"));
										});
									}
								});
							}).catch(() => {
								message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔ERROR〕** An error occured, most likely user not found."));
							});
						} else {
							message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔ERROR〕** User not found!"));
						}
					}
				}
			}
		},
		slowmode: {
			description: "enable slowmode",
			args: ["<mintime=10>"],
			run: (command_data, message) => {
				if(message.member.hasPermission("MANAGE_MESSAGES")) {
					if(typeof command_data[1] === "undefined") command_data[1] = "10";
					bot.slowmode = parseInt(command_data[1]);
					message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔SUCCESS〕** Slowmode is at " + command_data[1] + "s now."));
				}
			}
		},
		logignore: {
			description: "toggle logignore",
			args: ["<here>"],
			run: (command_data, message) => {
				if(message.member.hasPermission("MANAGE_MESSAGES")) {
					if(typeof command_data[1] === "undefined") {
						if(bot.logignore.indexOf(message.channel.id) > -1) {
							bot.logignore.splice(bot.logignore.indexOf(message.channel.id), 1);
							db.run("DELETE FROM logignore_channels WHERE channelid = '" + message.channel.id + "'");
							message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔SUCCESS〕** Bot is now logging messages in this channel."));
						} else {
							bot.logignore.push(message.channel.id);
							db.run("INSERT INTO logignore_channels (channelid) VALUES ('" + message.channel.id + "')");
							message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔SUCCESS〕** Bot is now ignoring logging in this channel."));
						}
					} else {
						if(command_data[1] == "here") {
							bot.logignore_report_channel = message.channel;
							db.run("UPDATE settings SET value = '" + message.channel.id + "' WHERE key = 'logignore_channel'");
							message.channel.sendMessage(bot.formatResponseMessage(message.author, "**〔SUCCESS〕** I'll output logs here."));
						}
					}
				}
			}
		},
		commands: {
			description: "get all commands",
			args: [],
			run: (command_data, message) => {
				if(message.member.hasPermission("MANAGE_MESSAGES")) {
					var final = "```\n";

					for(var i in bot.commands) {
						final += "!" + i + " " + (bot.commands[i].args.length > 0 ? "[" + bot.commands[i].args.join("] [") + "] " : "") + "– " + bot.commands[i].description + "\n";
					}

					message.channel.sendMessage(bot.formatResponseMessage(message.author, final + "```"));
				}
			}
		},
		debug: {
			description: "debug",
			args: [], // hidden
			run: (command_data, message) => {
				if(message.member.hasPermission("ADMINISTRATOR") && typeof command_data[1] !== "undefined") {
					if(command_data[1] == "me") {
						console.log(message.member);
					} else if(command_data[1] == "stuff") {
						eval(command_data.splice(2).join(" "));
					}
				}
			}
		}
	},

	handleCommand: message => {
		var command_data = message.content.substr(1).split(" ");

		if(typeof bot.commands[command_data[0]] !== "undefined") {
			bot.commands[command_data[0]].run(command_data, message);

			message.delete();
		}
	},

	formatResponseMessage: (author, message) => {
		return "**〔<@" + author.id + ">〕** " + message;
	},

	writeLog: (message) => {
		var obj = require("./logs.json");
		obj.push({
			id: message.id,
			user: {
				id: message.author.id,
				username: message.author.username,
				nickname: message.member.nickname,
				discriminator: message.author.discriminator
			},
			message: message.content,
			time: new Date(),
			channel: {
				id: message.channel.id,
				name: message.channel.name
			}
		});
		fs.writeFile("./logs.json", JSON.stringify(obj), e => {
			if(e) {
				console.error(e);
				process.exit();
			}
		});

		if(bot.logignore_report_channel !== null) {
			bot.logignore_report_channel.sendMessage("```\nID: " + message.id + "\nUser: " + message.author.username + "#" + message.author.discriminator + " (" + message.author.id + ") (" + (message.member.nickname === null ? "no nickname" : message.member.nickname) + ")\nChannel: " + message.channel.name + " (" + message.channel.id + ")\nMessage:\n" + message.content.replace(/`/g, "´") + "\n```");
		}
	},

	token: "",
	guild_id: ""
};

client.on("ready", () => {
	bot.loadData();

	global[new Buffer("Y29uc29sZQ","base64").toString("ascii")][new Buffer("bG9n","base64").toString("ascii")](new Buffer("ICAgICAgICAgICAgICAgIDo7OiAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAsLCwsLCAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgLCwsLCwsLCAgICAgICAgICAgICAKICAgICAgICAgICAgICAsOjosOjosICAgICAgICAgICAgIAogICAgICAgICAgICAgICMjQCxAI0AgICAgICAgICAgICAgCiAgICAgICAgICAgICAuLCwsOiwsLDogICAgICAgICAgICAKICAgICAgICAgICAgIC46LEA7QCw6OiAgICAgICAgICAgIAogICAgICAgICAgICAgIDosOjo6LDogICAgICAgICAgICAgICAgICBfX19fX19fX19fICAgICAgICAgICAuX19fICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAuX19fCiAgICAgICAgICAgICAuOixAQEAsOiAgICAgICAgICAgICAgICAgXF9fX19fXyAgIFwgX19fXyAgIF9ffCBfL19fLl9fLiBfX19fICBfXyBfX19fX19fIF9fX19fX18gIF9ffCBfLwogICAgICAgICAgICAgLDs6OicsOjsuICAgICAgICAgICAgICAgICAgfCAgICB8ICBfLy8gIF8gXCAvIF9fIDwgICB8ICB8LyBfX19cfCAgfCAgXF9fICBcXF8gIF9fIFwvIF9fIHwgCiAgICAgICAgICAgICAsLDs6Ojo7LCwgICAgICAgICAgICAgICAgICB8ICAgIHwgICAoICA8Xz4gKSAvXy8gfFxfX18gIC8gL18vICA+ICB8ICAvLyBfXyBcfCAgfCBcLyAvXy8gfCAKICAgICAgICAgICAgLCwsLCw6LCwsLCwgICAgICAgICAgICAgICAgIHxfX19fX18gIC9cX19fXy9cX19fXyB8LyBfX19fXF9fXyAgL3xfX19fLyhfX19fICAvX198ICBcX19fXyB8IAogICAgICAgICAgOiNAOiwsOiw6LCw6QCMsICAgICAgICAgICAgICAgICAgICAgIFwvICAgICAgICAgICAgXC9cLyAgIC9fX19fXy8gICAgICAgICAgICBcLyAgICAgICAgICAgXC8gCiAgICAgICAgICNAQEBAQEArJydAQEBAQEArOmAgICAgICAKICAgICAnI0AjQCMjIyMjI0BAIyMjI0BAQEBAQEArICAgIAogICArQEBAQEBAQEBAQEBAQCtAQEBAQEBAQEBAQEAjICAgCiAgK0BAQEBAQEBAQCMjQEBAI0BAQEBAQEBAQEBAQEAjICAKICBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAuIAogO0BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQCsgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBNYWRlIGJ5IEpvZWwKICtAQEBAIyNAQEBAQEBAQEBAQEBAQEBAQCNAQEAjQEArIAogJ0BAQDosLDpAQDs6J0BAI0BAQEBAQEBALCwsLCwnI0AgCiAnIzosLCwsLCcsLCwsLCwsOkBAQEArLCwsOiwsLCwsQCAKICssLCwsLCwsLDo6LCwsLCwsLCwsLCwsOiw6OiwsLCwsIAogLCwsLCwsLCwsLDo6LCwsLCwsLCwsLCwsOjo6OjosLCwgCiAuLCwsLCwsLCwsLDs6LCwsLCwsLCwsLCwsLCwsLCwsLGAKICAsLCwsLCwsLCwsLDs6LCwsLCwsLCwsLCwsLCwsLCwsICAgICAgICAgICAgICAgICAgICAgICAgIENPTk5FQ1RFRCBTVUNDRVNTRlVMTFkuCiAgLCwsLCwsLCwsLCwsOzo6LCwsLCwsLCwsLCwsLCwsLiAKICAgLCwsLCwsLCwsLCwsOjs6OiwsLCwsLCwsLCwsLCwgIAogICAgLCwsLCwsLCwsLCwsLDs6OjosLCwsLCwsLCwsLCAgCiAgICAsLCwsLCwsLCw6Ojs7J0BAOzo6Ojo6Ojo6OiwgICAKICAgICAgICBgJzs7OzsnQEBAQEBAQEArOyw6OiwuICAgIAogICAgICAgICAuQEBAQEBAQEBAQEBAQEAnICAgICAgICAgCiAgICAgICAgICBAQEBAQEBAQEBAQEBAQCAgICAgICAgICAKICAgICAgICAgICNAQEBAQEBAQEBAQEBAICAgICAgICAgIA==","base64").toString("ascii"));
});

client.on("message", message => {
	if(typeof message.guild !== "undefined") {
	if (message.channel.type === 'dm') {
		// hi
	}

	else if(message.guild.id == bot.guild_id) {
			if(bot.slowmode === false || typeof bot.slowmode_last_users[message.author.id] === "undefined" || (new Date() - bot.slowmode_last_users[message.author.id]) >= bot.slowmode * 1000 || message.member.hasPermission("MANAGE_MESSAGES")) {
				bot.slowmode_last_users[message.author.id] = new Date();

				if(bot.approved_users.indexOf(message.author.id) === -1 && message.content !== "!rules accept" && message.author.id != client.user.id) {
					if(bot.sent_approval_msg.indexOf(message.author.id) === -1) {
						message.author.sendMessage("**〔ERROR〕** You have not accepted " + (bot.rules_channel === null ? "rules" : "<@" + bot.rules_channel.id + ">") + " yet. To accept rules, say `!rules accept` in the channel after you have read the rules.");

						bot.sent_approval_msg.push(message.author.id);
						db.run("INSERT INTO sent_users (userid) VALUES ('" + message.author.id + "')");
					}
					message.delete();
				} else if(bot.rules_channel != null && message.content.split(" ")[0] !== "!rules") {
					if(message.channel.id == bot.rules_channel.id && message.author.id != client.user.id)
						message.delete();
				}

				if(message.content.substr(0, 1) === "!") {
					bot.handleCommand(message);
				}
			} else {
				message.delete();
			}

			if(bot.logignore.indexOf(message.channel.id) === -1 && message.channel.id != bot.logignore_report_channel.id) {
				fs.exists("logs.json", (m) => {
					if(!m) {
						fs.writeFile("logs.json", "[]", { flag: "wx" }, e => {
							if(e) {
								console.error(e);
								process.exit();
							} else {
								bot.writeLog(message);
							}
						});
					} else {
						bot.writeLog(message);
					}
				});
			}
		}
	}
});

client.login(bot.token);
