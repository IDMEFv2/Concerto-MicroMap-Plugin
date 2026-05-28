# from prewikka import version
# from prewikka.database import SQLScript


# class SQLUpdate(SQLScript):
#     type = "install"
#     branch = version.__branch__
#     version = "0"

#     def run(self):
#         self.query("""
# DROP TABLE IF EXISTS Prewikka_microvisualization_floor_plans;

# CREATE TABLE Prewikka_microvisualization_floor_plans (
#         id BIGINT UNSIGNED NOT NULL PRIMARY KEY AUTO_INCREMENT,
#         user_id VARCHAR(255) NOT NULL,
#         asset_name VARCHAR(255) NOT NULL,
#         svg_content TEXT NOT NULL
# ) ENGINE=InnoDB;
# """)