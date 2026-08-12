(async function applyConfiguredTheme() {
  const allowedThemes = new Set([
    "mosaic",
    "terminal",
    "retro-future",
    "light",
    "minimal",
    "90s-remix",
    "steampunk",
    "groovy",
    "yacht-rock"
  ]);
  let previewTheme = null;

  function applyTheme(theme) {
    if (!allowedThemes.has(theme)) return;

    document.documentElement.dataset.theme = theme;
  }

  if (typeof BroadcastChannel === "function") {
    const channel = new BroadcastChannel(
      "mosaic-theme-preview"
    );

    channel.addEventListener("message", (event) => {
      const theme = event.data?.theme;

      if (!allowedThemes.has(theme)) return;

      previewTheme = theme;
      applyTheme(theme);
    });
  }

  try {
    const response = await fetch("/api/config");

    if (!response.ok) {
      throw new Error(
        `Configuration request failed: ${response.status}`
      );
    }

    const config = await response.json();
    const theme = config.display?.theme;

    if (!previewTheme) {
      applyTheme(
        allowedThemes.has(theme) ? theme : "mosaic"
      );
    }
  } catch (error) {
    console.error("Unable to apply configured theme:", error);

    if (!previewTheme) {
      applyTheme("mosaic");
    }
  }
})();
