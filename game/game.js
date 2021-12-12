var {Player} = require('./player.js');
var globals = require('./globals.js');
const fs = require("fs");

function shuffle(a) {
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

function saveData(obj) {
	var string = JSON.stringify(obj);
	fs.writeFile('data/save.json', string, finished);
	function finished(err) { if (err != null) console.log(err) };
	console.log("Data Saved");
};

class Game {
	constructor(io, id, admin, data) {
		this.io = io;
		this.id = id;
		this.admin = admin;
		this.data = data;

		this.isPrivate = true;
		this.withPowers = false;
		this.waitingForChoice = [];
		this.timerType = 0;
		this.timer = null;

		this.players = {};
		this.order = [];
		this.spawns = [];
		this.turn = -1;
		this.round = 1;
		this.map = [];
		this.layer = [];
		this.moveList = [];

		this.defaults = {
			height: 10,
			width: 10,
			wallAmount: 2,
			timer: 30
		};
		this.settings = {
			height: null,
			width: null,
			wallAmount: null,
			timer: null
		};
		this.settingsConditions = {
			height: x => x >= 4 && x % 2 == 0,
			width: x => x >= 4 && x % 2 == 0,
			wallAmount: x => x >= 0,
			timer: x => x >= 10 && x <= 9999
		};

		this.version = "9.2";
		this.initialMap = "";
	}

	inside(x, y) {
		return y >= 0 && y < this.settings.height && x >= 0 && x < this.settings.width
	}

	sendPlayerList() {
		this.defaults.height = this.defaults.width = Math.max(10, 6 + 2 * this.order.length);
		this.defaults.wallAmount = Math.max(2, 1 + Math.floor(this.order.length / 2));

		this.io.in(this.id).emit("update gamestate", {playerList: Object.values(this.players).map(e => { return {id: e.id, username: e.username, ready: e.ready, orderIndex: this.order.indexOf(e.id), index: e.index, score: e.score, power: e.emoji} }), admin: this.admin, defaults: this.defaults});
	}

	clearLayer() {
		for (var [y, row] of this.layer.entries()) {
			for (var [x, tile] of row.entries()) {
				this.layer[y][x] = "";
			}
		}
	}

	async startGame() {
		this.order = shuffle(this.order);

		for (var i = 0; i < this.order.length; i ++) {
			var id = this.order[i];
			this.players[id].index = i;
			this.players[id].ready = false;
		}

		this.settings = Object.keys(this.settings).reduce((a, e) => { a[e] = (this.settings[e] ? this.settings[e] : this.defaults[e]); return a }, {});
		this.createMap();

		this.turn = 0;

		this.updateScores();

		const sockets = await this.io.in(this.id).fetchSockets();
		for (var s of sockets) {
			s.emit("update gamestate", {selfTurn: this.order.indexOf(s.id), map: this.map, layer: this.layer, turn: this.turn, round: this.round, moveList: this.moveList});
		}

		if (this.timerType) {
			for (var id of this.order) this.players[id].timer = this.settings.timer;
			this.io.in(this.id).emit("timers", this.order.map(e => this.players[e].timer));
		}
		this.io.in(this.id).emit("ready", false);
	}

	createMap() {
		this.map = [];
		this.layer = [];
		this.moveList = [[""]];

		for (var y = 0; y < this.settings.height; y ++) {
			this.map.push([])
			this.layer.push([]);
			for (var x = 0; x < this.settings.width; x ++) {
				this.map[y].push(-1) // -1 = vide, -2 = mur
				this.layer[y].push("");
			}
		}

		function check_bloating(self, map) {
			for (var y = 0; y < map.length; y++) {
				for (var x = 0; x < map[y].length; x++) {
					var count = 0;
					for (var dy = -1; dy <= 1; dy++) {
						for (var dx = -1; dx <= 1; dx++) {
							if (self.inside(x + dx, y + dy)) if (map[y + dy][x + dx] == -2) count += 1;
						}
					}

					if (count >= 2) return false;
				}
			}

			return true;
		}

		var new_map = null;
		do {
			new_map = JSON.parse(JSON.stringify(this.map));

			for (var my = 0; my < this.settings.height; my += this.settings.height/2) {
				for (var mx = 0; mx < this.settings.width; mx += this.settings.width/2) {
					for (var i = 0; i < this.settings.wallAmount; i++) {
						while (true) {
							y = my + Math.floor(Math.random() * this.settings.height/2)
							x = mx + Math.floor(Math.random() * this.settings.width/2)

							if (new_map[y][x] == -1) {
								new_map[y][x] = -2;
								break;
							}
						}
					}
				}
			}

			var r = Math.round(Math.min(this.settings.height, this.settings.width)/3), a = Math.random() * Math.PI * 2

			this.spawns = [];
			for (var i = 0; i < this.order.length; i++) {
				var id = this.order[i];

				while (new_map[Math.round(this.settings.height/2 - .5 + r * Math.sin(a))][Math.round(this.settings.width/2 - .5 + r * Math.cos(a))] != -1) a += Math.PI / 20

				var x = Math.round(this.settings.width/2 - .5 + r * Math.cos(a)), y = Math.round(this.settings.height/2 - .5 + r * Math.sin(a))
				this.spawns.push([x, y]);
				this.players[id].spawn(new_map, x, y);

				a += Math.PI / this.order.length * 2;
			}

			var valid = check_bloating(this, new_map);
		} while (!valid)

		this.map = new_map;
	}

	updateScores() {
		for (var id of this.order) this.players[id].score = 0;

		var reverse = this.order.map(e => this.players[e].index)
		for (var row of this.map) for (var tile of row) if (tile >= 0) { this.players[this.order[reverse.indexOf(tile)]].score += 1; }
	}

	nextTurn(player, message) {
		if (this.order[this.turn] !== player.id) return;

		if (!this.checkWin()) {
			if (this.timerType === 1) this.players[this.order[this.turn]].timer = this.settings.timer;

			var first = true
			do {
				if (!first) {
					var moveRow = this.moveList[this.moveList.length - 1];
					moveRow[moveRow.length - 1] = "-";
				} else {
					first = false;
				}

				this.players[this.order[this.turn]].onTurnEnd();

				this.turn = (this.turn + 1) % this.order.length
				if (this.turn == 0) {
					this.round += 1;
					this.moveList.push([]);

					if (this.round === 2 && this.timerType) {
						this.timer = setInterval(() => {
							var current = this.players[this.order[this.turn]];
							current.timer -= 0.1;
							this.io.in(this.id).emit("timers", this.order.map(e => this.players[e].timer));

							if (current.timer <= 0) {
								this.io.in(this.id).emit("message", current.username + " timed out ⏲");
								current.forfeit();
							}
						}, 100);
					}
				}
				this.moveList[this.moveList.length - 1].push("");

				this.players[this.order[this.turn]].onTurnStart();

				if (this.round > 30) {
					var maxScore = 0, index = 0, unique = true;

					for (var [i, id] of this.order.entries()) {
						if (this.players[id].score > maxScore) {
							maxScore = this.players[id].score;
							index = i;
							unique = true;
						} else if (this.players[id].score === maxScore) {
							unique = false;
						}
					}

					if (unique) this.endGame(index, "Usure");
				}

				if (this.turn === -1) break;
			} while ((!this.players[this.order[this.turn]].score || !this.players[this.order[this.turn]].checkForMoves().length));

			if (this.turn !== -1) {
				var current = this.players[this.order[this.turn]];
				if (current.prePlay !== null) setTimeout(() => { current.play(current.prePlay); current.prePlay = null; }, 100);
			}
		}

		this.io.in(this.id).emit("update gamestate", {map: this.map, layer: this.layer, turn: this.turn, round: this.round, moveList: this.moveList});
		this.sendPlayerList();
	}

	checkWin() {
		this.updateScores()

		var alive = this.order.map(e => this.players[e]).filter(e => e.score);

		if (alive.length == 1) {
			this.endGame(this.order.indexOf(alive[0].id), "Annihilation");
			return true;
		}

		for (var id of this.order) {
			if (this.players[id].score >= this.settings.width * this.settings.height / 2) {
				this.endGame(this.order.indexOf(id), "Domination");
				return true;
			}
		}

		return false;
	}

	endGame(index, reason) {
		var stat = {
			players: this.order.map(e => this.players[e].username),
			powers: this.order.map(e => this.players[e].constructor.name),
			scores: this.order.map(e => this.players[e].score),
			victor: index,
			reason: reason,
			initial: this.initialMap,
			moveList: this.moveList.map(e => e.join(" ")).join(" / "),
			version: this.version,
			date: Date.now()
		};
		console.log(stat);
		this.data.stats.push(stat);
		saveData(this.data);

		this.turn = -1;
		this.round = 1;
		this.settings = Object.keys(this.settings).reduce((a, e) => { a[e] = (this.settings[e] === this.defaults[e] ? null : this.settings[e]); return a }, {});

		clearInterval(this.timer);
		this.timer = null;

		this.io.in(this.id).emit("message", "Victoire de " + this.players[this.order[index]].username + " par " + reason + "!");
		this.io.in(this.id).emit("message", "Scores finaux:");
		for (var id of this.order) {
			var player = this.players[id];
			this.io.in(this.id).emit("message", player.emoji + " " + player.username + ": " + player.score);
		}

		this.io.in(this.id).emit("update gamestate", {turn: this.turn});

		for (var id of this.order) {
			this.players[id] = new Player(this, this.players[id].username, id);
		}

		this.sendPlayerList();
	}
}

module.exports = exports = Game;
