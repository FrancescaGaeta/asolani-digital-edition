 document.addEventListener("DOMContentLoaded", () => {
  loadSynopticView();
});

async function loadSynopticView() {
  const container = document.getElementById("synoptic-container");
  if (!container) return;

  try {
    const response = await fetch("/asolani-digital-edition/tei/visione3.xml");
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const xmlText = await response.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, "application/xml");

    if (xml.querySelector("parsererror")) {
      throw new Error("XML parsing error");
    }

    const grouped = collectParallelUnits(xml);
    const orderedKeys = sortGroupKeys(Object.keys(grouped));

    container.innerHTML = "";

    if (!orderedKeys.length) {
      container.innerHTML = `<tr><td colspan="3">No aligned units found.</td></tr>`;
      return;
    }

    orderedKeys.forEach(key => {
      const row = document.createElement("tr");
      row.className = "synoptic-table-row";

      row.appendChild(buildWitnessTd(grouped[key].Q, key));
      row.appendChild(buildWitnessTd(grouped[key].T1, key));
      row.appendChild(buildWitnessTd(grouped[key].T16, key));

      container.appendChild(row);
    });

    activateVariantLinks(container);

  } catch (error) {
    console.error(error);
    container.innerHTML = `<tr><td colspan="3">Error loading synoptic view: ${escapeHtml(error.message)}</td></tr>`;
  }
}

function collectParallelUnits(xml) {
  const grouped = {};

  const candidates = [
    ...Array.from(xml.getElementsByTagNameNS("*", "seg")),
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
  return (
    el.getAttribute("xml:id") ||
    el.getAttributeNS("http://www.w3.org/XML/1998/namespace", "id") ||
    ""
  );
}

function detectWitnessFromId(id) {
  if (id.startsWith("Q_")) return "Q";
  if (id.startsWith("T1_")) return "T1";
  if (id.startsWith("T16_")) return "T16";
  return null;
}

function buildWitnessTd(el, correspKey) {
  const td = document.createElement("td");
  td.className = "synoptic-cell";

  if (!el) {
    td.innerHTML = `
      <div class="unit-id">${escapeHtml(correspKey.replace(/^#/, ""))}</div>
      <div class="witness-text empty">—</div>
    `;
    return td;
  }

  const apparatusEntries = [];
  const witnessId = getXmlId(el) || "unit";
  const textHtml = renderNodeChildren(el, apparatusEntries, witnessId);

  const apparatusHtml = apparatusEntries.length
    ? `
      <details class="apparatus-box">
        <summary>Show apparatus</summary>
        <div class="inline-apparatus">
          ${apparatusEntries.join("")}
        </div>
      </details>
    `
    : "";

  td.innerHTML = `
    <div class="unit-id">${escapeHtml(correspKey.replace(/^#/, ""))}</div>
    <div class="witness-text">${textHtml}</div>
    ${apparatusHtml}
  `;

  return td;
}

function renderNodeChildren(node, apparatusEntries = [], witnessId = "unit") {
  let html = "";
  node.childNodes.forEach(child => {
    html += renderSingleNode(child, apparatusEntries, witnessId);
  });
  return html;
}

function renderSingleNode(node, apparatusEntries = [], witnessId = "unit") {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtml(node.nodeValue || "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const name = node.localName;

  if (name === "lb") return "<br>";
  if (name === "pb" || name === "cb") return "";

  if (name === "app") {
    return renderAppInline(node, apparatusEntries, witnessId);
  }

  if (name === "note") {
    const text = normalizeText(node.textContent);
    if (!text) return "";
    return `<sup class="note-inline" title="${escapeHtml(text)}">[note]</sup><span class="note-visible">${escapeHtml(text)}</span>`;
  }

  if (name === "hi") {
    return `<em>${renderNodeChildren(node, apparatusEntries, witnessId)}</em>`;
  }

  if (name === "q") {
    return `<span class="quoted">${renderNodeChildren(node, apparatusEntries, witnessId)}</span>`;
  }

  if (name === "persName" || name === "placeName" || name === "orgName") {
    return `<span class="${name}">${renderNodeChildren(node, apparatusEntries, witnessId)}</span>`;
  }

  if (name === "add") {
    return `<span class="tei-add">${renderNodeChildren(node, apparatusEntries, witnessId)}</span>`;
  }

  if (name === "del") {
    return `<span class="tei-del">${renderNodeChildren(node, apparatusEntries, witnessId)}</span>`;
  }

  if (
    name === "subst" ||
    name === "seg" ||
    name === "choice" ||
    name === "orig" ||
    name === "reg" ||
    name === "supplied" ||
    name === "unclear" ||
    name === "lem" ||
    name === "rdg" ||
    name === "l"
  ) {
    const content = renderNodeChildren(node, apparatusEntries, witnessId);
    if (name === "l") return `${content}<br>`;
    return content;
  }

  return renderNodeChildren(node, apparatusEntries, witnessId);
}

function renderAppInline(appNode, apparatusEntries, witnessId) {
  const lemEl = firstChildByLocalName(appNode, "lem");
  const rdgEls = childrenByLocalName(appNode, "rdg");
  const noteEls = childrenByLocalName(appNode, "note");

  const appIndex = apparatusEntries.length + 1;
  const appId = `${witnessId}-app-${appIndex}`;

  const lemmaText = lemEl ? normalizeText(lemEl.textContent) : "[no lemma]";
  const lemmaHtml = lemEl ? renderNodeChildren(lemEl, [], witnessId) : "[no lemma]";

  const readingsHtml = rdgEls.map(rdg => {
    const wit = rdg.getAttribute("wit") || "";
    const type = rdg.getAttribute("type") || "";
    const txt = normalizeText(rdg.textContent);

    let label = "";
    if (wit) label += ` ${wit}`;
    if (type) label += ` (${type})`;

    return `<li><strong>rdg${escapeHtml(label)}:</strong> ${escapeHtml(txt || "[empty]")}</li>`;
  }).join("");

  const notesHtml = noteEls.map(note => {
    const txt = normalizeText(note.textContent);
    return `<p class="app-note"><strong>Note:</strong> ${escapeHtml(txt)}</p>`;
  }).join("");

  apparatusEntries.push(`
    <div class="app-entry" id="${appId}">
      <p><strong>Lemma:</strong> ${escapeHtml(lemmaText)}</p>
      ${readingsHtml ? `<ul>${readingsHtml}</ul>` : ""}
      ${notesHtml}
    </div>
  `);

  return `
    <a href="#${appId}" class="variant-inline variant-link" data-target="${appId}">
      ${lemmaHtml}
    </a>
  `;
}

function activateVariantLinks(container) {
  container.querySelectorAll(".variant-link").forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();

      const targetId = link.dataset.target;
      if (!targetId) return;

      const target = document.getElementById(targetId);
      if (!target) return;

      const cell = link.closest(".synoptic-cell");
      if (!cell) return;

      const details = cell.querySelector(".apparatus-box");
      if (details) {
        details.open = true;
      }

      cell.querySelectorAll(".app-entry.active").forEach(entry => {
        entry.classList.remove("active");
      });

      target.classList.add("active");
      target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });
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

  if (clean.includes("title_main_a")) {
    const m = clean.match(/title_main_a(\d+)/);
    return { section: 0, kindOrder: 0, number: m ? parseInt(m[1], 10) : 0 };
  }

  if (clean.includes("title_book_a")) {
    const m = clean.match(/title_book_a(\d+)/);
    return { section: 0, kindOrder: 1, number: m ? parseInt(m[1], 10) : 0 };
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
