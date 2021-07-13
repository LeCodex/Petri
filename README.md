# Petri

A simple and kinda silly strategy game


# Rules of the game

## Start and goal :
Each player starts with one unit in a (semi-)random place on the board. The board is 10x10 by default.
The winner is the player who is the last with units on the board, or the first to control 50% of the board.
After 40 rounds without winners, the player with the most units wins.

## Turn order :
- The player chooses a direction (using arrow keys)
- All of their troops tries to replicate in that direction:
	- If the tile in that direction is empty, then it creates a new unit there,
	- If it is occupied by a friendly unit or a wall, nothing happens,
	- If it is occupied by an enemy unit, a combat triggers between those two units.

## Combats :
To determine who wins, we look at how many units each unit has behind it in a straight continuous line:
- 🗡️ If the attacker has the most, it replaces the defender with a unit of its team,
- 🛡️ If the defender has the most, nothing happens,
- ⚔️️ If there is a tie, the defender dies but the attacker doesn't create a new unit.
