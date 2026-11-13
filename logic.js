const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const BALL_RADIUS = 8;
const PADDLE_HEIGHT = 13;
const PADDLE_BASE_WIDTH = 116;
const PADDLE_WIDE_WIDTH = 174;
const PADDLE_Y = HEIGHT - 38;
const STORAGE_KEY = 'neonBreakoutBest';
const ROW_COLORS = ['#ff6584', '#ff9c6a', '#ffd166', '#b8f36b', '#56e5d7', '#6fa8ff', '#bd8cff'];

const scoreElement = document.getElementById('score');
const bestElement = document.getElementById('best');
const levelElement = document.getElementById('level');
const livesElement = document.getElementById('lives');
const sessionStatus = document.getElementById('session-status');
const progressTrack = document.querySelector('.progress-track');
const progressBar = document.getElementById('level-progress');
const progressLabel = document.getElementById('progress-label');
const overlay = document.getElementById('game-overlay');
const overlayKicker = document.getElementById('overlay-kicker');
const overlayTitle = document.getElementById('overlay-title');
const overlayMessage = document.getElementById('overlay-message');
const overlayAction = document.getElementById('overlay-action');
const pauseButton = document.getElementById('pause-btn');
const soundButton = document.getElementById('sound-btn');

let state = 'ready';
let score = 0;
let bestScore = loadBestScore();
let lives = 3;
let level = 1;
let bricks = [];
let remainingBricks = 0;
let paddleX = (WIDTH - PADDLE_BASE_WIDTH) / 2;
let pointerX = null;
let ballX = WIDTH / 2;
let ballY = PADDLE_Y - BALL_RADIUS;
let ballDX = 0;
let ballDY = 0;
let paddleWideTime = 0;
let powerUps = [];
let particles = [];
let keys = { left: false, right: false };
let soundOn = true;
let audioContext = null;
let lastFrameTime = 0;

const stars = Array.from({ length: 72 }, (_, index) => ({
    x: (index * 127 + 41) % WIDTH,
    y: (index * 83 + 23) % HEIGHT,
    size: index % 5 === 0 ? 1.6 : 0.8,
    alpha: 0.12 + ((index * 13) % 35) / 100
}));

function loadBestScore() {
    try {
        return Number(localStorage.getItem(STORAGE_KEY)) || 0;
    } catch (error) {
        console.warn('Could not read the saved high score.', error);
        return 0;
    }
}

function saveBestScore() {
    try {
        localStorage.setItem(STORAGE_KEY, String(bestScore));
    } catch (error) {
        console.warn('Could not save the high score.', error);
    }
}

function formatScore(value) {
    return String(value).padStart(5, '0');
}

function getPaddleWidth() {
    return paddleWideTime > 0 ? PADDLE_WIDE_WIDTH : PADDLE_BASE_WIDTH;
}

function updateHud() {
    scoreElement.textContent = formatScore(score);
    bestElement.textContent = formatScore(bestScore);
    levelElement.textContent = String(level).padStart(2, '0');
    livesElement.textContent = Array.from({ length: lives }, () => '●').join(' ') || '—';
    livesElement.parentElement.setAttribute('aria-label', `${lives} ${lives === 1 ? 'life' : 'lives'} remaining`);

    const cleared = bricks.length - remainingBricks;
    const progress = bricks.length ? cleared / bricks.length : 0;
    progressBar.style.width = `${progress * 100}%`;
    progressTrack.setAttribute('aria-valuemax', String(bricks.length));
    progressTrack.setAttribute('aria-valuenow', String(cleared));
    progressLabel.textContent = `${cleared} of ${bricks.length} bricks cleared`;
}

function setOverlay(kicker, title, message, buttonText) {
    overlayKicker.textContent = kicker;
    overlayTitle.textContent = title;
    overlayMessage.textContent = message;
    overlayAction.innerHTML = `${buttonText} <span aria-hidden="true">↗</span>`;
    overlay.hidden = false;
}

function updateStateUi() {
    pauseButton.disabled = state !== 'running' && state !== 'paused';
    pauseButton.innerHTML = state === 'paused'
        ? '▶ <span>Resume game</span>'
        : 'Ⅱ <span>Pause game</span>';

    switch (state) {
        case 'ready':
            sessionStatus.textContent = 'Ready when you are';
            setOverlay('READY PLAYER ONE', 'Your run starts here.', 'Break every brick. Don’t let the ball get past you.', lives < 3 ? 'Continue' : 'Launch ball');
            break;
        case 'paused':
            sessionStatus.textContent = 'Taking a breather';
            setOverlay('GAME PAUSED', 'Catch your breath.', 'Your ball is right where you left it.', 'Resume game');
            break;
        case 'levelup':
            sessionStatus.textContent = 'Level cleared — nice!';
            setOverlay('LEVEL COMPLETE', 'Beautifully done.', 'The next round gets a little faster.', 'Next level');
            break;
        case 'gameover':
            sessionStatus.textContent = 'Run complete';
            setOverlay('GAME OVER', 'That was a good run.', `You scored ${formatScore(score)}. Ready to go again?`, 'Play again');
            break;
        case 'running':
            sessionStatus.textContent = paddleWideTime > 0 ? 'Wide paddle active!' : 'Ball in play';
            overlay.hidden = true;
            break;
    }
}

function createBricks() {
    const columns = 10;
    const rows = Math.min(5 + Math.floor((level - 1) / 2), 7);
    const brickWidth = 68;
    const brickHeight = 19;
    const gap = 9;
    const left = (WIDTH - columns * brickWidth - (columns - 1) * gap) / 2;

    bricks = [];
    for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
            const extraHit = level >= 3 && (column + row + level) % 5 === 0 ? 1 : 0;
            bricks.push({
                x: left + column * (brickWidth + gap),
                y: 63 + row * (brickHeight + gap),
                width: brickWidth,
                height: brickHeight,
                hits: 1 + extraHit,
                color: ROW_COLORS[(row + level - 1) % ROW_COLORS.length]
            });
        }
    }
    remainingBricks = bricks.length;
    updateHud();
}

function attachBall() {
    const paddleWidth = getPaddleWidth();
    paddleX = Math.max(0, Math.min(WIDTH - paddleWidth, paddleX));
    ballX = paddleX + paddleWidth / 2;
    ballY = PADDLE_Y - BALL_RADIUS;
    ballDX = 0;
    ballDY = 0;
}

function startNewGame() {
    state = 'ready';
    score = 0;
    lives = 3;
    level = 1;
    paddleWideTime = 0;
    powerUps = [];
    particles = [];
    paddleX = (WIDTH - PADDLE_BASE_WIDTH) / 2;
    pointerX = null;
    createBricks();
    attachBall();
    updateHud();
    updateStateUi();
}

function launchBall() {
    if (state !== 'ready') return;
    initializeAudio();
    const speed = 335 + (level - 1) * 18;
    const direction = Math.random() < 0.5 ? -1 : 1;
    ballDX = speed * 0.48 * direction;
    ballDY = -speed * 0.88;
    state = 'running';
    updateStateUi();
}

function nextLevel() {
    if (state !== 'levelup') return;
    level += 1;
    paddleWideTime = 0;
    powerUps = [];
    createBricks();
    attachBall();
    state = 'ready';
    updateHud();
    updateStateUi();
}

function performOverlayAction() {
    if (state === 'ready') {
        launchBall();
    } else if (state === 'paused') {
        state = 'running';
        updateStateUi();
    } else if (state === 'levelup') {
        nextLevel();
    } else if (state === 'gameover') {
        startNewGame();
        launchBall();
    }
}

function setPaused(paused) {
    if (paused && state === 'running') {
        state = 'paused';
        updateStateUi();
    } else if (!paused && state === 'paused') {
        state = 'running';
        updateStateUi();
    }
}

function initializeAudio() {
    if (!soundOn || audioContext) return;
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (AudioContextConstructor) audioContext = new AudioContextConstructor();
}

function playTone(frequency, duration = 0.07, wave = 'sine') {
    if (!soundOn) return;
    initializeAudio();
    if (!audioContext) return;
    if (audioContext.state === 'suspended') audioContext.resume();

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    gain.gain.setValueAtTime(0.055, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
}

function addParticles(x, y, color, count = 8) {
    for (let index = 0; index < count; index += 1) {
        const angle = (Math.PI * 2 * index) / count;
        const speed = 45 + Math.random() * 110;
        particles.push({
            x,
            y,
            dx: Math.cos(angle) * speed,
            dy: Math.sin(angle) * speed,
            color,
            life: 0.42,
            maxLife: 0.42,
            size: 1.5 + Math.random() * 2
        });
    }
}

function awardScore(points) {
    score += points;
    if (score > bestScore) {
        bestScore = score;
        saveBestScore();
    }
    updateHud();
}

function handleBrickCollision(previousX, previousY) {
    for (const brick of bricks) {
        if (brick.hits <= 0) continue;

        const nearestX = Math.max(brick.x, Math.min(ballX, brick.x + brick.width));
        const nearestY = Math.max(brick.y, Math.min(ballY, brick.y + brick.height));
        const deltaX = ballX - nearestX;
        const deltaY = ballY - nearestY;
        if (deltaX * deltaX + deltaY * deltaY > BALL_RADIUS * BALL_RADIUS) continue;

        const cameFromSide = previousX + BALL_RADIUS <= brick.x || previousX - BALL_RADIUS >= brick.x + brick.width;
        const cameFromAbove = previousY + BALL_RADIUS <= brick.y || previousY - BALL_RADIUS >= brick.y + brick.height;
        if (cameFromSide && (!cameFromAbove || Math.abs(ballX - previousX) > Math.abs(ballY - previousY))) {
            ballDX = -ballDX;
        } else {
            ballDY = -ballDY;
        }

        brick.hits -= 1;
        playTone(brick.hits > 0 ? 250 : 390 + (bricks.indexOf(brick) % 5) * 55, 0.055, 'triangle');
        if (brick.hits <= 0) {
            remainingBricks -= 1;
            awardScore(10 * level);
            addParticles(brick.x + brick.width / 2, brick.y + brick.height / 2, brick.color, 7);
            if (Math.random() < 0.16) {
                powerUps.push({
                    x: brick.x + brick.width / 2,
                    y: brick.y + brick.height / 2,
                    type: Math.random() < 0.72 ? 'wide' : 'life',
                    dy: 145
                });
            }
        } else {
            awardScore(3 * level);
        }

        if (remainingBricks === 0) {
            state = 'levelup';
            updateStateUi();
        }
        updateHud();
        return;
    }
}

function catchPowerUp(powerUp) {
    if (powerUp.type === 'wide') {
        paddleWideTime = 12;
        playTone(680, 0.16, 'sine');
    } else {
        lives = Math.min(5, lives + 1);
        playTone(820, 0.2, 'sine');
    }
    addParticles(powerUp.x, powerUp.y, powerUp.type === 'wide' ? '#5fe6d0' : '#ff7895', 12);
    updateHud();
}

function loseLife() {
    lives -= 1;
    playTone(150, 0.24, 'sawtooth');
    addParticles(ballX, HEIGHT - 20, '#ff6584', 15);
    if (lives <= 0) {
        state = 'gameover';
    } else {
        state = 'ready';
        attachBall();
    }
    updateHud();
    updateStateUi();
}

function update(deltaTime) {
    if (state !== 'running') {
        if (state === 'ready') attachBall();
        return;
    }

    const paddleWidth = getPaddleWidth();
    if (keys.left) paddleX -= 470 * deltaTime;
    if (keys.right) paddleX += 470 * deltaTime;
    if (pointerX !== null) paddleX = pointerX - paddleWidth / 2;
    paddleX = Math.max(0, Math.min(WIDTH - paddleWidth, paddleX));

    if (paddleWideTime > 0) {
        paddleWideTime = Math.max(0, paddleWideTime - deltaTime);
        if (paddleWideTime === 0) paddleX = Math.min(paddleX, WIDTH - PADDLE_BASE_WIDTH);
    }

    const previousX = ballX;
    const previousY = ballY;
    ballX += ballDX * deltaTime;
    ballY += ballDY * deltaTime;

    if (ballX - BALL_RADIUS < 0) {
        ballX = BALL_RADIUS;
        ballDX = Math.abs(ballDX);
        playTone(205, 0.035);
    } else if (ballX + BALL_RADIUS > WIDTH) {
        ballX = WIDTH - BALL_RADIUS;
        ballDX = -Math.abs(ballDX);
        playTone(205, 0.035);
    }
    if (ballY - BALL_RADIUS < 0) {
        ballY = BALL_RADIUS;
        ballDY = Math.abs(ballDY);
        playTone(205, 0.035);
    }

    if (
        ballDY > 0 &&
        previousY + BALL_RADIUS <= PADDLE_Y &&
        ballY + BALL_RADIUS >= PADDLE_Y &&
        ballX >= paddleX - BALL_RADIUS &&
        ballX <= paddleX + paddleWidth + BALL_RADIUS
    ) {
        ballY = PADDLE_Y - BALL_RADIUS;
        const hitPosition = (ballX - (paddleX + paddleWidth / 2)) / (paddleWidth / 2);
        const speed = Math.min(620, Math.hypot(ballDX, ballDY) + 9);
        const angle = Math.max(-1.05, Math.min(1.05, hitPosition * 1.05));
        ballDX = Math.sin(angle) * speed;
        ballDY = -Math.cos(angle) * speed;
        playTone(320, 0.075, 'sine');
    }

    handleBrickCollision(previousX, previousY);
    if (state !== 'running') return;

    for (let index = powerUps.length - 1; index >= 0; index -= 1) {
        const powerUp = powerUps[index];
        powerUp.y += powerUp.dy * deltaTime;
        if (
            powerUp.y + 13 >= PADDLE_Y &&
            powerUp.y - 13 <= PADDLE_Y + PADDLE_HEIGHT &&
            powerUp.x >= paddleX - 12 &&
            powerUp.x <= paddleX + paddleWidth + 12
        ) {
            catchPowerUp(powerUp);
            powerUps.splice(index, 1);
        } else if (powerUp.y > HEIGHT + 20) {
            powerUps.splice(index, 1);
        }
    }

    for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        particle.life -= deltaTime;
        particle.x += particle.dx * deltaTime;
        particle.y += particle.dy * deltaTime;
        if (particle.life <= 0) particles.splice(index, 1);
    }

    if (ballY - BALL_RADIUS > HEIGHT) loseLife();
    if (state === 'running') {
        sessionStatus.textContent = paddleWideTime > 0 ? `Wide paddle · ${Math.ceil(paddleWideTime)}s` : 'Ball in play';
    }
}

function roundedRectPath(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    gradient.addColorStop(0, '#11172b');
    gradient.addColorStop(1, '#0b1020');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.strokeStyle = 'rgba(144, 164, 220, 0.045)';
    ctx.lineWidth = 1;
    for (let x = 26; x < WIDTH; x += 45) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, HEIGHT);
        ctx.stroke();
    }
    for (let y = 18; y < HEIGHT; y += 45) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WIDTH, y);
        ctx.stroke();
    }
    for (const star of stars) {
        ctx.fillStyle = `rgba(204, 218, 255, ${star.alpha})`;
        ctx.fillRect(star.x, star.y, star.size, star.size);
    }
}

function drawBricks() {
    for (const brick of bricks) {
        if (brick.hits <= 0) continue;
        ctx.save();
        ctx.shadowColor = brick.color;
        ctx.shadowBlur = 12;
        roundedRectPath(brick.x, brick.y, brick.width, brick.height, 6);
        ctx.fillStyle = brick.hits > 1 ? '#8394c0' : brick.color;
        ctx.fill();
        ctx.shadowBlur = 0;
        roundedRectPath(brick.x + 2, brick.y + 2, brick.width - 4, 3, 2);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fill();
        ctx.restore();
    }
}

function drawPaddle() {
    const width = getPaddleWidth();
    const gradient = ctx.createLinearGradient(paddleX, PADDLE_Y, paddleX + width, PADDLE_Y + PADDLE_HEIGHT);
    gradient.addColorStop(0, '#9d8aff');
    gradient.addColorStop(1, '#55e6d2');
    ctx.save();
    ctx.shadowColor = '#7b8cff';
    ctx.shadowBlur = 22;
    roundedRectPath(paddleX, PADDLE_Y, width, PADDLE_HEIGHT, 7);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();
}

function drawBall() {
    ctx.save();
    ctx.shadowColor = '#e9fcff';
    ctx.shadowBlur = 18;
    const gradient = ctx.createRadialGradient(ballX - 3, ballY - 3, 1, ballX, ballY, BALL_RADIUS);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(1, '#7ce9ff');
    ctx.beginPath();
    ctx.arc(ballX, ballY, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();
}

function drawPowerUps() {
    for (const powerUp of powerUps) {
        const isWide = powerUp.type === 'wide';
        const color = isWide ? '#5fe6d0' : '#ff7895';
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(powerUp.x, powerUp.y, 12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(18, 27, 49, 0.95)';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(isWide ? '↔' : '♥', powerUp.x, powerUp.y + 1);
        ctx.restore();
    }
}

function drawParticles() {
    for (const particle of particles) {
        ctx.globalAlpha = particle.life / particle.maxLife;
        ctx.fillStyle = particle.color;
        ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    ctx.globalAlpha = 1;
}

function draw() {
    drawBackground();
    drawBricks();
    drawPowerUps();
    drawParticles();
    drawPaddle();
    drawBall();
}

function frame(timestamp) {
    const deltaTime = lastFrameTime ? Math.min((timestamp - lastFrameTime) / 1000, 0.033) : 0;
    lastFrameTime = timestamp;
    update(deltaTime);
    draw();
    requestAnimationFrame(frame);
}

function movePaddleToPointer(event) {
    const bounds = canvas.getBoundingClientRect();
    const scaleX = WIDTH / bounds.width;
    const x = (event.clientX - bounds.left) * scaleX;
    if (x >= 0 && x <= WIDTH) pointerX = x;
}

canvas.addEventListener('pointermove', movePaddleToPointer);
canvas.addEventListener('pointerdown', (event) => {
    movePaddleToPointer(event);
    if (state === 'ready') launchBall();
});
canvas.addEventListener('pointerleave', () => {
    pointerX = null;
});

document.addEventListener('keydown', (event) => {
    if (['ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
        keys.left = true;
        pointerX = null;
    }
    if (event.code === 'ArrowRight' || event.code === 'KeyD') {
        keys.right = true;
        pointerX = null;
    }

    if (event.code === 'Space' || event.code === 'Enter') {
        if (state === 'ready') launchBall();
        else if (state === 'paused') setPaused(false);
    }
    if (event.code === 'Escape' || event.code === 'KeyP') {
        if (state === 'running') setPaused(true);
        else if (state === 'paused') setPaused(false);
    }
});

document.addEventListener('keyup', (event) => {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') keys.left = false;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') keys.right = false;
});

overlayAction.addEventListener('click', performOverlayAction);
pauseButton.addEventListener('click', () => setPaused(state === 'running'));
document.getElementById('restart-btn').addEventListener('click', startNewGame);
soundButton.addEventListener('click', () => {
    soundOn = !soundOn;
    soundButton.setAttribute('aria-pressed', String(soundOn));
    soundButton.setAttribute('aria-label', soundOn ? 'Mute game sounds' : 'Turn game sounds on');
    soundButton.innerHTML = `${soundOn ? '♫' : '♪'} <span>Sound ${soundOn ? 'on' : 'off'}</span>`;
    if (soundOn) initializeAudio();
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'running') setPaused(true);
});

bestElement.textContent = formatScore(bestScore);
createBricks();
attachBall();
updateStateUi();
requestAnimationFrame(frame);
