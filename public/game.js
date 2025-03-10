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
    elementsMap.joinGrandmasterBtn = document.getElementById('join-grandmaster');
    
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
    
    if (elementsMap.joinGrandmasterBtn) {
        elementsMap.joinGrandmasterBtn.addEventListener('click', joinAsGrandmaster);
    } else {
        console.error("Join as Grandmaster button not found!");
    }
    
    // Set up socket connection for chat messages
    const socket = io();
    socket.on('chatMessage', handleChatMessage);
    
    // Initialize game state
    updateGameMessage('Welcome to Diamant! Click "Start New Game" to begin.');
    
    // Initialize zoom and pan functionality
    initializeZoomPan();
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
    
    // Initialize round statistics tracking
    gameState.roundStats = {
        treasureFound: 0,
        treasureTaken: 0,
        trapsEncountered: 0,
        trapsSprung: 0,
        playersExited: 0,
        playersTrapped: 0
    };
    
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
    
    // Enable the Grandmaster button when a new game starts
    if (elementsMap.joinGrandmasterBtn) {
        elementsMap.joinGrandmasterBtn.disabled = false;
    }
    
    // Initialize path with entrance card
    initializePathWithEntranceCard();
    
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
    
    // Change the Start Game button to "Begin Now" to allow skipping the countdown
    if (elementsMap.startGameBtn) {
        elementsMap.startGameBtn.textContent = 'Begin Now';
        elementsMap.startGameBtn.disabled = false;
        elementsMap.startGameBtn.removeEventListener('click', showPlayerLimitPrompt);
        elementsMap.startGameBtn.addEventListener('click', skipJoinTimer);
    }
    
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
                
                // Instead of calling startNextRound(), create the deck and prepare the game directly
                // Similar to what skipJoinTimer() does
                gameState.deck = createDeck();
                console.log(`Created new deck with ${gameState.deck.length} cards for round ${gameState.currentRound}`);
                
                // Reset player states to be in the cave
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
                
                // Set phase to revealing
                gameState.phase = 'revealing';
                
                // Log the start of the expedition
                addLogEntry(`Expedition ${gameState.currentRound} begins! Everyone enters the cave...`, 'highlight');
                updateGameMessage(`Expedition ${gameState.currentRound} begins! Ready to reveal the first card.`);
                
                // Reset the reveal card button text and enable it
                if (elementsMap.revealCardBtn) {
                    elementsMap.revealCardBtn.textContent = 'Reveal First Card';
                    elementsMap.revealCardBtn.disabled = false;
                }
                
                // Reset the main button
                if (elementsMap.startGameBtn) {
                    elementsMap.startGameBtn.disabled = true;
                    elementsMap.startGameBtn.textContent = 'Begin Expedition';
                    elementsMap.startGameBtn.removeEventListener('click', skipJoinTimer);
                    elementsMap.startGameBtn.addEventListener('click', showPlayerLimitPrompt);
                }
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
 * Skip the join timer and start the game immediately
 */
function skipJoinTimer() {
    console.log("Skipping join timer and starting game immediately");
    
    // Clear the join timer
    if (gameState.timer) {
        clearInterval(gameState.timer);
        gameState.timer = null;
    }
    
    if (Object.keys(gameState.players).length > 0) {
        console.log(`Starting first round with ${Object.keys(gameState.players).length} players`);
        // Create the deck and prepare the game - don't call startNextRound() as that would show summary
        gameState.deck = createDeck();
        console.log(`Created new deck with ${gameState.deck.length} cards for round ${gameState.currentRound}`);
        
        // Reset player states to be in the cave
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
        
        // Set phase to revealing
        gameState.phase = 'revealing';
        
        // Log the start of the expedition
        addLogEntry(`Expedition ${gameState.currentRound} begins! Everyone enters the cave...`, 'highlight');
        updateGameMessage(`Expedition ${gameState.currentRound} begins! Ready to reveal the first card.`);
        
        // Reset the reveal card button text and enable it
        if (elementsMap.revealCardBtn) {
            elementsMap.revealCardBtn.textContent = 'Reveal First Card';
            elementsMap.revealCardBtn.disabled = false;
        }
        
        // Reset the main button
        if (elementsMap.startGameBtn) {
            elementsMap.startGameBtn.disabled = true;
            // Change the text back to "Begin Expedition" (for next game)
            elementsMap.startGameBtn.textContent = 'Begin Expedition';
            elementsMap.startGameBtn.removeEventListener('click', skipJoinTimer);
            elementsMap.startGameBtn.addEventListener('click', showPlayerLimitPrompt);
        }
    } else {
        console.log("No players joined, canceling game");
        gameState.phase = 'waiting';
        gameState.isActive = false;
        updateGameMessage('No players joined. Game canceled.');
        if (elementsMap.startGameBtn) {
            elementsMap.startGameBtn.disabled = false;
            elementsMap.startGameBtn.textContent = 'Begin Expedition';
            elementsMap.startGameBtn.removeEventListener('click', skipJoinTimer);
            elementsMap.startGameBtn.addEventListener('click', showPlayerLimitPrompt);
        }
    }
}

/**
 * Initialize path with entrance card as starting point
 */
function initializePathWithEntranceCard() {
    // Create entrance card
    const entranceCard = {
        type: 'entrance',
        value: 0
    };
    
    // Add to path
    gameState.currentPath.push(entranceCard);
    
    // Draw the path with just the entrance card
    updatePathDisplay();
    
    // Make sure zoom controls are visible from the start
    const cavePath = elementsMap.cavePath;
    if (cavePath && !cavePath.querySelector('.zoom-controls') && window.initializeZoomPan) {
        window.initializeZoomPan();
    }
    
    // Focus on entrance card after a short delay to ensure rendering is complete
    setTimeout(() => {
        const controls = cavePath.querySelector('.zoom-controls');
        if (controls) {
            const entranceButton = controls.querySelector('.focus-entrance');
            if (entranceButton) entranceButton.click();
        }
    }, 100);
    
    // Add log entry
    addLogEntry("The expedition begins at the cave entrance!", 'highlight');
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
    
    // Process the card effects
    processCardEffects(card);
    
    // Start decision phase automatically after revealing a card
    startDecisionPhase();
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
    
    // Process the card effects
    processCardEffects(card);
    
    // Update the path display
    updatePathDisplay();
    
    // Start decision phase automatically after revealing a card
    startDecisionPhase();
}

// Now implement the enhanced versions that extend the original functions
// (These will properly override the functions above since they're already defined)

/**
 * Extended version of revealFirstCard with map layout logic
 */
function enhancedRevealFirstCard() {
    console.log("Revealing first card with map layout (guaranteed not to be a trap)...");
    
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
    
    // Update the path display
    updatePathDisplay();
    
    // Process the card effects
    processCardEffects(card);
    
    // Start decision phase automatically after revealing a card
    startDecisionPhase();
}

/**
 * Extended version of revealNextCard with map layout logic
 */
function enhancedRevealNextCard() {
    console.log("Revealing next card with map layout...");
    
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
        enhancedRevealFirstCard();
        return;
    }
    
    // Reveal the next card
    const card = gameState.deck.pop();
    gameState.currentPath.push(card);
    
    // Process the card effects
    processCardEffects(card);
    
    // Update the entire path display
    updatePathDisplay();
    
    // Start decision phase automatically after revealing a card
    startDecisionPhase();
}

// Replace the original functions with the enhanced versions
// Do this after both functions are defined and the enhanced versions are created
revealFirstCard = enhancedRevealFirstCard;
revealNextCard = enhancedRevealNextCard;

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
            
            // Update round stats
            gameState.roundStats.treasureFound += card.originalValue;
            gameState.roundStats.treasureTaken += card.originalValue - remainingTreasure;
            
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
            gameState.roundStats.treasureFound += card.value;
            addLogEntry(`Revealed: ${card.value} rubies!`, 'success');
        }
    } else if (card.type === 'trap') {
        // Count this trap type
        gameState.revealedTraps[card.trapType] = (gameState.revealedTraps[card.trapType] || 0) + 1;
        
        // Update trap statistics
        gameState.roundStats.trapsEncountered++;
        
        // Check if this is the second trap of this type
        if (gameState.revealedTraps[card.trapType] >= 2) {
            // Update trap sprung statistics
            gameState.roundStats.trapsSprung++;
            
            addLogEntry(`DANGER! A second ${card.trapType} trap appears!`, 'danger');
            
            // First, give players a chance to make a decision
            updateGameMessage(`DANGER! A second ${card.trapType} trap appears! You have 15 seconds to type !roach to escape before the trap springs!`);
            
            // Start decision phase to give players a chance to escape
            startDecisionPhase();
            
            // Activate the trap after the decision phase
            gameState.pendingTrapType = card.trapType;
            
            return; // Exit early as trap handling will happen after decision phase
        } else {
            addLogEntry(`Revealed: A ${card.trapType} trap! Be careful...`, 'warning');
        }
    } else if (card.type === 'relic') {
        gameState.roundStats.treasureFound += card.value;
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
        // Update stats for exited players
        gameState.roundStats.playersExited += exitingPlayers.length;
        
        // Calculate how many players are exiting
        const totalExitingPlayers = exitingPlayers.length;
        
        // Calculate total remaining treasure on the path to divide among exiting players
        const remainingPathTreasure = gameState.treasureOnPath;
        const treasurePerExitingPlayer = Math.floor(remainingPathTreasure / totalExitingPlayers);
        
        // Update round stats for treasure taken
        gameState.roundStats.treasureTaken += remainingPathTreasure;
        
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
    const trappedPlayers = Object.values(gameState.players).filter(p => p.inCave);
    gameState.roundStats.playersTrapped += trappedPlayers.length;
    
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
    
    // Show round summary before starting the next round
    showRoundSummary();
    
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
    
    // Reset round statistics for the new round
    gameState.roundStats = {
        treasureFound: 0,
        treasureTaken: 0,
        trapsEncountered: 0,
        trapsSprung: 0,
        playersExited: 0,
        playersTrapped: 0
    };
    
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
    
    // Initialize with entrance card automatically
    initializePathWithEntranceCard();
}

/**
 * Show round summary modal with statistics
 */
function showRoundSummary() {
    // Don't show summary for round 0 (before game starts)
    if (gameState.currentRound === 0) return;
    
    console.log("Showing round summary");
    
    // Create the modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content summary-modal';
    
    // Add title
    const title = document.createElement('h2');
    title.textContent = `Expedition ${gameState.currentRound} Summary`;
    modalContent.appendChild(title);
    
    // Create summary content
    const summary = document.createElement('div');
    summary.className = 'round-summary';
    
    // Create treasure stats section
    const treasureStats = document.createElement('div');
    treasureStats.className = 'summary-section';
    treasureStats.innerHTML = `
        <h3><span class="summary-icon">🪙</span> Treasure</h3>
        <div class="summary-stat">
            <span class="stat-label">Discovered:</span>
            <span class="stat-value">${gameState.roundStats.treasureFound} rubies</span>
        </div>
        <div class="summary-stat">
            <span class="stat-label">Collected:</span>
            <span class="stat-value">${gameState.roundStats.treasureTaken} rubies</span>
        </div>
        <div class="summary-stat">
            <span class="stat-label">Left behind:</span>
            <span class="stat-value">${gameState.roundStats.treasureFound - gameState.roundStats.treasureTaken} rubies</span>
        </div>
    `;
    summary.appendChild(treasureStats);
    
    // Create danger stats section
    const dangerStats = document.createElement('div');
    dangerStats.className = 'summary-section';
    dangerStats.innerHTML = `
        <h3><span class="summary-icon">⚠️</span> Dangers</h3>
        <div class="summary-stat">
            <span class="stat-label">Traps encountered:</span>
            <span class="stat-value">${gameState.roundStats.trapsEncountered}</span>
        </div>
        <div class="summary-stat">
            <span class="stat-label">Traps sprung:</span>
            <span class="stat-value">${gameState.roundStats.trapsSprung}</span>
        </div>
    `;
    summary.appendChild(dangerStats);
    
    // Create player stats section
    const playerStats = document.createElement('div');
    playerStats.className = 'summary-section';
    playerStats.innerHTML = `
        <h3><span class="summary-icon">👤</span> Explorers</h3>
        <div class="summary-stat">
            <span class="stat-label">Total participants:</span>
            <span class="stat-value">${Object.keys(gameState.players).length}</span>
        </div>
        <div class="summary-stat">
            <span class="stat-label">Safely exited:</span>
            <span class="stat-value">${gameState.roundStats.playersExited}</span>
        </div>
        <div class="summary-stat">
            <span class="stat-label">Trapped:</span>
            <span class="stat-value">${gameState.roundStats.playersTrapped}</span>
        </div>
    `;
    summary.appendChild(playerStats);
    
    // Create player standings
    const standingsSection = document.createElement('div');
    standingsSection.className = 'summary-section player-standings';
    standingsSection.innerHTML = '<h3><span class="summary-icon">🏆</span> Current Standings</h3>';
    
    // Sort players by chest value
    const sortedPlayers = Object.values(gameState.players)
        .sort((a, b) => b.chest - a.chest)
        .slice(0, 5); // Show only top 5
    
    const standingsList = document.createElement('div');
    standingsList.className = 'standings-list';
    
    sortedPlayers.forEach((player, index) => {
        const playerEntry = document.createElement('div');
        playerEntry.className = 'player-standing';
        playerEntry.innerHTML = `
            <span class="standing-rank">${index + 1}.</span>
            <span class="standing-name">${player.username}</span>
            <span class="standing-score">${player.chest} rubies</span>
        `;
        standingsList.appendChild(playerEntry);
    });
    
    standingsSection.appendChild(standingsList);
    summary.appendChild(standingsSection);
    
    modalContent.appendChild(summary);
    
    // Add continue button
    const buttonContainer = document.createElement('div');
    buttonContainer.style.marginTop = '20px';
    buttonContainer.style.textAlign = 'center';
    
    const continueButton = document.createElement('button');
    continueButton.textContent = gameState.currentRound >= config.maxRounds ? 
        'See Final Results' : 'Continue to Next Expedition';
    continueButton.className = 'primary-btn';
    continueButton.style.minWidth = '200px';
    
    buttonContainer.appendChild(continueButton);
    modalContent.appendChild(buttonContainer);
    
    // Add modal to the page
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Add event listener to continue button
    continueButton.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
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
    
    // Enable start game button and reset text
    if (elementsMap.startGameBtn) {
        elementsMap.startGameBtn.disabled = false;
        elementsMap.startGameBtn.textContent = 'Begin Expedition';
        elementsMap.startGameBtn.removeEventListener('click', skipJoinTimer);
        elementsMap.startGameBtn.addEventListener('click', showPlayerLimitPrompt);
    }
    
    elementsMap.revealCardBtn.disabled = true;
    
    // Enable the Grandmaster button again when the game ends
    if (elementsMap.joinGrandmasterBtn) {
        elementsMap.joinGrandmasterBtn.disabled = false;
    }
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
 * Join the game as the Grandmaster
 */
function joinAsGrandmaster() {
    if (!gameState.isActive || gameState.phase !== 'joining') {
        // Only allow joining during the joining phase
        updateGameMessage("The Grandmaster can only join during the joining phase!");
        return;
    }

    // Check if Grandmaster already exists
    if (gameState.players["Grandmaster"]) {
        updateGameMessage("The Grandmaster is already in this expedition!");
        return;
    }
    
    // Add the Grandmaster as a player
    addPlayer("Grandmaster", true);
    
    // Provide feedback
    updateGameMessage("The Grandmaster has joined the expedition!");
    elementsMap.joinGrandmasterBtn.disabled = true;
}

/**
 * Add a player to the game
 */
function addPlayer(username, isGrandmaster = false) {
    // Check if player already exists
    if (gameState.players[username]) {
        return;
    }
    
    // Check if player limit has been reached (skip check for Grandmaster)
    if (!isGrandmaster && gameState.playerLimit > 0 && Object.keys(gameState.players).length >= gameState.playerLimit) {
        addLogEntry(`${username} tried to join, but the player limit (${gameState.playerLimit}) has been reached.`, 'warning');
        return;
    }
    
    // Create new player
    const player = {
        username,
        inCave: false,
        holding: 0,
        chest: 0,
        status: 'waiting',
        isGrandmaster: isGrandmaster
    };
    
    // Add to game state
    gameState.players[username] = player;
    
    // Create player element
    const playerElement = createPlayerElement(player);
    elementsMap.playersContainer.appendChild(playerElement);
    
    // Update player count
    elementsMap.playerCount.textContent = Object.keys(gameState.players).length;
    
    // Log the join - special message for Grandmaster
    if (isGrandmaster) {
        addLogEntry(`The Grandmaster has arrived to oversee the expedition!`, 'highlight');
    } else {
        addLogEntry(`${username} joined the game!`, 'success');
    }
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
    
    // Record decision
    player.decision = decision;
    
    // Log the decision
    if (decision === 'exit') {
        addLogEntry(`${username} decided to leave the cave!`);
    }
}

/**
 * Create a card element from a card object with emoji icons
 */
function createCardElement(card, isNewCard = false) {
    if (!cardTemplate) {
        console.error("Card template not found!");
        return document.createElement('div'); // Return empty div as fallback
    }
    
    const clone = cardTemplate.content.cloneNode(true);
    const cardElement = clone.querySelector('.card');
    
    // Set card type class
    cardElement.classList.add(`${card.type}-card`);
    
    if (card.type === 'trap') {
        cardElement.classList.add(`trap-${card.trapType}`);
    }
    
    // Handle animation differently - remove transform from default style
    // but keep the card-animated class
    if (isNewCard && card.type !== 'entrance') {
        cardElement.classList.add('card-animated');
        // Don't override the transform directly - let CSS handle the animation
    } else {
        // For non-animated cards, set scale to 1 explicitly
        cardElement.style.transform = 'scale(1)';
        cardElement.style.opacity = '1';
    }
    
    // Rest of the function remains the same
    const cardTitle = cardElement.querySelector('.card-title');
    const cardImage = cardElement.querySelector('.card-image');
    const cardValueContainer = cardElement.querySelector('.card-value-container');

    if (card.type === 'entrance') {
        // Set title
        if (cardTitle) {
            cardTitle.textContent = 'Cave Entrance';
            cardTitle.title = 'Starting Point'; // Hover tooltip
        }
        
        // Set entrance emoji
        if (cardImage) {
            cardImage.innerHTML = `<span class="card-emoji">🗻</span>`;
        }
        
        // Set value content
        if (cardValueContainer) {
            cardValueContainer.innerHTML = '';
            const valueElem = document.createElement('div');
            valueElem.className = 'card-value';
            valueElem.innerHTML = '<span>START</span>';
            cardValueContainer.appendChild(valueElem);
        }
    } else if (card.type === 'treasure') {
        // Set title
        if (cardTitle) {
            cardTitle.textContent = 'Treasure';
            cardTitle.title = 'Treasure'; // Add title attribute for hover tooltip
        }
        
        // Set treasure emoji
        if (cardImage) {
            cardImage.innerHTML = `<span class="card-emoji">🪙</span>`;
        }
        
        // Clear any previous values
        if (cardValueContainer) {
            cardValueContainer.innerHTML = '';
            
            // Add original value if available
            if (card.hasOwnProperty('originalValue')) {
                const originalValueElem = document.createElement('div');
                originalValueElem.className = 'card-original-value';
                originalValueElem.innerHTML = '<span class="value-label">Total</span><span>' + card.originalValue + '</span>';
                cardValueContainer.appendChild(originalValueElem);
            }
            
            // Add current value
            const valueElem = document.createElement('div');
            valueElem.className = 'card-value';
            valueElem.innerHTML = '<span class="value-label">Left</span><span>' + card.value + '</span>';
            cardValueContainer.appendChild(valueElem);
        }
        
        // Store original and current values as data attributes for animations
        cardElement.dataset.originalValue = card.originalValue || card.value;
        cardElement.dataset.currentValue = card.value;
        
    } else if (card.type === 'trap') {
        if (cardTitle) {
            const trapName = `${card.trapType.charAt(0).toUpperCase() + card.trapType.slice(1)} Trap`;
            cardTitle.textContent = trapName;
            cardTitle.title = trapName; // Add title attribute for hover tooltip
        }
        
        // Set trap emoji based on type
        if (cardImage) {
            let emoji = '';
            
            switch (card.trapType) {
                case 'snake':
                    emoji = '🐍';
                    break;
                case 'spider':
                    emoji = '🕷️';
                    break;
                case 'lava':
                    emoji = '🔥';
                    break;
                case 'rockfall':
                    emoji = '🪨';
                    break;
                case 'poison':
                    emoji = '☠️';
                    break;
                default:
                    emoji = '⚠️';
            }
            
            cardImage.innerHTML = `<span class="card-emoji">${emoji}</span>`;
        }
        
        // Clear value container for traps
        if (cardValueContainer) {
            cardValueContainer.innerHTML = '';
            const warningElem = document.createElement('div');
            warningElem.className = 'card-value danger';
            warningElem.innerHTML = '<span>DANGER</span>';
            cardValueContainer.appendChild(warningElem);
        }
        
    } else if (card.type === 'relic') {
        if (cardTitle) {
            cardTitle.textContent = 'Relic';
            cardTitle.title = 'Ancient Relic'; // Add title attribute for hover tooltip
        }
        
        // Set relic emoji
        if (cardImage) {
            cardImage.innerHTML = `<span class="card-emoji">🏺</span>`;
        }
        
        // Clear any previous values
        if (cardValueContainer) {
            cardValueContainer.innerHTML = '';
            const valueElem = document.createElement('div');
            valueElem.className = 'card-value';
            valueElem.innerHTML = '<span class="value-label">Value:</span><span>' + card.value + '</span>';
            cardValueContainer.appendChild(valueElem);
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
    // Update to show "Holding: X" instead of just the number
    if (holdingElement) holdingElement.textContent = `Holding: ${player.holding || 0}`;
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
    
    // Update to show "Holding: X" instead of just the number
    if (holdingElement) holdingElement.textContent = `Holding: ${player.holding || 0}`;
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
 * Modified to preserve existing card positions and add grid visualization
 */
function updatePathDisplay() {
    if (!elementsMap.cavePath) {
        console.error("Cave path element not found!");
        return;
    }
    
    // Check if path container exists
    const existingPathContainer = elementsMap.cavePath.querySelector('.path-container');
    
    if (!existingPathContainer) {
        // First time setup - create container and add all cards
        const pathContainer = document.createElement('div');
        pathContainer.className = 'path-container';
        elementsMap.cavePath.appendChild(pathContainer);
        
        const pathGrid = document.createElement('div');
        pathGrid.className = 'path-grid';
        pathContainer.appendChild(pathGrid);
        
        // Add subtle grid cell markers for reference (optional, can be commented out for production)
        // This helps visualize the actual grid positions
        for (let row = 1; row <= 25; row++) {
            for (let col = 1; col <= 25; col++) {
                const marker = document.createElement('div');
                marker.className = 'grid-cell-marker';
                marker.textContent = `${col},${row}`;
                marker.style.left = `${(col - 0.5) * 150 - 5 - 10}px`;
                marker.style.top = `${(row - 0.5) * 150 - 5 - 10}px`;
                pathGrid.appendChild(marker);
            }
        }
        
        // Generate positions for all cards
        const gridPositions = generateGridPositions(gameState.currentPath.length);
        
        // Store positions in container data attribute for future reference
        pathContainer.dataset.gridPositions = JSON.stringify(gridPositions);
        
        // Add all cards
        gameState.currentPath.forEach((card, index) => {
            const isLastCard = index === gameState.currentPath.length - 1 && index > 0;
            const cardElement = createCardElement(card, isLastCard);
            const pos = gridPositions[index];
            
            // Set position and unique identifier
            cardElement.style.gridColumn = `${pos.col} / span 1`;
            cardElement.style.gridRow = `${pos.row} / span 1`;
            cardElement.dataset.position = `${pos.col}-${pos.row}`;
            cardElement.dataset.index = index;
            cardElement.dataset.cardId = `card-${index}`;
            
            pathGrid.appendChild(cardElement);
            
            // Add connection lines for all cards except the first
            if (index > 0) {
                const prevPos = gridPositions[index - 1];
                drawConnectionLine(prevPos, pos, pathGrid);
            }
        });
        
        // Add zoom controls
        if (!elementsMap.cavePath.querySelector('.zoom-controls')) {
            const controls = createZoomControls();
            elementsMap.cavePath.appendChild(controls);
            
            if (window.setupZoomControlEvents) {
                window.setupZoomControlEvents(controls);
            }
        }
    } else {
        // Update existing path - this keeps cards in place
        const pathGrid = existingPathContainer.querySelector('.path-grid');
        
        // Get stored positions
        let storedPositions = [];
        try {
            storedPositions = JSON.parse(existingPathContainer.dataset.gridPositions || '[]');
        } catch (e) {
            console.error("Failed to parse stored positions:", e);
        }
        
        // Check if we need to generate positions for new cards
        if (storedPositions.length < gameState.currentPath.length) {
            const newCardCount = gameState.currentPath.length - storedPositions.length;
            const newPositions = [];
            
            // Generate positions for new cards, starting from the last known position
            let lastPos = storedPositions.length > 0 
                ? storedPositions[storedPositions.length - 1] 
                : { col: 13, row: 13 }; // Default to center if no positions
            
            for (let i = 0; i < newCardCount; i++) {
                // Generate a random direction for each new card
                const rand = Math.random();
                // Move by 1 column for tighter spacing
                let newCol = lastPos.col + 1;
                let newRow = lastPos.row;
                
                if (rand < 0.5) {
                    // Go right (50% chance)
                    // newRow stays the same
                } else if (rand < 0.75) {
                    // Go up-right (25% chance)
                    newRow--;
                } else {
                    // Go down-right (25% chance)
                    newRow++;
                }
                
                // Keep within grid bounds
                newRow = Math.max(2, Math.min(newRow, 23));
                
                // Check if we're getting close to the right edge of the grid
                // If so, we might want to expand the grid horizontally
                if (newCol > 20) {
                    // Try to apply a different random direction that turns back
                    const randTurn = Math.random();
                    if (randTurn < 0.7) { // 70% chance to turn
                        if (randTurn < 0.35) { // 35% chance to go up
                            newCol = lastPos.col;
                            newRow = lastPos.row - 1;
                        } else { // 35% chance to go down
                            newCol = lastPos.col;
                            newRow = lastPos.row + 1;
                        }
                    }
                }
                
                const newPos = { col: newCol, row: newRow };
                newPositions.push(newPos);
                lastPos = newPos;
            }
            
            // Add new positions to stored positions
            const updatedPositions = [...storedPositions, ...newPositions];
            existingPathContainer.dataset.gridPositions = JSON.stringify(updatedPositions);
            storedPositions = updatedPositions;
        }
        
        // Update or add cards as needed
        gameState.currentPath.forEach((card, index) => {
            // Try to find existing card element
            const existingCard = pathGrid.querySelector(`[data-card-id="card-${index}"]`);
            
            if (existingCard) {
                // Card exists, update values if needed (for treasure/relic cards)
                if (card.type === 'treasure' || card.type === 'relic') {
                    const valueContainer = existingCard.querySelector('.card-value-container');
                    if (valueContainer) {
                        valueContainer.innerHTML = '';
                        
                        if (card.hasOwnProperty('originalValue')) {
                            const originalValueElem = document.createElement('div');
                            originalValueElem.className = 'card-original-value';
                            originalValueElem.innerHTML = '<span class="value-label">Total</span><span>' + card.originalValue + '</span>';
                            valueContainer.appendChild(originalValueElem);
                        }
                        
                        const valueElem = document.createElement('div');
                        valueElem.className = 'card-value';
                        if (card.type === 'treasure') {
                            valueElem.innerHTML = '<span class="value-label">Left</span><span>' + card.value + '</span>';
                        } else {
                            valueElem.innerHTML = '<span class="value-label">Value</span><span>' + card.value + '</span>';
                        }
                        valueContainer.appendChild(valueElem);
                    }
                }
            } else {
                // Create new card
                const isNewCard = index > 0; // All cards except entrance are "new" for animation
                const cardElement = createCardElement(card, isNewCard);
                const pos = storedPositions[index];
                
                if (!pos) {
                    console.error(`No position found for card ${index}`);
                    return;
                }
                
                // Position card
                cardElement.style.gridColumn = `${pos.col} / span 1`;
                cardElement.style.gridRow = `${pos.row} / span 1`;
                cardElement.dataset.position = `${pos.col}-${pos.row}`;
                cardElement.dataset.index = index;
                cardElement.dataset.cardId = `card-${index}`;
                
                // Add to grid
                pathGrid.appendChild(cardElement);
                
                // Add connection line if not first card
                if (index > 0) {
                    const prevPos = storedPositions[index - 1];
                    drawConnectionLine(prevPos, pos, pathGrid);
                }
            }
        });
    }
}

/**
 * Draw a connecting line between two card positions
 */
function drawConnectionLine(pos1, pos2, gridContainer) {
    const connection = document.createElement('div');
    connection.className = 'path-connection';
    
    // Calculate the center points of the start and end positions
    // Each grid cell is 140px square with 10px gap
    const x1 = (pos1.col - 0.5) * 150 - 5;
    const y1 = (pos1.row - 0.5) * 150 - 5;
    const x2 = (pos2.col - 0.5) * 150 - 5;
    const y2 = (pos2.row - 0.5) * 150 - 5;
    
    // Calculate the angle and length of the line
    const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
    const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    
    // Position and rotate the line
    connection.style.width = `${length}px`;
    connection.style.height = '4px';
    connection.style.top = `${y1}px`;
    connection.style.left = `${x1}px`;
    connection.style.transformOrigin = '0 0';
    connection.style.transform = `rotate(${angle}deg)`;
    
    gridContainer.appendChild(connection);
}

/**
 * Create zoom controls for the cave path
 */
function createZoomControls() {
    const controls = document.createElement('div');
    controls.className = 'zoom-controls';
    controls.innerHTML = `
        <button class="zoom-btn zoom-in" title="Zoom In">+</button>
        <button class="zoom-btn zoom-out" title="Zoom Out">−</button>
        <button class="zoom-btn zoom-reset" title="Reset Zoom">↺</button>
        <button class="zoom-btn focus-latest" title="Go to Latest Card">⤑</button>
        <button class="zoom-btn focus-entrance" title="Go to Entrance">⌂</button>
    `;
    return controls;
}

/**
 * Set up zoom and pan functionality for the cave path
 */
function initializeZoomPan() {
    const cavePath = elementsMap.cavePath;
    if (!cavePath) return;
    
    let pathContainer = null;
    let isDragging = false;
    let startX, startY;
    let translateX = 0, translateY = 0;
    let scale = 1;
    const MIN_SCALE = 0.3;
    const MAX_SCALE = 3;
    
    // Create zoom controls container
    const controls = createZoomControls();
    cavePath.appendChild(controls);
    
    // Set up event listeners for buttons
    setupZoomControlEvents(controls);
    
    // Store setupZoomControlEvents on window for reuse
    window.setupZoomControlEvents = setupZoomControlEvents;
    
    // Set up event listeners for zoom control buttons
    function setupZoomControlEvents(controls) {
        controls.querySelector('.zoom-in').addEventListener('click', () => {
            if (scale < MAX_SCALE) {
                const rect = cavePath.getBoundingClientRect();
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                zoomAtPoint(centerX, centerY, scale + 0.2);
            }
        });
        
        controls.querySelector('.zoom-out').addEventListener('click', () => {
            if (scale > MIN_SCALE) {
                const rect = cavePath.getBoundingClientRect();
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                zoomAtPoint(centerX, centerY, scale - 0.2);
            }
        });
        
        controls.querySelector('.zoom-reset').addEventListener('click', resetView);
        controls.querySelector('.focus-latest').addEventListener('click', focusOnLatestCard);
        controls.querySelector('.focus-entrance').addEventListener('click', focusOnEntranceCard);
    }

    // Mouse down - start dragging
    cavePath.addEventListener('mousedown', (e) => {
        if (e.target.closest('.zoom-controls')) return;
        
        isDragging = true;
        startX = e.clientX - translateX;
        startY = e.clientY - translateY;
        cavePath.style.cursor = 'grabbing';
        e.preventDefault();
    });
    
    // Mouse move - handle dragging
    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        translateX = e.clientX - startX;
        translateY = e.clientY - startY;
        updateTransform();
        e.preventDefault();
    });
    
    // Mouse up - stop dragging
    window.addEventListener('mouseup', () => {
        isDragging = false;
        if (cavePath) cavePath.style.cursor = 'grab';
    });
    
    // Mouse leave - also stop dragging
    cavePath.addEventListener('mouseleave', () => {
        if (isDragging) {
            isDragging = false;
            cavePath.style.cursor = 'grab';
        }
    });
    
    // Touch start - for mobile
    cavePath.addEventListener('touchstart', (e) => {
        if (e.target.closest('.zoom-controls')) return;
        
        if (e.touches.length === 1) {
            isDragging = true;
            startX = e.touches[0].clientX - translateX;
            startY = e.touches[0].clientY - translateY;
            e.preventDefault();
        }
    });
    
    // Touch move - for mobile
    cavePath.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        
        if (e.touches.length === 1) {
            translateX = e.touches[0].clientX - startX;
            translateY = e.touches[0].clientY - startY;
            updateTransform();
            e.preventDefault();
        }
    });
    
    // Touch end - for mobile
    cavePath.addEventListener('touchend', () => {
        isDragging = false;
    });
    
    // Helper function to find the grid cell at a specific point
    function findGridCellAtPoint(clientX, clientY) {
        if (!pathContainer) return null;
        
        const pathGrid = pathContainer.querySelector('.path-grid');
        if (!pathGrid) return null;
        
        const rect = cavePath.getBoundingClientRect();
        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;
        
        // Convert mouse position to grid space (accounting for current transform)
        const gridX = (mouseX - translateX) / scale;
        const gridY = (mouseY - translateY) / scale;
        
        // Calculate grid cell (each cell is 140px with 10px gap, total 150px)
        const cellSize = 150;
        const col = Math.floor(gridX / cellSize) + 1;
        const row = Math.floor(gridY / cellSize) + 1;
        
        // Ensure we're within grid bounds
        if (col < 1 || col > 15 || row < 1 || row > 15) return null;
        
        // Calculate center point of the cell
        const centerX = (col - 0.5) * cellSize;
        const centerY = (row - 0.5) * cellSize;
        
        // Convert back to screen coordinates
        const screenX = centerX * scale + translateX;
        const screenY = centerY * scale + translateY;
        
        return {
            col,
            row,
            centerX: screenX,
            centerY: screenY
        };
    }
    
    // Wheel event for zooming - with grid-based focusing
    cavePath.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        // Calculate zoom direction and amount
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1; // Smoother zoom steps
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * zoomFactor));
        
        if (newScale !== scale) {
            // Find the grid cell under the mouse cursor
            const gridCell = findGridCellAtPoint(e.clientX, e.clientY);
            
            if (gridCell) {
                // Zoom centered on the grid cell
                zoomAtPoint(gridCell.centerX, gridCell.centerY, newScale);
            } else {
                // Fall back to zooming at the exact mouse position if no grid cell is found
                const rect = cavePath.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                zoomAtPoint(mouseX, mouseY, newScale);
            }
        }
    });
    
    // Zoom centered at a specific point - improved precision
    function zoomAtPoint(pointX, pointY, newScale) {
        if (!pathContainer) return;
        
        // Calculate point position in world space before zoom
        const worldX = (pointX - translateX) / scale;
        const worldY = (pointY - translateY) / scale;
        
        // Apply new scale
        const oldScale = scale;
        scale = newScale;
        
        // Recalculate translation to keep the point under cursor
        translateX = pointX - worldX * scale;
        translateY = pointY - worldY * scale;
        
        updateTransform();
    }
    
    // Update transform with current translation and scale
    function updateTransform() {
        if (!pathContainer) return;
        pathContainer.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    }
    
    // Reset view to default position
    function resetView() {
        scale = 1;
        translateX = 0;
        translateY = 0;
        updateTransform();
    }
    
    // Focus on the latest card
    function focusOnLatestCard() {
        if (!pathContainer || gameState.currentPath.length === 0) return;
        
        const lastCard = Array.from(pathContainer.querySelectorAll('.card')).pop();
        if (!lastCard) return;
        
        focusOnElement(lastCard);
    }
    
    // Focus on the entrance card
    function focusOnEntranceCard() {
        if (!pathContainer) return;
        
        const entranceCard = pathContainer.querySelector('.entrance-card');
        if (entranceCard) {
            focusOnElement(entranceCard);
        }
    }
    
    // Helper to focus on a specific element
    function focusOnElement(element) {
        if (!element || !pathContainer) return;
        
        const containerRect = cavePath.getBoundingClientRect();
        const cardRect = element.getBoundingClientRect();
        
        // Calculate where the element should be positioned
        const targetX = containerRect.width / 2 - cardRect.width / 2;
        const targetY = containerRect.height / 2 - cardRect.height / 2;
        
        // Calculate current position of element (relative to container)
        const currentX = cardRect.left - containerRect.left;
        const currentY = cardRect.top - containerRect.top;
        
        // Calculate the translation needed
        translateX += (targetX - currentX);
        translateY += (targetY - currentY);
        
        updateTransform();
    }

    // Make these functions available globally
    window.zoomAtPoint = zoomAtPoint;
    window.findGridCellAtPoint = findGridCellAtPoint;
    window.focusOnElement = focusOnElement;
    window.focusOnLatestCard = focusOnLatestCard;  
    window.focusOnEntranceCard = focusOnEntranceCard;
    window.updateTransform = updateTransform;
    
    // Update references
    pathContainer = cavePath.querySelector('.path-container');
    
    // Override the existing updatePathDisplay to maintain zoom state when revealing cards
    const originalUpdatePathDisplay = updatePathDisplay;
    window.updatePathDisplay = function() {
        // Remember the current transform state
        const previousScale = scale;
        const previousTranslateX = translateX;
        const previousTranslateY = translateY;
        
        // Update the display
        originalUpdatePathDisplay();
        
        // Get the updated path container reference
        pathContainer = cavePath.querySelector('.path-container');
        
        // If this is the initial path setup (only entrance card), center on it
        if (gameState.currentPath.length === 1) {
            resetView();
            setTimeout(() => {
                if (window.focusOnEntranceCard) {
                    window.focusOnEntranceCard();
                }
            }, 50);
        } 
        // Otherwise restore the previous transform state
        else {
            // Restore the zoom and position
            scale = previousScale;
            translateX = previousTranslateX;
            translateY = previousTranslateY;
            updateTransform();
            
            // We're no longer automatically focusing on the new card
            // Only auto-focus if this is a brand new path (first card after entrance)
            if (gameState.currentPath.length === 2) {
                setTimeout(() => {
                    const lastCard = Array.from(pathContainer.querySelectorAll('.card')).pop();
                    if (lastCard) {
                        focusOnElement(lastCard);
                    }
                }, 50);
            }
        }
    };
    
    // Initial focus on entrance card if it exists
    focusOnEntranceCard();
}

// Store initializeZoomPan in window to ensure it's accessible
window.initializeZoomPan = initializeZoomPan;

/**
 * Generate grid positions for the cards with more randomness
 * Ensures that the same direction isn't repeated more than twice
 */
function generateGridPositions(cardCount) {
    const positions = [];
    
    // Start position (center of grid)
    const startCol = 13; // Middle column of a 25x25 grid
    const startRow = 13; // Middle row as starting point
    
    // Add the entrance card position
    positions.push({ col: startCol, row: startRow });
    
    // Define possible directions
    const directions = [
        { name: 'right', colDelta: 1, rowDelta: 0 },
        { name: 'up-right', colDelta: 1, rowDelta: -1 },
        { name: 'down-right', colDelta: 1, rowDelta: 1 },
        { name: 'up', colDelta: 0, rowDelta: -1 },
        { name: 'down', colDelta: 0, rowDelta: 1 }
    ];
    
    // Track the last direction used and how many times it was repeated
    let lastDirectionName = null;
    let directionRepeatCount = 0;
    
    // For all subsequent cards (after the entrance), generate positions with spacing
    let lastCol = startCol;
    let lastRow = startRow;
    
    for (let i = 1; i < cardCount; i++) {
        // Filter available directions based on current position and past usage
        const availableDirections = directions.filter(dir => {
            // Don't allow going out of bounds (stay within grid)
            const newCol = lastCol + dir.colDelta;
            const newRow = lastRow + dir.rowDelta;
            
            // Check grid boundaries
            if (newRow < 2 || newRow > 23) return false;
            
            // Avoid going too far right (encourage turning)
            if (newCol > 22) {
                // Only allow vertical moves when we're too far right
                return dir.colDelta === 0;
            }
            
            // Limit direction repetition
            if (dir.name === lastDirectionName && directionRepeatCount >= 2) {
                return false;
            }
            
            return true;
        });
        
        // If no directions are available (trapped), force a right movement
        let chosenDirection;
        if (availableDirections.length === 0) {
            console.log("Path is trapped, forcing a new direction");
            chosenDirection = { name: 'right', colDelta: 1, rowDelta: 0 };
        } else {
            // Choose a random available direction
            chosenDirection = availableDirections[Math.floor(Math.random() * availableDirections.length)];
        }
        
        // Update direction tracking
        if (chosenDirection.name === lastDirectionName) {
            directionRepeatCount++;
        } else {
            lastDirectionName = chosenDirection.name;
            directionRepeatCount = 1;
        }
        
        // Calculate the new position
        const newCol = lastCol + chosenDirection.colDelta;
        const newRow = lastRow + chosenDirection.rowDelta;
        
        // Add the new position
        positions.push({ col: newCol, row: newRow });
        
        // Update last position for next card
        lastCol = newCol;
        lastRow = newRow;
    }
    
    return positions;
}