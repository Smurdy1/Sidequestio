// Duplicate-safe boot flag; keep declarations redeclarable so bad merges do not hard-crash.
var ideappShouldBoot = !globalThis.__ideappInitialized;
globalThis.__ideappInitialized = true;

var STORAGE_KEY = "ideappActivityIdeas.v1";
var VOTES_KEY = "ideappActivityVotes.v1";
var SWIPE_THRESHOLD = 120;
var VOTE_ANIMATION_MS = 380;
var VOTE_SCROLL_DELAY_MS = 460;
var TAG_LIMIT = 5;
var DAY_MS = 24 * 60 * 60 * 1000;
var renderedOrder = [];
var selectedTagSet = new Set();
var lastVote = null;
var suggestedTags = new Set(["Outdoors", "Food", "Creative", "Night", "Cozy", "Adrenaline", "10 minutes", "Low effort", "All day", "Plan ahead", "No money", "Road trip", "Solo", "Date", "Friends", "Family"]);

var starterIdeas = [
  {
    id: crypto.randomUUID(),
    title: "Secret stairway snack walk",
    description: "Find three public staircases in an older neighborhood, climb them before sunset, then end with tacos or ice cream.",
    category: "Outdoors",
    effort: "Low effort",
    tags: ["Outdoors", "Low effort", "Food"],
    createdAt: Date.now() - DAY_MS * 2 - 360000,
    yes: 18,
    no: 4
  },
  {
    id: crypto.randomUUID(),
    title: "One-hour train stop challenge",
    description: "Ride to a stop you never use. Spend exactly one hour finding the best photo, bite, and weird little detail.",
    category: "Wildcard",
    effort: "Medium",
    tags: ["Wildcard", "Transit", "One hour"],
    createdAt: Date.now() - DAY_MS * 2 - 250000,
    yes: 23,
    no: 7
  },
  {
    id: crypto.randomUUID(),
    title: "Thrift fit movie night",
    description: "Everyone gets ten dollars to buy an outfit and one mystery DVD. Wear the outfit while watching the winner.",
    category: "Creative",
    effort: "Bring friends",
    tags: ["Creative", "Friends", "No money"],
    createdAt: Date.now() - DAY_MS * 2 - 190000,
    yes: 16,
    no: 8
  },
  {
    id: crypto.randomUUID(),
    title: "Sunrise swim and diner pancakes",
    description: "A cold early dip, warm coffee, and a booth where everyone gets the biggest pancake on the menu.",
    category: "Adrenaline",
    effort: "Plan ahead",
    tags: ["Adrenaline", "Plan ahead", "Food"],
    createdAt: Date.now() - DAY_MS * 2 - 120000,
    yes: 28,
    no: 5
  }
];

var ideaFeed = document.querySelector("#ideaFeed");
var ideaTemplate = document.querySelector("#ideaTemplate");
var sortIdeas = document.querySelector("#sortIdeas");
var yesButton = document.querySelector("#yesButton");
var noButton = document.querySelector("#noButton");
var undoButton = document.querySelector("#undoButton");
var copyButton = document.querySelector("#copyButton");
var openComposer = document.querySelector("#openComposer");
var closeComposer = document.querySelector("#closeComposer");
var composerDialog = document.querySelector("#composerDialog");
var ideaForm = document.querySelector("#ideaForm");
var titleInput = document.querySelector("#title");
var descriptionInput = document.querySelector("#description");
var titleWarning = document.querySelector("#titleWarning");
var descriptionWarning = document.querySelector("#descriptionWarning");
var tagGroups = document.querySelector("#tagGroups");
var customTag = document.querySelector("#customTag");
var addCustomTag = document.querySelector("#addCustomTag");
var selectedTags = document.querySelector("#selectedTags");
var selectedTagList = document.querySelector("#selectedTagList");
var tagCount = document.querySelector("#tagCount");
var tagLimit = document.querySelector("#tagLimit");
var tagWarning = document.querySelector("#tagWarning");

var ideas = load(STORAGE_KEY, starterIdeas);
var votes = load(VOTES_KEY, {});
var currentIdeaId = null;
var currentSlide = null;
if (tagLimit) tagLimit.textContent = TAG_LIMIT;

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

function normalizeTag(tag) {
  const cleanTag = tag.trim().replace(/\s+/g, " ").slice(0, 18);
  if (cleanTag.toLowerCase() === "easy") return "Low effort";
  if (cleanTag.toLowerCase() === "5 minutes") return "10 minutes";
  return cleanTag;
}

function isCustomTag(tag) {
  return !suggestedTags.has(normalizeTag(tag));
}

function ideaTags(idea) {
  const tags = Array.isArray(idea.tags) ? idea.tags : [idea.category, idea.effort];
  return [...new Set(tags.map((tag) => normalizeTag(String(tag || ""))).filter(Boolean))].slice(0, TAG_LIMIT);
}

function syncTagInputs() {
  const tags = [...selectedTagSet];
  if (selectedTags) selectedTags.value = tags.join(",");
  if (tagCount) tagCount.textContent = `${tags.length}/${TAG_LIMIT}`;
  if (tagWarning && tags.length) tagWarning.textContent = "";
  if (selectedTagList) {
    selectedTagList.innerHTML = tags.map((tag) => {
      const customClass = isCustomTag(tag) ? " custom" : "";
      return `<button class="${customClass}" type="button" data-selected-tag="${escapeText(tag)}" aria-label="Remove ${escapeText(tag)} tag">${escapeText(tag)} <span aria-hidden="true">×</span></button>`;
    }).join("");
  }
  if (customTag) {
    const atLimit = selectedTagSet.size >= TAG_LIMIT;
    customTag.disabled = atLimit;
    customTag.placeholder = atLimit ? "5 tags selected" : "Add custom tag";
    if (addCustomTag) addCustomTag.disabled = atLimit;
  }
  document.querySelectorAll("[data-tag]").forEach((button) => {
    const tag = normalizeTag(button.dataset.tag || "");
    button.classList.toggle("selected", selectedTagSet.has(tag));
    button.disabled = !selectedTagSet.has(tag) && selectedTagSet.size >= TAG_LIMIT;
  });
}

function toggleTag(tag) {
  const cleanTag = normalizeTag(tag);
  if (!cleanTag) return;
  if (selectedTagSet.has(cleanTag)) selectedTagSet.delete(cleanTag);
  else if (selectedTagSet.size < TAG_LIMIT) selectedTagSet.add(cleanTag);
  else if (tagWarning) tagWarning.textContent = `${TAG_LIMIT} tags max`;
  syncTagInputs();
}

function resetTagPicker(defaultTags = []) {
  selectedTagSet = new Set(defaultTags.map((tag) => normalizeTag(tag)).filter(Boolean).slice(0, TAG_LIMIT));
  if (customTag) customTag.classList.remove("used");
  syncTagInputs();
}

function render() {
  ideaFeed.innerHTML = "";
  renderedOrder = sortedIdeas();

  if (!renderedOrder.length) {
    ideaFeed.innerHTML = `
      <section class="empty-feed">
        <div>
          <h2>No ideas yet.</h2>
          <p>Tap the + on the edge and post the first thing worth doing.</p>
        </div>
      </section>
    `;
    currentIdeaId = null;
    currentSlide = null;
    return;
  }

  appendIdeaSlides(3);
  observeCurrentSlide();
}

function appendIdeaSlides(cycles = 1) {
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    renderedOrder.forEach((idea) => appendIdeaSlide(idea));
  }
}

function appendIdeaSlide(idea) {
  const node = ideaTemplate.content.cloneNode(true);
  const slide = node.querySelector(".idea-slide");
  const tags = node.querySelector(".tags");
  const title = node.querySelector("h2");
  const description = node.querySelector("p");
  const approval = node.querySelector(".approval");
  const counts = node.querySelector(".counts");
  const hint = node.querySelector(".vote-hint");
  const newMarker = node.querySelector(".new-marker");

  if (!slide || !tags || !title || !description || !approval || !counts) {
    console.error("Ideapp idea template is missing required elements.");
    return;
  }

  slide.dataset.id = idea.id;
  slide.tabIndex = 0;
  if (hint && !ideaFeed.children.length) hint.hidden = false;
  if (newMarker && Date.now() - idea.createdAt < DAY_MS) newMarker.hidden = false;
  slide.dataset.vote = votes[idea.id] || "";
  tags.innerHTML = ideaTags(idea).map((tag, index) => {
    const classes = ["tag"];
    if (index === 0) classes.push("primary");
    if (isCustomTag(tag)) classes.push("custom");
    return `<span class="${classes.join(" ")}">${escapeText(tag)}</span>`;
  }).join("");
  title.textContent = idea.title;
  description.textContent = idea.description || "No pitch added yet. Swipe with your gut.";
  approval.textContent = `${approvalRate(idea)}% yes`;
  counts.textContent = `${idea.yes} yes · ${idea.no} no`;

  attachSwipeHandlers(slide);
  ideaFeed.appendChild(node);
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
    const choice = Math.abs(currentX) > SWIPE_THRESHOLD ? (currentX > 0 ? "yes" : "no") : "";
    setVotePreview(slide, choice);
  });

  slide.addEventListener("pointerup", (event) => finishSwipe(event.pointerId));
  slide.addEventListener("pointercancel", (event) => finishSwipe(event.pointerId));

  function finishSwipe(endedPointerId) {
    if (pointerId !== endedPointerId) return;
    slide.releasePointerCapture(pointerId);
    slide.classList.remove("is-dragging");
    pointerId = null;

    if (currentX > SWIPE_THRESHOLD) {
      animateVote(slide, "yes");
      return;
    }

    if (currentX < -SWIPE_THRESHOLD) {
      animateVote(slide, "no");
      return;
    }

    clearVotePreview(slide);
  }
}

function setVotePreview(slide, choice) {
  const currentVote = votes[slide.dataset.id] || "";
  if (!choice) {
    clearVotePreview(slide);
    return;
  }

  slide.dataset.preview = choice === currentVote ? "clear" : choice;
}

function clearVotePreview(slide) {
  delete slide.dataset.preview;
}

function observeCurrentSlide() {
  syncCurrentSlide();
}

function syncCurrentSlide() {
  const slides = [...document.querySelectorAll(".idea-slide")];
  if (!slides.length) return;

  const feedTop = ideaFeed.getBoundingClientRect().top;
  const closest = slides.reduce((best, slide) => {
    const distance = Math.abs(slide.getBoundingClientRect().top - feedTop);
    return distance < best.distance ? { slide, distance } : best;
  }, { slide: slides[0], distance: Infinity }).slide;

  currentSlide = closest;
  currentIdeaId = closest.dataset.id;
  updateActionStates();
}
function voteCurrent(choice) {
  const slide = currentSlide || document.querySelector(`.idea-slide[data-id="${currentIdeaId}"]`);
  if (!slide) return;
  animateVote(slide, choice);
}

function animateVote(slide, choice) {
  if (slide.dataset.animating === "true") return;
  const id = slide.dataset.id;
  let nextSlide = slide.nextElementSibling;
  if (!nextSlide) {
    appendIdeaSlides(1);
    nextSlide = slide.nextElementSibling;
  }

  slide.dataset.animating = "true";
  setVotePreview(slide, choice);
  setTimeout(() => {
    vote(id, choice, slide);
    updateSlideCounts(id);
    setTimeout(() => {
      scrollToSlide(nextSlide || slide);
      clearVotePreview(slide);
      delete slide.dataset.animating;
    }, VOTE_SCROLL_DELAY_MS - VOTE_ANIMATION_MS);
  }, VOTE_ANIMATION_MS);
}

function vote(id, choice, votedSlide = null) {
  const idea = ideas.find((item) => item.id === id);
  if (!idea) return;

  const previous = votes[id];
  lastVote = { id, previous, slide: votedSlide };
  if (previous === choice) {
    idea[choice] -= 1;
    delete votes[id];
  } else {
    if (previous) idea[previous] -= 1;
    idea[choice] += 1;
    votes[id] = choice;
  }

  save();
  updateSlideCounts(id);
  updateActionStates();
}

function undoLastVote() {
  if (!lastVote) return;
  const undoTarget = lastVote;
  const idea = ideas.find((item) => item.id === undoTarget.id);
  if (!idea) return;

  const current = votes[undoTarget.id];
  if (current) idea[current] -= 1;
  if (undoTarget.previous) {
    idea[undoTarget.previous] += 1;
    votes[undoTarget.id] = undoTarget.previous;
  } else {
    delete votes[undoTarget.id];
  }

  save();
  updateSlideCounts(undoTarget.id);
  scrollToUndoneSlide(undoTarget);
  lastVote = null;
  updateActionStates();
}

function scrollToUndoneSlide(undoTarget) {
  if (undoTarget.slide?.isConnected) {
    scrollToSlide(undoTarget.slide);
    return;
  }

  const matchingSlide = [...document.querySelectorAll(".idea-slide")]
    .find((slide) => slide.dataset.id === undoTarget.id);
  if (matchingSlide) scrollToSlide(matchingSlide);
}

function updateSlideCounts(id) {
  const idea = ideas.find((item) => item.id === id);
  if (!idea) return;

  document.querySelectorAll(`.idea-slide[data-id="${id}"]`).forEach((slide) => {
    const approval = slide.querySelector(".approval");
    const counts = slide.querySelector(".counts");
    slide.dataset.vote = votes[id] || "";
    if (approval) approval.textContent = `${approvalRate(idea)}% yes`;
    if (counts) counts.textContent = `${idea.yes} yes · ${idea.no} no`;
  });
}

function scrollToSlide(slide) {
  if (slide) {
    slide.scrollIntoView({ behavior: "smooth", block: "start" });
    currentSlide = slide;
    currentIdeaId = slide.dataset.id;
    updateActionStates();
  }
}

function updateActionStates() {
  yesButton.classList.toggle("active", votes[currentIdeaId] === "yes");
  noButton.classList.toggle("active", votes[currentIdeaId] === "no");
  undoButton.disabled = !lastVote;
}

function openComposerDialog() {
  resetTagPicker(["Low effort", "Friends"]);
  if (typeof composerDialog.showModal === "function") {
    composerDialog.showModal();
  } else {
    composerDialog.setAttribute("open", "");
  }
}

function currentIdea() {
  return ideas.find((idea) => idea.id === currentIdeaId);
}

function votePercents(idea) {
  const total = idea.yes + idea.no;
  if (!total) return { yes: 0, no: 0 };
  const yes = Math.round((idea.yes / total) * 100);
  return { yes, no: 100 - yes };
}

function shareText(idea) {
  const percents = votePercents(idea);
  return [
    `Idea: ${idea.title}`,
    idea.description ? `Why: ${idea.description}` : "",
    `Tags: ${ideaTags(idea).join(", ")}`,
    `Votes: ${percents.yes}% yes / ${percents.no}% no`
  ].filter(Boolean).join("\n");
}

function copyCurrentIdea() {
  const idea = currentIdea();
  if (!idea) return;
  const text = shareText(idea);
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text);
  else {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    textArea.remove();
  }
  copyButton.classList.add("copied");
  setTimeout(() => copyButton.classList.remove("copied"), 700);
}

function updateCharacterWarning(input, warning, threshold) {
  if (!input || !warning) return;
  const remaining = input.maxLength - input.value.length;
  warning.textContent = remaining <= threshold ? `${remaining} characters left` : "";
}

function maybeExtendFeed() {
  if (!renderedOrder.length) return;
  const remaining = ideaFeed.scrollHeight - ideaFeed.scrollTop - ideaFeed.clientHeight;
  if (remaining < ideaFeed.clientHeight * 1.5) appendIdeaSlides(2);
  syncCurrentSlide();
}

ideappShouldBoot && ideaFeed.addEventListener("scroll", maybeExtendFeed);
ideappShouldBoot && tagGroups.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tag]");
  if (button) toggleTag(button.dataset.tag);
});
ideappShouldBoot && selectedTagList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-selected-tag]");
  if (button) toggleTag(button.dataset.selectedTag);
});
ideappShouldBoot && addCustomTag.addEventListener("click", () => {
  toggleTag(customTag.value);
  customTag.value = "";
  customTag.classList.add("used");
});
ideappShouldBoot && customTag.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    toggleTag(customTag.value);
    customTag.value = "";
    customTag.classList.add("used");
  }
});
ideappShouldBoot && openComposer.addEventListener("click", openComposerDialog);
ideappShouldBoot && closeComposer.addEventListener("click", () => composerDialog.close());
ideappShouldBoot && yesButton.addEventListener("click", () => voteCurrent("yes"));
ideappShouldBoot && noButton.addEventListener("click", () => voteCurrent("no"));
ideappShouldBoot && undoButton.addEventListener("click", undoLastVote);
ideappShouldBoot && copyButton.addEventListener("click", copyCurrentIdea);
ideappShouldBoot && titleInput.addEventListener("input", () => updateCharacterWarning(titleInput, titleWarning, 10));
ideappShouldBoot && descriptionInput.addEventListener("input", () => updateCharacterWarning(descriptionInput, descriptionWarning, 40));
ideappShouldBoot && sortIdeas.addEventListener("change", render);

ideappShouldBoot && ideaForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(ideaForm);
  const description = formData.get("description").trim();
  const tags = (formData.get("tags") || "").split(",").map(normalizeTag).filter(Boolean).slice(0, TAG_LIMIT);
  if (!tags.length) {
    if (tagWarning) tagWarning.textContent = "Pick at least one tag";
    return;
  }

  ideas.unshift({
    id: crypto.randomUUID(),
    title: formData.get("title").trim(),
    description,
    category: tags[0] || "Wildcard",
    effort: tags[1] || "Low effort",
    tags,
    createdAt: Date.now(),
    yes: 0,
    no: 0
  });

  ideaForm.reset();
  resetTagPicker();
  composerDialog.close();
  save();
  render();
  ideaFeed.scrollTo({ top: 0, behavior: "smooth" });
});

ideappShouldBoot && window.addEventListener("keydown", (event) => {
  const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName) || event.target.isContentEditable;
  if (isTyping || composerDialog.open) return;

  if (event.key === "ArrowRight") {
    event.preventDefault();
    voteCurrent("yes");
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    voteCurrent("no");
  }
});

syncTagInputs();
updateCharacterWarning(titleInput, titleWarning, 10);
updateCharacterWarning(descriptionInput, descriptionWarning, 40);
ideappShouldBoot && render();
