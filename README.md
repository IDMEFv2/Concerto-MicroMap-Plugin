# Concerto-MicroMap-Plugin
Micro Map plugin for Concerto SIEM (SVG maps)

This plugin provides an SVG-based floor-plan visualization layer for IDMEFv2 alerts within the Concerto SIEM (Prewikka) interface. It lets operators monitor internal assets on floor plans and apply dynamic alert-driven coloring and navigation.

## Features

### 1. SVG Floor Plan Visualization
- **Plan Rendering**: Loads and renders SVG floor plans directly in the Micro Map view.
- **Element Monitoring**: Monitored SVG elements are tracked by ID and associated with alert context.
- **Interactive Selection**: Users can switch floor plans from the sidebar and open plans quickly.
- **Tooltip Support**: Monitored elements expose alert summaries and contextual details.

### 2. Dynamic Alert Visualization
- **Color Coding**: SVG elements are colored dynamically according to alert severity and rule evaluation.
- **Live Aggregation**: Alert rows are aggregated per monitored element and updated on refresh cycles.
- **Severity Awareness**: High/Medium/Low/Info distributions are available for rule checks and UI feedback.

### 3. Per-Object Rule Engine
Users can define rules for each monitored object directly from the UI:
- **Percentage Rules**: Change color if High/Medium/Low alerts exceed a configured percentage.
- **Regex Rules**: Change color if alert text/description matches specific patterns.
- **Rule Priority**: Rules are evaluated top-to-bottom; the first match defines the final color.
- **Object Scope**: Rules are stored per SVG object, allowing independent behavior by asset.
- **Dynamic Editing**: Rules can be added, edited, and removed from the rules modal.

### 4. Persistent Floor Plan State
- **Server-side Persistence**: Floor plans and metadata are persisted server-side.
- **Rules Persistence**: Per-object rules are stored and restored together with floor plan data.
- **Plan Registry**: Plan definitions are maintained in file-based storage under `/tmp/prewikka_micro_map/floor_plans.json`.
- **State Recovery**: Existing plans and their rule sets are restored when reopening the view.

### 5. Plan Management
- **Add Plan**: Upload and register new SVG floor plans.
- **Load Plan**: Open a selected floor plan from the available plan list.
- **Delete Plan**: Remove floor plans no longer needed.
- **Bulk Plan Discovery**: Supports list and bulk list APIs for cross-plugin navigation use cases.

### 6. Macro/Micro Navigation Integration
- **Explicit Micro Routes**: Dedicated `/micro_map/*` endpoints for plan and alert operations.
- **Macro Context Menu Integration**: Macro entities can navigate to specific Micro plans from a dynamic per-plan submenu.
- **Shared Navigation Context**: Macro writes per-user navigation context in `/tmp/prewikka_plugin_navigation/context.json`; Micro consumes it through `/micro_map/get_micro_navigation_context`.
- **Context Fields**: `has_reference`, `asset_ref`, `ref_type`, `source`, `svg_name`.
- **One-shot Consumption**: Navigation context is consumed when read, avoiding stale cross-navigation state.

### 7. Context and Time Synchronization
- **Context Transfer**: Selected macro context can be propagated to micro navigation flows.
- **Time Range Sync**: Alert queries respect the global Prewikka time selection.
- **Dynamic Refresh**: Changing time range updates computed alert aggregates and visual state.

### 8. Sidebar and UX Improvements
- **Structured Sidebar**: Dedicated Menu and Testing sections for clear operator flow.
- **Floor Plan Switcher**: Permanent plan selector (`floor-plan-select`) in the sidebar.
- **Asset Switcher**: Dedicated asset selector in sidebar for changing target entity without returning to Macro.
- **Rules Modal**: Macro-aligned modal structure for consistent rule editing experience.
- **Defensive Event Binding**: Safe listener registration avoids runtime crashes from missing DOM nodes.

### 9. Selector and Loading Behavior
- **No Default Selector Card in DOM**: The asset selector card is not pre-rendered at page load.
- **Selector Created on Demand**: The selector card is created only when bootstrap confirms that no asset/plan can be loaded automatically.
- **Loading-First Priority**: During load attempts (including `get_micro_plans_list` and `load_micro_floor_plan`), selector UI is suppressed to avoid transient flashes.
- **Handoff Stability**: In Macro-to-Micro handoff with valid context, selector UI is not shown while target asset/plan loading is in progress.
- **Sidebar Switch Stability**: Switching asset from the sidebar keeps selector UI hidden until loading settles.
- **Fallback Rule**: If no asset can be resolved after all load attempts complete, the selector card is then rendered and shown to the user.
- **Empty-State Rule**: Empty-state guidance is shown only when the view is idle, no selector card is present, and no SVG is loaded.

### 10. Micro Route Reference
- `/micro_map/get_micro_navigation_context`: Reads and consumes per-user Macro navigation context.
- `/micro_map/get_micro_plans_list`: Returns available floor plans for one asset.
- `/micro_map/get_micro_plans_list_bulk`: Returns available floor plans for multiple assets.
- `/micro_map/load_micro_floor_plan`: Loads a specific floor plan by `asset_ref` and `svg_name`.
- `/micro_map/add_micro_floor_plan`: Stores or updates one floor plan and optional object rules.
- `/micro_map/delete_micro_floor_plan`: Deletes a floor plan by `asset_ref` and `svg_name`.
- `/micro_map/get_micro_alerts_bulk_for_asset`: Returns alert rows for a given asset and time range.

---

## Installation

To install the plugin, you need to execute the installation command inside the Prewikka container and then restart the service.

### Prerequisites
- The SIEM stack must be running.
- Access to the `gui` container (via docker/podman).

### Environment Setup

Before installing, you must ensure the plugin source code is accessible inside the `gui` container. The recommended way is to mount the plugin directory as a volume in your `docker-compose.yml`.

1. **Locate your `docker-compose.yml` file**.
2. **Find the `gui` service definition**.
3. **Add a volume mapping** linking your local plugin folder to the container's plugin directory:

   ```yaml
    services:
       gui:
          # ... other configurations
          volumes:
             - ./plugins/prewikka_apps_micro_map:/prewikka/prewikka_apps_micro_map:Z
             # ... other volumes
   ```

   *Note: If your repository does not use a `plugins` folder, use `./prewikka_apps_micro_map` instead.*

4. **Recreate the container** to apply the volume change:
   ```bash
   docker-compose up -d gui
   ```

### Manual Installation Steps

1. **Install the plugin inside the container**:
   Execute the `setup.py install` command within the running `gui` container.

   Using Docker Compose (v1):
   ```bash
   docker-compose exec gui sh -lc "cd /prewikka/prewikka_apps_micro_map && python3 setup.py install"
   ```

   Using Docker Compose (v2):
   ```bash
   docker compose exec gui sh -lc "cd /prewikka/prewikka_apps_micro_map && python3 setup.py install"
   ```

2. **Restart the GUI service**:
   Reload the service to apply the changes.

   Using Docker Compose (v1):
   ```bash
   docker-compose restart gui
   ```

   Using Docker Compose (v2):
   ```bash
   docker compose restart gui
   ```

3. **Verify Installation**:
   Check the logs to ensure the service started correctly.
   ```bash
   docker-compose logs --tail=30 gui
   ```

4. **Access the Plugin**:
   - Open your web browser and log in to the Prewikka interface.
   - Navigate to **Alerts** > **Micro Map** in the menu.
