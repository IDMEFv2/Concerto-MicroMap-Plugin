from prewikka import pluginmanager, version

from .micro_map import microMapView

class Micro_Map(pluginmanager.PluginPreload): 
    plugin_name = "Micro_Map"
    plugin_author = version.__author__
    plugin_license = version.__license__
    plugin_version = version.__version__
    plugin_copyright = version.__copyright__
    plugin_description = N_("Micro Map page")
    # plugin_database_branch = version.__branch__
    # plugin_database_version = "0"
    plugin_classes = [microMapView]
    