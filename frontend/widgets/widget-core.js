/* ==========================
   Mosaic Widget Core
========================== */

class MosaicWidget {

    constructor(config) {

        this.id = config.id;
        this.title = config.title || "";
        this.size = config.size || "small";

        this.views = config.views || [];

        this.currentView = 0;
        this.expanded = false;

        this.rotationTime = config.rotationTime || 15000;

        this.element = null;
        this.timer = null;
    }


    mount(element) {

        this.element = element;

        this.render();

        this.startRotation();

    }


    render() {

        if (!this.element) return;


        const view = this.views[this.currentView];


        this.element.innerHTML = `

    <section class="widget ${this.size}">

        <div class="widget-header">

            <div class="widget-title">
                ${this.title}
            </div>

            <div class="widget-status">
                ${this.expanded ? "Expanded" : ""}
            </div>

        </div>


        <div class="widget-body">

            ${view.render()}

        </div>


        <div class="widget-footer">

            <span>
                ${this.currentView + 1}/${this.views.length}
            </span>

            <span>
                Mosaic
            </span>

        </div>

    </section>

`;

    }


    nextView() {

        this.currentView++;

        if (this.currentView >= this.views.length) {

            this.currentView = 0;

        }

        this.render();

    }


    previousView() {

        this.currentView--;

        if (this.currentView < 0) {

            this.currentView = this.views.length - 1;

        }

        this.render();

    }


    toggleExpand() {

        this.expanded = !this.expanded;

        this.render();

    }


    startRotation() {

        this.stopRotation();


        this.timer = setInterval(() => {


            if (!this.expanded) {

                this.nextView();

            }


        }, this.rotationTime);

    }


    stopRotation() {

        if (this.timer) {

            clearInterval(this.timer);

        }

    }

}