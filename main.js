
import { Chess } from 'chess.js';

const boardElement = document.getElementById('chessboard');
const modal = document.getElementById('overlay');
const modalMsg = document.getElementById('modal-message');
const modalBtn = document.getElementById('modal-btn');
const coachMsg = document.getElementById('coach-message');
const xpValEl = document.getElementById('xp-val');
const xpFillEl = document.getElementById('xp-bar-fill');
const levelEl = document.getElementById('level-num');
const movesList = document.getElementById('move-history');
const diffSelect = document.getElementById('difficulty-select'); // 1, 2, 3
const themeSwatches = document.querySelectorAll('.theme-swatch');
const turnIndicator = document.getElementById('turn-indicator');
const newGameBtn = document.getElementById('new-game-btn');
const capturedWhiteEl = document.getElementById('captured-white');
const capturedBlackEl = document.getElementById('captured-black');

let game = new Chess();
let draggedPiece = null;
let dragSourceSquare = null;
let userColor = 'w'; // User is always white for now
let currentXP = 0;
let currentLevel = 1;

// Piece Assets
const pieces = {
    'p': { w: 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg', b: 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg' },
    'n': { w: 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg', b: 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg' },
    'b': { w: 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg', b: 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg' },
    'r': { w: 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg', b: 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg' },
    'q': { w: 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg', b: 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg' },
    'k': { w: 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg', b: 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg' }
};

// Sound Effects (using simple beeps or oscillator if no assets, but browser might block AudioContext)
// For simplicity, we'll try to use polite sounds if possible, or just visual feedback.
// Let's rely on Coach and visual pulse for feedback to avoid asset missing errors.

function initGame() {
    game.reset();
    renderBoard();
    updateStatus();
    coachMsg.textContent = "Good luck! You are playing as White. Drag a pawn to start!";
    movesList.innerHTML = '';
    modal.classList.add('hidden');
    updateCaptures();

    // Default theme handled by HTML active class, but enable it just in case logic needs it
    updateBoardTheme('classic');
}

// Sound Synthesis using Web Audio API
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

function playSound(type) {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (type === 'move') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'capture') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.15);
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
    } else if (type === 'gameover') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.setValueAtTime(554, audioCtx.currentTime + 0.2);
        osc.frequency.setValueAtTime(659, audioCtx.currentTime + 0.4);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.8);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.8);
    }
}

function getPieceImage(type, color) {
    return pieces[type][color];
}

function renderBoard() {
    boardElement.innerHTML = '';
    const board = game.board(); // 8x8 array

    // We loop 0-7 (rank 8 downto 1 usually?)
    // chess.js board[0] is rank 8 (a8..h8)
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const square = document.createElement('div');
            square.classList.add('square');
            // Color
            const isLight = (r + c) % 2 === 0;
            square.classList.add(isLight ? 'light' : 'dark');

            const file = String.fromCharCode(97 + c);
            const rank = 8 - r;
            const squareId = `${file}${rank}`;
            square.dataset.square = squareId;

            const pieceData = board[r][c];
            if (pieceData) {
                const piece = document.createElement('div');
                piece.classList.add('piece');
                piece.style.backgroundImage = `url(${getPieceImage(pieceData.type, pieceData.color)})`;
                piece.dataset.square = squareId;
                piece.dataset.type = pieceData.type;
                piece.dataset.color = pieceData.color;

                // Add drag events
                if (pieceData.color === userColor && !game.isGameOver()) {
                    piece.addEventListener('pointerdown', onPointerDown);
                }


                // Check for undefended/under attack for learning mode
                if (pieceData.color === userColor) {
                    checkDanger(squareId, pieceData.color, piece);
                }

                square.appendChild(piece);
            }

            boardElement.appendChild(square);
        }
    }
}

// Learning Mode: Check danger
function checkDanger(square, color, pieceEl) {
    const opponent = color === 'w' ? 'b' : 'w';
    try {
        if (game.isAttacked(square, opponent)) {
            const isDefended = game.isAttacked(square, color);
            pieceEl.classList.add('under-attack-undefended');
            // We can differentiate style if needed, but using same pulse for now
        }
    } catch (e) {
        // Ignore if unsupported
    }
}

// Drag and Drop Logic
function onPointerDown(e) {
    e.preventDefault();
    const piece = e.target;
    const squareId = piece.dataset.square;

    draggedPiece = piece;
    dragSourceSquare = squareId;

    // Create a Ghost image for dragging visually
    const ghost = piece.cloneNode(true);
    ghost.classList.add('dragging');
    ghost.style.position = 'absolute';
    ghost.style.width = '60px'; // fixed size or compute
    ghost.style.height = '60px';
    ghost.style.left = `${e.clientX - 30}px`;
    ghost.style.top = `${e.clientY - 30}px`;

    document.body.appendChild(ghost);
    draggedPiece.style.opacity = '0.3';

    // Highlight legal moves
    highlightMoves(squareId);

    // Bind move/up events to document
    function moveHandler(ev) {
        ghost.style.left = `${ev.clientX - 30}px`;
        ghost.style.top = `${ev.clientY - 30}px`;
    }

    function upHandler(ev) {
        document.removeEventListener('pointermove', moveHandler);
        document.removeEventListener('pointerup', upHandler);

        ghost.remove();
        draggedPiece.style.opacity = '1';

        // Find drop target
        // We hide the ghost temporarily (or use pointer-events: none on it) to get element underlying
        ghost.style.display = 'none';
        const elemBelow = document.elementFromPoint(ev.clientX, ev.clientY);
        let targetSquare = null;

        // Traverse up to find .square
        let current = elemBelow;
        while (current) {
            if (current.classList.contains('square')) {
                targetSquare = current.dataset.square;
                break;
            }
            if (current.classList.contains('piece')) {
                // dropped on a piece, get its square
                targetSquare = current.dataset.square;
                break;
            }
            current = current.parentElement;
        }

        if (targetSquare) {
            attemptMove(dragSourceSquare, targetSquare);
        } else {
            renderBoard(); // reset highlights
        }
    }

    document.addEventListener('pointermove', moveHandler);
    document.addEventListener('pointerup', upHandler);
}

function highlightMoves(square) {
    // Clear old highlights
    document.querySelectorAll('.highlight, .highlight-capture').forEach(el => {
        el.classList.remove('highlight', 'highlight-capture');
    });

    const moves = game.moves({ square: square, verbose: true });
    moves.forEach(move => {
        // Find square element
        const sqEl = document.querySelector(`.square[data-square="${move.to}"]`);
        if (sqEl) {
            if (move.flags.includes('c') || move.flags.includes('e')) {
                sqEl.classList.add('highlight-capture');
            } else {
                sqEl.classList.add('highlight');
            }
        }
    });

    // Coach tip
    if (moves.length > 0) {
        coachMsg.textContent = `You selected a piece! It can move to the green dots!`;
    } else {
        coachMsg.textContent = `Uh oh, this piece is stuck! Try another one.`;
    }
}

function attemptMove(from, to) {
    try {
        const move = game.move({ from, to, promotion: 'q' }); // auto promote to queen for simplicity for kids

        if (move) {
            // Valid move
            handleXP(move);
            renderBoard();
            updateStatus();

            // Computer turn if game not over
            if (!game.isGameOver()) {
                coachMsg.textContent = "Great move! Now let me think...";
                setTimeout(makeComputerMove, 500 + Math.random() * 1000);
            }
        } else {
            // Invalid
            coachMsg.textContent = "Oops! You can't go there. Try a green circle!";
            renderBoard(); // refresh to remove ghost/highlights
        }
    } catch (e) {
        renderBoard();
    }
}

function handleXP(move) {
    let xpGain = 0;

    if (move.flags.includes('k') || move.flags.includes('q')) {
        coachMsg.textContent = "King safety is important! Good castle! +15 XP";
        xpGain += 15;
    } else if (move.flags.includes('c') || move.flags.includes('e')) {
        xpGain += 10;
        coachMsg.textContent = "Awesome capture! +10 XP!";
    } else if (move.flags.includes('p') || move.flags.includes('cp')) {
        xpGain += 20;
        coachMsg.textContent = "Promotion! You got a Queen! +20 XP!";
    } else {
        coachMsg.textContent = "Nice move! Keep controlling the center!";
        xpGain += 2;
    }

    addXP(xpGain);
}

function addXP(amount) {
    currentXP += amount;
    if (currentXP >= 100) {
        currentXP -= 100;
        currentLevel++;
        coachMsg.textContent = "LEVEL UP! You are getting stronger!";
        playSound('gameover'); // celebration sound
    }
    xpValEl.textContent = currentXP;
    levelEl.textContent = currentLevel;
    xpFillEl.style.width = `${currentXP}%`;
}

function updateStatus() {
    const hist = game.history();
    const lastMove = hist[hist.length - 1] || '';

    // Update moves list
    movesList.innerHTML = hist.map((m, i) => `${i % 2 === 0 ? (i / 2 + 1) + '.' : ''} ${m}`).join(' ');
    movesList.scrollTop = movesList.scrollHeight;

    if (game.inCheck()) {
        const kingSq = findKing(game.turn());
        const kingEl = document.querySelector(`.square[data-square="${kingSq}"]`);
        if (kingEl) kingEl.classList.add('in-check');
        coachMsg.textContent = "Watch out! Your King is in danger!";
    }

    if (game.isGameOver()) {
        let msg = '';
        if (game.isCheckmate()) {
            if (game.turn() === 'b') {
                msg = "Checkmate! You won! +50 XP!";
                addXP(50);
            } else {
                msg = "Oh no! Checkmate. The computer won.";
            }
        } else if (game.isDraw()) {
            msg = "It's a draw! Good game!";
            addXP(20);
        }
        modalMsg.textContent = msg;
        modalMsg.textContent = msg;
        modal.classList.remove('hidden');
        playSound('gameover');
    }

    updateCaptures();

    turnIndicator.textContent = game.turn() === 'w' ? "White's Turn" : "Black's Turn";
}


function updateCaptures() {
    // Total pieces count
    const totals = { 'p': 8, 'n': 2, 'b': 2, 'r': 2, 'q': 1, 'k': 1 };
    const currentWhite = { 'p': 0, 'n': 0, 'b': 0, 'r': 0, 'q': 0, 'k': 0 };
    const currentBlack = { 'p': 0, 'n': 0, 'b': 0, 'r': 0, 'q': 0, 'k': 0 };

    // Count current
    game.board().forEach(row => {
        row.forEach(p => {
            if (p) {
                if (p.color === 'w') currentWhite[p.type]++;
                else currentBlack[p.type]++;
            }
        });
    });

    // Calculate captured (Total - Current)
    // Note: Promotions complicate this potentially (e.g. extra queens). 
    // Standard capture box usually just shows pieces taken from opponent.
    // If I capture a pawn, it goes to "White Captured" (pieces White has captured) OR "Black pieces off board"?
    // "Captured By White" means Black pieces that are gone.

    const blackCaptured = []; // Pieces white has captured (missing black pieces)
    const whiteCaptured = []; // Pieces black has captured

    // Simple diff based on standard set. 
    // Does not account for promoted pawns well if we strictly stick to "missing from total".
    // Better: Filter history for captures? No, chess.js history is sanitized.
    // Let's stick to "Missing from standard set". If promoted, it's fine.

    ['p', 'n', 'b', 'r', 'q'].forEach(type => {
        // Black pieces captured by White
        let missingB = totals[type] - currentBlack[type];
        // If negative (promotion), treat as 0 for simple display or ignore
        if (missingB > 0) {
            for (let i = 0; i < missingB; i++) blackCaptured.push(type);
        }

        let missingW = totals[type] - currentWhite[type];
        if (missingW > 0) {
            for (let i = 0; i < missingW; i++) whiteCaptured.push(type);
        }
    });

    renderCaptureBox(capturedWhiteEl, blackCaptured, 'b'); // White captured Black pieces
    renderCaptureBox(capturedBlackEl, whiteCaptured, 'w'); // Black captured White pieces
}

function renderCaptureBox(el, piecesList, color) {
    el.innerHTML = '';
    piecesList.forEach(type => {
        const img = document.createElement('div');
        img.classList.add('captured-piece');
        img.style.backgroundImage = `url(${pieces[type][color]})`;
        el.appendChild(img);
    });
}

function findKing(color) {
    const board = game.board();
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (p && p.type === 'k' && p.color === color) {
                const file = String.fromCharCode(97 + c);
                const rank = 8 - r;
                return `${file}${rank}`;
            }
        }
    }
    return null;
}

// Computer AI
function makeComputerMove() {
    const diff = parseInt(diffSelect.value);
    const possibleMoves = game.moves({ verbose: true });
    if (possibleMoves.length === 0) return;

    let chosenMove = null;

    if (diff === 1) {
        // Easy: Random
        const idx = Math.floor(Math.random() * possibleMoves.length);
        chosenMove = possibleMoves[idx];
    } else if (diff === 2) {
        // Medium: Aggressive but simple
        const captures = possibleMoves.filter(m => m.flags.includes('c') || m.flags.includes('e'));
        if (captures.length > 0 && Math.random() < 0.7) {
            chosenMove = captures[Math.floor(Math.random() * captures.length)];
        } else {
            chosenMove = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
        }
    } else {
        // Master: 1-ply Material Search
        let bestScore = Infinity; // Black wants to minimize (Negative is good for Black)
        let bestMoves = [];
        const pieceValues = { 'p': 10, 'n': 30, 'b': 30, 'r': 50, 'q': 90, 'k': 900 };

        for (let move of possibleMoves) {
            game.move(move.san);
            let score = 0;
            game.board().forEach(row => {
                row.forEach(p => {
                    if (p) {
                        const val = pieceValues[p.type];
                        score += (p.color === 'w' ? val : -val);
                    }
                });
            });
            score += (Math.random() - 0.5) * 5;
            game.undo();

            if (score < bestScore) {
                bestScore = score;
                bestMoves = [move];
            } else if (Math.abs(score - bestScore) < 1) {
                bestMoves.push(move);
            }
        }
        chosenMove = bestMoves[Math.floor(Math.random() * bestMoves.length)];
    }

    game.move(chosenMove.san);

    // Coach explain computer move
    const pieceName = getPieceName(chosenMove.piece);
    const fromSq = chosenMove.from;
    const toSq = chosenMove.to;
    let explanation = `Computer moved ${pieceName} from ${fromSq} to ${toSq}.`;

    if (chosenMove.flags.includes('c') || chosenMove.flags.includes('e')) {
        explanation += " It captured your piece! Oh no!";
    } else if (game.inCheck()) {
        explanation += " Your King is in check!";
    } else {
        explanation += " Your turn!";
    }

    coachMsg.textContent = explanation;

    renderBoard();
    updateStatus();

    const fromEl = document.querySelector(`.square[data-square="${chosenMove.from}"]`);
    const toEl = document.querySelector(`.square[data-square="${chosenMove.to}"]`);
    if (fromEl) fromEl.classList.add('last-move');
    if (toEl) toEl.classList.add('last-move');
}

function getPieceName(p) {
    const names = { 'p': 'Pawn', 'n': 'Knight', 'b': 'Bishop', 'r': 'Rook', 'q': 'Queen', 'k': 'King' };
    return names[p] || 'Piece';
}

newGameBtn.addEventListener('click', () => {
    initGame();
});

themeSwatches.forEach(swatch => {
    swatch.addEventListener('click', (e) => {
        // Remove active from all
        themeSwatches.forEach(s => s.classList.remove('active'));
        // Add active to clicked
        e.target.classList.add('active');

        updateBoardTheme(e.target.dataset.theme);
    });
});

function updateBoardTheme(theme) {
    const root = document.documentElement;
    if (theme === 'blue') {
        root.style.setProperty('--board-light', '#EEF2FF');
        root.style.setProperty('--board-dark', '#6366F1');
    } else if (theme === 'candy') {
        root.style.setProperty('--board-light', '#FFF1F2');
        root.style.setProperty('--board-dark', '#FB7185');
    } else if (theme === 'wood') {
        root.style.setProperty('--board-light', '#EAD8B1');
        root.style.setProperty('--board-dark', '#966F33');
    } else { // classic
        root.style.setProperty('--board-light', '#F0FDF4');
        root.style.setProperty('--board-dark', '#4ADE80'); // Soft green
    }
}

modalBtn.addEventListener('click', () => {
    initGame();
});

// Start
initGame();

