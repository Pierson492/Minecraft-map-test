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
    const oldTargetScale = targetScale;
    targetScale = clamp(targetScale * factor, minScale, Math.max(minScale, MAX_SCALE));
    const ratio = targetScale / oldTargetScale;
    targetX = centerX - (centerX - targetX) * ratio;
    targetY = centerY - (centerY - targetY) * ratio;

    if (zoomAnimationFrame === null) {
        zoomAnimationFrame = requestAnimationFrame(animateZoom);
    }
}

function handleArrowKeys() {
    const moveSpeed = 30;

    if (isKeyPressed.ArrowUp) {
        y += moveSpeed;
        targetY = y;
    }
    if (isKeyPressed.ArrowDown) {
        y -= moveSpeed;
        targetY = y;
    }
    if (isKeyPressed.ArrowLeft) {
        x += moveSpeed;
        targetX = x;
    }
    if (isKeyPressed.ArrowRight) {
        x -= moveSpeed;
        targetX = x;
    }

    if (Object.values(isKeyPressed).some(Boolean)) {
        render();
    }
}

image.addEventListener("load", resetView);
window.addEventListener("resize", resetView);

document.addEventListener("keydown", (event) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        isKeyPressed[event.key] = true;
    }
});

document.addEventListener("keyup", (event) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        isKeyPressed[event.key] = false;
    }
});

setInterval(handleArrowKeys, 16);

container.addEventListener("wheel", (event) => {
    event.preventDefault();
    const bounds = container.getBoundingClientRect();
    const factor = Math.pow(1 + WHEEL_ZOOM_SENSITIVITY, -event.deltaY);
    zoomAt(factor, event.clientX - bounds.left, event.clientY - bounds.top);
}, { passive: false });

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

document.getElementById("zoom-in").addEventListener("click", () => {
    zoomAt(BUTTON_ZOOM_FACTOR, container.clientWidth / 2, container.clientHeight / 2);
});

document.getElementById("zoom-out").addEventListener("click", () => {
    zoomAt(1 / BUTTON_ZOOM_FACTOR, container.clientWidth / 2, container.clientHeight / 2);
});

document.getElementById("reset-view").addEventListener("click", resetView);
