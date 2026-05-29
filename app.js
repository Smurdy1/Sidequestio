// Guard against duplicate script execution after conflict resolution.
if (!globalThis.__ideappInitialized) {
(function initIdeapp() {
if (globalThis.__ideappInitialized) return;
ideappBoot: {
if (globalThis.__ideappInitialized) break ideappBoot;
globalThis.__ideappInitialized = true;

const STORAGE_KEY = "ideappActivityIdeas.v1";
const VOTES_KEY = "ideappActivityVotes.v1";
const SWIPE_THRESHOLD = 96;

const starterIdeas = [
  {
    id: crypto.randomUUID(),
    title: "Secret stairway snack walk",
    description: "Find three public staircases in an older neighborhood, climb them before sunset, then end with tacos or ice cream.",
    category: "Outdoors",
    effort: "Easy",
    createdAt: Date.now() - 360000,
    yes: 18,
    no: 4
  },
  {
    id: crypto.randomUUID(),
    title: "One-hour train stop challenge",
    description: "Ride to a stop you never use. Spend exactly one hour finding the best photo, bite, and weird little detail.",
    category: "Wildcard",
    effort: "Medium",
    createdAt: Date.now() - 250000,
    yes: 23,
    no: 7
  },
  {
    id: crypto.randomUUID(),
    title: "Thrift fit movie night",
    description: "Everyone gets ten dollars to buy an outfit and one mystery DVD. Wear the outfit while watching the winner.",
    category: "Creative",
    effort: "Bring friends",
    createdAt: Date.now() - 190000,
    yes: 16,
    no: 8
  },
  {
    id: crypto.randomUUID(),
    title: "Sunrise swim and diner pancakes",
    description: "A cold early dip, warm coffee, and a booth where everyone gets the biggest pancake on the menu.",
    category: "Adrenaline",
    effort: "Plan ahead",
    createdAt: Date.now() - 120000,
    yes: 28,
    no: 5
  }
];

const ideaFeed = document.querySelector("#ideaFeed");
const ideaTemplate = document.querySelector("#ideaTemplate");
const sortIdeas = document.querySelector("#sortIdeas");
const yesButton = document.querySelector("#yesButton");
const noButton = document.querySelector("#noButton");
const seedButton = document.querySelector("#seedButton");
const openComposer = document.querySelector("#openComposer");
const closeComposer = document.querySelector("#closeComposer");
const composerDialog = document.querySelector("#composerDialog");
const ideaForm = document.querySelector("#ideaForm");
const userType = document.querySelector("#userType");
const feedPulse = document.querySelector("#feedPulse");

let ideas = load(STORAGE_KEY, starterIdeas);
let votes = load(VOTES_KEY, {});
let currentIdeaId = null;

function load(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ideas));
  localStorage.setItem(VOTES_KEY, JSON.stringify(votes));
}

function sortedIdeas() {
  return [...ideas].sort((a, b) => {
    if (sortIdeas.value === "new") return b.createdAt - a.createdAt;
    if (sortIdeas.value === "split") return Math.abs(approvalRate(a) - 50) - Math.abs(approvalRate(b) - 50);
    return b.yes - a.yes || score(b) - score(a) || b.createdAt - a.createdAt;
  });
}

function score(idea) {
  return idea.yes - idea.no;
}

function approvalRate(idea) {
  const total = idea.yes + idea.no;
  return total ? Math.round((idea.yes / total) * 100) : 0;
}

function judgementFor(idea) {
  const total = idea.yes + idea.no;
  const approval = approvalRate(idea);
  const tags = [];

  if (total < 3) tags.push("New drop");
  else if (approval >= 78) tags.push("Crowd wants this");
  else if (approval <= 35) tags.push("Niche adventure");
  else tags.push("Debate bait");

  if (["5 minutes", "Easy", "No money"].includes(idea.effort) && approval >= 58) tags.push("Low-friction yes");
  if (["Full send", "All day", "Plan ahead"].includes(idea.effort) && approval >= 58) tags.push("Memory maker");
  if (idea.no > idea.yes) tags.push("Needs a twist");

  return tags;
}

function render() {
  ideaFeed.innerHTML = "";
  const orderedIdeas = sortedIdeas();

  if (!orderedIdeas.length) {
    ideaFeed.innerHTML = `
      <section class="empty-feed">
        <div>
          <h2>No ideas yet.</h2>
          <p>Tap the + on the edge and post the first thing worth doing.</p>
        </div>
      </section>
    `;
    currentIdeaId = null;
    updateInsights();
    return;
  }

  orderedIdeas.forEach((idea, index) => {
    const node = ideaTemplate.content.cloneNode(true);
    const slide = node.querySelector(".idea-slide");
    const tags = node.querySelector(".tags");
    const title = node.querySelector("h2");
    const description = node.querySelector("p");
    const judgements = node.querySelector(".judgements");
    const approval = node.querySelector(".approval");
    const counts = node.querySelector(".counts");

    if (!slide || !tags || !title || !description || !judgements || !approval || !counts) {
      console.error("Ideapp idea template is missing required elements.");
      return;
    }

    slide.id = index === 0 ? "top" : `idea-${idea.id}`;
    slide.dataset.id = idea.id;
    slide.tabIndex = 0;
    tags.innerHTML = `<span class="tag">${escapeText(idea.category)}</span><span class="tag coral">${escapeText(idea.effort)}</span>`;
    title.textContent = idea.title;
    description.textContent = idea.description || "No pitch added yet. Swipe with your gut.";
    judgements.innerHTML = judgementFor(idea).map((tag) => `<span class="judgement">${escapeText(tag)}</span>`).join("");
    approval.textContent = `${approvalRate(idea)}% yes`;
    counts.textContent = `${idea.yes} yes · ${idea.no} no`;

    attachSwipeHandlers(slide);
    ideaFeed.appendChild(node);
  });

  observeCurrentSlide();
  updateInsights();
}

function escapeText(text) {
  const element = document.createElement("span");
  element.textContent = text;
  return element.innerHTML;
}

function attachSwipeHandlers(slide) {
  let startX = 0;
  let currentX = 0;
  let pointerId = null;

  slide.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    currentX = 0;
    slide.setPointerCapture(pointerId);
    slide.classList.add("is-dragging");
  });

  slide.addEventListener("pointermove", (event) => {
    if (pointerId !== event.pointerId) return;
    currentX = event.clientX - startX;
    const clamped = Math.max(-150, Math.min(150, currentX));
    const opacity = Math.min(1, Math.abs(clamped) / SWIPE_THRESHOLD);
    slide.style.setProperty("--drag-x", `${clamped}px`);
    slide.style.setProperty("--drag-rotate", `${clamped / 18}deg`);
    slide.style.setProperty("--stamp-opacity", opacity.toFixed(2));
    slide.style.setProperty("--stamp-rotate", currentX > 0 ? "-12deg" : "12deg");
    slide.classList.toggle("dragging-yes", currentX > 16);
    slide.classList.toggle("dragging-no", currentX < -16);
  });

  slide.addEventListener("pointerup", (event) => finishSwipe(event.pointerId));
  slide.addEventListener("pointercancel", (event) => finishSwipe(event.pointerId));

  function finishSwipe(endedPointerId) {
    if (pointerId !== endedPointerId) return;
    slide.releasePointerCapture(pointerId);
    slide.classList.remove("is-dragging", "dragging-yes", "dragging-no");
    pointerId = null;

    if (currentX > SWIPE_THRESHOLD) {
      animateVote(slide, "yes");
      return;
    }

    if (currentX < -SWIPE_THRESHOLD) {
      animateVote(slide, "no");
      return;
    }

    slide.style.removeProperty("--drag-x");
    slide.style.removeProperty("--drag-rotate");
    slide.style.removeProperty("--stamp-opacity");
  }
}

function observeCurrentSlide() {
  const slides = [...document.querySelectorAll(".idea-slide")];
  if (!slides.length) return;

  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (visible) {
      currentIdeaId = visible.target.dataset.id;
      updateActionStates();
    }
  }, { root: ideaFeed, threshold: [0.55, 0.8] });

  slides.forEach((slide) => observer.observe(slide));
  currentIdeaId = slides[0].dataset.id;
  updateActionStates();
}

function voteCurrent(choice) {
  const slide = document.querySelector(`.idea-slide[data-id="${currentIdeaId}"]`);
  if (!slide) return;
  animateVote(slide, choice);
}

function animateVote(slide, choice) {
  const id = slide.dataset.id;
  const nextSlide = slide.nextElementSibling;
  const nextId = nextSlide?.dataset.id || id;
  slide.dataset.vote = choice;
  setTimeout(() => {
    vote(id, choice);
    render();
    scrollToIdea(nextId);
  }, 170);
}

function vote(id, choice) {
  const idea = ideas.find((item) => item.id === id);
  if (!idea) return;

  const previous = votes[id];
  if (previous === choice) {
    idea[choice] -= 1;
    delete votes[id];
  } else {
    if (previous) idea[previous] -= 1;
    idea[choice] += 1;
    votes[id] = choice;
  }

  save();
  updateInsights();
  updateActionStates();
}

function scrollToIdea(id) {
  const slide = document.querySelector(`.idea-slide[data-id="${id}"]`);

  if (slide) {
    slide.scrollIntoView({ behavior: "auto", block: "start" });
    currentIdeaId = id;
    updateActionStates();
  }
}

function updateActionStates() {
  yesButton.classList.toggle("active", votes[currentIdeaId] === "yes");
  noButton.classList.toggle("active", votes[currentIdeaId] === "no");
}

function updateInsights() {
  const personalVotes = Object.values(votes);
  const yesVotes = personalVotes.filter((voteValue) => voteValue === "yes").length;
  const noVotes = personalVotes.length - yesVotes;
  const averageApproval = ideas.length
    ? Math.round(ideas.reduce((sum, idea) => sum + approvalRate(idea), 0) / ideas.length)
    : 0;

  if (!personalVotes.length) userType.textContent = "Still deciding";
  else if (yesVotes / personalVotes.length >= 0.7) userType.textContent = "Adventure magnet";
  else if (noVotes / personalVotes.length >= 0.7) userType.textContent = "Sharp curator";
  else userType.textContent = "Balanced scout";

  feedPulse.textContent = ideas.length ? `${ideas.length} ideas · ${averageApproval}% average yes` : "Fresh start";
}

function openComposerDialog() {
  if (typeof composerDialog.showModal === "function") {
    composerDialog.showModal();
  } else {
    composerDialog.setAttribute("open", "");
  }
}

openComposer.addEventListener("click", openComposerDialog);
closeComposer.addEventListener("click", () => composerDialog.close());
yesButton.addEventListener("click", () => voteCurrent("yes"));
noButton.addEventListener("click", () => voteCurrent("no"));
sortIdeas.addEventListener("change", render);

seedButton.addEventListener("click", () => {
  const existingTitles = new Set(ideas.map((idea) => idea.title));
  const additions = starterIdeas
    .filter((idea) => !existingTitles.has(idea.title))
    .map((idea) => ({ ...idea, id: crypto.randomUUID(), createdAt: Date.now() - Math.floor(Math.random() * 500000) }));

  ideas = [...additions, ...ideas];
  save();
  render();
});

ideaForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(ideaForm);
  const description = formData.get("description").trim();

  ideas.unshift({
    id: crypto.randomUUID(),
    title: formData.get("title").trim(),
    description,
    category: formData.get("category"),
    effort: formData.get("effort"),
    createdAt: Date.now(),
    yes: 0,
    no: 0
  });

  ideaForm.reset();
  composerDialog.close();
  save();
  render();
  ideaFeed.scrollTo({ top: 0, behavior: "smooth" });
});

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight") voteCurrent("yes");
  if (event.key === "ArrowLeft") voteCurrent("no");
  if (event.key.toLowerCase() === "n") openComposerDialog();
});

render();
})();
}
