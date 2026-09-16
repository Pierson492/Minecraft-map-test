const container = document.getElementById("map-container");
const image = document.getElementById("map-image");

let scale = 1;
let minScale = 1;
let targetScale = 1;
let x = 0;
let y = 0;
let targetX = 0;
let targetY = 0;
let zoomAnimationFrame = null;
let dragStart = null;
let isKeyPressed = {};

// Keep the zoom steps gentle and allow enough magnification to inspect
// individual source-image pixels (up to 32 screen pixels per image pixel).
const MAX_SCALE = 32;
const BUTTON_ZOOM_FACTOR = 1.08;
// Slightly faster trackpad zoom while keeping the motion smooth.
const WHEEL_ZOOM_SENSITIVITY = 0.001;
const ZOOM_SMOOTHING = 0.18;

function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

function limitPosition() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    const imageWidth = image.naturalWidth * scale;
    const imageHeight = image.naturalHeight * scale;

    // Keep at least part of the image visible while panning.
    const minX = Math.min(0, width - imageWidth);
    const minY = Math.min(0, height - imageHeight);
    x = clamp(x, minX, Math.max(0, width - imageWidth));
    y = clamp(y, minY, Math.max(0, height - imageHeight));
}

function render() {
    limitPosition();
    image.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}

function resetView() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    minScale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    scale = minScale;
    targetScale = scale;
    x = (width - image.naturalWidth * scale) / 2;
    y = (height - image.naturalHeight * scale) / 2;
    targetX = x;
    targetY = y;
    render();
}

function animateZoom() {
    scale += (targetScale - scale) * ZOOM_SMOOTHING;
    x += (targetX - x) * ZOOM_SMOOTHING;
    y += (targetY - y) * ZOOM_SMOOTHING;
    render();

    const scaleIsSettled = Math.abs(targetScale - scale) < 0.0001;
    const xIsSettled = Math.abs(targetX - x) < 0.05;
    const yIsSettled = Math.abs(targetY - y) < 0.05;

    if (scaleIsSettled && xIsSettled && yIsSettled) {
        scale = targetScale;
        x = targetX;
        y = targetY;
        zoomAnimationFrame = null;
        render();
        return;
    }

    zoomAnimationFrame = requestAnimationFrame(animateZoom);
}

function zoomAt(factor, centerX, centerY) {
    // Update the destination rather than jumping the image immediately. This
    // makes high-frequency trackpad wheel events blend into one smooth motion.
    const oldTargetScale = targetScale;
    targetScale = clamp(targetScale * factor, minScale, Math.max(minScale, MAX_SCALE));
    const ratio = targetScale / oldTargetScale;
    targetX = centerX - (centerX - targetX) * ratio;
    targetY = centerY - (centerY - targetY) * ratio;

    if (zoomAnimationFrame === null) {
        zoomAnimationFrame = requestAnimationFrame(animateZoom);
    }
}

// Arrow key movement
function handleArrowKeys() {
    const moveSpeed = 30;
    
    if (isKeyPressed['ArrowUp']) {
        y += moveSpeed;
        targetY = y;
    }
    if (isKeyPressed['ArrowDown']) {
        y -= moveSpeed;
        targetY = y;
    }
    if (isKeyPressed['ArrowLeft']) {
        x += moveSpeed;
        targetX = x;
    }
    if (isKeyPressed['ArrowRight']) {
        x -= moveSpeed;
        targetX = y;
    }
    
    if (isKeyPressed['ArrowUp'] || isKeyPressed['ArrowDown'] || 
        isKeyPressed['ArrowLeft'] || isKeyPressed['ArrowRight']) {
        render();
    }
}

image.addEventListener("load", resetView);
window.addEventListener("resize", resetView);

// Keyboard events for arrow keys
document.addEventListener("keydown", (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        isKeyPressed[e.key] = true;
    }
});

document.addEventListener("keyup", (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        isKeyPressed[e.key] = false;
    }
});

// Continuous arrow key movement loop
setInterval(handleArrowKeys, 16); // ~60 FPS

// Scroll wheel zoom. Trackpads send many small wheel events, so accumulate
// those events into a moving target and animate toward it with requestAnimationFrame.
container.addEventListener("wheel", (event) => {
    event.preventDefault();
    const bounds = container.getBoundingClientRect();
    const factor = Math.pow(1 + WHEEL_ZOOM_SENSITIVITY, -event.deltaY);
    zoomAt(factor, event.clientX - bounds.left, event.clientY - bounds.top);
}, { passive: false });

// Trackpad drag (pointer events)
container.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    container.setPointerCapture(event.pointerId);
    dragStart = { pointerX: event.clientX, pointerY: event.clientY, x, y };
    container.classList.add("is-dragging");
});

container.addEventListener("pointermove", (event) => {
    if (!dragStart) return;
    x = dragStart.x + event.clientX - dragStart.pointerX;
    y = dragStart.y + event.clientY - dragStart.pointerY;
    targetX = x;
    targetY = y;
    render();
});

function stopDragging() {
    dragStart = null;
    container.classList.remove("is-dragging");
}

container.addEventListener("pointerup", stopDragging);
container.addEventListener("pointercancel", stopDragging);

// Button controls
document.getElementById("zoom-in").addEventListener("click", () => {
    zoomAt(BUTTON_ZOOM_FACTOR, container.clientWidth / 2, container.clientHeight / 2);
});

document.getElementById("zoom-out").addEventListener("click", () => {
    zoomAt(1 / BUTTON_ZOOM_FACTOR, container.clientWidth / 2, container.clientHeight / 2);
});

document.getElementById("reset-view").addEventListener("click", resetView);
