"use strict";

const KICAD_PARSER_VERSION = "tmi-kicad-sexpr-v1";
const PROJECT_TABS = [
  ["overview", "Overview"],
  ["source", "Source Import"],
  ["match", "Match Review"],
  ["guide", "Build Guide"],
  ["bom", "BOM Editor"],
  ["history", "History"]
];

const EDITOR_TABLES = [
  ["parts", "Parts"],
  ["stock", "Stock Lots"],
  ["locations", "Locations"],
  ["aliases", "Aliases"],
  ["specs", "Category Specs"],
  ["bom", "Project BOM"]
];

function renderProjectManagerView() {
  const projects = state.inventory.projects || [];
  const project = activeProject();
  state.activeProjectTab = PROJECT_TABS.some(([id]) => id === state.activeProjectTab) ? state.activeProjectTab : "overview";
  const list = projects.length
    ? projects.map((item) => {
        const summary = projectSummary(item.id);
        const placements = projectPlacements(item.id).length;
        return `<button type="button" class="project-list-item ${project?.id === item.id ? "active" : ""}" data-action="select-project" data-id="${item.id}">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(item.revision || "no rev")} / ${summary.rows} BOM / ${placements} refs / ${summary.shortageRows} shortages</span>
        </button>`;
      }).join("")
    : `<div class="empty-panel compact"><h3>no projects</h3><p>Import KiCad source files or paste a CSV/TSV BOM.</p></div>`;

  if (!project) {
    return `<div class="view-stack project-manager">
      <div class="panel project-control-bar">
        <div class="project-control-main">
          <h3 class="view-title">project manager</h3>
          <div class="project-list project-list-strip">${list}</div>
        </div>
        <div class="action-row"><button type="button" class="primary-button" data-action="project-tab" data-tab="source">import KiCad</button></div>
      </div>
      <section class="project-detail">${renderProjectSourceImport(null)}</section>
    </div>`;
  }

  const summary = projectSummary(project.id);
  const cost = projectCostSummary(project.id);
  const sources = projectSources(project.id).length;
  const placements = projectPlacements(project.id).length;
  const tabs = PROJECT_TABS.map(([id, label]) => `<button type="button" class="tab-button ${state.activeProjectTab === id ? "active" : ""}" data-action="project-tab" data-tab="${id}">${escapeHtml(label)}</button>`).join("");

  return `<div class="view-stack project-manager">
    <div class="panel project-control-bar">
      <div class="project-control-main">
        <h3 class="view-title">project manager</h3>
        <div class="project-list project-list-strip">${list}</div>
      </div>
      <div class="action-row">
        <button type="button" data-action="project-tab" data-tab="source">import source</button>
        <button type="button" data-action="project-tab" data-tab="match">match review</button>
        <button type="button" data-action="preview-project-repair" data-id="${project.id}">preview repair</button>
        <button type="button" data-action="open-edit-project" data-id="${project.id}">edit project</button>
        <button type="button" data-action="reserve-project" data-id="${project.id}">reserve</button>
        <button type="button" data-action="release-project" data-id="${project.id}">release</button>
        <button type="button" class="danger-button" data-action="apply-project-consumption" data-id="${project.id}">consume reserved</button>
      </div>
    </div>

    <section class="project-detail">
      <div class="panel project-summary-panel">
        <div class="project-head">
          <div>
            <h4>${escapeHtml(project.name)}</h4>
            <p>${escapeHtml([project.revision, project.status, project.owner].filter(Boolean).join(" / ") || "project")}</p>
          </div>
          <button type="button" data-action="delete-project" data-id="${project.id}" class="danger-button">delete project</button>
        </div>
        ${renderSummaryStrip([
          [summary.rows, "BOM rows"],
          [placements, "placements"],
          [sources, "source files"],
          [summary.unresolved, "unresolved", summary.unresolved ? "warn" : ""],
          [summary.shortageRows, "shortages", summary.shortageRows ? "warn" : ""],
          [formatMoney(cost.total, cost.currency), "BOM total"],
          [cost.missingPriceRows, "missing price", cost.missingPriceRows ? "warn" : ""]
        ])}
        <div class="tab-row">${tabs}</div>
      </div>
      ${renderProjectTabContent(project)}
    </section>
  </div>`;
}

function renderProjectTabContent(project) {
  if (state.activeProjectTab === "source") return renderProjectSourceImport(project);
  if (state.activeProjectTab === "match") return renderProjectMatchReview(project);
  if (state.activeProjectTab === "guide") return renderProjectBuildGuide(project);
  if (state.activeProjectTab === "bom") {
    const q = String(state.projectQuery || "").toLowerCase();
    const rows = projectBomRows(project.id).filter((row) => {
      if (!q) return true;
      const part = row.partId ? state.inventory.parts.find((item) => item.id === row.partId) : null;
      return [row.value, row.footprint, row.mpn, row.referencesText, part?.name].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
    return `<section class="panel bom-editor-panel">
      <div class="panel-head">
        <div>
          <h4>BOM editor</h4>
          <p>Edit rows, take project parts, or open the manual matcher for exact inventory assignment.</p>
        </div>
        <div class="action-row">
          <input type="search" data-project-search value="${escapeAttr(state.projectQuery || "")}" placeholder="filter BOM rows" />
          <button type="button" data-action="project-tab" data-tab="source">import/update</button>
        </div>
      </div>
      ${renderBomTable(project, rows)}
    </section>`;
  }
  if (state.activeProjectTab === "history") return renderProjectHistory(project);
  return renderProjectOverview(project);
}

function renderProjectMatchReview(project) {
  const health = projectHealth(project.id);
  const filter = state.projectMatchFilter || "all";
  const selected = state.selectedBomRowIds || new Set();
  const rows = projectBomRows(project.id).filter((row) => {
    const candidate = getBomMatchCandidates(row, { limit: 1 })[0];
    const hasWarnings = !!candidate?.warnings.length || !!candidate?.rowWarnings.length || bomMatchContext(row).warnings.length > 0;
    if (filter === "unresolved") return row.fitted !== 0 && !row.partId;
    if (filter === "warnings") return hasWarnings;
    if (filter === "dnp") return row.fitted === 0;
    return true;
  });
  const exactCount = projectBomRows(project.id).filter((row) => row.fitted !== 0 && !row.partId && getBomMatchCandidates(row, { limit: 1 })[0]?.confidence === "exact").length;
  return `<section class="panel match-review-panel">
    <div class="panel-head match-review-head">
      <div>
        <h4>Match Review</h4>
        <p>${health.unresolved} unresolved / ${exactCount} exact candidates / ${health.warnings} warnings</p>
      </div>
      <div class="action-row">
        <select data-project-match-filter>
          <option value="all" ${filter === "all" ? "selected" : ""}>all BOM rows</option>
          <option value="unresolved" ${filter === "unresolved" ? "selected" : ""}>unresolved</option>
          <option value="warnings" ${filter === "warnings" ? "selected" : ""}>warnings</option>
          <option value="dnp" ${filter === "dnp" ? "selected" : ""}>DNP</option>
        </select>
        <button type="button" class="primary-button" data-action="accept-selected-matches" data-id="${project.id}">accept selected</button>
        <button type="button" data-action="accept-all-exact" data-id="${project.id}">accept all exact</button>
        <button type="button" data-action="unlink-selected-matches" data-id="${project.id}">clear selected matches</button>
        <button type="button" data-action="clear-bom-review-selection">clear selection</button>
      </div>
    </div>
    ${renderProjectHealthPanel(project)}
    ${renderMatchReviewTable(project, rows, selected)}
    ${renderRepairPreview(project)}
  </section>`;
}

function renderProjectHealthPanel(project) {
  const health = projectHealth(project.id);
  return `<div class="project-health-grid">
    ${summaryChipHtml(health.unresolved, "unresolved", health.unresolved ? "warn" : "")}
    ${summaryChipHtml(health.dnpRows, "DNP")}
    ${summaryChipHtml(health.missingPrices, "missing prices", health.missingPrices ? "warn" : "")}
    ${summaryChipHtml(health.invalidLinks, "invalid links", health.invalidLinks ? "warn" : "")}
    ${summaryChipHtml(health.sourceWarnings, "source warnings", health.sourceWarnings ? "warn" : "")}
    ${summaryChipHtml(health.placementIssues, "placement issues", health.placementIssues ? "warn" : "")}
    ${summaryChipHtml(health.shortages, "shortages", health.shortages ? "warn" : "")}
  </div>`;
}

function renderMatchReviewTable(project, rows, selected) {
  const body = rows.map((row) => {
    const current = row.partId ? state.inventory.parts.find((part) => part.id === row.partId) : null;
    const candidate = getBomMatchCandidates(row, { limit: 1 })[0] || null;
    const status = bomRowStatus(row);
    const cost = candidate?.partId ? partPriceInfo(candidate.partId) : null;
    const warnings = [...(candidate?.rowWarnings || []), ...(candidate?.warnings || [])];
    const checked = selected.has(row.id) ? "checked" : "";
    return `<tr class="${row.fitted === 0 ? "review-dnp-row" : ""} ${warnings.length ? "review-warning-row" : ""}">
      <td class="select-cell"><input type="checkbox" data-bom-review-select value="${row.id}" ${checked} /></td>
      <td><span class="cell-truncate mono-cell" title="${escapeAttr(row.referencesText || "")}">${escapeHtml(row.referencesText || "")}</span></td>
      <td>${row.quantity}</td>
      <td><span class="cell-truncate" title="${escapeAttr(row.value || "")}">${escapeHtml(row.value || "")}</span></td>
      <td><span class="cell-truncate mono-cell" title="${escapeAttr(row.footprint || "")}">${escapeHtml(shortFootprint(row.footprint || ""))}</span></td>
      <td>${current ? `<button type="button" class="link-button cell-truncate" data-action="open-edit-part" data-id="${current.id}" title="${escapeAttr(current.name)}">${escapeHtml(current.name)}</button>` : `<span class="muted">unmatched</span>`}</td>
      <td>${candidate ? renderCandidateCell(candidate) : `<span class="danger-text">no candidate</span>`}</td>
      <td><span class="badge confidence-${escapeAttr(candidate?.confidence || "none")}">${escapeHtml(candidate?.confidence || "none")}</span></td>
      <td>${candidate?.score ? Math.round(candidate.score) : "-"}</td>
      <td><span class="cell-truncate" title="${escapeAttr((candidate?.reasons || []).join(" / "))}">${escapeHtml((candidate?.reasons || []).join(" / ") || "-")}</span></td>
      <td><span class="cell-truncate ${warnings.length ? "danger-text" : "muted"}" title="${escapeAttr(warnings.join(" / "))}">${escapeHtml(warnings.join(" / ") || "-")}</span></td>
      <td>${candidate ? candidate.available : "-"}</td>
      <td>${status.shortage ? `<span class="qty-low">${status.shortage}</span>` : `<span class="qty-ok">0</span>`}</td>
      <td>${cost?.unitPrice == null ? `<span class="muted">missing</span>` : escapeHtml(formatMoney(cost.unitPrice, cost.currency))}</td>
      <td><span class="badge status-chip ${row.fitted === 0 ? "skipped" : "done"}">${row.fitted === 0 ? "DNP" : "fit"}</span></td>
      <td class="action-cell">
        <div class="row-action-grid">
          ${candidate ? `<button type="button" class="small-button" data-action="accept-bom-row-match" data-id="${row.id}">accept</button>` : ""}
          <button type="button" class="small-button" data-action="match-bom-row" data-id="${row.id}">match</button>
          <button type="button" class="small-button" data-action="open-edit-bom-row" data-id="${row.id}">edit</button>
        </div>
      </td>
    </tr>`;
  }).join("");
  return `<div class="table-wrap match-review-wrap"><table class="data-table match-review-table">
    <colgroup>
      <col class="col-select" />
      <col class="col-refs" />
      <col class="col-qty" />
      <col class="col-value" />
      <col class="col-footprint" />
      <col class="col-current" />
      <col class="col-candidate" />
      <col class="col-confidence" />
      <col class="col-score" />
      <col class="col-reasons" />
      <col class="col-warnings" />
      <col class="col-stock" />
      <col class="col-shortage" />
      <col class="col-price" />
      <col class="col-fit" />
      <col class="col-actions" />
    </colgroup>
    <thead><tr>
      <th class="select-cell"><input type="checkbox" data-bom-review-select-all /></th>
      <th>Refs</th><th>Qty</th><th>Value</th><th>Footprint</th><th>Current</th><th>Candidate</th><th>Confidence</th><th>Score</th><th>Reasons</th><th>Warnings</th><th>Stock</th><th>Short</th><th>Unit</th><th>Fit</th><th>Actions</th>
    </tr></thead>
    <tbody>${body || `<tr><td colspan="16">No BOM rows for this filter.</td></tr>`}</tbody>
  </table></div>`;
}

function renderCandidateCell(candidate) {
  return `<button type="button" class="link-button cell-truncate" data-action="open-edit-part" data-id="${candidate.partId}" title="${escapeAttr(candidate.partName)}">${escapeHtml(candidate.partName)}</button>`;
}

function renderRepairPreview(project) {
  const analysis = state.projectRepairAnalysis?.projectId === project.id ? state.projectRepairAnalysis : null;
  if (!analysis) {
    return `<div class="repair-preview compact-repair">
      <button type="button" data-action="preview-project-repair" data-id="${project.id}">preview repair</button>
      <span class="small-note">Checks stale matches, invalid links, DNP flags, placements, and build-step links.</span>
    </div>`;
  }
  const changes = analysis.changes.map((change) => `<label class="repair-row">
    <input type="checkbox" data-repair-select value="${escapeAttr(change.id)}" checked />
    <span>${escapeHtml(change.label)}</span>
  </label>`).join("");
  const warnings = analysis.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
  return `<div class="repair-preview">
    <div class="panel-head">
      <div>
        <h4>Repair preview</h4>
        <p>${analysis.changes.length} changes / ${analysis.warnings.length} warnings</p>
      </div>
      <div class="action-row">
        <button type="button" class="primary-button" data-action="apply-project-repair" data-id="${project.id}">apply selected repair</button>
        <button type="button" data-action="preview-project-repair" data-id="${project.id}">refresh preview</button>
      </div>
    </div>
    ${changes ? `<div class="repair-list">${changes}</div>` : `<p class="small-note">No repair changes suggested.</p>`}
    ${warnings ? `<ul class="warning-list">${warnings}</ul>` : ""}
  </div>`;
}

function renderProjectOverview(project) {
  const sources = projectSources(project.id);
  const placements = projectPlacements(project.id);
  const sessions = projectBuildSessions(project.id);
  const warnings = projectWarnings(project.id);
  const latestSource = sources[0]?.importedAt ? formatDate(sources[0].importedAt) : "no source import";
  return `<div class="project-overview-grid">
    <section class="panel form-section">
      <h4>metadata</h4>
      <dl class="kv-list">
        <div><dt>status</dt><dd>${escapeHtml(project.status || "active")}</dd></div>
        <div><dt>target qty</dt><dd>${escapeHtml(String(project.targetQuantity || 1))}</dd></div>
        <div><dt>due</dt><dd>${escapeHtml(project.dueDate || "-")}</dd></div>
        <div><dt>tags</dt><dd>${escapeHtml(project.tags || "-")}</dd></div>
        <div><dt>latest import</dt><dd>${escapeHtml(latestSource)}</dd></div>
      </dl>
    </section>
    <section class="panel form-section">
      <h4>assembly state</h4>
      ${renderSummaryStrip([
        [placements.filter((row) => row.side === "top").length, "top refs"],
        [placements.filter((row) => row.side === "bottom").length, "bottom refs"],
        [sessions.length, "sessions"],
        [warnings.length, "warnings", warnings.length ? "warn" : ""]
      ])}
      <div class="action-row">
        <button type="button" class="primary-button" data-action="project-tab" data-tab="guide">open build guide</button>
        <button type="button" data-action="create-build-session" data-id="${project.id}">new build session</button>
      </div>
    </section>
    <section class="panel span-2">
      <div class="panel-head"><h4>warnings</h4><p>${warnings.length ? "source/import issues to review" : "no source warnings"}</p></div>
      ${warnings.length ? `<ul class="warning-list">${warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p class="small-note">All stored placements and BOM rows are linked cleanly.</p>`}
    </section>
  </div>`;
}

function renderProjectSourceImport(project) {
  const projects = state.inventory.projects || [];
  const projectOptions = projects.map((item) => `<option value="${item.id}" ${project?.id === item.id ? "selected" : ""}>${escapeHtml(item.name)}${item.revision ? ` / ${escapeHtml(item.revision)}` : ""}</option>`).join("");
  const defaultName = project?.name || "";
  const defaultRevision = project?.revision || "";
  return `<section class="panel form-section source-import-panel">
    <div class="panel-head">
      <h4>KiCad source import</h4>
      <p>Choose a project folder or select .kicad_pro, .kicad_pcb, and .kicad_sch files together.</p>
    </div>
    <form id="kicadSourceForm" novalidate onsubmit="return false;">
      <div class="form-grid">
        <div class="field"><label>mode</label><select name="projectMode"><option value="create">create project</option><option value="update" ${project ? "selected" : ""}>update selected</option></select></div>
        <div class="field"><label>project</label><select name="existingProjectId"><option value="">new project</option>${projectOptions}</select></div>
        <div class="field"><label>project name</label><input name="projectName" value="${escapeAttr(defaultName)}" placeholder="PCB project name" /></div>
        <div class="field"><label>revision</label><input name="revision" value="${escapeAttr(defaultRevision)}" placeholder="rev A" /></div>
        <div class="field"><label>target qty</label><input name="targetQuantity" type="number" min="0" step="1" value="${escapeAttr(project?.targetQuantity || 1)}" /></div>
        <div class="field"><label>owner</label><input name="owner" value="${escapeAttr(project?.owner || "")}" /></div>
        <div class="field"><label>KiCad project folder</label><input name="kicadFolder" type="file" multiple webkitdirectory /></div>
        <div class="field"><label>or source files</label><input name="kicadFiles" type="file" multiple accept=".kicad_pro,.kicad_pcb,.kicad_sch" /></div>
      </div>
      <div class="action-row">
        <button type="button" data-action="preview-kicad-source">preview source</button>
        <button type="button" class="primary-button" data-action="import-kicad-source">import source</button>
      </div>
    </form>
    <div id="kicadSourcePreview" class="bulk-preview"></div>
    <details class="advanced-panel nested-card">
      <summary>CSV/TSV BOM fallback</summary>
      <p class="small-note">The Add view still accepts generic BOM tables when source files are not available.</p>
      <button type="button" data-action="open-inventory-imports">open BOM importer</button>
    </details>
  </section>`;
}

function renderProjectBuildGuide(project) {
  const placements = projectPlacements(project.id);
  const sessions = projectBuildSessions(project.id);
  const session = activeBuildSession(project.id);
  const sessionOptions = sessions.map((item) => `<option value="${item.id}" ${session?.id === item.id ? "selected" : ""}>${escapeHtml(item.name)} / qty ${item.buildQuantity}</option>`).join("");
  const progress = buildProgress(project.id, session?.id || 0);
  const side = state.projectSideFilter || "both";
  const shown = placements.filter((row) => side === "both" || row.side === side);
  const rows = shown.map((placement) => renderPlacementGuideRow(project, placement, session)).join("");
  return `<section class="panel build-guide-panel">
    <div class="panel-head build-guide-head">
      <div>
        <h4>iBOM build guide</h4>
        <p>${placements.length} references / ${progress.done} done / ${progress.skipped} skipped / ${progress.taken} taken</p>
      </div>
      <div class="action-row">
        <select data-build-session-select>${sessionOptions || `<option value="">no session</option>`}</select>
        <button type="button" data-action="create-build-session" data-id="${project.id}">new session</button>
        <select data-project-side-filter>
          <option value="both" ${side === "both" ? "selected" : ""}>both sides</option>
          <option value="top" ${side === "top" ? "selected" : ""}>top</option>
          <option value="bottom" ${side === "bottom" ? "selected" : ""}>bottom</option>
          <option value="unknown" ${side === "unknown" ? "selected" : ""}>unknown</option>
        </select>
      </div>
    </div>
    ${placements.length ? `<div class="build-guide-grid">
      ${renderBoardSvg(project, shown, session)}
      <div class="table-wrap build-placement-table"><table class="data-table compact-parts-table build-guide-table">
        <colgroup>
          <col class="col-ref" />
          <col class="col-side" />
          <col class="col-value" />
          <col class="col-footprint" />
          <col class="col-match" />
          <col class="col-stock" />
          <col class="col-status" />
          <col class="col-actions" />
        </colgroup>
        <thead><tr><th>Ref</th><th>Side</th><th>Value</th><th>Footprint</th><th>Match</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>` : `<div class="empty-panel compact"><h3>no placements</h3><p>Import KiCad source files to generate the board guide.</p><button type="button" data-action="project-tab" data-tab="source">import source</button></div>`}
  </section>`;
}

function renderPlacementGuideRow(project, placement, session) {
  const row = placement.bomRowId ? state.inventory.projectBom.find((item) => item.id === placement.bomRowId) : null;
  const part = row?.partId ? state.inventory.parts.find((item) => item.id === row.partId) : null;
  const status = row ? bomRowStatus(row) : { available: 0, shortage: 0 };
  const step = session ? buildStepForPlacement(session.id, placement.id) : null;
  const stepStatus = step?.status || "pending";
  const disabled = session ? "" : "disabled title=\"Create a build session first\"";
  return `<tr class="${stepStatus !== "pending" ? "build-step-done" : ""}">
    <td class="mono-cell">${escapeHtml(placement.reference)}</td>
    <td><span class="badge side-chip ${escapeAttr(placement.side || "unknown")}">${escapeHtml(placement.side || "unknown")}</span></td>
    <td><span class="cell-truncate" title="${escapeAttr(placement.value || row?.value || "")}">${escapeHtml(placement.value || row?.value || "")}</span></td>
    <td><span class="cell-truncate mono-cell" title="${escapeAttr(placement.footprint || row?.footprint || "")}">${escapeHtml(shortFootprint(placement.footprint || row?.footprint || ""))}</span></td>
    <td>${part ? `<button type="button" class="link-button cell-truncate" data-action="open-edit-part" data-id="${part.id}" title="${escapeAttr(part.name)}">${escapeHtml(part.name)}</button>` : `<span class="danger-text">unresolved</span>`}</td>
    <td>${part ? `<span class="qty-ok">${stockSummary(part.id).total}</span>${status.shortage ? ` / <span class="qty-low">${status.shortage} short</span>` : ""}` : "-"}</td>
    <td><span class="badge status-chip ${escapeAttr(session ? stepStatus : "pending")}">${escapeHtml(session ? stepStatus : "no session")}</span>${step?.takenQuantity ? ` <span class="subtext">took ${step.takenQuantity}</span>` : ""}</td>
    <td class="action-cell">
      <div class="row-action-grid build-action-grid">
        ${part ? `<button type="button" class="small-button" data-action="take-placement" data-id="${placement.id}" ${disabled}>take</button>` : ""}
        <button type="button" class="small-button" data-action="mark-placement-done" data-id="${placement.id}" ${disabled}>done</button>
        <button type="button" class="small-button" data-action="mark-placement-skipped" data-id="${placement.id}" ${disabled}>skip</button>
        <button type="button" class="small-button" data-action="mark-placement-pending" data-id="${placement.id}" ${disabled}>reset</button>
      </div>
    </td>
  </tr>`;
}

function renderBoardSvg(project, placements, session) {
  const bounds = projectBoardBounds(project.id);
  const width = Math.max(10, bounds.maxX - bounds.minX);
  const height = Math.max(10, bounds.maxY - bounds.minY);
  const pad = Math.max(width, height) * 0.08;
  const viewBox = `${bounds.minX - pad} ${bounds.minY - pad} ${width + pad * 2} ${height + pad * 2}`;
  const boardGeometry = projectBoardGeometry(project.id);
  const boardShapes = boardGeometry.length
    ? boardGeometry.map(renderBoardShape).join("")
    : `<rect class="board-outline" x="${bounds.minX}" y="${bounds.minY}" width="${width}" height="${height}" rx="1.5"></rect>`;
  const footprints = placements.map((placement) => {
    const x = placement.xMm ?? bounds.minX + width / 2;
    const y = placement.yMm ?? bounds.minY + height / 2;
    const row = placement.bomRowId ? state.inventory.projectBom.find((item) => item.id === placement.bomRowId) : null;
    const step = session ? buildStepForPlacement(session.id, placement.id) : null;
    const body = placementBody(placement);
    const fitted = placement.dnp ? "dnp" : "fitted";
    const cls = [
      "placement-footprint",
      placement.side || "unknown",
      row?.partId ? "matched" : "unmatched",
      fitted,
      step?.status === "done" ? "done" : "",
      step?.status === "skipped" ? "skipped" : ""
    ].filter(Boolean).join(" ");
    return `<g class="${cls}" data-action="mark-placement-done" data-id="${placement.id}" transform="translate(${x} ${y}) rotate(${placement.rotation || 0})">
      <rect class="footprint-body" x="${-body.width / 2}" y="${-body.height / 2}" width="${body.width}" height="${body.height}" rx="${Math.min(0.35, body.height / 3)}"></rect>
      <line class="footprint-pin1" x1="${-body.width / 2}" y1="${-body.height / 2}" x2="${Math.min(0, -body.width / 2 + body.width * 0.35)}" y2="${-body.height / 2}"></line>
      <circle class="footprint-center" r="${Math.min(0.55, Math.max(0.2, Math.min(body.width, body.height) * 0.18))}"></circle>
      <text x="${body.width / 2 + 0.7}" y="0.75">${escapeHtml(placement.reference)}</text>
    </g>`;
  }).join("");
  const gridSize = Math.max(5, Math.round(Math.max(width, height) / 10));
  const ratio = `${trimNumber(width + pad * 2)} / ${trimNumber(height + pad * 2)}`;
  return `<div class="board-panel pcb-render-panel" style="--board-ratio:${escapeAttr(ratio)}">
    <div class="pcb-render-legend">
      <span><i class="legend-swatch matched"></i>matched</span>
      <span><i class="legend-swatch unmatched"></i>unresolved</span>
      <span><i class="legend-swatch done"></i>done</span>
      <span><i class="legend-swatch skipped"></i>skipped</span>
    </div>
    <svg class="board-svg" viewBox="${escapeAttr(viewBox)}" role="img" aria-label="PCB placement map">
      <defs>
        <pattern id="pcbGrid-${project.id}" width="${gridSize}" height="${gridSize}" patternUnits="userSpaceOnUse">
          <path d="M ${gridSize} 0 L 0 0 0 ${gridSize}" class="pcb-grid-line"></path>
        </pattern>
      </defs>
      <rect class="pcb-grid-fill" x="${bounds.minX - pad}" y="${bounds.minY - pad}" width="${width + pad * 2}" height="${height + pad * 2}" fill="url(#pcbGrid-${project.id})"></rect>
      <g class="board-shape">${boardShapes}</g>
      <g class="placement-layer">${footprints}</g>
    </svg>
  </div>`;
}

function projectBoardGeometry(projectId) {
  for (const placement of projectPlacements(projectId)) {
    const meta = parseJsonSafe(placement.boundingJson);
    if (Array.isArray(meta?.boardGeometry) && meta.boardGeometry.length) return meta.boardGeometry;
  }
  return [];
}

function placementBody(placement) {
  const meta = parseJsonSafe(placement.boundingJson);
  const body = meta?.body || footprintBodyFallback(placement.footprint);
  return {
    width: Math.max(0.5, Math.min(30, Number(body.width) || 2.4)),
    height: Math.max(0.5, Math.min(30, Number(body.height) || 1.4))
  };
}

function renderBoardShape(shape) {
  if (shape.type === "rect") return `<rect class="board-outline" x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" rx="1.5"></rect>`;
  if (shape.type === "line") return `<line class="board-edge-line" x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}"></line>`;
  if (shape.type === "circle") return `<circle class="board-edge-line" cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}"></circle>`;
  return "";
}

function shortFootprint(value) {
  const text = String(value || "");
  const parts = text.split(":");
  const clean = parts.length > 1 ? parts.slice(1).join(":") : text;
  return clean.length > 42 ? `${clean.slice(0, 39)}...` : clean;
}

function renderProjectHistory(project) {
  const movements = (state.inventory.stockMovements || []).filter((row) => row.projectId === project.id).slice(0, 80);
  const sessions = projectBuildSessions(project.id);
  const rows = movements.map((row) => {
    const part = state.inventory.parts.find((item) => item.id === row.partId);
    const session = row.buildSessionId ? sessions.find((item) => item.id === row.buildSessionId) : null;
    const placement = row.placementId ? state.inventory.projectPlacements.find((item) => item.id === row.placementId) : null;
    return `<tr><td>${escapeHtml(formatDate(row.createdAt))}</td><td>${escapeHtml(row.movementType)}</td><td>${escapeHtml(part?.name || `part ${row.partId}`)}</td><td>${row.quantity}</td><td>${escapeHtml(session?.name || "")}</td><td>${escapeHtml(placement?.reference || "")}</td><td>${escapeHtml(row.notes || "")}</td></tr>`;
  }).join("");
  return `<section class="panel">
    <div class="panel-head"><h4>history</h4><p>${movements.length} project-linked stock movements</p></div>
    <div class="table-wrap"><table class="data-table compact-parts-table"><thead><tr><th>Date</th><th>Type</th><th>Part</th><th>Qty</th><th>Session</th><th>Ref</th><th>Notes</th></tr></thead><tbody>${rows || `<tr><td colspan="7">No project stock movements yet.</td></tr>`}</tbody></table></div>
  </section>`;
}

function projectSources(projectId) {
  return (state.inventory.projectSources || []).filter((row) => row.projectId === Number(projectId)).sort((a, b) => String(b.importedAt).localeCompare(String(a.importedAt)));
}

function projectPlacements(projectId) {
  return (state.inventory.projectPlacements || []).filter((row) => row.projectId === Number(projectId)).sort((a, b) => naturalReferenceCompare(a.reference, b.reference));
}

function projectBuildSessions(projectId) {
  return (state.inventory.projectBuildSessions || []).filter((row) => row.projectId === Number(projectId)).sort((a, b) => b.id - a.id);
}

function projectBuildSteps(sessionId) {
  return (state.inventory.projectBuildSteps || []).filter((row) => row.sessionId === Number(sessionId));
}

function activeBuildSession(projectId) {
  const sessions = projectBuildSessions(projectId);
  if (!sessions.length) return null;
  const active = sessions.find((row) => row.id === Number(state.activeBuildSessionId));
  if (active) return active;
  state.activeBuildSessionId = sessions[0].id;
  return sessions[0];
}

function buildStepForPlacement(sessionId, placementId) {
  return (state.inventory.projectBuildSteps || []).find((row) => row.sessionId === Number(sessionId) && row.placementId === Number(placementId)) || null;
}

function ensureBuildStep(session, placement) {
  let step = buildStepForPlacement(session.id, placement.id);
  if (step) return step;
  step = {
    id: nextId(state.inventory.projectBuildSteps || []),
    sessionId: session.id,
    projectId: session.projectId,
    placementId: placement.id,
    bomRowId: placement.bomRowId ?? null,
    reference: placement.reference,
    status: "pending",
    takenQuantity: 0,
    completedAt: null,
    notes: null
  };
  state.inventory.projectBuildSteps.push(step);
  return step;
}

function buildProgress(projectId, sessionId) {
  const steps = sessionId ? projectBuildSteps(sessionId) : [];
  return {
    total: projectPlacements(projectId).length,
    done: steps.filter((row) => row.status === "done").length,
    skipped: steps.filter((row) => row.status === "skipped").length,
    taken: steps.reduce((sum, row) => sum + numberOrZero(row.takenQuantity), 0)
  };
}

function createBuildSession(projectId) {
  const project = state.inventory.projects.find((item) => item.id === Number(projectId));
  if (!project) return;
  const name = prompt("Build session name", `${project.name} build ${projectBuildSessions(project.id).length + 1}`);
  if (!name) return;
  const qty = integerOrZero(prompt("Build quantity", String(project.targetQuantity || 1))) || 1;
  state.inventory.projectBuildSessions = state.inventory.projectBuildSessions || [];
  state.inventory.projectBuildSteps = state.inventory.projectBuildSteps || [];
  const now = new Date().toISOString();
  const session = {
    id: nextId(state.inventory.projectBuildSessions),
    projectId: project.id,
    name: textValue(name),
    status: "active",
    buildQuantity: qty,
    createdAt: now,
    updatedAt: now,
    notes: null
  };
  state.inventory.projectBuildSessions.push(session);
  projectPlacements(project.id).forEach((placement) => ensureBuildStep(session, placement));
  state.activeBuildSessionId = session.id;
  logActivity("create-build-session", "project", project.id, `${session.name} qty ${qty}`);
  touchInventory();
  if (!persistDatabase("build session created", { dirty: true })) return;
  state.activeProjectTab = "guide";
  render();
}

function setPlacementStatus(placementId, status) {
  const placement = state.inventory.projectPlacements.find((row) => row.id === Number(placementId));
  if (!placement) return;
  const session = activeBuildSession(placement.projectId);
  if (!session) {
    toast("create a build session first", "error");
    return;
  }
  const step = ensureBuildStep(session, placement);
  step.status = status;
  step.completedAt = status === "pending" ? null : new Date().toISOString();
  session.updatedAt = new Date().toISOString();
  logActivity(`build-${status}`, "project_placement", placement.id, placement.reference);
  touchInventory();
  if (!persistDatabase("build progress updated", { dirty: true })) return;
  render();
}

function takePlacementStock(placementId) {
  const placement = state.inventory.projectPlacements.find((row) => row.id === Number(placementId));
  if (!placement) return;
  const session = activeBuildSession(placement.projectId);
  if (!session) {
    toast("create a build session first", "error");
    return;
  }
  const bom = placement.bomRowId ? state.inventory.projectBom.find((row) => row.id === placement.bomRowId) : null;
  if (!bom?.partId) {
    toast("placement is unresolved", "error");
    return;
  }
  const qty = integerOrZero(prompt(`Take quantity for ${placement.reference}`, String(session.buildQuantity || 1))) || 0;
  if (qty <= 0) return;
  const result = takeStock(bom.partId, {
    quantity: qty,
    projectId: placement.projectId,
    bomRowId: bom.id,
    buildSessionId: session.id,
    placementId: placement.id,
    notes: `build guide take: ${placement.reference}`
  });
  if (!result.ok) {
    toast(`take failed: ${result.error}`, "error");
    return;
  }
  const step = ensureBuildStep(session, placement);
  step.takenQuantity = numberOrZero(step.takenQuantity) + result.quantity;
  session.updatedAt = new Date().toISOString();
  logActivity("take-placement", "project_placement", placement.id, `${result.quantity} taken for ${placement.reference}`);
  touchInventory();
  if (!persistDatabase("build stock taken", { dirty: true })) return;
  render();
}

function projectBoardBounds(projectId) {
  const placements = projectPlacements(projectId);
  for (const placement of placements) {
    const meta = parseJsonSafe(placement.boundingJson);
    if (meta?.boardBounds) return meta.boardBounds;
  }
  const xs = placements.map((row) => row.xMm).filter((n) => Number.isFinite(Number(n))).map(Number);
  const ys = placements.map((row) => row.yMm).filter((n) => Number.isFinite(Number(n))).map(Number);
  if (!xs.length || !ys.length) return { minX: 0, minY: 0, maxX: 100, maxY: 70 };
  return { minX: Math.min(...xs) - 5, minY: Math.min(...ys) - 5, maxX: Math.max(...xs) + 5, maxY: Math.max(...ys) + 5 };
}

function projectWarnings(projectId) {
  const warnings = [];
  const rows = projectBomRows(projectId);
  const placements = projectPlacements(projectId);
  rows.filter((row) => !row.partId).slice(0, 20).forEach((row) => warnings.push(`Unresolved BOM row: ${row.referencesText || row.value || row.id}`));
  placements.filter((row) => !row.bomRowId).slice(0, 20).forEach((row) => warnings.push(`Placement without BOM row: ${row.reference}`));
  (projectSources(projectId) || []).forEach((source) => {
    if (source.notes) warnings.push(`${source.fileName}: ${source.notes}`);
  });
  return warnings;
}

async function previewKiCadSourceFromForm() {
  const form = $("#kicadSourceForm");
  const target = $("#kicadSourcePreview");
  if (!form || !target) return;
  target.innerHTML = `<p class="small-note">Parsing KiCad files...</p>`;
  try {
    const parsed = await parseKiCadProjectFiles(kiCadFilesFromForm(form));
    target.innerHTML = renderKiCadSourcePreview(parsed);
  } catch (error) {
    target.innerHTML = `<p class="danger-text">${escapeHtml(error.message)}</p>`;
  }
}

async function importKiCadSourceFromForm() {
  const form = $("#kicadSourceForm");
  if (!form) return;
  try {
    const parsed = await parseKiCadProjectFiles(kiCadFilesFromForm(form));
    if (!parsed.components.length) {
      toast("no KiCad components found", "error");
      previewKiCadSourceFromForm();
      return;
    }
    const fd = new FormData(form);
    const now = new Date().toISOString();
    const mode = textValue(fd.get("projectMode")) || "create";
    const existingProjectId = nullableNumber(fd.get("existingProjectId"));
    let project = mode === "update" && existingProjectId ? state.inventory.projects.find((row) => row.id === existingProjectId) : null;
    if (!project) {
      project = {
        id: nextId(state.inventory.projects || []),
        name: textValue(fd.get("projectName")) || parsed.projectName || "KiCad project",
        revision: nullableText(fd.get("revision")),
        sourceFile: parsed.primarySource || "KiCad source set",
        status: "active",
        targetQuantity: integerOrZero(fd.get("targetQuantity")) || 1,
        dueDate: null,
        owner: nullableText(fd.get("owner")),
        tags: null,
        createdAt: now,
        updatedAt: now,
        notes: null
      };
      state.inventory.projects.push(project);
    } else {
      project.name = textValue(fd.get("projectName")) || project.name;
      project.revision = nullableText(fd.get("revision")) || project.revision;
      project.sourceFile = parsed.primarySource || project.sourceFile;
      project.targetQuantity = integerOrZero(fd.get("targetQuantity")) || project.targetQuantity || 1;
      project.owner = nullableText(fd.get("owner")) || project.owner;
      project.updatedAt = now;
    }

    replaceProjectSourceData(project, parsed, now);
    logActivity("import-kicad-source", "project", project.id, `${parsed.components.length} refs imported for match review`);
    touchInventory();
    if (!persistDatabase("KiCad project imported", { dirty: true })) return;
    state.activeProjectId = project.id;
    state.activeProjectTab = "match";
    localStorage.setItem(STORAGE.activeProjectId, String(project.id));
    setView("projects");
    toast(`KiCad source imported: ${project.name}`);
  } catch (error) {
    toast(`KiCad import failed: ${error.message}`, "error");
    const target = $("#kicadSourcePreview");
    if (target) target.innerHTML = `<p class="danger-text">${escapeHtml(error.message)}</p>`;
  }
}

function replaceProjectSourceData(project, parsed, now) {
  state.inventory.projectSources = (state.inventory.projectSources || []).filter((row) => row.projectId !== project.id);
  state.inventory.projectPlacements = (state.inventory.projectPlacements || []).filter((row) => row.projectId !== project.id);
  state.inventory.projectBuildSessions = (state.inventory.projectBuildSessions || []).filter((row) => row.projectId !== project.id);
  state.inventory.projectBuildSteps = (state.inventory.projectBuildSteps || []).filter((row) => row.projectId !== project.id);
  state.inventory.projectReservations = (state.inventory.projectReservations || []).filter((row) => row.projectId !== project.id);
  state.inventory.projectBom = (state.inventory.projectBom || []).filter((row) => row.projectId !== project.id);

  parsed.sources.forEach((source) => {
    state.inventory.projectSources.push({
      id: nextId(state.inventory.projectSources),
      projectId: project.id,
      fileName: source.fileName,
      fileType: source.fileType,
      fileHash: source.fileHash,
      importedAt: now,
      parserVersion: KICAD_PARSER_VERSION,
      notes: source.notes || null
    });
  });

  const groups = groupKiCadComponents(parsed.components);
  const bomByGroup = new Map();
  groups.forEach((group) => {
    const row = {
      id: nextId(state.inventory.projectBom),
      projectId: project.id,
      partId: null,
      value: group.value || null,
      footprint: group.footprint || null,
      mpn: group.mpn || null,
      referencesText: group.references.join(" "),
      quantity: group.references.length,
      fitted: group.dnp ? 0 : 1,
      notes: null
    };
    state.inventory.projectBom.push(row);
    bomByGroup.set(group.key, row);
  });

  parsed.components.forEach((component) => {
    const group = componentGroupKey(component);
    const bom = bomByGroup.get(group);
    state.inventory.projectPlacements.push({
      id: nextId(state.inventory.projectPlacements),
      projectId: project.id,
      bomRowId: bom?.id || null,
      reference: component.reference,
      sourceUuid: component.uuid || null,
      side: component.side || "unknown",
      xMm: component.xMm ?? null,
      yMm: component.yMm ?? null,
      rotation: component.rotation ?? null,
      value: component.value || null,
      footprint: component.footprint || null,
      mpn: component.mpn || null,
      manufacturer: component.manufacturer || null,
      dnp: component.dnp ? 1 : 0,
      boundingJson: JSON.stringify({
        boardBounds: parsed.boardBounds || null,
        boardGeometry: parsed.boardGeometry || [],
        body: component.body || footprintBodyFallback(component.footprint)
      }),
      notes: component.notes || null
    });
  });
}

function renderKiCadSourcePreview(parsed) {
  const groups = groupKiCadComponents(parsed.components);
  const rows = groups.slice(0, 60).map((group) => {
    const candidate = getBomMatchCandidates({ value: group.value, footprint: group.footprint, mpn: group.mpn, referencesText: group.references.join(" ") }, { limit: 1 })[0];
    return `<tr><td>${escapeHtml(group.references.join(" "))}</td><td>${group.references.length}</td><td>${escapeHtml(group.value || "")}</td><td>${escapeHtml(group.footprint || "")}</td><td>${escapeHtml(group.mpn || "")}</td><td>${group.dnp ? "DNP" : "yes"}</td><td>${candidate ? `${escapeHtml(candidate.partName)} <span class="muted">(${escapeHtml(candidate.confidence)})</span>` : `<span class="danger-text">no candidate</span>`}</td></tr>`;
  }).join("");
  return `<p class="section-title">preview / ${parsed.components.length} references / ${groups.length} BOM groups / ${parsed.sources.length} source files</p>
    ${parsed.warnings.length ? `<p class="small-note danger-text">${escapeHtml(parsed.warnings.slice(0, 4).join(" / "))}</p>` : ""}
    <div class="table-wrap compact-table"><table class="data-table"><thead><tr><th>Refs</th><th>Qty</th><th>Value</th><th>Footprint</th><th>MPN</th><th>Fitted</th><th>Auto match</th></tr></thead><tbody>${rows || `<tr><td colspan="7">No components parsed.</td></tr>`}</tbody></table></div>`;
}

function kiCadFilesFromForm(form) {
  return [
    ...[...(form.querySelector("[name='kicadFolder']")?.files || [])],
    ...[...(form.querySelector("[name='kicadFiles']")?.files || [])]
  ];
}

async function parseKiCadProjectFiles(fileList) {
  const files = [...fileList].filter((file) => /\.(kicad_pro|kicad_pcb|kicad_sch)$/i.test(file.name));
  if (!files.length) throw new Error("Select .kicad_pro, .kicad_pcb, and .kicad_sch files.");
  const sources = [];
  const schematicComponents = [];
  const placementsByRef = new Map();
  const warnings = [];
  let boardBounds = null;
  let boardGeometry = [];
  let projectName = "";
  let primarySource = "";

  for (const file of files) {
    const text = await file.text();
    const fileType = file.name.endsWith(".kicad_pcb") ? "pcb" : file.name.endsWith(".kicad_sch") ? "schematic" : "project";
    const source = { fileName: file.webkitRelativePath || file.name, fileType, fileHash: simpleTextHash(text), notes: null };
    sources.push(source);
    if (!primarySource || fileType === "project") primarySource = source.fileName;
    if (!projectName && file.name.endsWith(".kicad_pro")) projectName = file.name.replace(/\.kicad_pro$/i, "");
    try {
      if (fileType === "pcb") {
        const parsed = parseKiCadPcb(text);
        parsed.placements.forEach((placement) => placementsByRef.set(placement.reference, placement));
        boardBounds = parsed.boardBounds || boardBounds;
        boardGeometry = parsed.boardGeometry?.length ? parsed.boardGeometry : boardGeometry;
        if (!projectName) projectName = file.name.replace(/\.kicad_pcb$/i, "");
      } else if (fileType === "schematic") {
        schematicComponents.push(...parseKiCadSchematic(text));
      }
    } catch (error) {
      source.notes = error.message;
      warnings.push(`${file.name}: ${error.message}`);
    }
  }

  const components = mergeKiCadComponents(schematicComponents, placementsByRef);
  if (!files.some((file) => file.name.endsWith(".kicad_pcb"))) warnings.push("No .kicad_pcb file selected; board placement markers may be incomplete.");
  if (!files.some((file) => file.name.endsWith(".kicad_sch"))) warnings.push("No .kicad_sch file selected; BOM metadata is inferred from PCB properties.");
  return { sources, components, warnings, boardBounds, boardGeometry, projectName, primarySource };
}

function parseKiCadSchematic(text) {
  const tree = parseSExpression(text);
  return findSexpr(tree, "symbol").map((node) => {
    const props = propertyMap(node);
    const reference = textValue(props.Reference || props.reference || props.Ref || props.ref);
    if (!reference || reference.startsWith("#")) return null;
    return {
      reference,
      value: nullableText(props.Value || props.value),
      footprint: nullableText(props.Footprint || props.footprint),
      mpn: nullableText(props.MPN || props.Mpn || props["Part Number"] || props.PartNumber || props.LCSC),
      manufacturer: nullableText(props.Manufacturer || props.MFR || props.Mfr),
      dnp: dnpFromNode(node) || dnpFromProperties(props),
      uuid: childValue(node, "uuid"),
      side: "unknown",
      xMm: null,
      yMm: null,
      rotation: null,
      notes: null
    };
  }).filter(Boolean);
}

function parseKiCadPcb(text) {
  const tree = parseSExpression(text);
  const placements = findSexpr(tree, "footprint").map((node) => {
    const props = propertyMap(node);
    const texts = fpTextMap(node);
    const at = findChild(node, "at") || [];
    const layer = childValue(node, "layer") || "";
    const reference = textValue(props.Reference || texts.reference || texts.ref);
    if (!reference || reference.startsWith("#")) return null;
    const footprint = nullableText(node[1] || props.Footprint);
    return {
      reference,
      value: nullableText(props.Value || texts.value),
      footprint,
      mpn: nullableText(props.MPN || props.Mpn || props["Part Number"] || props.PartNumber || props.LCSC),
      manufacturer: nullableText(props.Manufacturer || props.MFR || props.Mfr),
      dnp: dnpFromNode(node) || dnpFromProperties(props),
      uuid: childValue(node, "uuid") || childValue(node, "tstamp"),
      side: /^B\./i.test(layer) ? "bottom" : /^F\./i.test(layer) ? "top" : "unknown",
      xMm: nullableNumber(at[1]),
      yMm: nullableNumber(at[2]),
      rotation: nullableNumber(at[3]),
      body: footprintBodySize(node, footprint),
      notes: null
    };
  }).filter(Boolean);
  return { placements, boardBounds: extractBoardBounds(tree, placements), boardGeometry: extractBoardGeometry(tree) };
}

function mergeKiCadComponents(schematicComponents, placementsByRef) {
  const refs = new Set(schematicComponents.map((row) => row.reference));
  placementsByRef.forEach((_, ref) => refs.add(ref));
  return [...refs].sort(naturalReferenceCompare).map((reference) => {
    const sch = schematicComponents.find((row) => row.reference === reference) || {};
    const pcb = placementsByRef.get(reference) || {};
    return {
      reference,
      value: nullableText(sch.value || pcb.value),
      footprint: nullableText(sch.footprint || pcb.footprint),
      mpn: nullableText(sch.mpn || pcb.mpn),
      manufacturer: nullableText(sch.manufacturer || pcb.manufacturer),
      dnp: !!(sch.dnp || pcb.dnp),
      uuid: pcb.uuid || sch.uuid || null,
      side: pcb.side || "unknown",
      xMm: pcb.xMm ?? null,
      yMm: pcb.yMm ?? null,
      rotation: pcb.rotation ?? null,
      body: pcb.body || footprintBodyFallback(sch.footprint || pcb.footprint),
      notes: null
    };
  });
}

function groupKiCadComponents(components) {
  const map = new Map();
  components.forEach((component) => {
    const key = componentGroupKey(component);
    if (!map.has(key)) {
      map.set(key, {
        key,
        value: component.value || "",
        footprint: component.footprint || "",
        mpn: component.mpn || "",
        manufacturer: component.manufacturer || "",
        dnp: !!component.dnp,
        references: []
      });
    }
    map.get(key).references.push(component.reference);
  });
  return [...map.values()].map((group) => ({ ...group, references: group.references.sort(naturalReferenceCompare) }))
    .sort((a, b) => naturalReferenceCompare(a.references[0], b.references[0]));
}

function componentGroupKey(component) {
  return [component.value || "", component.footprint || "", component.mpn || "", component.manufacturer || "", component.dnp ? "dnp" : "fit"].map((item) => String(item).toLowerCase().trim()).join("|");
}

function tokenizeSExpression(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === ";") {
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "(" || ch === ")") {
      tokens.push(ch);
      i += 1;
      continue;
    }
    if (ch === '"') {
      let value = "";
      i += 1;
      while (i < text.length) {
        const next = text[i];
        if (next === "\\" && i + 1 < text.length) {
          value += text[i + 1];
          i += 2;
          continue;
        }
        if (next === '"') { i += 1; break; }
        value += next;
        i += 1;
      }
      tokens.push(value);
      continue;
    }
    let value = "";
    while (i < text.length && !/\s|\(|\)/.test(text[i])) {
      value += text[i];
      i += 1;
    }
    tokens.push(value);
  }
  return tokens;
}

function parseSExpression(text) {
  const tokens = tokenizeSExpression(text);
  let index = 0;
  function parseList() {
    const list = [];
    if (tokens[index] !== "(") throw new Error("expected '('");
    index += 1;
    while (index < tokens.length && tokens[index] !== ")") {
      if (tokens[index] === "(") list.push(parseList());
      else {
        list.push(tokens[index]);
        index += 1;
      }
    }
    if (tokens[index] !== ")") throw new Error("unclosed S-expression");
    index += 1;
    return list;
  }
  const roots = [];
  while (index < tokens.length) {
    roots.push(tokens[index] === "(" ? parseList() : tokens[index++]);
  }
  return roots.length === 1 ? roots[0] : roots;
}

function findSexpr(node, tag, result = []) {
  if (!Array.isArray(node)) return result;
  if (node[0] === tag) result.push(node);
  node.forEach((child) => {
    if (Array.isArray(child)) findSexpr(child, tag, result);
  });
  return result;
}

function findChild(node, tag) {
  return Array.isArray(node) ? node.find((child) => Array.isArray(child) && child[0] === tag) || null : null;
}

function hasChild(node, tag) {
  return !!findChild(node, tag);
}

function childValue(node, tag) {
  const child = findChild(node, tag);
  return child ? nullableText(child[1]) : null;
}

function propertyMap(node) {
  const map = {};
  findSexpr(node, "property").forEach((property) => {
    if (property.length >= 3) map[String(property[1])] = property[2];
  });
  return map;
}

function fpTextMap(node) {
  const map = {};
  findSexpr(node, "fp_text").forEach((item) => {
    if (item.length >= 3) map[String(item[1]).toLowerCase()] = item[2];
  });
  return map;
}

function extractBoardBounds(tree, placements) {
  const points = [];
  const addPoint = (node) => {
    if (!node) return;
    const x = nullableNumber(node[1]);
    const y = nullableNumber(node[2]);
    if (x !== null && y !== null) points.push([x, y]);
  };
  findSexpr(tree, "gr_line").forEach((node) => {
    if (childValue(node, "layer") !== "Edge.Cuts") return;
    addPoint(findChild(node, "start"));
    addPoint(findChild(node, "end"));
  });
  findSexpr(tree, "gr_rect").forEach((node) => {
    if (childValue(node, "layer") !== "Edge.Cuts") return;
    addPoint(findChild(node, "start"));
    addPoint(findChild(node, "end"));
  });
  placements.forEach((row) => {
    if (row.xMm !== null && row.yMm !== null) points.push([row.xMm, row.yMm]);
  });
  if (!points.length) return null;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function extractBoardGeometry(tree) {
  const shapes = [];
  const point = (node) => {
    const x = nullableNumber(node?.[1]);
    const y = nullableNumber(node?.[2]);
    return x !== null && y !== null ? { x, y } : null;
  };
  const isEdge = (node) => childValue(node, "layer") === "Edge.Cuts";
  findSexpr(tree, "gr_rect").forEach((node) => {
    if (!isEdge(node)) return;
    const start = point(findChild(node, "start"));
    const end = point(findChild(node, "end"));
    if (start && end) shapes.push({ type: "rect", x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) });
  });
  findSexpr(tree, "gr_line").forEach((node) => {
    if (!isEdge(node)) return;
    const start = point(findChild(node, "start"));
    const end = point(findChild(node, "end"));
    if (start && end) shapes.push({ type: "line", x1: start.x, y1: start.y, x2: end.x, y2: end.y });
  });
  findSexpr(tree, "gr_circle").forEach((node) => {
    if (!isEdge(node)) return;
    const center = point(findChild(node, "center"));
    const end = point(findChild(node, "end"));
    if (center && end) shapes.push({ type: "circle", cx: center.x, cy: center.y, r: Math.hypot(end.x - center.x, end.y - center.y) });
  });
  return shapes;
}

function footprintBodySize(node, footprint) {
  const points = [];
  const addPoint = (pointNode) => {
    const x = nullableNumber(pointNode?.[1]);
    const y = nullableNumber(pointNode?.[2]);
    if (x !== null && y !== null) points.push([x, y]);
  };
  findSexpr(node, "fp_rect").forEach((shape) => {
    addPoint(findChild(shape, "start"));
    addPoint(findChild(shape, "end"));
  });
  findSexpr(node, "fp_line").forEach((shape) => {
    addPoint(findChild(shape, "start"));
    addPoint(findChild(shape, "end"));
  });
  if (points.length >= 2) {
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const width = Math.max(0.5, Math.min(30, Math.max(...xs) - Math.min(...xs)));
    const height = Math.max(0.5, Math.min(30, Math.max(...ys) - Math.min(...ys)));
    return { width, height };
  }
  return footprintBodyFallback(footprint);
}

function footprintBodyFallback(footprint) {
  const text = String(footprint || "").toLowerCase();
  const table = [
    [/0402|1005/, [1.05, 0.6]],
    [/0603|1608/, [1.7, 0.95]],
    [/0805|2012/, [2.2, 1.35]],
    [/1206|3216/, [3.4, 1.8]],
    [/sod-?323/, [2.6, 1.45]],
    [/sod-?123/, [3.8, 1.8]],
    [/sot-?23/, [3.0, 1.7]],
    [/qfn|ufqfp|lqfp/, [5.2, 5.2]],
    [/cherry|mx|keyswitch/, [14.0, 14.0]],
    [/mountinghole|mounting_hole/, [4.2, 4.2]],
    [/led.*5050|ws2812/, [5.2, 5.2]]
  ];
  const match = table.find(([pattern]) => pattern.test(text));
  const [width, height] = match ? match[1] : [2.4, 1.4];
  return { width, height };
}

function dnpFromProperties(props) {
  const dnp = String(props.DNP || props.dnp || "").trim().toLowerCase();
  if (["1", "yes", "true", "dnp", "dnf"].includes(dnp)) return true;
  const fitted = String(props.Fitted || props.fitted || props.Populate || props.populated || "").trim().toLowerCase();
  return ["0", "no", "false", "dnp", "dnf"].includes(fitted);
}

function dnpFromNode(node) {
  const child = findChild(node, "dnp");
  if (!child) return false;
  if (child.length <= 1) return true;
  const value = String(child[1] ?? "").trim().toLowerCase();
  if (["", "1", "yes", "true", "dnp", "dnf", "exclude"].includes(value)) return true;
  return !["0", "no", "false", "include", "fitted", "populate"].includes(value);
}

function simpleTextHash(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function naturalReferenceCompare(a, b) {
  const parse = (value) => {
    const match = String(value || "").match(/^([A-Za-z]+)(\d+)(.*)$/);
    return match ? [match[1], Number(match[2]), match[3]] : [String(value || ""), 0, ""];
  };
  const aa = parse(a);
  const bb = parse(b);
  return aa[0].localeCompare(bb[0]) || aa[1] - bb[1] || aa[2].localeCompare(bb[2]);
}

function parseJsonSafe(text) {
  try { return text ? JSON.parse(text) : null; }
  catch { return null; }
}

function renderAdvancedEditorView() {
  state.editorTable = EDITOR_TABLES.some(([id]) => id === state.editorTable) ? state.editorTable : "parts";
  const tabs = EDITOR_TABLES.map(([id, label]) => `<button type="button" class="tab-button ${state.editorTable === id ? "active" : ""}" data-action="editor-table" data-table="${id}">${escapeHtml(label)}</button>`).join("");
  return `<div class="view-stack advanced-editor-view">
    <div class="view-toolbar">
      <h3 class="view-title">advanced inventory editor</h3>
      <div class="action-row">
        <button type="button" data-action="editor-validate">validate</button>
        <button type="button" class="primary-button" data-action="editor-apply">apply all</button>
      </div>
    </div>
    <section class="panel editor-panel">
      <div class="panel-head">
        <div class="tab-row">${tabs}</div>
        <div class="action-row">
          <button type="button" data-action="editor-add-row">add row</button>
          <button type="button" data-action="editor-delete-selected" class="danger-button">delete selected</button>
        </div>
      </div>
      ${renderEditorBatchToolbar()}
      ${renderEditorGrid(state.editorTable)}
      <details class="advanced-panel nested-card">
        <summary>Paste TSV</summary>
        <textarea id="editorPasteText" class="bulk-textarea" placeholder="Paste tab-separated rows with headers or columns matching the active grid."></textarea>
        <div class="action-row"><button type="button" data-action="editor-paste-tsv">add pasted rows</button></div>
      </details>
      <div id="editorValidation" class="bulk-preview">${state.editorValidationHtml || ""}</div>
    </section>
  </div>`;
}

function renderEditorBatchToolbar() {
  const categories = state.inventory.categories.map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join("");
  const locations = [`<option value="">no location</option>`].concat(state.inventory.locations.map((location) => `<option value="${location.id}">${escapeHtml(locationPath(location.id))}</option>`)).join("");
  const partOptions = [`<option value="">unresolved</option>`].concat(state.inventory.parts.map((part) => `<option value="${part.id}">${escapeHtml(part.name)}</option>`)).join("");
  return `<div class="editor-batch-toolbar">
    <div class="field"><label>category</label><select id="editorBatchCategory">${categories}</select></div>
    <div class="field"><label>location</label><select id="editorBatchLocation">${locations}</select></div>
    <div class="field"><label>unit price</label><input id="editorBatchPrice" type="number" min="0" step="0.0001" /></div>
    <div class="field"><label>currency</label><input id="editorBatchCurrency" value="${escapeAttr(defaultCurrency())}" /></div>
    <div class="field"><label>matched part</label><select id="editorBatchPart">${partOptions}</select></div>
    <div class="field"><label>fitted</label><select id="editorBatchFitted"><option value="1">fitted</option><option value="0">DNP</option></select></div>
    <div class="action-row">
      <button type="button" data-action="editor-batch-category">set category</button>
      <button type="button" data-action="editor-batch-location">set location</button>
      <button type="button" data-action="editor-batch-price">set price</button>
      <button type="button" data-action="editor-batch-fitted">set fitted</button>
      <button type="button" data-action="editor-batch-match">set match</button>
      <button type="button" data-action="editor-batch-auto-match">auto-match</button>
    </div>
  </div>`;
}

function editorColumns(table) {
  const maps = {
    parts: ["id", "name", "categoryId", "package", "footprint", "manufacturer", "mpn", "notes"],
    stock: ["id", "partId", "locationId", "quantity", "minQuantity", "source", "orderNumber", "unitPrice", "currency", "dateAdded", "notes"],
    locations: ["id", "name", "type", "parentId", "capacity", "x", "y", "z", "color", "ledNode", "ledIndex", "notes"],
    aliases: ["id", "partId", "aliasType", "aliasValue", "notes"],
    specs: ["kind", "partId", "resistanceOhm", "capacitanceF", "inductanceH", "tolerancePercent", "voltageV", "powerW", "dielectric", "currentA"],
    bom: ["id", "projectId", "partId", "referencesText", "value", "footprint", "mpn", "quantity", "fitted", "notes"]
  };
  return maps[table] || maps.parts;
}

function editorRows(table) {
  if (table === "aliases") return state.inventory.partAliases || [];
  if (table === "specs") return specEditorRows();
  if (table === "bom") return state.inventory.projectBom || [];
  return state.inventory[table] || [];
}

function specEditorRows() {
  const rows = [];
  Object.entries(SPEC_CONFIGS).forEach(([kind, config]) => {
    (state.inventory[config.table] || []).forEach((row) => rows.push({ kind, ...row }));
  });
  return rows;
}

function renderEditorGrid(table) {
  const columns = editorColumns(table);
  const rows = editorRows(table);
  const head = `<th class="select-cell"><input type="checkbox" data-editor-select-all /></th>${columns.map((col) => `<th>${escapeHtml(col)}</th>`).join("")}`;
  const body = rows.map((row, index) => renderEditorRow(table, row, columns, index)).join("");
  return `<div class="table-wrap editor-grid-wrap"><table class="data-table compact-parts-table editor-grid" data-editor-grid="${escapeAttr(table)}"><thead><tr>${head}</tr></thead><tbody>${body || renderEditorRow(table, {}, columns, 0, true)}</tbody></table></div>`;
}

function renderEditorRow(table, row, columns, index, isNew = false) {
  const key = row.id || `${row.kind || table}-${row.partId || index}`;
  const cells = columns.map((col) => `<td>${renderEditorInput(table, col, row, isNew)}</td>`).join("");
  return `<tr data-editor-row="${escapeAttr(String(key))}" ${isNew ? "data-editor-new=\"1\"" : ""}><td class="select-cell"><input type="checkbox" data-editor-select /></td>${cells}</tr>`;
}

function renderEditorInput(table, col, row, isNew) {
  const value = row[col] ?? "";
  if (col === "id" && !isNew) return `<input data-editor-field="${col}" value="${escapeAttr(value)}" readonly />`;
  if (col === "categoryId") return `<select data-editor-field="${col}">${state.inventory.categories.map((category) => `<option value="${category.id}" ${Number(value) === category.id ? "selected" : ""}>${escapeHtml(category.name)}</option>`).join("")}</select>`;
  if (col === "locationId" || col === "parentId") return `<select data-editor-field="${col}"><option value=""></option>${state.inventory.locations.map((location) => `<option value="${location.id}" ${Number(value) === location.id ? "selected" : ""}>${escapeHtml(locationPath(location.id))}</option>`).join("")}</select>`;
  if (col === "partId") return `<select data-editor-field="${col}"><option value=""></option>${state.inventory.parts.map((part) => `<option value="${part.id}" ${Number(value) === part.id ? "selected" : ""}>${escapeHtml(part.name)}</option>`).join("")}</select>`;
  if (col === "projectId") return `<select data-editor-field="${col}">${state.inventory.projects.map((project) => `<option value="${project.id}" ${Number(value) === project.id ? "selected" : ""}>${escapeHtml(project.name)}</option>`).join("")}</select>`;
  if (col === "kind") return `<select data-editor-field="${col}">${Object.keys(SPEC_CONFIGS).map((kind) => `<option value="${kind}" ${value === kind ? "selected" : ""}>${kind}</option>`).join("")}</select>`;
  if (col === "fitted") return `<select data-editor-field="${col}"><option value="1" ${Number(value) !== 0 ? "selected" : ""}>1</option><option value="0" ${Number(value) === 0 ? "selected" : ""}>0</option></select>`;
  if (col === "dateAdded") return `<input data-editor-field="${col}" type="date" value="${escapeAttr(value || new Date().toISOString().slice(0, 10))}" />`;
  const numeric = /^(quantity|minQuantity|capacity|x|y|z|ledIndex|unitPrice|resistanceOhm|capacitanceF|inductanceH|tolerancePercent|voltageV|powerW|currentA)$/.test(col);
  return `<input data-editor-field="${col}" ${numeric ? "type=\"number\" step=\"any\"" : ""} value="${escapeAttr(value)}" />`;
}

function editorSelectedRows() {
  return [...$$(".editor-grid tbody tr")].filter((row) => row.querySelector("[data-editor-select]")?.checked);
}

function editorBatchSet(action) {
  const rows = editorSelectedRows();
  if (!rows.length) {
    toast("select editor rows first", "error");
    return;
  }
  rows.forEach((row) => {
    if (action === "category") setEditorCell(row, "categoryId", $("#editorBatchCategory")?.value);
    if (action === "location") setEditorCell(row, "locationId", $("#editorBatchLocation")?.value);
    if (action === "price") {
      setEditorCell(row, "unitPrice", $("#editorBatchPrice")?.value);
      setEditorCell(row, "currency", $("#editorBatchCurrency")?.value);
    }
    if (action === "fitted") setEditorCell(row, "fitted", $("#editorBatchFitted")?.value);
    if (action === "match") setEditorCell(row, "partId", $("#editorBatchPart")?.value);
    if (action === "auto-match") {
      const rowData = readEditorRow(row);
      const candidate = getBomMatchCandidates(rowData, { limit: 1 })[0];
      if (candidate && ["exact", "strong"].includes(candidate.confidence)) setEditorCell(row, "partId", candidate.partId);
    }
  });
}

function setEditorCell(row, field, value) {
  const input = row.querySelector(`[data-editor-field="${field}"]`);
  if (input) input.value = value ?? "";
}

function addEditorRow() {
  const table = $(".editor-grid");
  if (!table) return;
  const columns = editorColumns(state.editorTable);
  table.querySelector("tbody").insertAdjacentHTML("beforeend", renderEditorRow(state.editorTable, {}, columns, Date.now(), true));
}

function deleteSelectedEditorRows() {
  const rows = editorSelectedRows();
  if (!rows.length) return;
  rows.forEach((row) => row.remove());
}

function pasteEditorTsv() {
  const text = $("#editorPasteText")?.value || "";
  if (!text.trim()) return;
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const columns = editorColumns(state.editorTable);
  let header = null;
  if (lines.length && lines[0].split("\t").some((cell) => columns.includes(cell.trim()))) {
    header = lines.shift().split("\t").map((cell) => cell.trim());
  }
  const table = $(".editor-grid tbody");
  if (!table) return;
  lines.forEach((line, index) => {
    const cells = parseSimpleCsvLine(line, "\t");
    const row = {};
    (header || columns).forEach((col, i) => row[col] = cells[i] ?? "");
    table.insertAdjacentHTML("beforeend", renderEditorRow(state.editorTable, row, columns, index + Date.now(), true));
  });
  $("#editorPasteText").value = "";
}

function readEditorRow(row) {
  const data = {};
  row.querySelectorAll("[data-editor-field]").forEach((input) => {
    data[input.dataset.editorField] = input.value;
  });
  return data;
}

function editorDraftInventory() {
  const draft = JSON.parse(JSON.stringify(state.inventory));
  const table = state.editorTable;
  const rows = [...$$(".editor-grid tbody tr")].map(readEditorRow).filter((row) => Object.values(row).some((value) => String(value ?? "").trim()));
  if (table === "parts") draft.parts = rows.map((row, index) => ({
    ...state.inventory.parts.find((item) => item.id === Number(row.id)),
    id: Number(row.id) || nextId(draft.parts || []) + index,
    categoryId: Number(row.categoryId) || state.inventory.categories[0]?.id || 1,
    name: textValue(row.name) || "part",
    package: nullableText(row.package),
    footprint: nullableText(row.footprint),
    manufacturer: nullableText(row.manufacturer),
    mpn: nullableText(row.mpn),
    notes: nullableText(row.notes),
    createdAt: state.inventory.parts.find((item) => item.id === Number(row.id))?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
  if (table === "stock") draft.stock = rows.map((row, index) => ({
    ...state.inventory.stock.find((item) => item.id === Number(row.id)),
    id: Number(row.id) || nextId(draft.stock || []) + index,
    partId: Number(row.partId),
    locationId: nullableNumber(row.locationId),
    quantity: integerOrZero(row.quantity),
    minQuantity: integerOrZero(row.minQuantity),
    source: nullableText(row.source),
    orderNumber: nullableText(row.orderNumber),
    unitPrice: nullableNumber(row.unitPrice),
    currency: row.unitPrice ? normalizeCurrency(row.currency || defaultCurrency(), defaultCurrency()) : null,
    dateAdded: row.dateAdded || state.inventory.stock.find((item) => item.id === Number(row.id))?.dateAdded || new Date().toISOString().slice(0, 10),
    notes: nullableText(row.notes)
  }));
  if (table === "locations") draft.locations = rows.map((row, index) => ({
    ...state.inventory.locations.find((item) => item.id === Number(row.id)),
    id: Number(row.id) || nextId(draft.locations || []) + index,
    name: textValue(row.name) || "location",
    type: textValue(row.type) || "bin",
    parentId: nullableNumber(row.parentId),
    capacity: nullableNumber(row.capacity),
    x: nullableNumber(row.x),
    y: nullableNumber(row.y),
    z: nullableNumber(row.z),
    color: nullableText(row.color),
    ledNode: nullableText(row.ledNode),
    ledIndex: nullableNumber(row.ledIndex),
    notes: nullableText(row.notes)
  }));
  if (table === "aliases") draft.partAliases = rows.map((row, index) => ({
    id: Number(row.id) || nextId(draft.partAliases || []) + index,
    partId: Number(row.partId),
    aliasType: nullableText(row.aliasType) || "alias",
    aliasValue: textValue(row.aliasValue),
    notes: nullableText(row.notes)
  }));
  if (table === "bom") draft.projectBom = rows.map((row, index) => ({
    id: Number(row.id) || nextId(draft.projectBom || []) + index,
    projectId: Number(row.projectId),
    partId: nullableNumber(row.partId),
    referencesText: nullableText(row.referencesText),
    value: nullableText(row.value),
    footprint: nullableText(row.footprint),
    mpn: nullableText(row.mpn),
    quantity: integerOrZero(row.quantity),
    fitted: Number(row.fitted) === 0 ? 0 : 1,
    notes: nullableText(row.notes)
  }));
  if (table === "specs") {
    Object.values(SPEC_CONFIGS).forEach((config) => draft[config.table] = []);
    rows.forEach((row) => {
      const kind = row.kind;
      const config = SPEC_CONFIGS[kind];
      if (!config) return;
      const spec = { partId: Number(row.partId) };
      config.fields.forEach(([name, , type]) => {
        if (row[name] === undefined || row[name] === "") return;
        spec[name] = type === "number" ? Number(row[name]) : row[name];
      });
      draft[config.table].push(spec);
    });
  }
  return normalizeInventory(draft);
}

function validateEditorDraft() {
  const draft = editorDraftInventory();
  const validation = validateInventory(draft);
  state.editorValidationHtml = validation.ok
    ? `<p class="qty-ok">Validation passed for ${escapeHtml(state.editorTable)}.</p>`
    : `<div class="danger-text">${validation.errors.slice(0, 12).map((error) => `<p>${escapeHtml(error)}</p>`).join("")}</div>`;
  const target = $("#editorValidation");
  if (target) target.innerHTML = state.editorValidationHtml;
}

function applyEditorDraft() {
  const draft = editorDraftInventory();
  const validation = validateInventory(draft);
  if (!validation.ok) {
    state.editorValidationHtml = `<p class="danger-text">${escapeHtml(validation.errors[0])}</p>`;
    render();
    return;
  }
  state.inventory = draft;
  touchInventory();
  if (!persistDatabase("advanced editor applied", { dirty: true })) return;
  toast("advanced editor changes applied");
  render();
}

Object.assign(window, {
  renderProjectManagerView,
  renderAdvancedEditorView,
  previewKiCadSourceFromForm,
  importKiCadSourceFromForm,
  createBuildSession,
  setPlacementStatus,
  takePlacementStock,
  editorBatchSet,
  addEditorRow,
  deleteSelectedEditorRows,
  pasteEditorTsv,
  validateEditorDraft,
  applyEditorDraft,
  parseKiCadProjectFiles,
  parseSExpression,
  projectPlacements,
  projectSources,
  projectBuildSessions
});
