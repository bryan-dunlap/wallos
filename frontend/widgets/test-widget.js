console.log("TEST WIDGET FILE LOADED");

/* ==========================
   Test Widget
========================== */

const TestWidget = new MosaicWidget({

    id: "test",

    title: "Test Widget",

    size: "small",

    rotationTime: 5000,

    views: [

        {
            title: "Greeting",

            render() {

                return `
                    <div>
                        Hello Mosaic
                    </div>
                `;

            }

        },


        {
            title: "Rotation",

            render() {

                return `
                    <div>
                        Rotation Works
                    </div>
                `;

            }

        },


        {
            title: "Future",

            render() {

                return `
                    <div>
                        Knob Ready
                    </div>
                `;

            }

        }

    ]

});
