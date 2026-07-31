import pkg_resources
import os
import json
import tempfile
import ast
import base64

from prewikka import database, template, view, error, mainmenu, response
from prewikka.dataprovider import Criterion

class Micro_Map(object):
    def __init__(self, id_, name, category, description, criteria):
        self.id_ = id_
        self.name = name
        self.category = category
        self.description = description
        self.criteria = criteria

class MicroDatabase(database.DatabaseHelper):
    def _get_storage_path(self):
        storage_dir = "/tmp/prewikka_micro_map"
        if not os.path.exists(storage_dir):
            os.makedirs(storage_dir)
        return os.path.join(storage_dir, "floor_plans.json")

    def _load_storage(self):
        storage_path = self._get_storage_path()

        if not os.path.isfile(storage_path):
            return {"assets": []}

        try:
            with open(storage_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            return {"assets": []}

        if not isinstance(data, dict):
            return {"assets": []}

        assets = data.get("assets", [])
        if not isinstance(assets, list):
            return {"assets": []}

        return {"assets": assets}

    def _save_storage(self, data):
        storage_path = self._get_storage_path()
        storage_dir = os.path.dirname(storage_path)

        fd, tmp_path = tempfile.mkstemp(prefix="floor_plans_", suffix=".tmp", dir=storage_dir)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as tmp_file:
                json.dump(data, tmp_file, ensure_ascii=False)
            os.replace(tmp_path, storage_path)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    def insert_floor_plan_into_db(self, asset_ref, svg_name, svg_content, ref_type="entity_name", object_rules=None):
        asset_ref = "" if asset_ref is None else str(asset_ref).strip()
        svg_name = "" if svg_name is None else str(svg_name).strip()
        ref_type = "entity_name" if ref_type is None else str(ref_type).strip()
        object_rules = object_rules if isinstance(object_rules, dict) else None

        if not asset_ref:
            raise error.PrewikkaUserError(_("Operation refused"), message=_("Missing asset_ref"))

        if not svg_name:
            raise error.PrewikkaUserError(_("Operation refused"), message=_("Missing svg_name"))

        data = self._load_storage()
        assets = data["assets"]

        existing_asset = next((a for a in assets if a.get("asset_ref") == asset_ref), None)
        if not existing_asset:
            existing_asset = {
                "asset_ref": asset_ref,
                "ref_type": ref_type or "entity_name",
                "svg_items": []
            }
            assets.append(existing_asset)

        existing_asset["ref_type"] = ref_type or existing_asset.get("ref_type") or "entity_name"

        svg_items = existing_asset["svg_items"]
        existing_svg = next((item for item in svg_items if item.get("svg_name") == svg_name), None)
        if existing_svg:
            existing_svg["svg_content"] = svg_content
            if object_rules is not None:
                existing_svg["object_rules"] = object_rules
            elif not isinstance(existing_svg.get("object_rules"), dict):
                existing_svg["object_rules"] = {}
        else:
            svg_items.append({
                "svg_name": svg_name,
                "svg_content": svg_content,
                "object_rules": object_rules if object_rules is not None else {}
            })

        self._save_storage(data)

        return {"result": "SVG saved", "asset_ref": asset_ref, "svg_name": svg_name}

    def get_floor_plan_from_db(self, asset_ref, svg_name):
        asset_ref = "" if asset_ref is None else str(asset_ref).strip()
        svg_name = "" if svg_name is None else str(svg_name).strip()
        if not asset_ref or not svg_name:
            return None

        data = self._load_storage()
        assets = data["assets"]

        asset_entry = next((asset for asset in assets if asset.get("asset_ref") == asset_ref), None)
        if not asset_entry:
            return None

        svg_entry = next((item for item in asset_entry.get("svg_items", []) if item.get("svg_name") == svg_name), None)
        if not svg_entry:
            return None

        return {
            "asset_ref": asset_ref,
            "svg_name": svg_entry.get("svg_name"),
            "svg_content": svg_entry.get("svg_content"),
            "object_rules": svg_entry.get("object_rules") if isinstance(svg_entry.get("object_rules"), dict) else {}
        }

    def get_plans_list(self, asset_ref):
        asset_ref = "" if asset_ref is None else str(asset_ref).strip()
        if not asset_ref:
            return []

        data = self._load_storage()
        assets = data["assets"]

        asset_entry = next((asset for asset in assets if asset.get("asset_ref") == asset_ref), None)
        if not asset_entry:
            return []

        full_list = []
        for item in asset_entry.get("svg_items", []):
            if not isinstance(item, dict):
                continue
            name = item.get("svg_name")
            if isinstance(name, str) and name.strip():
                full_list.append(name)

        return full_list

    def get_plans_list_bulk(self, asset_refs):
        if not asset_refs:
            return {}
        data = self._load_storage()
        assets = data.get("assets", [])
        result = {}
        for asset_ref in asset_refs:
            asset_ref = str(asset_ref).strip()
            if not asset_ref:
                continue
            asset_entry = next((a for a in assets if a.get("asset_ref") == asset_ref), None)
            if not asset_entry:
                result[asset_ref] = []
                continue
            names = [
                item.get("svg_name") for item in asset_entry.get("svg_items", [])
                if isinstance(item, dict) and isinstance(item.get("svg_name"), str) and item.get("svg_name").strip()
            ]
            result[asset_ref] = names
        return result

    def save_object_rules(self, asset_ref, svg_name, object_id, rules):
        asset_ref = "" if asset_ref is None else str(asset_ref).strip()
        svg_name = "" if svg_name is None else str(svg_name).strip()
        object_id = "" if object_id is None else str(object_id).strip()

        if not asset_ref:
            raise error.PrewikkaUserError(_("Operation refused"), message=_("Missing asset_ref"))

        if not svg_name:
            raise error.PrewikkaUserError(_("Operation refused"), message=_("Missing svg_name"))

        if not object_id:
            raise error.PrewikkaUserError(_("Operation refused"), message=_("Missing object_id"))

        if not isinstance(rules, list):
            raise error.PrewikkaUserError(_("Operation refused"), message=_("Invalid rules payload"))

        data = self._load_storage()
        assets = data.get("assets", [])

        asset_entry = next((asset for asset in assets if asset.get("asset_ref") == asset_ref), None)
        if not asset_entry:
            return {"status": "no_match", "asset_ref": asset_ref, "svg_name": svg_name, "object_id": object_id}

        svg_entry = next((item for item in asset_entry.get("svg_items", []) if item.get("svg_name") == svg_name), None)
        if not svg_entry:
            return {"status": "no_match", "asset_ref": asset_ref, "svg_name": svg_name, "object_id": object_id}

        if not isinstance(svg_entry.get("object_rules"), dict):
            svg_entry["object_rules"] = {}

        svg_entry["object_rules"][object_id] = rules
        self._save_storage(data)

        return {"status": "success", "asset_ref": asset_ref, "svg_name": svg_name, "object_id": object_id}

    def delete_floor_plan_from_db(self, asset_ref, svg_name):
        asset_ref = "" if asset_ref is None else str(asset_ref).strip()
        svg_name = "" if svg_name is None else str(svg_name).strip()

        if not asset_ref:
            raise error.PrewikkaUserError(_("Operation refused"), message=_("Missing asset_ref"))

        if not svg_name:
            raise error.PrewikkaUserError(_("Operation refused"), message=_("Missing svg_name"))

        data = self._load_storage()
        assets = data.get("assets", [])

        asset_entry = next((asset for asset in assets if asset.get("asset_ref") == asset_ref), None)
        if not asset_entry:
            return {"status": "no_match", "asset_ref": asset_ref, "svg_name": svg_name}

        svg_items = asset_entry.get("svg_items", [])
        kept_items = [item for item in svg_items if str(item.get("svg_name") or "").strip() != svg_name]

        if len(kept_items) == len(svg_items):
            return {"status": "no_match", "asset_ref": asset_ref, "svg_name": svg_name}

        asset_entry["svg_items"] = kept_items

        if not kept_items:
            data["assets"] = [asset for asset in assets if asset is not asset_entry]

        self._save_storage(data)
        return {"status": "success", "asset_ref": asset_ref, "svg_name": svg_name}

    def reset_all_floor_plans(self):
        self._save_storage({"assets": []})
        return {"status": "success"}

    def add_floor_plan_to_assets_without_plans(self, asset_refs, svg_name, svg_content, ref_type="entity_name"):
        svg_name = "" if svg_name is None else str(svg_name).strip()
        ref_type = "entity_name" if ref_type is None else str(ref_type).strip()

        if not svg_name:
            raise error.PrewikkaUserError(_("Operation refused"), message=_("Missing svg_name"))

        normalized_refs = []
        for raw_ref in (asset_refs or []):
            asset_ref = "" if raw_ref is None else str(raw_ref).strip()
            if asset_ref:
                normalized_refs.append(asset_ref)

        deduplicated_refs = list(dict.fromkeys(normalized_refs))
        if not deduplicated_refs:
            return {
                "status": "success",
                "svg_name": svg_name,
                "requested": 0,
                "applied": 0,
                "applied_asset_refs": [],
                "skipped_asset_refs": []
            }

        data = self._load_storage()
        assets = data.get("assets", [])
        asset_map = {}
        for asset in assets:
            if not isinstance(asset, dict):
                continue
            key = str(asset.get("asset_ref") or "").strip()
            if key:
                asset_map[key] = asset

        changed = False
        applied_asset_refs = []
        skipped_asset_refs = []

        for asset_ref in deduplicated_refs:
            existing_asset = asset_map.get(asset_ref)
            if not existing_asset:
                existing_asset = {
                    "asset_ref": asset_ref,
                    "ref_type": ref_type or "entity_name",
                    "svg_items": []
                }
                assets.append(existing_asset)
                asset_map[asset_ref] = existing_asset
                changed = True
            else:
                existing_asset["ref_type"] = ref_type or existing_asset.get("ref_type") or "entity_name"

            svg_items = existing_asset.get("svg_items")
            if not isinstance(svg_items, list):
                svg_items = []
                existing_asset["svg_items"] = svg_items
                changed = True

            has_existing_plan = any(
                isinstance(item, dict) and str(item.get("svg_name") or "").strip()
                for item in svg_items
            )
            if has_existing_plan:
                skipped_asset_refs.append(asset_ref)
                continue

            svg_items.append({
                "svg_name": svg_name,
                "svg_content": svg_content,
                "object_rules": {}
            })
            applied_asset_refs.append(asset_ref)
            changed = True

        if changed:
            self._save_storage(data)

        return {
            "status": "success",
            "svg_name": svg_name,
            "requested": len(deduplicated_refs),
            "applied": len(applied_asset_refs),
            "applied_asset_refs": applied_asset_refs,
            "skipped_asset_refs": skipped_asset_refs
        }

class microMapView(view.View):
    plugin_htdocs = (("micro_map", pkg_resources.resource_filename(__name__, 'htdocs')),)

    def __init__(self):
        view.View.__init__(self)
        self._db = MicroDatabase()

    @view.route("/micro_map", methods=["GET", "POST"], permissions=[N_("IDMEF_VIEW")], menu=(N_("Alerts"), N_("Micro Map")))
    def listing(self):
        return view.ViewResponse(template.PrewikkaTemplate(__name__, "templates/micro_map.mak").render(), menu=mainmenu.HTMLMainMenu())

    def _get_presets_dir(self):
        return pkg_resources.resource_filename(__name__, "htdocs/samples/presets")

    def _sanitize_preset_filename(self, raw_filename):
        if raw_filename is None:
            raise error.PrewikkaUserError(_("Operation refused"), message=_("Missing preset filename"))

        filename = str(raw_filename).strip()
        if not filename:
            raise error.PrewikkaUserError(_("Operation refused"), message=_("Missing preset filename"))

        safe_name = os.path.basename(filename)
        if safe_name != filename:
            raise error.PrewikkaUserError(_("Operation refused"), message=_("Invalid preset filename"))

        if not safe_name.lower().endswith(".svg"):
            raise error.PrewikkaUserError(_("Operation refused"), message=_("Preset must be an SVG file"))

        return safe_name

    def _load_floor_plan_preset_content(self, safe_name):
        presets_dir = self._get_presets_dir()
        file_path = os.path.join(presets_dir, safe_name)

        if not os.path.isfile(file_path):
            raise error.PrewikkaUserError(_("Operation refused"), message=_("Preset file not found"))

        with open(file_path, "r", encoding="utf-8-sig") as f:
            return f.read()

    def _format_preset_display_name(self, filename):
        safe_name = os.path.basename(str(filename or "").strip())
        if not safe_name:
            return "Sample"

        lower_name = safe_name.lower()
        if lower_name.endswith(".drawio.svg"):
            base_name = safe_name[:-len(".drawio.svg")]
        elif lower_name.endswith(".svg"):
            base_name = safe_name[:-len(".svg")]
        else:
            base_name = safe_name

        cleaned = " ".join(base_name.replace("_", " ").split())
        if not cleaned:
            return "Sample"

        return cleaned.title()

    def _get_navigation_context_path(self):
        storage_dir = "/tmp/prewikka_plugin_navigation"
        if not os.path.exists(storage_dir):
            os.makedirs(storage_dir)
        return os.path.join(storage_dir, "context.json")

    def _get_current_user_id(self):
        user_obj = env.request.__dict__.get("user")
        if user_obj and getattr(user_obj, "id", None):
            return str(user_obj.id)
        return "anonymous"

    def _load_navigation_context(self):
        path = self._get_navigation_context_path()
        if not os.path.isfile(path):
            return {"by_user": {}}

        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict) and isinstance(data.get("by_user"), dict):
                    return data
        except Exception:
            pass

        return {"by_user": {}}

    def _save_navigation_context(self, data):
        path = self._get_navigation_context_path()
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)

    def _pop_navigation_context_for_current_user(self):
        data = self._load_navigation_context()
        by_user = data.get("by_user", {})
        user_id = self._get_current_user_id()

        context = by_user.pop(user_id, None)
        data["by_user"] = by_user
        self._save_navigation_context(data)

        if not isinstance(context, dict):
            return {
                "has_reference": False,
                "asset_ref": "",
                "ref_type": "",
                "source": "",
                "svg_name": ""
            }

        asset_ref = str(context.get("asset_ref") or "").strip()
        ref_type = str(context.get("ref_type") or "").strip()
        source = str(context.get("source") or "").strip()
        svg_name = str(context.get("svg_name") or "").strip()

        return {
            "has_reference": bool(asset_ref),
            "asset_ref": asset_ref,
            "ref_type": ref_type,
            "source": source,
            "svg_name": svg_name
        }

    @view.route("/micro_map/get_micro_navigation_context", methods=["GET", "POST"])
    def get_navigation_context(self):
        return self._pop_navigation_context_for_current_user()

    @view.route("/micro_map/list_floor_plan_presets", methods=["GET"])
    def list_floor_plan_presets(self):
        presets_dir = self._get_presets_dir()

        if not os.path.isdir(presets_dir):
            return {"status": "success", "presets": []}

        filenames = [
            name for name in os.listdir(presets_dir)
            if name.lower().endswith(".svg") and os.path.isfile(os.path.join(presets_dir, name))
        ]
        filenames.sort()

        presets = []
        seen_keys = set()
        for name in filenames:
            display_name = self._format_preset_display_name(name)
            unique_key = f"{display_name.lower()}::{name.lower()}"
            if unique_key in seen_keys:
                continue
            seen_keys.add(unique_key)
            presets.append({
                "filename": name,
                "display_name": display_name
            })

        return {"status": "success", "presets": presets}

    @view.route("/micro_map/reset_micro_state", methods=["POST"])
    def reset_micro_state(self):
        return self._db.reset_all_floor_plans()

    @view.route("/micro_map/apply_floor_plan_preset_to_missing", methods=["POST"])
    def apply_floor_plan_preset_to_missing(self):
        safe_name = self._sanitize_preset_filename(env.request.parameters.get("filename"))

        raw_asset_refs = env.request.parameters.get("asset_refs")
        asset_refs = []
        if raw_asset_refs:
            try:
                parsed = json.loads(raw_asset_refs)
                if isinstance(parsed, list):
                    asset_refs = parsed
            except Exception:
                asset_refs = []

        svg_content = self._load_floor_plan_preset_content(safe_name)

        return self._db.add_floor_plan_to_assets_without_plans(
            asset_refs=asset_refs,
            svg_name=safe_name,
            svg_content=svg_content,
            ref_type="entity_name"
        )

    @view.route("/micro_map/get_micro_alerts_bulk_for_asset", methods=["POST"])
    def get_alerts_bulk_for_asset(self):
        def _to_text(v):
            if v is None:
                return ""
            if isinstance(v, (list, tuple)):
                if not v:
                    return ""
                return _to_text(v[0])
            return str(v).strip()

        def _get(row, index):
            return row[index] if len(row) > index else None

        def _normalize_dataprovider_value(value):
            if value is None:
                return None

            if isinstance(value, dict):
                return value

            if isinstance(value, (list, tuple)):
                normalized = [_normalize_dataprovider_value(item) for item in value]
                normalized = [item for item in normalized if item is not None]

                if len(normalized) == 0:
                    return None
                if len(normalized) == 1:
                    return normalized[0]
                return normalized

            text = str(value).strip()

            if text in ["", "None", "[None]"]:
                return None

            if (text.startswith("[") and text.endswith("]")) or (text.startswith("{") and text.endswith("}")):
                try:
                    parsed = ast.literal_eval(text)
                    return _normalize_dataprovider_value(parsed)
                except Exception:
                    pass

            return text

        payload = {}
        
        raw_body = getattr(env.request, "body", None)

        if raw_body:
            try:
                if isinstance(raw_body, bytes):
                    raw_body = raw_body.decode("utf-8", errors="ignore")
                parsed = json.loads(raw_body)
                if isinstance(parsed, dict):
                    payload = parsed
            except Exception:
                payload = {}

        params = env.request.parameters or {}

        asset_ref = _to_text(payload.get("asset_ref") or params.get("asset_ref"))
        ref_type = _to_text(payload.get("ref_type") or params.get("ref_type") or "entity_name")
        start_date = _to_text(payload.get("start_date") or params.get("start_date"))
        end_date = _to_text(payload.get("end_date") or params.get("end_date"))

        if not asset_ref:
            return {"status": "no_match", "data": [], "alerts_count": 0}

        query_field_specs = [
            ("entity_name", "idmefv2.entityname"),
            ("priority", "idmefv2.priority"),
            ("type", "idmefv2.type"),
            ("category", "idmefv2.category"),
            ("description", "idmefv2.description"),
            ("create_time", "idmefv2.create_time"),
            ("start_time", "idmefv2.start_time"),

            ("target_id", "idmefv2.target.id"),
            ("target_ip", "idmefv2.target.ip"),
            ("target_hostname", "idmefv2.target.hostname"),
            ("target_category", "idmefv2.target.category"),
            ("target_location", "idmefv2.target.location"),
            ("target_geolocation", "idmefv2.target.geolocation"),

            ("analyzer_id", "idmefv2.analyzer.id"),
            ("analyzer_ip", "idmefv2.analyzer.ip"),
            ("analyzer_name", "idmefv2.analyzer.name"),
            ("analyzer_hostname", "idmefv2.analyzer.hostname"),
            ("analyzer_model", "idmefv2.analyzer.model"),
            ("analyzer_category", "idmefv2.analyzer.category"),
            ("analyzer_data", "idmefv2.analyzer.data"),
            ("analyzer_method", "idmefv2.analyzer.method"),
            ("analyzer_location", "idmefv2.analyzer.location"),
            ("analyzer_geolocation", "idmefv2.analyzer.geolocation"),

            ("sensor_id", "idmefv2.sensor.id"),
            ("sensor_ip", "idmefv2.sensor.ip"),
            ("sensor_name", "idmefv2.sensor.name"),
            ("sensor_hostname", "idmefv2.sensor.hostname"),
            ("sensor_model", "idmefv2.sensor.model"),
            ("sensor_location", "idmefv2.sensor.location"),
            ("sensor_geolocation", "idmefv2.sensor.geolocation"),
            ("sensor_capturezone", "idmefv2.sensor.capture_zone"),

            ("source_id", "idmefv2.source.id"),
            ("source_ip", "idmefv2.source.ip"),
            ("source_hostname", "idmefv2.source.hostname"),
            ("source_category", "idmefv2.source.category"),
            ("source_location", "idmefv2.source.location"),
            ("source_geolocation", "idmefv2.source.geolocation"),
            ("source_note", "idmefv2.source.note"),
        ]

        query_fields = [field_path for _, field_path in query_field_specs]

        criteria = Criterion()
        if start_date:
            criteria += Criterion('idmefv2.create_time', '>=', start_date)
        if end_date:
            criteria += Criterion('idmefv2.create_time', '<=', end_date)

        if ref_type in ["ip", "target_ip", "idmefv2.target.ip"]:
            criteria += Criterion('idmefv2.target.ip', '=', asset_ref)
        else:
            criteria += Criterion('idmefv2.entityname', '=', asset_ref)

        ret = env.dataprovider.query(query_fields, criteria)

        data = []
        for row in ret:
            item = {}
            for index, (output_name, _field_path) in enumerate(query_field_specs):
                item[output_name] = _normalize_dataprovider_value(_get(row, index))

            if not item.get("analyzer"):
                item["analyzer"] = item.get("analyzer_hostname") or item.get("analyzer_name") or item.get("analyzer_ip")

            data.append(item)

        return {
            "status": "success",
            "data": data,
            "alerts_count": len(data),
            "queried_fields": query_fields
        }

    @view.route("/micro_map/get_micro_time", methods=["GET"])
    def get_time(self):
        return {
            "start_date": env.request.menu.start, 
            "end_date": env.request.menu.end
        }

    @view.route("/micro_map/add_micro_floor_plan", methods=["POST"])
    def add_floor_plan(self):
        asset_ref = env.request.parameters.get("asset_ref")
        ref_type = env.request.parameters.get("ref_type")
        svg_name = env.request.parameters.get("svg_name")
        svg_content = env.request.parameters.get("svg_content")
        object_rules_raw = env.request.parameters.get("object_rules")
        object_rules = None

        if object_rules_raw:
            try:
                parsed_rules = json.loads(object_rules_raw)
                if isinstance(parsed_rules, dict):
                    object_rules = parsed_rules
            except Exception:
                object_rules = None

        result = self._db.insert_floor_plan_into_db(asset_ref, svg_name, svg_content, ref_type, object_rules=object_rules)
        return result

    @view.route("/micro_map/load_micro_floor_plan", methods=["POST"])
    def load_floor_plan(self):
        asset_ref = env.request.parameters.get("asset_ref")
        svg_name = env.request.parameters.get("svg_name")

        return self._db.get_floor_plan_from_db(asset_ref, svg_name)
    
    @view.route("/micro_map/get_micro_plans_list", methods=["POST"])
    def get_plans_list(self):
        asset_ref = env.request.parameters.get("asset_ref")
        result = self._db.get_plans_list(asset_ref)

        return result

    @view.route("/micro_map/get_micro_plans_list_bulk", methods=["POST"])
    def get_plans_list_bulk(self):
        asset_refs = []
        raw_body = getattr(env.request, "body", None)
        if raw_body:
            try:
                if isinstance(raw_body, bytes):
                    raw_body = raw_body.decode("utf-8", errors="ignore")
                parsed = json.loads(raw_body)
                if isinstance(parsed, list):
                    asset_refs = parsed
                elif isinstance(parsed, dict):
                    asset_refs = parsed.get("asset_refs", [])
            except Exception:
                pass
        if not asset_refs:
            raw = (env.request.parameters or {}).get("asset_refs")
            if raw:
                try:
                    asset_refs = json.loads(raw)
                except Exception:
                    pass
        return self._db.get_plans_list_bulk(asset_refs)

    @view.route("/micro_map/save_micro_object_rules", methods=["POST"])
    def save_micro_object_rules(self):
        asset_ref = env.request.parameters.get("asset_ref")
        svg_name = env.request.parameters.get("svg_name")
        object_id = env.request.parameters.get("object_id")
        rules_raw = env.request.parameters.get("rules")

        try:
            rules = json.loads(rules_raw or "[]")
        except Exception:
            rules = []

        return self._db.save_object_rules(asset_ref, svg_name, object_id, rules)

    @view.route("/micro_map/delete_micro_floor_plan", methods=["POST"])
    def delete_floor_plan(self):
        asset_ref = env.request.parameters.get("asset_ref")
        svg_name = env.request.parameters.get("svg_name")
        return self._db.delete_floor_plan_from_db(asset_ref, svg_name)

    @view.route("/micro_map/navigate_to_macro_map", methods=["POST"])
    def navigate_to_macro_map(self):
        return response.PrewikkaRedirectResponse("/macro_map")

    @view.route("/micro_map/navigate_to_table_by_target_ip", methods=["POST"])
    def navigate_to_table_by_target_ip(self):
        target_ip = (env.request.parameters.get("target_ip") or "").strip()
        if not target_ip:
            return {"status": "no_match", "data": []}

        criteria = Criterion()
        criteria += Criterion('idmefv2.target.ip', '=', target_ip)

        link = None
        linkview = env.viewmanager.get(datatype="idmefv2", keywords=["listing"])
        if linkview:
            link = linkview[-1].make_url(criteria=criteria, **env.request.menu.get_parameters())
            return response.PrewikkaRedirectResponse(link)

        return {"status": "no_match", "data": []}

    @view.route("/micro_map/download_svg_guide", methods=["POST"])
    def download_svg_guide(self):
        filename = "drawio_svg_template_guide.md"
        samples_dir = pkg_resources.resource_filename(__name__, "htdocs/samples")
        file_path = os.path.join(samples_dir, filename)

        if not os.path.isfile(file_path):
            raise error.PrewikkaUserError(_("Operation refused"), message=_("File not found"))

        with open(file_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")

        return {
            "status": "success",
            "filename": filename,
            "content_type": "application/octet-stream",
            "data_base64": b64
        }

        return {"status": "no_match", "data": []}
