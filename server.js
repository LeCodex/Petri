const fs = require("fs");
const deepcopy = require("deepcopy");
const Game = require("./game/game.js");
const powers = require("./game/player.js");
var globals = require("./game/globals.js");

const express = require('express');
const app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

app.use(express.static("public"));

app.get('/', (req, res) => {
	res.sendFile(__dirname + '/views/index.html');
});

// Health check
app.head('/health', function (req, res) {
	res.sendStatus(200);
});

var string = fs.readFileSync('data/save.json');
var data = JSON.parse(string);
console.log(data);

var games = {};

function saveData(obj) {
	var string = JSON.stringify(obj);
	fs.writeFile('data/save.json', string, finished);
	function finished(err) { if (err != null) console.log(err) };
	console.log("Data Saved");
};

function choose(choices) {
	console.log(choices);
	var index = Math.floor(Math.random() * choices.length);
	return choices[index];
}

function randomID(length) {
	// Declare all characters
	let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

	// Pick characers randomly
	let str = '';
	for (let i = 0; i < length; i++) {
			str += chars.charAt(Math.floor(Math.random() * chars.length));
	}

	return str;
}

function compressMap(map) {
	var rows = [];
	var empty = 0;
	
	for (var row of map) {
		var r = "";
		
		for (var tile of row) {
			if (tile === -1) {
				empty += 1;
			} else {
				if (empty) r += String(empty);
				empty = 0;
				
				r += (tile === -2 ? "W" : String.fromCharCode(tile + 65));
			}
		}
		
		if (empty) r += String(empty);
		empty = 0;
		rows.push(r);
	}
	
	return rows.join("/");
}

io.on('connection', (socket) => {
	var game;
	var prePlay;
	
	console.log('a user connected');
	socket.emit("message", "Succesfully connected as user " + socket.id);
	socket.emit("public games", Object.values(globals.games).filter(e => !e.isPrivate).length);
	
	function generateSettingsValidity() {
		if (!game) return;
		
		return Object.keys(game.settings).reduce(function(result, key) {
			result[key] = game.settingsConditions[key](game.settings[key] ? game.settings[key] : game.defaults[key]) && !isNaN(game.settings[key]);
			return result;
		}, {});
	}
	
	socket.on('join', (username, room) => {
		if (game) return;
		
		if (typeof(room) === "string") {
			if (!room.length) { room = choose(Object.keys(globals.games).filter(e => !globals.games[e].isPrivate)) }
			if (!globals.games[room]) { console.log("Unknown game ID " + room); return; }
			
			socket.join(room);
			game = globals.games[room];
		} else {
			var ID = randomID(5);
			
			socket.join(ID);
			game = globals.games[ID] = new Game(io, ID, socket.id, data);
			
			console.log("New game at ID " + ID);
		}
		
		game.players[socket.id] = new powers.Player(game, username, socket.id);
		if (game.turn == -1 && game.order.length < 6) {
			game.order.push(socket.id);
		} else {
			socket.emit("spectate", true);
		}
		
		socket.emit("login");
		socket.emit("message", "Joined as " + username + " to room " + game.id);
		io.in(game.id).emit("message", username + " connected 👋");
	});
	
	socket.on("login", () => {
		game.sendPlayerList();
		
		socket.emit("update gamestate", {map: game.map, layer: game.layer, turn: game.turm, round: game.round, settings: game.settings, defaults: game.defaults, valid: generateSettingsValidity(), moveList: game.moveList, powers: Object.values(powers).map(e => { var temp = new e(); return {key: e.name, emoji: temp.emoji, name: temp.name, description: temp.description} })});
		
		socket.emit("private", game.isPrivate);
		socket.emit("powers state", game.withPowers);
		socket.emit("timer", game.timerType);
	});
	
	socket.on('message', (message) => {
		if (!game) return;
		
		var msg = "[" + game.players[socket.id].username + "] " + message;
		
		socket.emit("message", msg);
		
		var send = true;
		if (message.substring(0, 1) == "!") send = false;
		if (send) socket.in(game.id).emit("message", msg);
	});
	
	socket.on('ready', async (state) => {
		if (!game) return;
		if (game.turn != -1) return;
		if (!game.order.includes(socket.id)) return;
		
		game.players[socket.id].ready = state;
		
		io.in(game.id).emit("message", game.players[socket.id].username + " is " + (!state ? "not ready ❌" : "ready ✅"));
		
		if (!game.order.map(e => game.players[e]).filter(e => !e.ready).length && game.order.length > 1) {
			await game.startGame(); 
			io.in(game.id).emit("message", "Game has started with players " + game.order.map(e => game.players[e].username).join(", "));
			
			if (game.withPowers) {
				game.waitingForChoice = game.order.map(e => true);
				io.in(game.id).emit("message", "Waiting for everyone to choose their power...");
				
				var sockets = await io.in(game.id).fetchSockets();
				for (var s of sockets) if (game.order.includes(s.id)) s.emit("select power");
			} else {
				game.initialMap = compressMap(game.map)
			}
		} else {
			socket.emit("ready", state);
		}
		
		game.sendPlayerList();
	});
	
	socket.on('power selected', async (key) => {
		if (!game) return;
		if (!game.order.includes(socket.id)) return;
		if (!game.waitingForChoice.length) return;
		if (!game.waitingForChoice[game.order.indexOf(socket.id)]) return;
		if (!powers[key]) return;
		
		var replacement = new powers[key](game, game.players[socket.id].username, socket.id);
		
		replacement.index = game.players[socket.id].index;
		replacement.score = game.players[socket.id].score;
		
		game.players[socket.id] = replacement;
		game.waitingForChoice[game.order.indexOf(socket.id)] = false;
		
		if (!game.waitingForChoice.filter(e => e).length) {
			io.in(game.id).emit("message", "All powers have been chosen");
			game.waitingForChoice = [];
			
			for (var [i, [x, y]] of game.spawns.entries()) game.players[game.order[i]].spawn(game.map, x, y);
			io.in(game.id).emit("update gamestate", {map: game.map});
			
			game.initialMap = compressMap(game.map)
		
			game.sendPlayerList();
		}
		
		socket.emit("power selected");
	})
	
	socket.on('spectate', (state) => {
		if (!game) return;
		if (game.order.includes(socket.id) !== state) { socket.emit("spectate", state); return; } // Only go to spectator if in the players, and vice versa. Also correct if client desynced
		if (!state && (game.order.length === 6 || game.turn !== -1)) return; // Only allow joining if there are less than 6 players and before the game starts
		
		var state_string = "";
		if (state) {
			if (game.turn == -1) {
				game.order.splice(game.order.indexOf(socket.id), 1);
				state_string = " is now spectating 👻";
			}
			
			if (game.turn != -1 && game.players[socket.id].score) {
				game.players[socket.id].forfeit();
				state_string = " forfeited 💀";
			}
		} else {
			game.order.push(socket.id);
			state_string = " is now playing 🎮";
		}
		
		if (state_string.length) io.in(game.id).emit("message", game.players[socket.id].username + state_string);
		socket.emit("spectate", !game.order.includes(socket.id));
		
		game.sendPlayerList();
	});
	
	socket.on('private', (state) => {
		if (!game) return;
		if (socket.id !== game.admin) return;
		
		game.isPrivate = state;
		io.in(game.id).emit("private", state);
		io.emit("public games", Object.values(globals.games).filter(e => !e.isPrivate).length);
	});
	
	socket.on('powers', (state) => {
		if (!game) return;
		if (socket.id !== game.admin) return;
		
		game.withPowers = state;
		io.in(game.id).emit("powers state", state);
	});
	
	socket.on('timer', (state) => {
		if (!game) return;
		if (socket.id !== game.admin) return;
		if (state < 0 || state > 2) return;
		
		game.timerType = state;
		io.in(game.id).emit("timer", state);
	});
	
	socket.on('settings', (settings) => {
		if (!game) return;
		if (socket.id !== game.admin) return;
		if (game.turn !== -1) return;
		
		for (var [key, value] of Object.entries(settings)) {
			var name = key.slice(0, -5);
			if (game.settings[name] !== undefined) { game.settings[name] = value.length ? Number(value) : null; }
		}
		
		console.log(game.settings);
		
		io.in(game.id).emit("update gamestate", {settings: game.settings, valid: generateSettingsValidity()});
	})
	
	socket.on('input', (index) => {
		if (!game) return;
		if (game.waitingForChoice.length) return;
		if (game.turn === -1) return;
		if (!game.order.includes(socket.id)) return;
		if (index < 0) return;
		
		if (game.order[game.turn] === socket.id && game.players[socket.id].prePlay === null) {
			if (index < 4) {
				game.players[socket.id].move(index);
				game.nextTurn();
			} else if (index == 4 && game.players[socket.id].powerActive) {
				io.in(game.id).emit("message", game.players[socket.id].activePower());
			}
		} else if (index < 4 && game.players[socket.id].prePlay !== index) {
			game.players[socket.id].prePlay = index;
			socket.emit("message", "PRE PLAY: " + ["⬅️", "⬆️", "⬇️", "➡️"][index]);
		}
	});
	
	socket.on('reconnecting', (attemptNumber) => {
		socket.emit("message", "Reconnection attempt number " + attemptNumber + "...");
	});
	
	socket.on('disconnect', (reason) => {
		console.log('user disconnected');
		
		if (!game) return;
		
		io.in(game.id).emit("message", game.players[socket.id].username + " disconnected (" + reason + ")");
			
		if (game.turn !== -1) game.players[socket.id].forfeit();
		if (game.order.includes(socket.id)) {
			game.order.splice(game.order.indexOf(socket.id), 1);
			if (game.waitingForChoice.length && game.waitingForChoice[game.order.indexOf(socket.id)]) game.waitingForChoice[game.order.indexOf(socket.id)] = false;
		}
		delete game.players[socket.id];
		
		if (game.admin === socket.id) {
			game.admin = Object.keys(game.players)[0];
			if (game.admin) io.in(game.id).emit("message", game.players[game.admin].username + " is now the game admin");
		}
		
		game.sendPlayerList();
		
		if (!game.admin) delete globals.games[game.id];
			
		io.in(game.id).emit("update gamestate", {map: game.map, layer: game.layer});
	});
});

http.listen(process.env.PORT || 3000, () => {
	console.log('listening on *:' + (process.env.PORT || 3000));
});
