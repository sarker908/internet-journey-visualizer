(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const scenarios = window.WHAT_IF_SCENARIOS || [];
  const views = ["home-view","story-view","ending-view","timeline-view"];
  const state = { scenario:null, nodeId:null, path:[], choices:[], completed:null, reducedMotion:false };
  const STORAGE_KEY = "whatif-reality-archive-v1";

  const readArchive = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; } };
  const saveArchive = entry => { const items = readArchive(); items.unshift(entry); localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0,30))); updateArchive(); };
  const showView = id => { views.forEach(view => $("#"+view).classList.toggle("hidden", view !== id)); if(id === "home-view") { $("#ending-view").classList.add("hidden"); $("#timeline-view").classList.add("hidden"); window.scrollTo({top:0,behavior:state.reducedMotion?"auto":"smooth"}); } };
  const categoryName = category => ({survival:"SURVIVAL",time:"TIME & SPACE",future:"FUTURE TECHNOLOGY",human:"HUMAN NATURE"})[category] || "ALTERNATE REALITY";

  function renderScenarios(filter="all") {
    const grid = $("#scenario-grid");
    const filtered = scenarios.filter(item => filter === "all" || item.category === filter);
    grid.innerHTML = filtered.map(item => `
      <article class="scenario-card" data-scenario="${item.id}" tabindex="0" role="button" aria-label="Explore ${item.title}">
        <div class="card-art" style="--card-bg:${item.art}"><div class="card-orb"></div></div>
        <span class="card-number">REALITY / ${item.number}</span>
        <div class="card-content"><div class="card-category">${item.categoryLabel}</div><h3>${item.title}</h3><p>${item.short}</p><div class="card-bottom"><span>${item.duration} &nbsp;·&nbsp; ${item.difficulty}</span><span class="card-arrow">↗</span></div></div>
      </article>`).join("");
    $$(".scenario-card", grid).forEach(card => {
      const open = () => startScenario(card.dataset.scenario);
      card.addEventListener("click", open);
      card.addEventListener("keydown", event => { if(event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
    });
  }

  function startScenario(id) {
    const scenario = scenarios.find(item => item.id === id);
    if(!scenario) return;
    state.scenario = scenario; state.nodeId = scenario.start; state.path = []; state.choices = []; state.completed = null;
    $("#story-backdrop").style.background = `radial-gradient(ellipse at 75% 35%, #547fc055, transparent 52%), ${scenario.art}`;
    $("#story-category").textContent = scenario.categoryLabel;
    showView("story-view");
    renderNode();
  }

  function renderNode() {
    const node = state.scenario.nodes[state.nodeId];
    if(!node) { showError("This path is incomplete. Please restart the reality."); return; }
    if(node.ending) { finishScenario(node); return; }
    state.path.push(state.nodeId);
    const step = state.path.length;
    $("#story-kicker").textContent = node.kicker || "THE STORY CONTINUES";
    $("#story-title").textContent = node.title;
    $("#story-text").textContent = node.text;
    $("#step-label").textContent = "STEP " + String(step).padStart(2,"0");
    $("#progress-fill").style.width = Math.min(95, step * 12) + "%";
    $("#choice-list").innerHTML = node.choices.map((choice,index) => `
      <button class="choice-button" data-choice="${index}"><span class="choice-letter">${String.fromCharCode(65+index)}</span><span class="choice-label">${choice.label}</span><span class="choice-arrow">↗</span></button>`).join("");
    $$(".choice-button").forEach(button => button.addEventListener("click", () => {
      const choice = node.choices[Number(button.dataset.choice)];
      state.choices.push({from:state.nodeId,fromTitle:node.title,label:choice.label,to:choice.next});
      state.nodeId = choice.next;
      renderNode();
    }));
    $("#story-content").animate?.([{opacity:.25,transform:"translateY(12px)"},{opacity:1,transform:"translateY(0)"}],{duration:state.reducedMotion?0:420,easing:"ease-out"});
  }

  function finishScenario(ending) {
    state.completed = ending;
    $("#ending-symbol").textContent = ending.symbol || "✧";
    $("#ending-type").textContent = ending.type || "REALITY CONCLUDED";
    $("#ending-title").textContent = ending.title;
    $("#ending-text").textContent = ending.text;
    $("#ending-decisions").textContent = state.choices.length;
    $("#ending-score").textContent = Math.min(100, Math.round((state.path.length / Math.max(1,Object.keys(state.scenario.nodes).length - 1))*100)) + "%";
    $("#progress-fill").style.width = "100%";
    saveArchive({id:state.scenario.id,title:state.scenario.title,ending:ending.title,type:ending.type,completedAt:new Date().toISOString(),choices:state.choices,path:state.path});
    showView("ending-view");
  }

  function renderTimeline() {
    const entry = {title:state.scenario.title,ending:state.completed.title,choices:state.choices,path:state.path};
    $("#timeline-meta").textContent = `${state.scenario.categoryLabel}  /  ${entry.choices.length} DECISIONS  /  ${entry.ending.toUpperCase()}`;
    const nodes = state.path.map((id,index) => {
      const node = state.scenario.nodes[id];
      const choice = state.choices[index];
      return `<article class="timeline-node"><span>EVENT ${String(index+1).padStart(2,"0")} · ${escapeHTML(node.kicker || "REALITY EVENT")}</span><h3>${escapeHTML(node.title)}</h3><p>${escapeHTML(node.text)}</p>${choice ? `<div class="timeline-choice">YOU CHOSE: ${escapeHTML(choice.label)}</div>` : ""}</article>`;
    });
    nodes.push(`<article class="timeline-node"><span>FINAL OUTCOME</span><h3>${escapeHTML(state.completed.title)}</h3><p>${escapeHTML(state.completed.text)}</p></article>`);
    $("#timeline-track").innerHTML = nodes.join("");
    showView("timeline-view");
  }

  function escapeHTML(value) { return String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char])); }
  function showError(message) { $("#story-title").textContent = "Reality interrupted"; $("#story-text").textContent = message; $("#choice-list").innerHTML = '<button class="button button-primary" id="error-restart">Restart reality</button>'; $("#error-restart").addEventListener("click",()=>startScenario(state.scenario.id)); }

  function updateArchive() {
    const items = readArchive();
    $("#archive-count").textContent = items.length;
    const container = $("#archive-list");
    if(!items.length) { container.innerHTML = '<div class="empty-state"><span>◌</span><h3>No realities explored yet</h3><p>Your alternate histories will appear here.</p></div>'; return; }
    container.innerHTML = items.map(item => `<div class="archive-item"><div><strong>${escapeHTML(item.title)}</strong><br><span>${escapeHTML(item.type || "REALITY")} · ${new Date(item.completedAt).toLocaleDateString()}</span></div><div><span>${escapeHTML(item.ending)}</span></div></div>`).join("");
  }

  function bindEvents() {
    $("[data-explore]").forEach(button => button.addEventListener("click", () => { showView("home-view"); $("#explore").scrollIntoView({behavior:state.reducedMotion?"auto":"smooth"}); }));
    $$("[data-home]").forEach(button => button.addEventListener("click", event => { event.preventDefault(); showView("home-view"); }));
    $$("[data-archive]").forEach(button => button.addEventListener("click", event => { event.preventDefault(); $("#archive").scrollIntoView({behavior:state.reducedMotion?"auto":"smooth"}); }));
    $("#filters").addEventListener("click",event => { const button=event.target.closest("[data-filter]"); if(!button)return; $$(".filter").forEach(item=>item.classList.toggle("active",item===button)); renderScenarios(button.dataset.filter); });
    $("#exit-story").addEventListener("click",()=>showView("home-view"));
    $("#restart-story").addEventListener("click",()=>startScenario(state.scenario.id));
    $("#view-timeline").addEventListener("click",renderTimeline);
    $("#replay-story").addEventListener("click",()=>startScenario(state.scenario.id));
    $("#timeline-back").addEventListener("click",()=>showView("ending-view"));
    $("#timeline-replay").addEventListener("click",()=>startScenario(state.scenario.id));
    $("#timeline-home").addEventListener("click",()=>showView("home-view"));
    $("#motion-toggle").addEventListener("click",()=>{state.reducedMotion=!state.reducedMotion;document.body.classList.toggle("reduced-motion",state.reducedMotion);$(".motion-label").textContent=state.reducedMotion?"Motion off":"Motion on";});
  }

  renderScenarios(); updateArchive(); bindEvents();
})();