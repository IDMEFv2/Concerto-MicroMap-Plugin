from setuptools import setup, find_packages

setup(name="prewikka-apps-micro_map",
      version="1.1.0",
      author="Marco Compagno",
      author_email="marco_compagno@elmisoftware.com",
      url="https://www.prelude-siem.org",
      packages=find_packages(),
      install_requires=["prewikka >= 5.0.0"],
      entry_points={
          "prewikka.views": [
              "Micro_Map = micro_map:Micro_Map",
          ],
          'prewikka.updatedb': [
            'micro_map = micro_map.sql'
        ]
      },
      package_data={
          "micro_map": [
              "templates/*.mak",
              "sql/*.py",
              "htdocs/css/*.css",
              "htdocs/js/*.js",
              "htdocs/samples/presets/*.svg"
          ],
      },
      
)