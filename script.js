(() => {
    "use strict";

    const container = document.getElementById("map-container");
    const image = document.getElementById("map-image");
    const nightImage = document.getElementById("map-image-night");
    const modeToggle = document.getElementById("mode-toggle");
    const waypointLayer = document.getElementById("waypoint-layer");
    const waypointToggle = document.getElementById("waypoint-toggle");
    if (!container || !image) return;

    const mapImages = [image, nightImage].filter(Boolean);

    const MAX_SCALE = 64;
    const BUTTON_ZOOM_FACTOR = 1.2;
    // Trackpads emit many small wheel events. A small exponential step keeps the
    // response proportional while RAF batching prevents event/render jitter.
    const WHEEL_ZOOM_SENSITIVITY = 0.0012;
    const KEY_PAN_SPEED = 20;
    const DRAG_THRESHOLD = 5; // px of movement before a press counts as a drag
    const WAYPOINT_KEY = "israelcraft-map-waypoints";
    const ARROW_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

    let scale = 1;
    let minScale = 1;
    let x = 0;
    let y = 0;
    let isNight = false;
    let nightAvailable = Boolean(nightImage);
    let zoomFrame = null;
    let pendingWheelDelta = 0;
    let pendingZoomPoint = null;
    let keyFrame = null;
    let dragStart = null;
    let dragMoved = false;
    let pinchStart = null;
    let placing = false;
    const pressedKeys = new Set();
    const pointers = new Map();
    let waypoints = loadWaypoints();

    const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

    /* ---------- view math ---------- */

    function limitPosition() {
        const width = container.clientWidth;
        const height = container.clientHeight;
        const imageWidth = image.naturalWidth * scale;
        const imageHeight = image.naturalHeight * scale;
        x = clamp(x, Math.min(0, width - imageWidth), Math.max(0, width - imageWidth));
        y = clamp(y, Math.min(0, height - imageHeight), Math.max(0, height - imageHeight));
    }

    function render() {
        limitPosition();
        const transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
        mapImages.forEach((mapImage) => { mapImage.style.transform = transform; });
        if (waypointLayer) {
            // Same transform as the images, so waypoint coordinates are map pixels.
            waypointLayer.style.transform = transform;
            waypointLayer.style.setProperty("--inverse-scale", String(1 / scale));
        }
    }

    function updateMinScale() {
        if (!image.naturalWidth || !image.naturalHeight) return false;
        minScale = Math.min(container.clientWidth / image.naturalWidth, container.clientHeight / image.naturalHeight);
        return true;
    }

    function resetView() {
        if (!updateMinScale()) return;
        scale = minScale;
        x = (container.clientWidth - image.naturalWidth * scale) / 2;
        y = (container.clientHeight - image.naturalHeight * scale) / 2;
        render();
    }

    function zoomAt(factor, centerX, centerY) {
        const newScale = clamp(scale * factor, minScale, Math.max(minScale, MAX_SCALE));
        if (newScale === scale) return;
        const ratio = newScale / scale;
        x = centerX - (centerX - x) * ratio;
        y = centerY - (centerY - y) * ratio;
        scale = newScale;
        render();
    }

    /* ---------- wheel zoom ---------- */

    function applyPendingWheelZoom() {
        zoomFrame = null;
        if (!pendingWheelDelta || !pendingZoomPoint) return;
        const delta = pendingWheelDelta;
        const point = pendingZoomPoint;
        pendingWheelDelta = 0;
        pendingZoomPoint = null;
        zoomAt(Math.exp(-delta * WHEEL_ZOOM_SENSITIVITY), point.x, point.y);
    }

    container.addEventListener("wheel", (event) => {
        event.preventDefault();
        const bounds = container.getBoundingClientRect();
        const rawDelta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
        pendingWheelDelta = clamp(pendingWheelDelta + rawDelta, -240, 240);
        pendingZoomPoint = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
        if (zoomFrame === null) zoomFrame = requestAnimationFrame(applyPendingWheelZoom);
    }, { passive: false });

    /* ---------- drag, pinch, click-to-place (pointer events only) ---------- */

    function pinchMetrics() {
        const [a, b] = [...pointers.values()];
        const bounds = container.getBoundingClientRect();
        return {
            distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
            x: (a.x + b.x) / 2 - bounds.left,
            y: (a.y + b.y) / 2 - bounds.top
        };
    }

    container.addEventListener("pointerdown", (event) => {
        if (event.target.closest("button")) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        container.setPointerCapture(event.pointerId);
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size === 1) {
            dragStart = { pointerX: event.clientX, pointerY: event.clientY, x, y };
            dragMoved = false;
            container.classList.add("is-dragging");
        } else if (pointers.size === 2) {
            dragStart = null;
            dragMoved = true; // a pinch is never a click
            pinchStart = pinchMetrics();
        }
    });

    container.addEventListener("pointermove", (event) => {
        const pointer = pointers.get(event.pointerId);
        if (!pointer) return;
        pointer.x = event.clientX;
        pointer.y = event.clientY;

        if (pointers.size === 2 && pinchStart) {
            const now = pinchMetrics();
            x += now.x - pinchStart.x;
            y += now.y - pinchStart.y;
            zoomAt(now.distance / pinchStart.distance, now.x, now.y);
            render();
            pinchStart = now;
            return;
        }

        if (!dragStart) return;
        const dx = event.clientX - dragStart.pointerX;
        const dy = event.clientY - dragStart.pointerY;
        if (!dragMoved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        dragMoved = true;
        x = dragStart.x + dx;
        y = dragStart.y + dy;
        render();
    });

    function endPointer(event) {
        if (!pointers.delete(event.pointerId)) return;
        if (pointers.size === 1) {
            // One finger lifted after a pinch: keep panning with the other one.
            const [remaining] = [...pointers.values()];
            dragStart = { pointerX: remaining.x, pointerY: remaining.y, x, y };
            pinchStart = null;
        } else if (pointers.size === 0) {
            const wasClick = event.type === "pointerup" && !dragMoved && placing;
            dragStart = null;
            pinchStart = null;
            container.classList.remove("is-dragging");
            if (wasClick) placeWaypoint(event.clientX, event.clientY);
        }
    }

    container.addEventListener("pointerup", endPointer);
    container.addEventListener("pointercancel", endPointer);

    /* ---------- keyboard panning (only while the map is hovered or focused) ---------- */

    function mapHasKeyboard() {
        return container.matches(":hover") || document.activeElement === container;
    }

    function panWithKeys() {
        keyFrame = null;
        if (!pressedKeys.size) return;
        if (pressedKeys.has("ArrowUp")) y += KEY_PAN_SPEED;
        if (pressedKeys.has("ArrowDown")) y -= KEY_PAN_SPEED;
        if (pressedKeys.has("ArrowLeft")) x += KEY_PAN_SPEED;
        if (pressedKeys.has("ArrowRight")) x -= KEY_PAN_SPEED;
        render();
        keyFrame = requestAnimationFrame(panWithKeys);
    }

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && placing) setPlacing(false);
        if (!ARROW_KEYS.includes(event.key) || !mapHasKeyboard()) return;
        if (event.target.closest && event.target.closest("input, textarea, select")) return;
        event.preventDefault();
        pressedKeys.add(event.key);
        if (keyFrame === null) keyFrame = requestAnimationFrame(panWithKeys);
    });
    document.addEventListener("keyup", (event) => pressedKeys.delete(event.key));
    window.addEventListener("blur", () => pressedKeys.clear());

    /* ---------- day / night ---------- */

    function setMapMode(night) {
        if (night && !nightAvailable) return;
        isNight = night;
        container.classList.toggle("is-night", isNight);
        modeToggle.setAttribute("aria-pressed", String(isNight));
        modeToggle.setAttribute("aria-label", isNight ? "Switch to day map" : "Switch to night map");
        modeToggle.querySelector("span").textContent = isNight ? "Day" : "Night";
        modeToggle.firstChild.textContent = isNight ? "☀ " : "☾ ";
        if (nightImage) nightImage.setAttribute("aria-hidden", String(!isNight));
    }

    function disableNightMode() {
        nightAvailable = false;
        setMapMode(false);
        if (nightImage) nightImage.style.display = "none";
        modeToggle.disabled = true;
        modeToggle.title = "Add images/map-night.jpg to enable the night map";
    }

    if (modeToggle) {
        if (!nightImage || (nightImage.complete && nightImage.naturalWidth === 0 && nightImage.getAttribute("src"))) {
            disableNightMode();
        } else {
            nightImage.addEventListener("error", disableNightMode);
        }
        modeToggle.addEventListener("click", () => setMapMode(!isNight));
        if (nightAvailable) setMapMode(false);
    }

    /* ---------- waypoints ---------- */

    function isValidWaypoint(point) {
        return point && typeof point.name === "string" && Number.isFinite(point.x) && Number.isFinite(point.y);
    }

    function loadWaypoints() {
        try {
            const saved = JSON.parse(localStorage.getItem(WAYPOINT_KEY) || "[]");
            return Array.isArray(saved) ? saved.filter(isValidWaypoint) : [];
        } catch (error) {
            return [];
        }
    }

    function saveWaypoints() {
        try {
            localStorage.setItem(WAYPOINT_KEY, JSON.stringify(waypoints));
        } catch (error) {
            // Storage can be unavailable (private mode, quota); waypoints just won't persist.
        }
    }

    function renderWaypoints() {
        if (!waypointLayer) return;
        waypointLayer.textContent = "";
        waypoints.forEach((point) => {
            const anchor = document.createElement("div");
            anchor.className = "waypoint";
            anchor.style.left = `${point.x}px`;
            anchor.style.top = `${point.y}px`;

            const pin = document.createElement("button");
            pin.type = "button";
            pin.className = "waypoint-pin";
            pin.style.setProperty("--pin-color", point.color || "#1d4e89");
            pin.title = point.name;
            pin.setAttribute("aria-label", `Waypoint ${point.name}. Activate to delete.`);

            const letter = document.createElement("span");
            letter.textContent = point.name.charAt(0).toUpperCase();
            pin.appendChild(letter);

            pin.addEventListener("click", (event) => {
                event.stopPropagation();
                if (!confirm(`Delete waypoint “${point.name}”?`)) return;
                waypoints = waypoints.filter((item) => item.id !== point.id);
                saveWaypoints();
                renderWaypoints();
            });

            anchor.appendChild(pin);
            waypointLayer.appendChild(anchor);
        });
    }

    function setPlacing(value) {
        placing = value;
        container.classList.toggle("is-placing", placing);
        if (!waypointToggle) return;
        const label = placing ? "Cancel waypoint placement" : "Place waypoint";
        waypointToggle.setAttribute("aria-pressed", String(placing));
        waypointToggle.setAttribute("aria-label", label);
        waypointToggle.title = label;
    }

    function placeWaypoint(clientX, clientY) {
        const bounds = container.getBoundingClientRect();
        // Screen point -> map pixel, using the same x/y/scale the images are drawn with.
        const mapX = (clientX - bounds.left - x) / scale;
        const mapY = (clientY - bounds.top - y) / scale;
        if (mapX < 0 || mapY < 0 || mapX > image.naturalWidth || mapY > image.naturalHeight) return;

        const name = prompt("Waypoint name:");
        if (!name || !name.trim()) return;

        waypoints.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: name.trim().slice(0, 40),
            x: Math.round(mapX),
            y: Math.round(mapY),
            color: `hsl(${Math.floor(Math.random() * 360)} 68% 45%)`
        });
        saveWaypoints();
        renderWaypoints();
        setPlacing(false);
    }

    /* ---------- wiring ---------- */

    document.getElementById("zoom-in")?.addEventListener("click", () => {
        zoomAt(BUTTON_ZOOM_FACTOR, container.clientWidth / 2, container.clientHeight / 2);
    });
    document.getElementById("zoom-out")?.addEventListener("click", () => {
        zoomAt(1 / BUTTON_ZOOM_FACTOR, container.clientWidth / 2, container.clientHeight / 2);
    });
    document.getElementById("reset-view")?.addEventListener("click", resetView);
    waypointToggle?.addEventListener("click", () => setPlacing(!placing));

    image.addEventListener("load", resetView);
    // A cached image can finish loading before this script runs, so the load event is missed.
    if (image.complete && image.naturalWidth) resetView();

    // Keep the current view on resize instead of snapping back to the default.
    window.addEventListener("resize", () => {
        if (!updateMinScale()) return;
        scale = Math.max(scale, minScale);
        render();
    });

    renderWaypoints();
    setPlacing(false);
})();
