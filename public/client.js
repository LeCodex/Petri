// client-side js, loaded by index.html
// run by the browser each time the page is loaded

import globals from './globals.js';

console.log("hello world :o");

function getRandomColor() {
	var letters = '0123456789abcdef';
	var color = '#';
	for (var i = 0; i < 6; i++) {
		color += letters[Math.floor(Math.random() * 16)];
	}
	return color;
}

function hexToDec(col) {
	var letters = '0123456789abcdef';
	var dec = 0;
	if (typeof(col) == "string") {
		var list = col.split("");
	} else {
		var list = col;
	}
	list.forEach((element, index) => {
		dec += Math.pow(16, index) * letters.indexOf(element.toLowerCase());
	});
	return dec;
}

function wrapText(context, text, x, y, maxWidth, lineHeight) {
	var words = text.split(" ");
	var line = "";

	for (var n = 0; n < words.length; n++) {
		var testLine = line + words[n] + " ";
		var metrics = context.measureText(testLine);
		var testWidth = metrics.width;
		if (testWidth > maxWidth && n > 0) {
			context.fillText(line, x, y);
			line = words[n] + " ";
			y += lineHeight;
		} else {
			line = testLine;
		}
	}
	context.fillText(line, x, y);
}

function choose(choices) {
	console.log(choices);
	var index = Math.floor(Math.random() * choices.length);
	return choices[index];
}

function secondsToString(seconds) {
	var numminutes = Math.floor(seconds / 60);
	var numseconds = Math.floor(seconds % 60);
	var numdecimals = Math.floor(seconds % 1 * 10);
	return numminutes + ":" + (numseconds < 10 ? "0" : "") + numseconds + (seconds <= 10 ? "." + numdecimals : "");
}

const CHAT_FADE_TIME = 300;
const DEFAULT_ALIASES = ["Steve", "Bob", "John", "Jim", "Paul"];
const SYMBOLS = ["https://cdn.glitch.com/e985941e-927e-489d-a79b-cffbabb57b92%2Fspades.png?v=1625502235203", "https://cdn.glitch.com/e985941e-927e-489d-a79b-cffbabb57b92%2Fhearts.png?v=1625502233980", "https://cdn.glitch.com/e985941e-927e-489d-a79b-cffbabb57b92%2Fclubs.png?v=1625502232014", "https://cdn.glitch.com/e985941e-927e-489d-a79b-cffbabb57b92%2Fdiamonds.png?v=1625502232995", "https://cdn.glitch.com/e985941e-927e-489d-a79b-cffbabb57b92%2Fplain-circle.png?v=1625502231457", "https://cdn.glitch.com/e985941e-927e-489d-a79b-cffbabb57b92%2Fsquare.png?v=1625502223161"];
const PING_SOUND = new Audio("https://cdn.glitch.com/e985941e-927e-489d-a79b-cffbabb57b92%2Fping.wav?v=1626025001040");
const PLAY_SOUND = new Audio("https://cdn.glitch.com/e985941e-927e-489d-a79b-cffbabb57b92%2Fplay.wav?v=1626025006294");

var username;

var playerList = [];
var moveList = [];
var powers = [];

var admin = "";
var isPrivate = true;
var withPowers = false;
var timerType = 0;

var ready = false;
var spectating = false;

var map = [];
var layer = [];
var turn = -1;
var selfTurn = -1;
var round = 0;
var timers = [];

var mx, my;
var timerInterval = null;

var $joinArea = $('#joinArea');
var $gameArea = $('#gameArea');

var $usernameInput = $("#usernameInput")[0];
var $gameIDInput = $("#gameIDInput")[0];

var $creationButton = $("#gameCreationButton")[0];
var $joinButton = $("#gameJoinButton")[0];

var $readyButton = $("#readyButton")[0];
var $leaveButton = $("#gameLeaveButton")[0];
var $spectateButton = $("#spectateButton")[0];

var $gameInputs = {
	heightInput: $("#heightInput")[0],
	widthInput: $("#widthInput")[0],
	wallAmountInput: $("#wallAmountInput")[0],
	privacyButton: $("#privacyButton")[0],
	powersButton: $("#powersButton")[0],
	timerButton: $("#timerButton")[0],
	timerInput: $("#timerInput")[0]
};

var $playerList = $("#playerList");
var $moveList = $("#moveList");

var $powersMenu = $("#powersMenu");
var $powersList = $("#powersList");

var $settingsButton = $("#settingsButton")[0];
var $settingsMenu = $("#settingsMenu");
var $settingsInput = {
	colorblind: {
		input: $("#colorblindButton")[0],
		default: false,
		update: function(input, key) {
			input.innerHTML = input.innerHTML.split(":")[0] + ": " + (settings[key] ? "on" : "off");
		},
		events: {
			click: function(event) {
				var input = event.target;
				var name = input.id.slice(0, -6);
				settings[name] = !settings[name];
				updateSetting(input, name);
				redrawMap();
			}
		}
	},
	prePlay: {
		input: $("#prePlayButton")[0],
		default: false,
		update: function(input, key) {
			input.innerHTML = input.innerHTML.split(":")[0] + ": " + (settings[key] ? "on" : "off");
		},
		events: {
			click: function(event) {
				var input = event.target;
				var name = input.id.slice(0, -6);
				settings[name] = !settings[name];
				updateSetting(input, name);
			}
		}
	}
};
var $exitButton = $("#exitButton")[0];

$settingsButton.addEventListener("click", function(evt) {
	$settingsMenu[0].hidden = false;
});

$exitButton.addEventListener("click", function(evt) {
	$settingsMenu[0].hidden = true;
});

var settings = {};
function updateSetting(input, key) {
	localStorage.settings = JSON.stringify(settings);
	$settingsInput[key].update(input, key);
}

if (localStorage.settings === undefined) localStorage.settings = "{}";
for (var [key, value] of Object.entries($settingsInput)) {
	settings[key] = localStorage.settings[key] ?? value.default;
	updateSetting(value.input, key);

	for (var [name, fnc] of Object.entries(value.events)) {
		value.input.addEventListener(name, fnc);
	}
}

var $window = $(window);
var $map = $("#gameMap")[0];
var $inputMessage = $('#inputMessage');

function decodeEntities(encodedString) {
	var translate_re = /&(nbsp|amp|quot|lt|gt);/g;
	var translate = {
		"nbsp": " ",
		"amp" : "&",
		"quot": "\"",
		"lt"	: "<",
		"gt"	: ">"
	};
	return encodedString.replace(translate_re, function(match, entity) {
		return translate[entity];
	}).replace(/&#(\d+);/gi, function(match, numStr) {
		var num = parseInt(numStr, 10);
		return String.fromCharCode(num);
	});
}

function addMessage(msg) {
	msg = decodeEntities(msg);
	$("#eventList").append($("<li>").text(msg).hide().fadeIn(CHAT_FADE_TIME));
	$("#eventList").scrollTop($("#eventList")[0].scrollHeight);
}

function mouseX(evt) {
	if (evt.pageX) {
		return evt.pageX;
	} else if (evt.clientX) {
		return evt.clientX + (document.documentElement.scrollLeft ?
			document.documentElement.scrollLeft :
			document.body.scrollLeft);
	} else {
		return null;
	}
}

function mouseY(evt) {
	if (evt.pageY) {
		return evt.pageY;
	} else if (evt.clientY) {
		return evt.clientY + (document.documentElement.scrollTop ?
			document.documentElement.scrollTop :
			document.body.scrollTop);
	} else {
		return null;
	}
}

function redrawMap() {
	if (!map.length) return;

	var goalColor = globals.PLAYER_COLORS[turn] ?? "#FFFFFF";

	$map.innerHTML = "";
	$map.animate({borderColor: goalColor}, 500).finished.then(() => { $map.style.borderColor = goalColor; });

	var tileSize = Math.min((window.innerWidth * .4 - 12) / map[0].length, (window.innerHeight * .7 - 12) / map.length) - 1; // Use the amount of tiles on the dimensiosn used as the size of the "square"
	console.log(tileSize);

	for (var [y, row] of map.entries()) {
		var tr = document.createElement('tr');
		for (var [x, tile] of row.entries()) {
			var td = document.createElement('td');

			// var filler = document.createElement('div');
			// filler.
			// td.appendChild(filler)

			td.classList.add("gameTile", "noSelect");
			td.height = td.width = tileSize + "px";
			td.bgColor = tile < 0 ? ["white", "black"][tile + 2] : globals.PLAYER_COLORS[tile];

			if (layer[y][x].length || (colorblind && tile >= 0)) {
				var img = document.createElement("img");
				img.src = layer[y][x].length ? layer[y][x] : SYMBOLS[tile];
				td.appendChild(img);
			}

			tr.appendChild(td);
		}
		$map.appendChild(tr);
	}
}

function updatePlayerList() {
	$playerList[0].innerHTML = "";
	for (var i = 0; i < playerList.length; i++) {
		var player = playerList[i];
		var element = $("<li>");

		var spectating_or_order = player.orderIndex === -1 ? "👻 " : (turn > -1 ? globals.NUMBER_EMOJIS[player.orderIndex] + " " : "");
		var powerEmoji = withPowers && turn !== -1 && player.orderIndex !== -1 ? player.power + " " : ""
		var text = spectating_or_order + powerEmoji + player.username + (player.ready ? " ✅" : "") + (player.id === admin ? " 👑" : "");

		if (turn !== -1 && player.orderIndex !== -1) {
			element[0].style.color = globals.PLAYER_COLORS[player.index];
			text += " : " + player.score;

			if (timerType) text += " (" + secondsToString(timers[player.orderIndex]) + ")";
		}

		if (player.orderIndex === -1) element[0].style.fontStyle = "italic";

		element.text(text);
		$playerList.append(element);
	}
}

$(function() {
	var socket = io();

	window.onresize = function(event) {
		redrawMap();
	};

	function choosePower(evt) {
		var index = $(evt.srcElement).index();

		socket.emit("power selected", powers[index].key);
	}

	// Prevents input from having injected markup
	const cleanInput = (input) => {
		return $('<div/>').text(input).html();
	}

	 // Keyboard events
	$window.keydown(event => {
		var controls = ["ArrowLeft", "ArrowUp", "ArrowDown", "ArrowRight", "Space"];
		var index = controls.indexOf(event.code);

		if (index != -1) {
			socket.emit("input", index, settings.prePlay);
		} else if (event.which === 13) {
			var message = $inputMessage.val();
			message = cleanInput(message);
			if (message) {
				$inputMessage.val('');
				socket.emit('message', message);
			}
		}
	});

	document.onmousemove = function(e) {
		mx, my = e.clientX, e.clientY;
	}

	document.onbeforeunload = function(e) {
		socket.disconnect();
		socket.close();
	}

	$creationButton.addEventListener("click", function() {
		socket.emit('join', $usernameInput.value.length ? $usernameInput.value : choose(DEFAULT_ALIASES), undefined);
	});

	$joinButton.addEventListener("click", function() {
		socket.emit('join', $usernameInput.value.length ? $usernameInput.value : choose(DEFAULT_ALIASES), $gameIDInput.value);
	});

	$leaveButton.addEventListener("click", function() {
		window.location.reload(true);
	});

	$readyButton.addEventListener("click", function() {
		socket.emit('ready', !ready);
	});

	$spectateButton.addEventListener("click", function() {
		if (!spectating && ready) socket.emit('ready', false);
		socket.emit('spectate', !spectating);
	});

	$gameInputs.privacyButton.addEventListener("click", function() {
		socket.emit("private", !isPrivate);
	});

	$gameInputs.powersButton.addEventListener("click", function() {
		socket.emit("powers", !withPowers);
	});

	$gameInputs.timerButton.addEventListener("click", function() {
		socket.emit("timer", (timerType + 1) % 3);
	});

	for (var [key, input] of Object.entries($gameInputs)) {
		if (!key.endsWith("Input")) continue;

		input.addEventListener("input", function(event) {
			if (socket.id === admin) {
				var input = event.target;
				var settings = {};
				console.log(input.id, input.value);
				settings[input.id] = input.value;

				socket.emit("settings", settings);
			}
		});
	}


	// SOCKET MESSAGES //
	socket.on("login", function() {
		socket.emit("login");
		localStorage.username = $('#usernameInput').val();

		$joinArea[0].hidden = true;
		$gameArea[0].hidden = false;
	});

	socket.on("public games", function(amount) {
		$("#publicGamesCount")[0].innerHTML = amount;
	});

	socket.on("ready", function(state) {
		ready = state;

		if (ready) {
			$readyButton.style.backgroundColor = "lime";
			$readyButton.innerHTML = "Prêt";
		} else {
			$readyButton.style.backgroundColor = "red";
			$readyButton.innerHTML = "Prêt?";
		}
	});

	socket.on("spectate", function(state) {
		spectating = state;

		if (state) {
			$spectateButton.innerHTML = "Rejoindre";
		} else {
			$spectateButton.innerHTML = "Devenir spectateur";
		}
	});

	socket.on("private", function(state) {
		isPrivate = state;

		if (state) {
			$gameInputs.privacyButton.innerHTML = "Partie privée";
		} else {
			$gameInputs.privacyButton.innerHTML = "Partie publique";
		}
	});

	socket.on("powers state", function(state) {
		withPowers = state;

		if (state) {
			$gameInputs.powersButton.innerHTML = "Pouvoirs activés";
		} else {
			$gameInputs.powersButton.innerHTML = "Pouvoirs désactivés";
		}
	});

	socket.on("timer", function(state) {
		timerType = state;

		$gameInputs.timerButton.innerHTML = ["Pas de timer", "Timer normal", "Horloge d'échecs"][state];
	});

	socket.on("select power", function() {
		$powersMenu[0].hidden = false;
	})

	socket.on("power selected", function() {
		$powersMenu[0].hidden = true;
	});

	socket.on("message", function(msg) {
		addMessage(msg);
	});

	socket.on("timers", function(info) {
		timers = info;
		updatePlayerList();
	})

	socket.on("update gamestate", function(info) {
		map = info.map ?? map;
		layer = info.layer ?? layer;

		round = info.round ?? round;
		selfTurn = info.selfTurn ?? selfTurn;
		playerList = info.playerList ?? playerList;
		moveList = info.moveList ?? moveList;
		admin = info.admin ?? admin;

		powers = info.powers ?? powers;

		// Updating turn and plays sounds
		if (info.turn !== undefined) {
			if (turn !== info.turn) {
				if (info.turn === selfTurn) {
					PING_SOUND.play();
				} else {
					PLAY_SOUND.play();
				}
			}
			turn = info.turn;
		}

		// Updating the powers choices
		if (info.powers) {
			$powersList.innerHTML = "";

			var title = document.createElement("li");
			title.innerHTML = "<h1>Choisis un pouvoir</h1>";
			$powersList.append(title);

			var div = document.createElement("div");

			for (var power of powers) {
				var button = document.createElement("button");
				button.onclick = function(evt) { choosePower(evt) };
				button.innerHTML = power.emoji + " " + power.name + " : " + power.description;
				div.append(button);
			}

			var li = document.createElement("li");
			li.append(div);
			$powersList.append(li);
		}

		// Updating the default values for the settings
		if (info.defaults) {
			for (var [key, value] of Object.entries(info.defaults)) {
				$gameInputs[key + "Input"].placeholder = value;
			}
		}

		// Updating the actual values for the settings
		if (info.settings) {
			for (var [key, value] of Object.entries(info.settings)) {
				if (socket.id !== admin) $gameInputs[key + "Input"].value = value; // Only for other clients
				$gameInputs[key + "Input"].style.background = info.valid[key] ? "" : "red";
			}
		}

		// Updating the player list. Doing it everytime since multiple values influence it
		if (turn !== -1) playerList.sort((a, b) => a.orderIndex === -1 ? 1 : a.orderIndex - b.orderIndex);
		updatePlayerList()

		// Updating the move list
		if (info.moveList) {
			$moveList[0].innerHTML = "";
			for (var row of moveList) {
				var element = $("<li>");
				for (var [i, move] of row.entries()) {
					var str = $("<span>");
					var playerIndex = playerList.filter(e => e.orderIndex === i)[0].index;

					str[0].style.color = globals.PLAYER_COLORS[playerIndex];
					str.text(move + " ");

					element.append(str);
				}

				$moveList.append(element);
			}
		}

		for (var input of Object.values($gameInputs)) input.disabled = (socket.id !== admin || turn !== -1);

		// Updating the map because you never know
		redrawMap();
	});

	socket.on("disconnect", function(reason) {
		console.log("You were disconnecetd from the server");
		socket.close();
		setTimeout(function() {
			window.location.reload(true);
		}, 1000);
	});
});
