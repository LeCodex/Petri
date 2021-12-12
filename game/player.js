var globals = require('./globals.js');

class Player {
	constructor(game, username, id) {
		this.game = game;
		this.username = username;
		this.id = id;
		this.score = 0;
		this.timer = null;
		this.ready = false;
		this.powerActive = false;
		this.variables = {};

		this.prePlay = null;

		this.name = "Sans Pouvoir";
		this.emoji = "🚫";
		this.description = "Aucun pouvoir spécial";
	}

	spawn(map, x, y) {
		map[y][x] = this.index;
	}

	checkForMoves() {
		var moves = [];
		var variables = JSON.parse(JSON.stringify(this.variables));
		for (var i = 0; i < 4; i++) {
			var o = this.move(i);
			if (o) moves.push({index: i, map: o.map});
			this.variables = JSON.parse(JSON.stringify(variables));
		}

		return moves;
	}

	play(index) {
		this.game.clearLayer();
		var ret = this.move(index);

		if (ret) {
			var symbol = ["L", "U", "D", "R"][index];
			var moveRow = this.game.moveList[this.game.moveList.length - 1];
			moveRow[moveRow.length - 1] += symbol;

			this.game.map = ret.map;
			this.game.layer = ret.layer;
			if (this.postPlay()) this.game.nextTurn(this);
		}
	}

	move(index) {
		var dx = [-1, 0, 0, 1][index];
		var dy = [0, -1, 1, 0][index];
		var variables = this.variables = JSON.parse(JSON.stringify(this.variables));

		var new_map = JSON.parse(JSON.stringify(this.game.map));
		var new_layer = JSON.parse(JSON.stringify(this.game.layer));

		this.moveTiles(new_map, new_layer, dx, dy);

		if (JSON.stringify(this.game.map) !== JSON.stringify(new_map)) {
			return {map: new_map, layer: new_layer};
		} else {
			this.variables = variables;
			return null;
		}
	}

	moveTiles(map, layer, dx, dy) {
		for (var [y, row] of this.game.map.entries()) {
			for (var [x, tile] of row.entries()) {
				this.moveTile(map, layer, x, y, x + dx, y + dy, dx, dy);
			}
		}
	}

	moveTile(map, layer, x, y, nx, ny, dx, dy) {
		if (this.game.map[y][x] == this.index && this.game.inside(nx, ny)) {
			var new_tile = this.game.map[ny][nx];

			if (new_tile == -1) {
				map[ny][nx] = this.index;
			} else if (new_tile != this.index && new_tile >= 0) {
				this.fight(map, layer, x, y, nx, ny, dx, dy)
			}
		}
	}

	fight(map, layer, x, y, nx, ny, dx, dy) {
		var owner = this.game.players[this.game.order[this.game.map[ny][nx]]];

		var attack = this.getPower(x, y, -dx, -dy);
		var defense = owner.getPower(nx, ny, dx, dy);

		var diff = attack - defense;
		diff += this.onAttack(attack, defense, owner);
		diff += owner.onDefense(attack, defense, this);

		if (diff > 0) {
			map[ny][nx] = this.index;
			layer[ny][nx] = "https://cdn.glitch.com/e985941e-927e-489d-a79b-cffbabb57b92%2Fdagger_1f5e1-fe0f.png?v=1625421211688"; // 🗡️
		} else if (diff == 0) {
			map[ny][nx] = -1;
			layer[ny][nx] = "https://cdn.glitch.com/e985941e-927e-489d-a79b-cffbabb57b92%2Fcrossed-swords_2694-fe0f.png?v=1625421210008"; // ⚔️️
		} else {
			layer[ny][nx] = "https://cdn.glitch.com/e985941e-927e-489d-a79b-cffbabb57b92%2Fshield_1f6e1-fe0f.png?v=1625421210487"; // 🛡️
		}
	}

	getPower(x, y, dx, dy) {
		var power = 0, tdx = 0, tdy = 0;

		while (this.game.map[y + tdy][x + tdx] === this.index) {
			power += 1;
			tdx += dx;
			tdy += dy;
			if (!this.game.inside(x + tdx, y + tdy)) break;
		}

		return power;
	}

	onAttack(attack, defense, defender) {
		return 0;
	}

	onDefense(attack, defense, attacker) {
		return 0;
	}

	onTurnStart() {}

	postPlay() { return true; }

	onTurnEnd() {}

	activePower() {
		var moveRow = this.game.moveList[this.game.moveList.length - 1];
		moveRow[moveRow.length - 1] += "P";
	}

	forfeit() {
		for (var [y, row] of this.game.map.entries()) {
			for (var [x, tile] of row.entries()) {
				if (tile == this.index) {
					this.game.map[y][x] = -1;
					this.game.layer[y][x] = "https://cdn.glitch.com/e985941e-927e-489d-a79b-cffbabb57b92%2Fskull_1f480.png?v=1625421456016"; // 💀
				}
			}
		}

		if (this.game.order[this.game.turn] === this.id) {
			var moveRow = this.game.moveList[this.game.moveList.length - 1];
			moveRow[moveRow.length - 1] = "X";

			this.game.nextTurn(this);
		} else {
			this.game.io.in(this.game.id).emit("update gamestate", {map: this.game.map, layer: this.game.layer});
			this.game.checkWin();
		}
	}
}


class Defender extends Player {
	constructor(game, user, id) {
		super(game, user, id)

		this.name = "Défenseur";
		this.emoji = "🛡️";
		this.description = "A +1 en défense";
	}

	onDefense(attack, defense, attacker) {
		return -1;
	}
}


class Attacker extends Player {
	constructor(game, user, id) {
		super(game, user, id)

		this.name = "Attaquant";
		this.emoji = "🗡️";
		this.description = "A +1 en attaque";
	}

	onAttack(attack, defense, defender) {
		return 1;
	}
}


class Architect extends Player {
	constructor(game, user, id) {
		super(game, user, id)

		this.name = "Architecte";
		this.emoji = "🧱";
		this.description = "Les murs qu'il touche font partie de ses unités pour les combats";
	}

	getPower(x, y, dx, dy) {
		var power = 0, tdx = 0, tdy = 0;

		while ([-2, this.index].includes(this.game.map[y + tdy][x + tdx])) {
			power += 1;
			tdx += dx;
			tdy += dy;
			if (!this.game.inside(x + tdx, y + tdy)) break;
		}

		return power;
	}
}


class Swarm extends Player {
	constructor(game, user, id) {
		super(game, user, id)

		this.name = "Essaim";
		this.emoji = "🐝";
		this.description = "Commence avec deux unités en plus en ligne";
	}

	spawn(map, x, y) {
		map[y][x] = this.index;

		var d1 = Math.floor(Math.random() * 2);
		var d2 = 1 - d1;

		if (this.game.inside(x + d1, y + d2) && this.game.inside(x - d1, y - d2) && map[y + d2][x + d1] === -1 && map[y - d2][x - d1] === -1) {
			map[y + d2][x + d1] = this.index
			map[y - d2][x - d1] = this.index
		} else {
			map[y + d1][x + d2] = this.index
			map[y - d1][x - d2] = this.index
		}
	}
}


class Glitcher extends Player {
	constructor(game, user, id) {
		super(game, user, id)

		this.name = "Glitcheur";
		this.emoji = "👾";
		this.description = "Peut prendre une fois dans la partie un second tour juste après le sien";
		this.powerActive = true;

		this.stealTurn = false;
	}

	activePower() {
		super.activePower()

		this.powerActive = false;
		this.stealTurn = true;

		return "️👾 Pouvoir du Glitcheur : Le prochain tour sera le vôtre";
	}

	postPlay() {
		if (this.stealTurn) {
			this.stealTurn = false;
			this.game.io.in(this.game.id).emit("update gamestate", {map: this.game.map, layer: this.game.layer, moveList: this.game.moveList});
			return false;
		} else {
			return true;
		}
	}
}


class Pacifist extends Player {
	constructor(game, user, id) {
		super(game, user, id)

		this.name = "Pacifiste";
		this.emoji = "🕊️";
		this.description = "Jusqu'au 21e tour, ne peut pas être attaqué par les joueurs qu'il n'a pas attaqué";

		this.variables = {warWith: []};
	}

	spawn(map, x, y) {
		map[y][x] = this.index;
		this.variables.warWith = [];
	}

	onDefense(attack, defense, attacker) {
		return (!this.variables.warWith.includes(attacker.id) && this.game.round <= 20 ? -Infinity : 0);
	}

	onAttack(attack, defense, defender) {
		if (!this.variables.warWith.includes(defender.id)) this.variables.warWith.push(defender.id);
		return 0;
	}
}


class General extends Player {
	constructor(game, user, id) {
		super(game, user, id)

		this.name = "Général";
		this.emoji = "🚩";
		this.description = "Peut doubler la valeur de ses unités pour deux manches";
		this.powerActive = true;

		this.variables = {turn: 0};
	}

	activePower() {
		super.activePower()

		this.powerActive = false;
		this.variables.turn = 1;

		return "🚩 Pouvoir du Général : Vos unités valent double pendant les deux prochaines manches"
	}

	onTurnStart() {
		this.variables.turn += this.variables.turn ? 1 : 0;
		if (this.variables.turn == 3) this.variables.turn = 0;
	}

	getPower(x, y, dx, dy) {
		return (this.variables.turn ? 2 : 1) * super.getPower(x, y, dx, dy);
	}
}


class Topologist extends Player {
	constructor(game, user, id) {
		super(game, user, id)

		this.name = "Topologiste";
		this.emoji = "🍩";
		this.description = "Considère les bords du terrain comme adjacents";
	}

	moveTiles(map, layer, dx, dy) {
		for (var [y, row] of this.game.map.entries()) {
			for (var [x, tile] of row.entries()) {
				var nx = (x + dx + this.game.settings.width) % this.game.settings.width;
				var ny = (y + dy + this.game.settings.height) % this.game.settings.height;

				this.moveTile(map, layer, x, y, nx, ny, dx, dy);
			}
		}
	}

	getPower(x, y, dx, dy) {
		var power = 0, tx = x, ty = y;

		while (this.game.map[ty][tx] === this.index) {
			power += 1;
			tx = (tx + dx + this.game.settings.width) % this.game.settings.width;
			ty = (ty + dy + this.game.settings.height) % this.game.settings.height;
			if (power > Math.max(this.game.settings.width, this.game.settings.height)) break; // Should never happen in theory since that would mean there would be no one to attack
		}

		return power;
	}
}

class Isolated extends Player {
	constructor(game, user, id) {
		super(game, user, id)

		this.name = "Isolé";
		this.emoji = "🏚️";
		this.description = "En combat, prend le max entre les unités derrière et le min des unités de chaque côté";
	}

	getPower(x, y, dx, dy) {
		var behind = this.getPowerSub(x, y, dx, dy);
		var left = this.getPowerSub(x, y, dy, dx);
		var right = this.getPowerSub(x, y, -dy, -dx);
		// console.log(behind, left, right);

		return Math.max(behind, (left + right) / 2);
	}

	getPowerSub(x, y, dx, dy) {
		var power = 0, tdx = 0, tdy = 0;

		while (this.game.map[y + tdy][x + tdx] === this.index) {
			power += 1;
			tdx += dx;
			tdy += dy;
			if (!this.game.inside(x + tdx, y + tdy)) break;
		}

		return power;
	}
}

module.exports = exports = {Player, Attacker, Defender, Architect, Swarm, Glitcher, Pacifist, General, Topologist, Isolated};
