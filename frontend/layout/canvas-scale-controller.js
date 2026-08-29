const MOSAIC_CANVAS_WIDTH = 1512;
const MOSAIC_CANVAS_HEIGHT = 982;

function calculateMosaicCanvasScale(viewportWidth, viewportHeight) {
    if (
        !Number.isFinite(viewportWidth) ||
        !Number.isFinite(viewportHeight) ||
        viewportWidth <= 0 ||
        viewportHeight <= 0
    ) {
        return 1;
    }

    return Math.min(
        viewportWidth / MOSAIC_CANVAS_WIDTH,
        viewportHeight / MOSAIC_CANVAS_HEIGHT
    );
}

class MosaicCanvasScaleController {

    constructor(root = document.documentElement) {
        this.root = root;
        this.frame = null;
        this.handleResize = () => this.scheduleUpdate();
    }

    getViewportSize() {
        return {
            width: document.documentElement.clientWidth,
            height: document.documentElement.clientHeight
        };
    }

    update() {
        this.frame = null;

        const viewport = this.getViewportSize();
        const scale = calculateMosaicCanvasScale(
            viewport.width,
            viewport.height
        );

        this.root.style.setProperty("--mosaic-scale", String(scale));
    }

    scheduleUpdate() {
        if (this.frame !== null) return;

        this.frame = window.requestAnimationFrame(
            () => this.update()
        );
    }

    start() {
        this.update();
        window.addEventListener("resize", this.handleResize);
    }

    stop() {
        window.removeEventListener("resize", this.handleResize);

        if (this.frame !== null) {
            window.cancelAnimationFrame(this.frame);
            this.frame = null;
        }
    }

}

window.mosaicCanvasScaleController =
    new MosaicCanvasScaleController();
window.mosaicCanvasScaleController.start();
