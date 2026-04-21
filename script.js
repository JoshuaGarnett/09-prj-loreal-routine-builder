/* ---------- DOM references ---------- */
window.__APP_SCRIPT_LOADED = true;
const APP_VERSION = "4.1";
const WORKER_URL = "https://holy-king-6ca1.josh-j-garnett.workers.dev/";
const STORAGE_KEYS = {
  selectedIds: "loreal-selected-products",
  rtlMode: "loreal-rtl-mode",
};

const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const rtlToggle = document.getElementById("rtlToggle");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const selectionSummary = document.getElementById("selectionSummary");
const clearSelectionsBtn = document.getElementById("clearSelections");
const generateRoutineBtn = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const clearChatBtn = document.getElementById("clearChat");
const appStatus = document.getElementById("appStatus");

/* ---------- app state ---------- */
let allProducts = [];
let selectedProductIds = new Set();
let expandedDescriptions = new Set();
let conversationHistory = [];
let hasGeneratedRoutine = false;
let productsLoaded = false;

/* ---------- startup ---------- */
initializeApp();

function setAppStatus(state, text) {
  if (!appStatus) {
    return;
  }

  appStatus.classList.remove("is-booting", "is-ready", "is-error");
  appStatus.classList.add(state);
  appStatus.textContent = text;
}

async function initializeApp() {
  setAppStatus("is-booting", `App status: booting... (v${APP_VERSION})`);
  window.__APP_READY = false;
  window.__APP_INIT_FAILED = false;
  const bootGuardId = setTimeout(() => {
    if (!window.__APP_READY) {
      setAppStatus("is-error", `App status: startup timeout (v${APP_VERSION})`);
      productsContainer.innerHTML = `<div class="placeholder-message">Startup timed out. Please refresh the page.</div>`;
      window.__APP_INIT_FAILED = true;
    }
  }, 8000);

  try {
    loadSavedSelections();
    loadSavedDirection();
    addMessageToChat(
      "assistant",
      "Choose products, then click Generate Routine. After that, you can ask follow-up questions about your routine, skincare, haircare, makeup, fragrance, or related beauty topics.",
    );

    if (window.PRODUCTS_DATA && Array.isArray(window.PRODUCTS_DATA.products)) {
      allProducts = window.PRODUCTS_DATA.products;
      productsLoaded = true;
      renderProducts();
      renderSelectedProducts();
      setAppStatus("is-ready", `App status: ready (v${APP_VERSION})`);
      window.__APP_READY = true;
      window.__APP_INIT_FAILED = false;
      return;
    }

    allProducts = await loadProducts();
    productsLoaded = true;
    renderProducts();
    renderSelectedProducts();
    setAppStatus("is-ready", `App status: ready (v${APP_VERSION})`);
    window.__APP_READY = true;
    window.__APP_INIT_FAILED = false;
  } catch (error) {
    productsContainer.innerHTML = `<div class="placeholder-message">Could not load products. Please refresh and try again.</div>`;
    addMessageToChat(
      "assistant",
      "I could not load products right now. Please refresh the page.",
    );
    setAppStatus("is-error", `App status: error (v${APP_VERSION})`);
    window.__APP_READY = false;
    window.__APP_INIT_FAILED = true;
    console.error(error);
  } finally {
    clearTimeout(bootGuardId);
  }
}

/* ---------- data loading ---------- */
async function loadProducts() {
  if (window.PRODUCTS_DATA && Array.isArray(window.PRODUCTS_DATA.products)) {
    return window.PRODUCTS_DATA.products;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  let response;

  try {
    response = await fetch("products.json", { signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Product loading timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`Failed to load products: ${response.status}`);
  }

  const data = await response.json();
  return data.products;
}

/* ---------- rendering ---------- */
function renderProducts() {
  if (!productsLoaded && allProducts.length === 0) {
    productsContainer.innerHTML = `<div class="placeholder-message">Loading products...</div>`;
    return;
  }

  const selectedCategory = categoryFilter.value;
  const searchTerm = productSearch.value.trim().toLowerCase();

  const filteredProducts = allProducts.filter((product) => {
    const matchesCategory =
      selectedCategory === "all" || product.category === selectedCategory;
    const matchesSearch =
      searchTerm.length === 0 ||
      product.name.toLowerCase().includes(searchTerm) ||
      product.brand.toLowerCase().includes(searchTerm) ||
      product.description.toLowerCase().includes(searchTerm);

    return matchesCategory && matchesSearch;
  });

  if (filteredProducts.length === 0) {
    productsContainer.innerHTML = `<div class="placeholder-message">No products match your search. Try a different keyword or category.</div>`;
    return;
  }

  productsContainer.innerHTML = filteredProducts
    .map((product) => {
      const isSelected = selectedProductIds.has(product.id);
      const isDescriptionOpen = expandedDescriptions.has(product.id);

      return `
        <article class="product-card ${isSelected ? "selected" : ""}" data-id="${product.id}" aria-pressed="${isSelected}">
          <div class="product-top">
            <img src="${product.image}" alt="${product.name}" loading="lazy" />
            <div class="product-info">
              <h3>${product.name}</h3>
              <p class="brand">${product.brand}</p>
              <span class="badge">${product.category}</span>
            </div>
          </div>

          <div class="card-actions">
            <button type="button" class="toggle-selection">${isSelected ? "Unselect" : "Select"}</button>
            <button type="button" class="toggle-description" aria-expanded="${isDescriptionOpen}">${isDescriptionOpen ? "Hide Details" : "View Details"}</button>
          </div>

          <p class="description-panel ${isDescriptionOpen ? "open" : ""}">${product.description}</p>
        </article>
      `;
    })
    .join("");

  bindProductCardButtons();
}

function renderSelectedProducts() {
  const selectedProducts = getSelectedProducts();

  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML = "";
    selectionSummary.textContent = "No products selected yet.";
    clearSelectionsBtn.disabled = true;
    productsContainer.removeAttribute("data-selected-products");
    return;
  }

  selectionSummary.textContent = `${selectedProducts.length} product${selectedProducts.length === 1 ? "" : "s"} selected.`;
  clearSelectionsBtn.disabled = false;
  productsContainer.setAttribute(
    "data-selected-products",
    selectedProducts.map((product) => product.name).join(", "),
  );

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
        <div class="selected-pill">
          <span>${product.name}</span>
          <button type="button" class="remove-pill" data-remove-id="${product.id}" aria-label="Remove ${product.name}">x</button>
        </div>
      `,
    )
    .join("");
}

function escapeHtml(text) {
  return String(text)
    .split("&")
    .join("&amp;")
    .split("<")
    .join("&lt;")
    .split(">")
    .join("&gt;")
    .split('"')
    .join("&quot;")
    .split("'")
    .join("&#39;");
}

function normalizeLinkUrl(urlText) {
  const decodedUrl = urlText.split("&amp;").join("&");

  try {
    const parsedUrl = new URL(decodedUrl);

    if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
      return decodedUrl;
    }

    return null;
  } catch (error) {
    return null;
  }
}

function formatInlineMarkdown(text) {
  const safeText = escapeHtml(String(text));
  const savedAnchors = [];

  function saveAnchor(labelText, hrefText) {
    const normalizedHref = normalizeLinkUrl(hrefText);

    if (!normalizedHref) {
      return labelText;
    }

    const anchorHtml = `<a href="${normalizedHref}" target="_blank" rel="noopener noreferrer">${labelText}</a>`;
    const placeholder = `@@ANCHOR_${savedAnchors.length}@@`;
    savedAnchors.push(anchorHtml);
    return placeholder;
  }

  let htmlText = safeText;

  htmlText = htmlText.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (fullMatch, linkLabel, linkUrl) => saveAnchor(linkLabel, linkUrl),
  );
  htmlText = htmlText.replace(/(https?:\/\/[^\s<]+)/g, (fullMatch, linkUrl) =>
    saveAnchor(linkUrl, linkUrl),
  );
  htmlText = htmlText.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  htmlText = htmlText.replace(
    /(^|\s)\*(?!\*)([^\n*]+?)\*(?!\*)/g,
    "$1<em>$2</em>",
  );

  htmlText = htmlText.replace(/@@ANCHOR_(\d+)@@/g, (fullMatch, indexText) => {
    const anchorIndex = Number(indexText);
    return savedAnchors[anchorIndex] || "";
  });

  return htmlText;
}

function formatChatMessageContent(message) {
  const lines = String(message).replace(/\r\n/g, "\n").split("\n");
  const htmlParts = [];
  let listType = null;
  let listItems = [];

  function flushList() {
    if (listItems.length === 0) {
      return;
    }

    const tagName = listType === "ol" ? "ol" : "ul";
    htmlParts.push(`<${tagName}>${listItems.join("")}</${tagName}>`);
    listType = null;
    listItems = [];
  }

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i].trim();

    if (rawLine.length === 0) {
      flushList();
      continue;
    }

    const headingMatch = rawLine.match(/^(#{1,6})\s+(.*)$/);

    if (headingMatch) {
      flushList();
      const headingLevel = Math.min(headingMatch[1].length, 6);
      htmlParts.push(
        `<h${headingLevel}>${formatInlineMarkdown(headingMatch[2])}</h${headingLevel}>`,
      );
      continue;
    }

    const bulletMatch = rawLine.match(/^[-*+]\s+(.*)$/);
    const numberMatch = rawLine.match(/^\d+\.\s+(.*)$/);

    if (bulletMatch) {
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }

      listItems.push(`<li>${formatInlineMarkdown(bulletMatch[1])}</li>`);
      continue;
    }

    if (numberMatch) {
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }

      listItems.push(`<li>${formatInlineMarkdown(numberMatch[1])}</li>`);
      continue;
    }

    flushList();
    htmlParts.push(`<p>${formatInlineMarkdown(rawLine)}</p>`);
  }

  flushList();
  return htmlParts.join("");
}

function addMessageToChat(role, message) {
  const safeRole = role === "user" ? "user" : "assistant";
  const messageDiv = document.createElement("div");
  messageDiv.className = `chat-message ${safeRole}`;

  if (safeRole === "assistant") {
    messageDiv.innerHTML = formatChatMessageContent(message);
  } else {
    messageDiv.textContent = message;
  }

  chatWindow.appendChild(messageDiv);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function addLoadingBubble(labelText = "Thinking") {
  const loadingDiv = document.createElement("div");
  loadingDiv.className = "chat-message assistant loading-bubble";
  loadingDiv.innerHTML = `${escapeHtml(labelText)} <span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span>`;
  chatWindow.appendChild(loadingDiv);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return loadingDiv;
}

function removeLoadingBubble(loadingDiv) {
  if (loadingDiv && loadingDiv.parentElement) {
    loadingDiv.remove();
  }
}

function addRetryMessage(errorText, onRetry) {
  const errorDiv = document.createElement("div");
  errorDiv.className = "chat-message assistant request-error";

  const errorParagraph = document.createElement("p");
  errorParagraph.textContent = `Request failed: ${errorText}`;

  const retryButton = document.createElement("button");
  retryButton.type = "button";
  retryButton.className = "retry-btn";
  retryButton.textContent = "Retry";

  retryButton.addEventListener("click", async () => {
    retryButton.disabled = true;
    errorDiv.remove();
    await onRetry();
  });

  errorDiv.appendChild(errorParagraph);
  errorDiv.appendChild(retryButton);
  chatWindow.appendChild(errorDiv);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* ---------- selection helpers ---------- */
function getSelectedProducts() {
  return allProducts.filter((product) => selectedProductIds.has(product.id));
}

function toggleProductSelection(productId) {
  if (selectedProductIds.has(productId)) {
    selectedProductIds.delete(productId);
  } else {
    selectedProductIds.add(productId);
  }

  saveSelections();
  renderProducts();
  renderSelectedProducts();
}

function toggleDescriptionState(productId) {
  if (expandedDescriptions.has(productId)) {
    expandedDescriptions.delete(productId);
  } else {
    expandedDescriptions.add(productId);
  }

  renderProducts();
}

function bindProductCardButtons() {
  const cards = productsContainer.querySelectorAll(".product-card");

  cards.forEach((card) => {
    const productId = Number(card.dataset.id);
    const selectionButton = card.querySelector(".toggle-selection");
    const descriptionButton = card.querySelector(".toggle-description");

    if (selectionButton) {
      selectionButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleProductSelection(productId);
      });
    }

    if (descriptionButton) {
      descriptionButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleDescriptionState(productId);
      });
    }
  });
}

window.toggleProductSelection = toggleProductSelection;
window.toggleDescriptionState = toggleDescriptionState;

function saveSelections() {
  localStorage.setItem(
    STORAGE_KEYS.selectedIds,
    JSON.stringify(Array.from(selectedProductIds)),
  );
}

function loadSavedSelections() {
  const saved = localStorage.getItem(STORAGE_KEYS.selectedIds);

  if (!saved) {
    return;
  }

  try {
    const parsedIds = JSON.parse(saved);
    selectedProductIds = new Set(parsedIds);
  } catch (error) {
    console.error("Could not parse saved selections", error);
    selectedProductIds = new Set();
  }
}

function applyDirection(isRtl) {
  document.documentElement.setAttribute("dir", isRtl ? "rtl" : "ltr");
  rtlToggle.checked = isRtl;
}

function loadSavedDirection() {
  const savedDirection = localStorage.getItem(STORAGE_KEYS.rtlMode);
  applyDirection(savedDirection === "true");
}

/* ---------- worker integration ---------- */
async function sendMessagesToWorker(messages, selectedProducts, mode) {
  const maxContinuationRounds = 2;
  const conversationMessages = [...messages];
  let combinedResponse = "";

  for (let round = 0; round <= maxContinuationRounds; round += 1) {
    const { content, finishReason } = await requestWorkerResponse(
      conversationMessages,
      selectedProducts,
      mode,
    );
    const trimmedContent = content.trim();

    if (trimmedContent.length > 0) {
      combinedResponse +=
        combinedResponse.length > 0 ? `\n\n${trimmedContent}` : trimmedContent;
      conversationMessages.push({ role: "assistant", content: trimmedContent });
    }

    if (finishReason !== "length") {
      return combinedResponse || trimmedContent;
    }

    conversationMessages.push({
      role: "user",
      content:
        "Continue exactly where you left off. Do not repeat previous text. Finish the response in the same style.",
    });
  }

  return combinedResponse;
}

async function requestWorkerResponse(messages, selectedProducts, mode) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000);

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode,
        model: "gpt-4o-search-preview",
        fallbackModel: "gpt-4o",
        webSearch: true,
        max_output_tokens: 1800,
        messages,
        selectedProducts,
      }),
      signal: controller.signal,
    });

    const rawText = await response.text();

    if (!response.ok) {
      throw new Error(`Worker error ${response.status}: ${rawText}`);
    }

    if (rawText.trim().length === 0) {
      throw new Error("Worker returned an empty response.");
    }

    try {
      return parseWorkerResponse(JSON.parse(rawText));
    } catch (error) {
      return {
        content: rawText,
        finishReason: null,
      };
    }
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        "The request took too long and timed out. Please try again.",
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseWorkerResponse(data) {
  const choice = data.choices && data.choices[0] ? data.choices[0] : null;

  if (data.reply) {
    return {
      content: data.reply,
      finishReason: choice ? choice.finish_reason || null : null,
    };
  }

  if (data.response) {
    return {
      content: data.response,
      finishReason: choice ? choice.finish_reason || null : null,
    };
  }

  if (data.output_text) {
    return {
      content: data.output_text,
      finishReason: choice ? choice.finish_reason || null : null,
    };
  }

  if (choice && choice.message && choice.message.content) {
    return {
      content: choice.message.content,
      finishReason: choice.finish_reason || null,
    };
  }

  return {
    content:
      "I received a response, but I could not read the assistant message format.",
    finishReason: null,
  };
}

function buildSystemMessage() {
  return {
    role: "system",
    content:
      "You are a helpful L'Oreal routine advisor. Use the selected products to create clear AM/PM or use-order guidance. Follow-up answers must stay focused on the generated routine or related beauty topics: skincare, haircare, makeup, fragrance, suncare, or men's grooming. If web search information is available, include fresh details and cite links when provided.",
  };
}

function userAskedAllowedTopic(text) {
  const allowedTopicPattern =
    /routine|skin|skincare|hair|haircare|makeup|fragrance|spf|sunscreen|cleanser|moisturizer|serum|beauty|grooming/i;
  return allowedTopicPattern.test(text);
}

async function generateRoutine() {
  if (generateRoutineBtn.disabled) {
    return;
  }

  const selectedProducts = getSelectedProducts();

  if (selectedProducts.length === 0) {
    addMessageToChat("assistant", "Please select at least one product first.");
    return;
  }

  const selectedPayload = selectedProducts.map((product) => ({
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
  }));

  const selectedProductsJson = JSON.stringify(selectedPayload, null, 2);
  const selectedProductsText = selectedPayload
    .map(
      (product) =>
        `- ${product.name} (${product.brand}) | category: ${product.category} | description: ${product.description}`,
    )
    .join("\n");

  const prompt = [
    "Create a personalized routine using ONLY the selected products below.",
    "Use every selected product in the routine when it makes sense, and clearly name each product in the output.",
    "If a product should be skipped for a specific step, explain why instead of ignoring it.",
    "Return a practical step-by-step routine with headings and bullet or numbered steps.",
    "",
    "Selected products (plain text):",
    selectedProductsText,
    "",
    "Selected products (JSON):",
    selectedProductsJson,
    "",
    "Now write the routine.",
  ].join("\n");

  conversationHistory = [
    buildSystemMessage(),
    { role: "user", content: prompt },
  ];
  addMessageToChat("user", "Generate my routine using my selected products.");

  const loadingBubble = addLoadingBubble("Generating routine");

  try {
    generateRoutineBtn.disabled = true;
    generateRoutineBtn.textContent = "Generating...";

    const assistantMessage = await sendMessagesToWorker(
      conversationHistory,
      selectedPayload,
      "routine",
    );

    removeLoadingBubble(loadingBubble);
    conversationHistory.push({ role: "assistant", content: assistantMessage });
    addMessageToChat("assistant", assistantMessage);
    hasGeneratedRoutine = true;
  } catch (error) {
    console.error(error);
    removeLoadingBubble(loadingBubble);
    addMessageToChat(
      "assistant",
      "I could not generate your routine right now. Please try again in a moment.",
    );
    addRetryMessage(error.message, generateRoutine);
  } finally {
    removeLoadingBubble(loadingBubble);
    generateRoutineBtn.disabled = false;
    generateRoutineBtn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Routine`;
  }
}

async function sendFollowUpMessage() {
  const message = userInput.value.trim();

  if (!message) {
    return;
  }

  if (!hasGeneratedRoutine) {
    addMessageToChat(
      "assistant",
      "Generate a routine first, then I can answer follow-up questions with full context.",
    );
    return;
  }

  if (!userAskedAllowedTopic(message)) {
    addMessageToChat(
      "assistant",
      "Please ask a question related to your routine or beauty topics like skincare, haircare, makeup, fragrance, suncare, or grooming.",
    );
    return;
  }

  addMessageToChat("user", message);
  userInput.value = "";
  conversationHistory.push({ role: "user", content: message });

  const selectedPayload = getSelectedProducts().map((product) => ({
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
  }));

  const loadingBubble = addLoadingBubble("Thinking");

  try {
    const assistantMessage = await sendMessagesToWorker(
      conversationHistory,
      selectedPayload,
      "follow-up",
    );

    removeLoadingBubble(loadingBubble);
    conversationHistory.push({ role: "assistant", content: assistantMessage });
    addMessageToChat("assistant", assistantMessage);
  } catch (error) {
    console.error(error);
    removeLoadingBubble(loadingBubble);
    addMessageToChat(
      "assistant",
      "I could not answer that follow-up right now. Please try again.",
    );
    addRetryMessage(error.message, sendFollowUpMessage);
  }
}

/* ---------- events ---------- */
categoryFilter.addEventListener("change", renderProducts);
productSearch.addEventListener("input", renderProducts);

rtlToggle.addEventListener("change", () => {
  applyDirection(rtlToggle.checked);
  localStorage.setItem(STORAGE_KEYS.rtlMode, String(rtlToggle.checked));
});

productsContainer.addEventListener("click", (event) => {
  const card = event.target.closest(".product-card");

  if (!card) {
    return;
  }

  const productId = Number(card.dataset.id);
  const clickedSelectButton = event.target.closest(".toggle-selection");
  const clickedDescriptionButton = event.target.closest(".toggle-description");

  if (clickedSelectButton) {
    toggleProductSelection(productId);
    return;
  }

  if (clickedDescriptionButton) {
    toggleDescriptionState(productId);
    return;
  }

  if (!event.target.closest("button")) {
    toggleProductSelection(productId);
  }
});

selectedProductsList.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-id]");

  if (!removeButton) {
    return;
  }

  const productId = Number(removeButton.dataset.removeId);
  selectedProductIds.delete(productId);
  saveSelections();
  renderProducts();
  renderSelectedProducts();
});

clearSelectionsBtn.addEventListener("click", () => {
  selectedProductIds.clear();
  saveSelections();
  renderProducts();
  renderSelectedProducts();
  addMessageToChat(
    "assistant",
    "Your selected products list has been cleared.",
  );
});

generateRoutineBtn.addEventListener("click", generateRoutine);

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await sendFollowUpMessage();
});

clearChatBtn.addEventListener("click", () => {
  chatWindow.innerHTML = "";
  conversationHistory = [];
  hasGeneratedRoutine = false;
  addMessageToChat(
    "assistant",
    "Chat cleared. Generate a routine again when you are ready.",
  );
});
