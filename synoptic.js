document.addEventListener("DOMContentLoaded", () => {
  loadSynopticView();
});

async function loadSynopticView() {
  const container = document.getElementById("synoptic-container");

  if (!container) {
    console.error("Container #synoptic-container not found.");
    return;
  }

  try {
    const response = await fetch("tei/visione3.xml");

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const xmlText = await response.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, "application/xml");

    const parserError = xml.getElementsByTagName("parsererror");
    if (parserError.length > 0) {
      throw new Error("XML parsing error.");
    }

    const grouped = collectParallelUnits(xml);
    const orderedKeys = sortGroupKeys(Object.keys(grouped));

    container.innerHTML = "";

    if (orderedKeys.length === 0) {
      container.innerHTML = "<p>No aligned units found in version3.xml.</p>";
      return;
    }

    orderedKeys.forEach(key => {
      const group = grouped[key];

      const row = document.createElement("div");
      row.className = "synoptic-row";

      row.appendChild(buildWitnessCell(group.Q, "Q", key));
      row.appendChild(buildWitnessCell(group.T1, "1505", key));
      row.appendChild(buildWitnessCell(group.T16, "1553", key));

      container.appendChild(row);
    });

  } catch (error) {
    console.error(error);
    container.innerHTML = `<p>Error loading synoptic view: ${escapeHtml(error.message)}</p>`;
  }
}

function collectParallelUnits(xml) {
  const grouped = {};

  const candidates = [
    ...Array.from(xml.getElementsByTagNameNS("*", "head")),
    ...Array.from(xml.getElementsByTagNameNS("*", "p")),
    ...Array.from(xml.getElementsByTagNameNS("*", "lg"))
  ];

  candidates.forEach(el => {
    const corresp = el.getAttribute("corresp");
    if (!corresp || !corresp.startsWith("#al_")) return;

    const xmlId = getXmlId(el);
    if (!xmlId) return;

    const witness = detectWitnessFromId(xmlId);
    if (!witness) return;

    if (!grouped[corresp]) {
      grouped[corresp] = { Q: null, T1: null, T16: null };
    }

    grouped[corresp][witness] = el;
  });

  return grouped;
}

function getXmlId(el) {
  return el.getAttribute("xml:id") || el.getAttributeNS("http://www.w3.org/XML/1998/namespace", "id") || "";
}

function detectWitnessFromId(id) {
  if (id.startsWith("Q_")) return "Q";
  if (id.startsWith("T1_")) return "T1";
  if (id.startsWith("T16_")) return "T16";
  return null;
}

function buildWitnessCell(el, label, correspKey) {
  const cell = document.createElement("article");
  cell.className = "witness";

  if (!el) {
    cell.innerHTML = `
      <h3>${label}</h3>
      <div class="unit-meta">${escapeHtml(correspKey.replace(/^#/, ""))}</div>
      <div class="witness-text empty">—</div>
    `;
    return cell;
  }

  const textHtml = renderContent(el);
  const appHtml = renderApparatus(el);

  cell.innerHTML = `
    <h3>${label}</h3>
    <div class="unit-meta">${escapeHtml(correspKey.replace(/^#/, ""))}</div>
    <div class="witness-text">${textHtml}</div>
    <button class="toggle-app" type="button">Show apparatus</button>
    <div class="apparatus hidden">
      ${appHtml || "<p>No apparatus in this unit.</p>"}
    </div>
  `;

  const button = cell.querySelector(".toggle-app");
  const apparatus = cell.querySelector(".apparatus");

  button.addEventListener("click", () => {
    apparatus.classList.toggle("hidden");
    button.textContent = apparatus.classList.contains("hidden")
      ? "Show apparatus"
      : "Hide apparatus";
  });

  return cell;
}

function renderContent(el) {
  const clone = el.cloneNode(true);

  removeDescendantsByLocalName(clone, "app");
  removeDescendantsByLocalName(clone, "note");

  return renderNodeChildren(clone).trim();
}

function renderApparatus(el) {
  const apps = Array.from(el.getElementsByTagNameNS("*", "app"));
  if (!apps.length) return "";

  return apps.map((app, index) => {
    const lemEl = firstChildByLocalName(app, "lem");
    const rdgEls = childrenByLocalName(app, "rdg");
    const noteEls = childrenByLocalName(app, "note");

    const lemma = lemEl ? normalizeText(lemEl.textContent) : "[no lemma]";

    const readings = rdgEls.map(rdg => {
      const wit = rdg.getAttribute("wit");
      const type = rdg.getAttribute("type");
      const txt = normalizeText(rdg.textContent);

      let label = "";
      if (wit) label += ` ${wit}`;
      if (type) label += ` (${type})`;

      return `
        <li>
          <strong>rdg${escapeHtml(label)}:</strong>
          ${escapeHtml(txt || "[empty]")}
        </li>
      `;
    }).join("");

    const notes = noteEls.map(note => {
      const txt = normalizeText(note.textContent);
      return `<p class="app-note"><strong>Note:</strong> ${escapeHtml(txt)}</p>`;
    }).join("");

    return `
      <div class="app-entry">
        <p><strong>App ${index + 1}.</strong> <strong>Lem:</strong> ${escapeHtml(lemma)}</p>
        ${readings ? `<ul>${readings}</ul>` : "<p>No readings.</p>"}
        ${notes}
      </div>
    `;
  }).join("");
}

function renderNodeChildren(node) {
  let html = "";

  node.childNodes.forEach(child => {
    html += renderSingleNode(child);
  });

  return html;
}

function renderSingleNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtml(node.nodeValue || "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const name = node.localName;

  if (name === "lb") return "<br>";
  if (name === "pb") return "";
  if (name === "cb") return "";

  if (name === "hi") {
    return `<em>${renderNodeChildren(node)}</em>`;
  }

  if (name === "q") {
    return `<span class="quoted">${renderNodeChildren(node)}</span>`;
  }

  if (name === "persName" || name === "placeName" || name === "orgName") {
    return `<span class="${name}">${renderNodeChildren(node)}</span>`;
  }

  if (name === "add") {
    return `<span class="tei-add">${renderNodeChildren(node)}</span>`;
  }

  if (name === "del") {
    return `<span class="tei-del">${renderNodeChildren(node)}</span>`;
  }

  if (name === "subst" || name === "seg" || name === "choice" || name === "orig" || name === "reg" || name === "supplied" || name === "unclear") {
    return renderNodeChildren(node);
  }

  if (name === "head") {
    return `<strong>${renderNodeChildren(node)}</strong>`;
  }

  if (name === "l") {
    return `${renderNodeChildren(node)}<br>`;
  }

  return renderNodeChildren(node);
}

function removeDescendantsByLocalName(root, localName) {
  const nodes = Array.from(root.getElementsByTagNameNS("*", localName));
  nodes.forEach(n => n.remove());
}

function firstChildByLocalName(parent, localName) {
  return Array.from(parent.children).find(el => el.localName === localName) || null;
}

function childrenByLocalName(parent, localName) {
  return Array.from(parent.children).filter(el => el.localName === localName);
}

function normalizeText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function escapeHtml(str) {
  return (str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sortGroupKeys(keys) {
  return keys.sort((a, b) => {
    const pa = parseCorrespKey(a);
    const pb = parseCorrespKey(b);

    if (pa.section !== pb.section) return pa.section - pb.section;
    if (pa.kindOrder !== pb.kindOrder) return pa.kindOrder - pb.kindOrder;
    if (pa.number !== pb.number) return pa.number - pb.number;

    return a.localeCompare(b);
  });
}

function parseCorrespKey(key) {
  const clean = key.replace(/^#/, "");

  if (clean.includes("title_main")) {
    return { section: 0, kindOrder: 0, number: 0 };
  }

  if (clean.includes("title_book")) {
    return { section: 0, kindOrder: 1, number: 0 };
  }

  const pMatch = clean.match(/al_s(\d+)_p(\d+)/);
  if (pMatch) {
    return {
      section: parseInt(pMatch[1], 10),
      kindOrder: 2,
      number: parseInt(pMatch[2], 10)
    };
  }

  const lgMatch = clean.match(/al_s(\d+)_lg(\d+)/);
  if (lgMatch) {
    return {
      section: parseInt(lgMatch[1], 10),
      kindOrder: 3,
      number: parseInt(lgMatch[2], 10)
    };
  }

  return { section: 999, kindOrder: 999, number: 999 };
}
