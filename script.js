const container = document.getElementById("map-container");
const image = document.getElementById("map-image");
const nightImage = document.getElementById("map-image-night");
const modeToggle = document.getElementById("mode-toggle");
const mapImages = [image, nightImage];

let scale = 1;
let minScale = 1;
let x = 0;
let y = 0;
let dragStart = null;
let isKeyPressed = {};
let isNight = false;

const MAX_SCALE = 32;
const BUTTON_ZOOM_FACTOR = 1.08;
const WHEEL_ZOOM_SENSITIVITY = 0.002;

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
    const transform = `translate(${x}px, ${y}px) scale(${scale})`;
    mapImages.forEach((mapImage) => {
        mapImage.style.transform = transform;
    });
}

function resetView() {
    if (!image.naturalWidth || !image.naturalHeight) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    minScale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    scale = minScale;
    x = (width - image.naturalWidth * scale) / 2;
    y = (height - image.naturalHeight * scale) / 2;
    render();
}

function zoomAt(factor, centerX, centerY) {
    const oldScale = scale;
    const newScale = clamp(scale * factor, minScale, Math.max(minScale, MAX_SCALE));
    if (newScale === oldScale) return;

    // Apply the zoom immediately around the pointer. Using the current transform
    // (instead of a queued target transform) prevents trackpad events from darting.
    const ratio = newScale / oldScale;
    x = centerX - (centerX - x) * ratio;
    y = centerY - (centerY - y) * ratio;
    scale = newScale;
    render();
}

function handleArrowKeys() {
    const moveSpeed = 30;
    if (isKeyPressed.ArrowUp) y += moveSpeed;
    if (isKeyPressed.ArrowDown) y -= moveSpeed;
    if (isKeyPressed.ArrowLeft) x += moveSpeed;
    if (isKeyPressed.ArrowRight) x -= moveSpeed;
    if (Object.values(isKeyPressed).some(Boolean)) render();
}

function setMapMode(night) {
    isNight = night;
    container.classList.toggle("is-night", isNight);
    modeToggle.setAttribute("aria-pressed", String(isNight));
    modeToggle.setAttribute("aria-label", isNight ? "Switch to day map" : "Switch to night map");
    modeToggle.querySelector("span").textContent = isNight ? "Day" : "Night";
    modeToggle.firstChild.textContent = isNight ? "☀ " : "☾ ";
    nightImage.setAttribute("aria-hidden", String(!isNight));
}

image.addEventListener("load", resetView);
window.addEventListener("resize", resetView);

// A missing night image should not hide the working day map. Add images/map-night.jpg
// whenever a night render is available; the toggle will start working automatically.
nightImage.addEventListener("error", () => {
    nightImage.style.display = "none";
    modeToggle.title = "Add images/map-night.jpg to enable the night map";
});

container.addEventListener("wheel", (event) => {
    event.preventDefault();
    const bounds = container.getBoundingClientRect();
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    const factor = Math.exp(-delta * WHEEL_ZOOM_SENSITIVITY);
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
    render();
});

function stopDragging() {
    dragStart = null;
    container.classList.remove("is-dragging");
}

container.addEventListener("pointerup", stopDragging);
container.addEventListener("pointercancel", stopDragging);

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

document.getElementById("zoom-in").addEventListener("click", () => {
    zoomAt(BUTTON_ZOOM_FACTOR, container.clientWidth / 2, container.clientHeight / 2);
});

document.getElementById("zoom-out").addEventListener("click", () => {
    zoomAt(1 / BUTTON_ZOOM_FACTOR, container.clientWidth / 2, container.clientHeight / 2);
});

document.getElementById("reset-view").addEventListener("click", resetView);
modeToggle.addEventListener("click", () => setMapMode(!isNight));
setMapMode(false);
