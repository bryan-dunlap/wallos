/* ==========================
   Mosaic Event Definitions
========================== */

function createMosaicEvent({
    type,
    title,
    subtitle = "",
    source = "",
    payload = {}
}) {

    return {

        type,

        title,

        subtitle,

        source,

        payload

    };

}
