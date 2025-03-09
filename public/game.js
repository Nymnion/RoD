// Game configuration
const config = {
    joinTime: 30,          // Seconds for joining phase
    decisionTime: 15,      // Seconds for decision phase
    maxRounds: 5,          // Number of rounds in a game
    minTreasureScale: 1.0, // Minimum treasure value as a percentage of player count (100%)
    maxTreasureScale: 4.0, // Maximum treasure value as a multiple of player count (400%)
    roundBreakTime: 5,     // Seconds between rounds
};

// Game state
const gameState = {
    isActive: false,
    phase: 'waiting',      // waiting, joining, revealing, deciding, roundEnd, gameEnd
    currentRound: 1,
    players: {},
    deck: [],
    currentPath: [],
    revealedTraps: {},
    treasureOnPath: 0,
    treasureValues: [],
    timer: null,
    timerRemaining: 0,
    timerDuration: 0,
    playerLimit: 0,        // 0 means no limit
};

// DOM elements map for quick access - initialize as empty objects
const elementsMap = {};

// Templates
let cardTemplate;
let playerTemplate;

// Initialize the game
document.addEventListener('DOMContentLoaded', () => {
    // Initialize DOM element references
    elementsMap.startGameBtn = document.getElementById('start-game');
    elementsMap.revealCardBtn = document.getElementById('reveal-card');
    elementsMap.timerBar = document.getElementById('timer-bar');
    elementsMap.timerText = document.getElementById('timer-text');
    elementsMap.cavePath = document.getElementById('cave-path');
    elementsMap.playersContainer = document.getElementById('players-container');
    elementsMap.gameLog = document.getElementById('game-log');
    elementsMap.gameMessage = document.getElementById('game-message');
    elementsMap.currentRound = document.getElementById('current-round');
    elementsMap.playerCount = document.getElementById('player-count');
    elementsMap.activePlayers = document.getElementById('active-players');
    
    // Initialize templates
    cardTemplate = document.getElementById('card-template');
    playerTemplate = document.getElementById('player-template');
    
    // Verify all elements were found
    console.log("DOM Elements initialized:", elementsMap);
    
    // Set up event listeners
    if (elementsMap.startGameBtn) {
        elementsMap.startGameBtn.addEventListener('click', showPlayerLimitPrompt);
    } else {
        console.error("Start game button not found!");
    }
    
    if (elementsMap.revealCardBtn) {
        elementsMap.revealCardBtn.addEventListener('click', revealNextCard);
    } else {
        console.error("Reveal card button not found!");
    }
    
    // Set up socket connection for chat messages
    const socket = io();
    socket.on('chatMessage', handleChatMessage);
    
    // Initialize game state
    updateGameMessage('Welcome to Diamant! Click "Start New Game" to begin.');
});

/**
 * Show the player limit prompt when starting a new game
 */
function showPlayerLimitPrompt() {
    // Create a modal dialog
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    
    // Add title
    const title = document.createElement('h2');
    title.textContent = 'Player Limit';
    modalContent.appendChild(title);
    
    // Add description
    const description = document.createElement('p');
    description.textContent = 'Enter the maximum number of players allowed to join (0 for no limit):';
    description.style.marginBottom = '15px';
    modalContent.appendChild(description);
    
    // Add input field
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '100';
    input.value = '0';
    input.style.width = '100%';
    input.style.padding = '10px';
    input.style.marginBottom = '20px';
    input.style.borderRadius = '5px';
    input.style.border = '1px solid #444';
    input.style.backgroundColor = '#2a2a2a';
    input.style.color = '#fff';
    modalContent.appendChild(input);
    
    // Add buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '10px';
    
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.className = 'primary-btn';
    cancelButton.style.backgroundColor = '#555';
    cancelButton.style.flex = '1';
    
    const startButton = document.createElement('button');
    startButton.textContent = 'Start Game';
    startButton.className = 'primary-btn';
    startButton.style.flex = '1';
    
    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(startButton);
    modalContent.appendChild(buttonContainer);
    
    // Add modal to the page
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Focus the input field
    input.focus();
    
    // Add event listeners
    cancelButton.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    startButton.addEventListener('click', () => {
        const limit = parseInt(input.value);
        gameState.playerLimit = isNaN(limit) ? 0 : limit;
        document.body.removeChild(modal);
        startGame();
    });
    
    // Allow pressing Enter to submit
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            startButton.click();
        }
    });
}

/**
 * Start a new game
 */
function startGame() {
    console.log("Starting new game with player limit:", gameState.playerLimit);
    
    // Reset game state
    gameState.isActive = true;
    gameState.currentRound = 1;
    gameState.currentPath = [];
    gameState.revealedTraps = {};
    gameState.treasureOnPath = 0;
    gameState.phase = 'joining';
    gameState.treasureValues = [];
    gameState.players = {};
    
    // Update UI safely
    if (elementsMap.currentRound) elementsMap.currentRound.textContent = gameState.currentRound;
    if (elementsMap.playerCount) elementsMap.playerCount.textContent = '0';
    if (elementsMap.activePlayers) elementsMap.activePlayers.textContent = '0';
    if (elementsMap.cavePath) elementsMap.cavePath.innerHTML = '';
    if (elementsMap.playersContainer) elementsMap.playersContainer.innerHTML = '';
    if (elementsMap.gameLog) elementsMap.gameLog.innerHTML = '';
    
    // Disable controls during joining phase
    if (elementsMap.startGameBtn) elementsMap.startGameBtn.disabled = true;
    if (elementsMap.revealCardBtn) elementsMap.revealCardBtn.disabled = true;
    
    // Start join timer
    const limitMessage = gameState.playerLimit > 0 ? 
        `Joining phase! Type !join in chat to play. (Limited to ${gameState.playerLimit} players)` : 
        'Joining phase! Type !join in chat to play. (No player limit)';
    
    updateGameMessage(limitMessage);
    addLogEntry('A new game of Diamant is starting! Type !join to play!', 'highlight');
    
    if (gameState.playerLimit > 0) {
        addLogEntry(`Player limit set to ${gameState.playerLimit} players.`, 'highlight');
    } else {
        addLogEntry('No player limit set - unlimited players can join.', 'highlight');
    }
    
    // Clear any existing timer
    if (gameState.timer) {
        clearInterval(gameState.timer);
        gameState.timer = null;
    }
    
    // Start join timer with visual feedback
    gameState.timerDuration = config.joinTime;
    gameState.timerRemaining = config.joinTime;
    
    // Update timer display safely
    const timerDisplay = elementsMap.timerText;
    const timerBar = elementsMap.timerBar;
    
    if (timerDisplay) timerDisplay.textContent = `${gameState.timerRemaining}s`;
    if (timerBar) timerBar.style.transform = 'scaleX(1)';
    
    // Start the timer
    gameState.timer = setInterval(() => {
        gameState.timerRemaining--;
        
        // Update timer display safely
        if (timerDisplay) timerDisplay.textContent = `${gameState.timerRemaining}s`;
        if (timerBar) timerBar.style.transform = `scaleX(${gameState.timerRemaining / gameState.timerDuration})`;
        
        // Log the time every 5 seconds
        if (gameState.timerRemaining % 5 === 0 || gameState.timerRemaining <= 3) {
            console.log(`Join timer: ${gameState.timerRemaining}s remaining`);
        }
        
        if (gameState.timerRemaining <= 0) {
            clearInterval(gameState.timer);
            gameState.timer = null;
            
            console.log("Join timer ended, checking player count");
            
            if (Object.keys(gameState.players).length > 0) {
                console.log(`Starting first round with ${Object.keys(gameState.players).length} players`);
                // Start the first round (deck will be created in startNextRound)
                startNextRound();
            } else {
                console.log("No players joined, canceling game");
                gameState.phase = 'waiting';
                gameState.isActive = false;
                updateGameMessage('No players joined. Game canceled.');
                if (elementsMap.startGameBtn) elementsMap.startGameBtn.disabled = false;
            }
        }
    }, 1000);
}

/**
 * Create a deck of cards for the game
 */
function createDeck() {
    const deck = [];
    
    // Calculate treasure values based on player count
    const playerCount = Object.keys(gameState.players).length;
    
    // Calculate min and max treasure values
    // Min = 100% of player count, Max = 400% of player count
    const minTreasure = Math.max(1, playerCount);
    const maxTreasure = Math.max(5, playerCount * 4);
    
    console.log(`Treasure value range: ${minTreasure} (min) to ${maxTreasure} (max) based on ${playerCount} players`);
    
    // Generate treasure values if not already generated
    if (gameState.treasureValues.length === 0) {
        // Create an array of treasure values between min and max
        const range = maxTreasure - minTreasure;
        const step = range / 14; // 15 treasure cards
        
        for (let i = 0; i < 15; i++) {
            const value = Math.floor(minTreasure + (step * i));
            gameState.treasureValues.push(value);
        }
        
        // Log the treasure values for debugging
        console.log(`Treasure values (${playerCount} players): ${gameState.treasureValues.join(', ')}`);
    }
    
    // Add treasure cards
    gameState.treasureValues.forEach(value => {
        deck.push({ type: 'treasure', value });
    });
    
    // Add trap cards (3 of each type)
    const trapTypes = ['snake', 'spider', 'lava', 'rockfall', 'poison'];
    trapTypes.forEach(trapType => {
        for (let i = 0; i < 3; i++) {
            deck.push({ type: 'trap', trapType });
        }
    });
    
    // Shuffle the deck
    return shuffleDeck(deck);
}

/**
 * Shuffle an array using Fisher-Yates algorithm
 */
function shuffleDeck(deck) {
    const newDeck = [...deck];
    for (let i = newDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
    }
    return newDeck;
}

/**
 * Reveal the first card, ensuring it's never a trap
 */
function revealFirstCard() {
    console.log("Revealing first card (guaranteed not to be a trap)...");
    
    if (gameState.deck.length === 0) {
        addLogEntry("The deck is empty!", "warning");
        startNextRound();
        return;
    }
    
    // Find the first non-trap card in the deck
    let cardIndex = -1;
    for (let i = 0; i < gameState.deck.length; i++) {
        if (gameState.deck[i].type !== 'trap') {
            cardIndex = i;
            break;
        }
    }
    
    // If no non-trap card found, create a treasure card
    let card;
    if (cardIndex === -1) {
        console.log("No non-trap cards found in deck, creating a treasure card");
        const playerCount = Object.keys(gameState.players).length;
        const treasureValue = Math.max(5, playerCount * 2); // Decent starting treasure
        card = { type: 'treasure', value: treasureValue };
    } else {
        // Remove the non-trap card from the deck
        card = gameState.deck.splice(cardIndex, 1)[0];
    }
    
    // Add the card to the path
    gameState.currentPath.push(card);
    
    // Create and add the card element to the path
    const cardElement = createCardElement(card);
    if (elementsMap.cavePath) {
        elementsMap.cavePath.appendChild(cardElement);
    }
    
    // Process the card effects
    processCardEffects(card);
    
    // Start decision phase automatically after revealing a card
    startDecisionPhase();
}

/**
 * Reveal the next card from the deck
 */
function revealNextCard() {
    console.log("Revealing next card...");
    
    if (gameState.deck.length === 0) {
        addLogEntry("The deck is empty!", "warning");
        startNextRound();
        return;
    }
    
    // Check if there are any players in the cave
    const playersInCave = Object.values(gameState.players).filter(p => p.inCave);
    if (playersInCave.length === 0) {
        addLogEntry("All players have left the cave!", "warning");
        startNextRound();
        return;
    }
    
    // Disable reveal card button during card reveal
    if (elementsMap.revealCardBtn) {
        elementsMap.revealCardBtn.disabled = true;
        
        // Change button text to "Reveal Next Card" after first card
        if (gameState.currentPath.length === 0) {
            elementsMap.revealCardBtn.textContent = 'Reveal Next Card';
        }
    }
    
    // If this is the first card, use revealFirstCard to ensure it's not a trap
    if (gameState.currentPath.length === 0) {
        revealFirstCard();
        return;
    }
    
    // Reveal the next card
    const card = gameState.deck.pop();
    gameState.currentPath.push(card);
    
    // Create and add the card element to the path
    const cardElement = createCardElement(card);
    if (elementsMap.cavePath) {
        elementsMap.cavePath.appendChild(cardElement);
    }
    
    // Process the card effects
    processCardEffects(card);
    
    // Start decision phase automatically after revealing a card
    startDecisionPhase();
}

/**
 * Process the effects of a revealed card
 */
function processCardEffects(card) {
    if (card.type === 'treasure') {
        // Count players in the cave
        const playersInCave = Object.values(gameState.players).filter(p => p.inCave);
        const playersCount = playersInCave.length;
        
        if (playersCount > 0) {
            // Calculate treasure per player
            const treasurePerPlayer = Math.floor(card.value / playersCount);
            
            // Calculate remaining treasure on the card
            const remainingTreasure = card.value % playersCount;
            
            // Update the card value to show only the remaining treasure
            card.originalValue = card.value; // Store original value for display purposes
            card.value = remainingTreasure;
            
            // Add treasure to each player in the cave
            playersInCave.forEach(player => {
                player.holding = (player.holding || 0) + treasurePerPlayer;
                updatePlayerElement(player);
            });
            
            // Update total treasure on path
            gameState.treasureOnPath = gameState.currentPath.reduce((total, c) => {
                return total + (c.type === 'treasure' ? c.value : 0);
            }, 0);
            
            // Update the path display to show new values
            updatePathDisplay();
            
            addLogEntry(`Revealed: ${card.originalValue} rubies! Each player collects ${treasurePerPlayer}, leaving ${remainingTreasure} on the card.`, 'success');
        } else {
            // No players in cave, just add to path
            gameState.treasureOnPath += card.value;
            card.originalValue = card.value;
            addLogEntry(`Revealed: ${card.value} rubies!`, 'success');
        }
    } else if (card.type === 'trap') {
        // Count this trap type
        gameState.revealedTraps[card.trapType] = (gameState.revealedTraps[card.trapType] || 0) + 1;
        
        // Check if this is the second trap of this type
        if (gameState.revealedTraps[card.trapType] >= 2) {
            addLogEntry(`DANGER! A second ${card.trapType} trap appears!`, 'danger');
            
            // Activate the trap after the decision phase
            gameState.pendingTrapType = card.trapType;
            
            return; // Exit early as trap handling will happen after decision phase
        } else {
            addLogEntry(`Revealed: A ${card.trapType} trap! Be careful...`, 'warning');
        }
    } else if (card.type === 'relic') {
        addLogEntry(`Revealed: A rare relic worth ${card.value} rubies!`, 'highlight');
        gameState.treasureOnPath += card.value;
    }
    
    // Update game message
    updateGameMessage(`Card revealed: ${getCardDescription(card)}. You have 15 seconds to type !roach to leave the cave.`);
}

/**
 * Start the decision phase where players decide to continue or exit
 */
function startDecisionPhase() {
    console.log("Starting decision phase...");
    
    // Check if there are any players in the cave
    const playersInCave = Object.values(gameState.players).filter(p => p.inCave);
    console.log("Players in cave at decision phase:", playersInCave.length);
    
    if (playersInCave.length === 0) {
        console.log("No players in cave, ending round");
        startNextRound();
        return;
    }
    
    gameState.phase = 'deciding';
    
    addLogEntry("Decision time! Type !roach to leave with your treasures, or wait to continue exploring.", 'highlight');
    
    // Start timer for decision phase (15 seconds)
    startTimer(config.decisionTime, () => {
        if (gameState.phase === 'deciding') {
            processDecisions();
            
            // Automatically reveal the next card after processing decisions
            if (gameState.phase === 'revealing') {
                setTimeout(() => {
                    revealNextCard();
                }, 1500);
            }
        }
    });
}

/**
 * Process player decisions after the timer ends
 */
function processDecisions() {
    console.log("Processing decisions...");
    
    const playersInCave = Object.values(gameState.players).filter(p => p.inCave);
    console.log("Players in cave:", playersInCave.length);
    
    if (playersInCave.length === 0) {
        startNextRound();
        return;
    }
    
    // Calculate treasure distribution for players who are leaving
    const exitingPlayers = Object.values(gameState.players).filter(p => 
        p.decision === 'exit' && p.inCave
    );
    
    console.log("Exiting players:", exitingPlayers.length);
    
    if (exitingPlayers.length > 0) {
        // Calculate how many players are exiting
        const totalExitingPlayers = exitingPlayers.length;
        
        // Calculate total remaining treasure on the path to divide among exiting players
        const remainingPathTreasure = gameState.treasureOnPath;
        const treasurePerExitingPlayer = Math.floor(remainingPathTreasure / totalExitingPlayers);
        
        console.log("Remaining path treasure:", remainingPathTreasure);
        console.log("Treasure per exiting player:", treasurePerExitingPlayer);
        
        // Process each exiting player
        exitingPlayers.forEach(player => {
            // Get the treasure they've already collected while exploring
            const collectedTreasure = player.holding || 0;
            
            // Add their share of the remaining treasure on the path
            const totalTreasure = collectedTreasure + treasurePerExitingPlayer;
            
            console.log(`${player.username} collected: ${collectedTreasure}, share: ${treasurePerExitingPlayer}, total: ${totalTreasure}`);
            
            // Mark player as out of the cave
            player.inCave = false;
            player.status = 'exited';
            
            // Add their total treasure to their score
            player.chest = (player.chest || 0) + totalTreasure;
            player.holding = 0;
            
            // Clear their decision
            delete player.decision;
            
            // Update player element
            updatePlayerElement(player);
        });
        
        // Update the treasure on path - all treasure is taken by exiting players
        gameState.treasureOnPath = 0;
        
        // Update all card values to 0 as treasure is taken
        gameState.currentPath.forEach(card => {
            if (card.type === 'treasure' || card.type === 'relic') {
                card.value = 0;
            }
        });
        
        // Update the path display to show new values
        updatePathDisplay();
        
        // Log player exits to console only, not to game log
        if (exitingPlayers.length === 1) {
            const player = exitingPlayers[0];
            console.log(`[PLAYER EXIT] ${player.username} left the cave with ${player.chest} rubies!`);
        } else {
            const treasureMessages = exitingPlayers.map(player => 
                `${player.username} (${player.chest})`
            ).join(', ');
            console.log(`[PLAYER EXITS] Players left the cave with their treasures: ${treasureMessages}`);
        }
        
        // Update game message
        updateGameMessage(`${exitingPlayers.length} player(s) left the cave.`);
        
        // Update active players count
        if (elementsMap.activePlayers) {
            elementsMap.activePlayers.textContent = Object.values(gameState.players).filter(p => p.inCave).length;
        }
    }
    
    // Reset decisions for continuing players
    Object.values(gameState.players).forEach(player => {
        if (player.inCave) {
            delete player.decision;
        }
    });
    
    // Check if there's a pending trap to activate
    if (gameState.pendingTrapType) {
        const trapType = gameState.pendingTrapType;
        delete gameState.pendingTrapType;
        
        // Activate the trap after a short delay to allow UI to update
        setTimeout(() => {
            handleTrapSpring(trapType);
        }, 1000);
        return;
    }
    
    // Check if anyone is still in the cave
    const remainingPlayers = Object.values(gameState.players).filter(p => p.inCave);
    console.log("Remaining players after decisions:", remainingPlayers.length);
    
    if (remainingPlayers.length === 0) {
        startNextRound();
    } else {
        // Continue with next card
        gameState.phase = 'revealing';
        updateGameMessage("Continuing to the next card...");
    }
}

/**
 * Handle a trap being sprung (second trap of same type)
 */
function handleTrapSpring(trapType) {
    addLogEntry(`The ${trapType} trap is sprung! All players in the cave lose their treasures!`, 'danger');
    updateGameMessage(`DANGER! The ${trapType} trap is sprung!`);
    
    // First, process any pending exit decisions to let players escape safely
    const exitingPlayers = Object.values(gameState.players).filter(p => 
        p.decision === 'exit' && p.inCave
    );
    
    if (exitingPlayers.length > 0) {
        console.log(`${exitingPlayers.length} players are escaping just before the trap springs!`);
        
        // Process decisions to let these players escape safely
        processDecisions();
    }
    
    // Now handle the trap for remaining players
    // All players still in the cave lose their treasures
    Object.values(gameState.players).forEach(player => {
        if (player.inCave) {
            console.log(`${player.username} loses ${player.holding} treasure due to trap!`);
            player.holding = 0;
            player.status = 'out';
            player.inCave = false;
            updatePlayerElement(player);
        }
    });
    
    // Update active players count safely
    if (elementsMap.activePlayers) {
        elementsMap.activePlayers.textContent = '0';
    }
    
    // Start next round after a delay
    setTimeout(() => {
        startNextRound();
    }, 2000);
}

/**
 * Start the next round or end the game
 */
function startNextRound() {
    console.log(`Starting round ${gameState.currentRound + 1}`);
    
    // Check if this was the final round
    if (gameState.currentRound >= config.maxRounds) {
        endGame("Game over! All rounds completed.");
        return;
    }
    
    // Increment round counter
    gameState.currentRound++;
    if (elementsMap.currentRound) elementsMap.currentRound.textContent = gameState.currentRound;
    
    // Reset path and traps for the new round
    gameState.currentPath = [];
    gameState.revealedTraps = {};
    gameState.treasureOnPath = 0;
    
    // Clear the cave path display
    if (elementsMap.cavePath) elementsMap.cavePath.innerHTML = '';
    
    // Create a new deck for each round to ensure traps can appear again
    // and maintain the correct ratio between trap and treasure cards
    gameState.treasureValues = []; // Reset treasure values for the new round
    gameState.deck = createDeck();
    console.log(`Created new deck with ${gameState.deck.length} cards for round ${gameState.currentRound}`);
    
    // Display treasure value range in the first round
    if (gameState.currentRound === 1) {
        const playerCount = Object.keys(gameState.players).length;
        const minTreasure = Math.max(1, playerCount);
        const maxTreasure = Math.max(5, playerCount * 4);
        addLogEntry(`Treasure values range from ${minTreasure} to ${maxTreasure} gold based on ${playerCount} players.`, 'highlight');
    }
    
    // Reset all players to be in the cave at the start of the round
    Object.values(gameState.players).forEach(player => {
        player.inCave = true;
        player.status = 'in';
        player.holding = 0;
        updatePlayerElement(player);
    });
    
    // Update active players count
    if (elementsMap.activePlayers) {
        elementsMap.activePlayers.textContent = Object.keys(gameState.players).length;
    }
    
    gameState.phase = 'revealing';
    addLogEntry(`Round ${gameState.currentRound} begins! Everyone enters the cave...`, 'highlight');
    updateGameMessage(`Round ${gameState.currentRound} begins! Ready to reveal the first card.`);
    
    // Reset the reveal card button text and enable it
    if (elementsMap.revealCardBtn) {
        elementsMap.revealCardBtn.textContent = 'Reveal First Card';
        elementsMap.revealCardBtn.disabled = false;
    }
}

/**
 * End the game and show final scores
 */
function endGame(message) {
    gameState.phase = 'gameEnd';
    gameState.isActive = false;
    
    // Display end game message
    addLogEntry(message, 'highlight');
    addLogEntry("Final scores:", 'highlight');
    
    // Sort players by score
    const sortedPlayers = Object.values(gameState.players).sort((a, b) => b.chest - a.chest);
    
    // Display final scores
    sortedPlayers.forEach((player, index) => {
        addLogEntry(`${index + 1}. ${player.username}: ${player.chest} rubies`, index === 0 ? 'success' : '');
    });
    
    // Announce winner
    if (sortedPlayers.length > 0) {
        updateGameMessage(`Game over! ${sortedPlayers[0].username} wins with ${sortedPlayers[0].chest} rubies!`);
    } else {
        updateGameMessage("Game over! No players participated.");
    }
    
    // Enable start game button
    elementsMap.startGameBtn.disabled = false;
    elementsMap.revealCardBtn.disabled = true;
}

/**
 * Handle a chat message from a user
 */
function handleChatMessage(data) {
    const username = data.user;
    const message = data.message.trim().toLowerCase();
    
    // Process commands
    if (message === '!join' && gameState.phase === 'joining') {
        addPlayer(username);
    } else if (message === '!roach' && gameState.phase === 'deciding') {
        playerDecision(username, 'exit');
    }
}

/**
 * Add a player to the game
 */
function addPlayer(username) {
    // Check if player already exists
    if (gameState.players[username]) {
        return;
    }
    
    // Check if player limit has been reached
    if (gameState.playerLimit > 0 && Object.keys(gameState.players).length >= gameState.playerLimit) {
        addLogEntry(`${username} tried to join, but the player limit (${gameState.playerLimit}) has been reached.`, 'warning');
        return;
    }
    
    // Create new player
    const player = {
        username,
        inCave: false,
        holding: 0,
        chest: 0,
        status: 'waiting'
    };
    
    // Add to game state
    gameState.players[username] = player;
    
    // Create player element
    const playerElement = createPlayerElement(player);
    elementsMap.playersContainer.appendChild(playerElement);
    
    // Update player count
    elementsMap.playerCount.textContent = Object.keys(gameState.players).length;
    
    // Log the join
    addLogEntry(`${username} joined the game!`, 'success');
}

/**
 * Record a player's decision
 */
function playerDecision(username, decision) {
    const player = gameState.players[username];
    
    // Check if player exists and is in the cave
    if (!player || !player.inCave) {
        return;
    }

    if(gameState.pendingTrapType) {
        addLogEntry(`${username} tried to roach after a trap has been sprung. 😎💿`, 'warning');
        return;
    }
    
    // Record decision
    player.decision = decision;
    
    // Log the decision
    if (decision === 'exit') {
        addLogEntry(`${username} decided to leave the cave!`);
    }
}

/**
 * Create a card element from a card object
 */
function createCardElement(card) {
    if (!cardTemplate) {
        console.error("Card template not found!");
        return document.createElement('div'); // Return empty div as fallback
    }
    
    const clone = cardTemplate.content.cloneNode(true);
    const cardElement = clone.querySelector('.card');
    
    // Set card type class
    cardElement.classList.add(`${card.type}-card`);
    
    // Set card content
    const titleElement = cardElement.querySelector('.card-title');
    const imageElement = cardElement.querySelector('.card-image');
    const valueElement = cardElement.querySelector('.card-value');
    
    if (card.type === 'treasure') {
        if (titleElement) {
            // Show original value if available, but keep it short
            if (card.hasOwnProperty('originalValue')) {
                titleElement.textContent = `Treasure (${card.originalValue})`;
                // Add title attribute for hover tooltip with full text
                titleElement.title = `Treasure (${card.originalValue})`;
            } else {
                titleElement.textContent = 'Treasure';
                titleElement.title = 'Treasure';
            }
        }
        
        if (valueElement) {
            // Show remaining gold
            valueElement.textContent = `${card.value} gold`;
        }
        
        // Store original and current values as data attributes for animations
        cardElement.dataset.originalValue = card.originalValue || card.value;
        cardElement.dataset.currentValue = card.value;
    } else if (card.type === 'trap') {
        if (titleElement) {
            const trapName = `${card.trapType.charAt(0).toUpperCase() + card.trapType.slice(1)} Trap`;
            titleElement.textContent = trapName;
            titleElement.title = trapName; // Add title attribute for hover tooltip
        }
        cardElement.classList.add(`trap-${card.trapType}`);
    } else if (card.type === 'relic') {
        if (titleElement) {
            titleElement.textContent = 'Relic';
            titleElement.title = 'Relic';
        }
        if (valueElement) {
            valueElement.textContent = `${card.value} gold`;
        }
    }
    
    return cardElement;
}

/**
 * Create a player element from a player object
 */
function createPlayerElement(player) {
    if (!playerTemplate) {
        console.error("Player template not found!");
        return document.createElement('div'); // Return empty div as fallback
    }
    
    const clone = playerTemplate.content.cloneNode(true);
    const playerElement = clone.querySelector('.player');
    
    // Set player data attribute for easy lookup
    playerElement.dataset.username = player.username;
    
    // Set player content
    const nameElement = playerElement.querySelector('.player-name');
    const statusElement = playerElement.querySelector('.player-status');
    const holdingElement = playerElement.querySelector('.player-holding');
    const chestElement = playerElement.querySelector('.player-chest');
    
    if (nameElement) nameElement.textContent = player.username;
    if (statusElement) {
        statusElement.textContent = player.status === 'in' ? 'In Cave' : 
                                   player.status === 'exited' ? 'Exited' : 'Out';
    }
    if (holdingElement) holdingElement.textContent = player.holding || 0;
    if (chestElement) chestElement.textContent = player.chest || 0;
    
    // Add status class
    if (statusElement) {
        if (player.status === 'exited') {
            statusElement.classList.add('exited');
        } else if (player.status === 'out') {
            statusElement.classList.add('out');
        }
    }
    
    return playerElement;
}

/**
 * Update a player element with new data
 */
function updatePlayerElement(player) {
    if (!elementsMap.playersContainer) {
        console.error("Players container not found!");
        return;
    }
    
    const playerElement = elementsMap.playersContainer.querySelector(`.player[data-username="${player.username}"]`);
    
    if (!playerElement) {
        console.log(`Player element for ${player.username} not found, creating new element`);
        const newPlayerElement = createPlayerElement(player);
        elementsMap.playersContainer.appendChild(newPlayerElement);
        return;
    }
    
    // Update player content
    const statusElement = playerElement.querySelector('.player-status');
    const holdingElement = playerElement.querySelector('.player-holding');
    const chestElement = playerElement.querySelector('.player-chest');
    
    if (statusElement) {
        statusElement.textContent = player.inCave ? 'In Cave' : 
                                   player.status === 'exited' ? 'Exited' : 'Out';
        
        // Update status class
        statusElement.classList.remove('exited', 'out');
        
        if (player.status === 'exited') {
            statusElement.classList.add('exited');
        } else if (player.status === 'out') {
            statusElement.classList.add('out');
        }
    }
    
    if (holdingElement) holdingElement.textContent = player.holding || 0;
    if (chestElement) chestElement.textContent = player.chest || 0;
}

/**
 * Add an entry to the game log
 */
function addLogEntry(message, className = '') {
    console.log(`[GAME LOG] ${message}`);
    
    if (!elementsMap.gameLog) {
        console.error("Game log element not found!");
        return;
    }
    
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${className}`;
    logEntry.textContent = message;
    
    elementsMap.gameLog.appendChild(logEntry);
    elementsMap.gameLog.scrollTop = elementsMap.gameLog.scrollHeight;
    
    // Limit the number of log entries to prevent performance issues
    while (elementsMap.gameLog.children.length > 50) {
        elementsMap.gameLog.removeChild(elementsMap.gameLog.firstChild);
    }
}

/**
 * Update the game message display
 */
function updateGameMessage(message) {
    console.log(`[GAME MESSAGE] ${message}`);
    
    if (!elementsMap.gameMessage) {
        console.error("Game message element not found!");
        return;
    }
    
    elementsMap.gameMessage.textContent = message;
}

/**
 * Start timer for a specific duration
 */
function startTimer(seconds, callback) {
    console.log(`Starting timer for ${seconds} seconds`);
    
    // Clear any existing timer
    if (gameState.timer) {
        clearInterval(gameState.timer);
        gameState.timer = null;
    }
    
    // Set up timer state
    gameState.timerRemaining = seconds;
    gameState.timerDuration = seconds;
    
    // Update timer display safely
    const timerDisplay = elementsMap.timerText;
    const timerBar = elementsMap.timerBar;
    
    if (timerDisplay) timerDisplay.textContent = `${seconds}s`;
    if (timerBar) timerBar.style.transform = 'scaleX(1)';
    
    // Start the timer
    gameState.timer = setInterval(() => {
        gameState.timerRemaining--;
        
        // Update timer display safely
        if (timerDisplay) timerDisplay.textContent = `${gameState.timerRemaining}s`;
        if (timerBar) timerBar.style.transform = `scaleX(${gameState.timerRemaining / gameState.timerDuration})`;
        
        // Log the time every 5 seconds or in the last 3 seconds
        if (gameState.timerRemaining % 5 === 0 || gameState.timerRemaining <= 3) {
            console.log(`Timer: ${gameState.timerRemaining}s remaining`);
        }
        
        if (gameState.timerRemaining <= 0) {
            console.log("Timer ended, executing callback");
            clearInterval(gameState.timer);
            gameState.timer = null;
            callback();
        }
    }, 1000);
}

/**
 * Get a readable description of a card
 */
function getCardDescription(card) {
    if (card.type === 'treasure') {
        return `Treasure (${card.value} rubies)`;
    } else if (card.type === 'trap') {
        return `${card.trapType} trap`;
    } else if (card.type === 'relic') {
        return `Relic (${card.value} rubies)`;
    }
    return 'Unknown card';
}

/**
 * Update the path display with current cards and treasure values
 */
function updatePathDisplay() {
    if (!elementsMap.cavePath) {
        console.error("Cave path element not found!");
        return;
    }
    
    // Get all card elements
    const cardElements = elementsMap.cavePath.querySelectorAll('.card');
    
    // Update each card's value display
    gameState.currentPath.forEach((card, index) => {
        if (index < cardElements.length) {
            const cardElement = cardElements[index];
            
            if (card.type === 'treasure') {
                // Update title with original value if available
                const titleElement = cardElement.querySelector('.card-title');
                if (titleElement && card.hasOwnProperty('originalValue')) {
                    titleElement.textContent = `Treasure (${card.originalValue})`;
                }
                
                // Update value display
                const valueElement = cardElement.querySelector('.card-value');
                if (valueElement) {
                    valueElement.textContent = `${card.value} gold`;
                }
                
                // Update data attributes
                cardElement.dataset.currentValue = card.value;
            }
        }
    });
}