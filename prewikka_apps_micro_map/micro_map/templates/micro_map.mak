<%!
  import pkg_resources
%>

<link rel="stylesheet" type="text/css" href="micro_map/css/micro_map.css"/>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css"/>
<button id="sidebar-toggle" type="button" class="is-hidden"><i class="bi bi-list"></i></button>
<div class="micro-map-controls">
  <span class="version">V${pkg_resources.get_distribution('prewikka-apps-micro_map').version}</span>
</div>

<div id="sidebar" class="is-hidden drawer-closed">
  <div id="sidebar-header">
    <h3>Micro Map</h3>
    <button id="sidebar-close" type="button"><i class="bi bi-x-lg"></i></button>
  </div>
  <div id="sidebar-body">
    <div id="controls">
      <div class="micro-menu-section-title">Menu</div>

      <button id="return-to-map" type="button" class="micro-menu-item">
        <i class="bi bi-house-door"></i>
        <span>Return to the Map</span>
      </button>

      <button id="manage-floor-plans" type="button" class="micro-menu-item">
        <i class="bi bi-diagram-3"></i>
        <span>Manage floor plans</span>
      </button>

      <div class="micro-plan-switcher">
        <span class="micro-plan-switcher-label">Current floor plan</span>
        <div class="micro-plan-switcher-controls">
          <select name="floor_plan_select" id="floor-plan-select" disabled></select>
          <button id="load-plan-button" type="button" disabled>Open</button>
        </div>

        <span class="micro-plan-switcher-label">Current asset</span>
        <div class="micro-plan-switcher-controls">
          <select name="asset_switch_select" id="asset-switch-select"></select>
          <button id="load-asset-button" type="button">Open</button>
        </div>
      </div>

      <div class="micro-menu-section-title micro-testing-title">Testing</div>

      <button id="blink-random" type="button">Blink Obj</button>
      <button id="blink-connected-random" type="button">Blink camera view</button>
    </div>
  </div>
</div>

<div id="manage-floor-plans-modal" class="crud-modal-border crud-modal" data-resizable="true">
  <div class="custom-modal-header bg-primary ui-front" data-draggable="true">
    <div class="flex justify-between">
      <h3>Manage floor plans</h3>
      <div class="cursor-pointer flex align-center">
        <svg id="close-manage-floor-plans-modal" clip-rule="evenodd" fill-rule="evenodd" fill="white" stroke-linejoin="round"
          stroke-miterlimit="2" width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path
            d="m12 10.93 5.719-5.72c.146-.146.339-.219.531-.219.404 0 .75.324.75.749 0 .193-.073.385-.219.532l-5.72 5.719 5.719 5.719c.147.147.22.339.22.531 0 .427-.349.75-.75.75-.192 0-.385-.073-.531-.219l-5.719-5.719-5.719 5.719c-.146.146-.339.219-.531.219-.401 0-.75-.323-.75-.75 0-.192.073-.384.22-.531l5.719-5.719-5.72-5.719c-.146-.147-.219-.339-.219-.532 0-.425.346-.749.75-.749.192 0 .385.073.531.219z" />
        </svg>
      </div>
    </div>
  </div>

  <div class="custom-modal-body">
    <div class="crud-modal-section">
      <span class="bold">Upload and save a new floor plan</span>
      <div class="flex gap-1">
        <button id="manage-select-svg-button" class="btn btn-primary" type="button">Select SVG</button>
        <div class="flex w-100 align-stretch">
          <input id="manage-svg-filename" type="text" class="modal-input w-100 modal-input-flat-right" readonly>
          <button id="manage-clear-svg-button" class="btn btn-danger btn-flat-left" type="button">X</button>
          <input type="file" id="manage-svg-file-input" accept=".svg,image/svg+xml" style="display:none" />
        </div>
      </div>
      <div class="flex gap-1 align-center">
        <span class="bold">Floor plan name:</span>
        <input id="manage-plan-name" type="text" class="modal-input w-100" placeholder="e.g. First Floor">
      </div>
      <div class="flex w-100 justify-end">
        <button id="manage-upload-save-button" class="btn btn-primary" type="button">Upload and save</button>
      </div>
    </div>

    <hr class="modal-hr">

    <div class="crud-modal-section">
      <span class="bold">Delete an existing floor plan</span>
      <div class="flex gap-1 align-center">
        <span class="bold">Saved plans:</span>
        <select id="manage-delete-plan-dropdown" class="modal-input w-100"></select>
      </div>
      <div class="flex w-100 justify-end">
        <button id="manage-delete-plan-button" class="btn btn-danger" type="button">Delete selected plan</button>
      </div>
    </div>
  </div>
</div>

<div id="micro-rules-modal" class="crud-modal-border crud-modal" data-resizable="true">
  <div class="custom-modal-header bg-primary ui-front" data-draggable="true">
    <div class="flex justify-between">
      <h3>Define the object's color rules</h3>
      <div class="cursor-pointer flex align-center">
        <svg id="close-micro-rules-modal" clip-rule="evenodd" fill-rule="evenodd" fill="white" stroke-linejoin="round"
          stroke-miterlimit="2" width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path
            d="m12 10.93 5.719-5.72c.146-.146.339-.219.531-.219.404 0 .75.324.75.749 0 .193-.073.385-.219.532l-5.72 5.719 5.719 5.719c.147.147.22.339.22.531 0 .427-.349.75-.75.75-.192 0-.385-.073-.531-.219l-5.719-5.719-5.719 5.719c-.146.146-.339.219-.531.219-.401 0-.75-.323-.75-.75 0-.192.073-.384.22-.531l5.719-5.719-5.72-5.719c-.146-.147-.219-.339-.219-.532 0-.425.346-.749.75-.749.192 0 .385.073.531.219z" />
        </svg>
      </div>
    </div>
  </div>

  <div class="custom-modal-body">
    <span class="pb-1 bold">
      Rules are evaluated from top to bottom (Rule 1 → Rule N). The first matching rule determines the object color.
    </span>

    <span id="micro-rules-modal-subtitle" class="micro-rules-subtitle"></span>

    <div id="micro-rules-grid-container" class="rules-container"></div>
    <div class="mt-1">
      <button id="micro-add-rule-button" class="btn btn-primary" type="button">Add rule</button>
      <div id="micro-insert-rules-div" class="flex gap-1 justify-between" style="display: none;">
        <div class="flex gap-1">
          <div class="flex gap-1 flex-col">
            <span class="bold">Rule type:</span>
            <select id="micro-type-dropdown" class="rule-input modal-input">
              <option value="percentage">Percentage</option>
              <option value="regex">Regex</option>
            </select>
          </div>
          <div class="flex gap-1 flex-col">
            <span class="bold">Position:</span>
            <input id="micro-position-input" type="number" class="rule-input modal-input" min="1" step="1" value="1">
          </div>
        </div>
        <div class="flex gap-1 mt-auto">
          <button id="micro-cancel-rules-button" class="btn btn-secondary" type="button">Cancel</button>
          <button id="micro-insert-rules-button" class="btn btn-primary" type="button">Confirm</button>
        </div>
      </div>
    </div>
  </div>
</div>

<div id="micro-modal-mask" class="modal-mask"></div>

<div id="asset-selector-overlay" class="is-hidden">
  <div id="asset-selector-card" class="crud-modal-border">
    <div class="custom-modal-header bg-primary">
      <h3>Select an Asset</h3>
    </div>
    <div class="custom-modal-body">
      <p id="asset-selector-message">Choose an asset from Macro Map to open Micro Map.</p>
      <select id="asset-selector-dropdown" class="modal-input"></select>
      <div class="flex w-100 justify-end">
        <button id="asset-selector-load" class="btn btn-primary" type="button">Open selected asset</button>
      </div>
    </div>
  </div>
</div>

<div id="main-map" class="is-hidden">
  <div id="svg-container"></div>
</div>

<div id="MicroPopoverOption" class="popover-options">
  <ul class="popover dropdown-menu dropdown-menu-theme multi-level" role="menu" aria-labelledby="dropdownMenu">
    <div class="arrow"></div>
    <li class="dropdown-submenu">
      <a>Search</a>
      <ul class="dropdown-menu dropdown-menu-theme">
        <li><a id="alerts_table_by_target_ip">Go to alerts table</a></li>
      </ul>
    </li>
    <li class="dropdown-submenu">
      <a>Object settings</a>
      <ul class="dropdown-menu dropdown-menu-theme">
        <li><a id="micro_edit_rules">Edit color rules</a></li>
      </ul>
    </li>
  </ul>
</div>

<script type="text/javascript">
  $LAB
    .script("micro_map/js/micro_map.js")
    .wait(function() {
      initializeListeners();
    });
</script>