const redditFeed = document.getElementById("reddit-feed");

let redditPosts = [];
let currentPostIndex = 0;
let rotationTimer = null;

function escapeHtml(value = "") {
  return value.replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };

    return entities[character];
  });
}

function displayCurrentPost() {
  if (!redditFeed || redditPosts.length === 0) {
    return;
  }

  const post = redditPosts[currentPostIndex];

  redditFeed.innerHTML = `
    <div class="reddit-post">
      <div class="reddit-source">
        ${escapeHtml(post.subreddit)}
      </div>

      <div class="reddit-headline">
        ${escapeHtml(post.title)}
      </div>

      <div class="reddit-position">
        ${currentPostIndex + 1} / ${redditPosts.length}
      </div>
    </div>
  `;
}

function startRotation() {
  if (rotationTimer) {
    clearInterval(rotationTimer);
  }

  rotationTimer = setInterval(() => {
    currentPostIndex =
      (currentPostIndex + 1) % redditPosts.length;

    displayCurrentPost();
  }, 15000);
}

async function loadRedditFeed() {
  try {
    const response = await fetch("/api/reddit");

    if (!response.ok) {
      throw new Error(`Reddit request failed: ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data.posts) || data.posts.length === 0) {
      throw new Error("No Reddit posts were returned.");
    }

    redditPosts = data.posts;
    currentPostIndex = 0;

    displayCurrentPost();
    startRotation();
  } catch (error) {
    console.error("Unable to load Reddit feed:", error);

    redditFeed.innerHTML = `
      <div class="reddit-post">
        <div class="reddit-source">
          Reddit unavailable
        </div>

        <div class="reddit-headline">
          The feed could not be loaded.
        </div>
      </div>
    `;
  }
}

loadRedditFeed();

setInterval(loadRedditFeed, 15 * 60 * 1000);
