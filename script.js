const container = document.getElementById("map-container");
const image = document.getElementById("map-image");

let scale = 1;
let minScale = 1;
let x = 0;
let y = 0;
let dragStart = null;

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
    x = (width - image.naturalWidth * scale) / 2;
    y = (height - image.naturalHeight * scale) / 2;
    render();
}

function zoomAt(factor, centerX, centerY) {
    const oldScale = scale;
    scale = clamp(scale * factor, minScale, minScale * 8);
    const ratio = scale / oldScale;
    x = centerX - (centerX - x) * ratio;
    y = centerY - (centerY - y) * ratio;
    render();
}

image.addEventListener("load", resetView);
window.addEventListener("resize", resetView);

container.addEventListener("wheel", (event) => {
    event.preventDefault();
    const bounds = container.getBoundingClientRect();
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
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

document.getElementById("zoom-in").addEventListener("click", () => {
    zoomAt(1.25, container.clientWidth / 2, container.clientHeight / 2);
});

document.getElementById("zoom-out").addEventListener("click", () => {
    zoomAt(1 / 1.25, container.clientWidth / 2, container.clientHeight / 2);
});

document.getElementById("reset-view").addEventListener("click", resetView);

