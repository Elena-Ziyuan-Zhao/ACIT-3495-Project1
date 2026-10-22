import os
import time
import mysql.connector
from pymongo import MongoClient

# Fetch database credentials from environment variables
MYSQL_USER = os.getenv('MYSQL_USER')
MYSQL_PASSWORD = os.getenv('MYSQL_PASSWORD')
MYSQL_DATABASE = os.getenv('MYSQL_DATABASE')
MYSQL_HOST = os.getenv('MYSQL_HOST', 'mysql-db')
MONGO_URI = os.getenv('MONGO_URI')

def calculate_and_store_analytics():
    try:
        # 1. Connect to MySQL Database
        mysql_conn = mysql.connector.connect(
            host=MYSQL_HOST,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            database=MYSQL_DATABASE
        )
        cursor = mysql_conn.cursor(dictionary=True)

        # 2. Query MySQL to aggregate commute statistics
        query = """
            SELECT 
                CONCAT(r.origin, ' to ', r.destination) as route_name, 
                MIN(c.duration_minutes) as min_duration, 
                MAX(c.duration_minutes) as max_duration, 
                AVG(c.duration_minutes) as avg_duration, 
                COUNT(c.id) as total_trips
            FROM commute_logs c
            JOIN routes r ON c.route_id = r.id
            GROUP BY c.route_id, route_name
        """
        cursor.execute(query)
        results = cursor.fetchall()

        # 3. Connect to MongoDB
        mongo_client = MongoClient(MONGO_URI)
        mongo_db = mongo_client['analytics_db']
        collection = mongo_db['route_stats']

        # 4. Upsert results into MongoDB
        for row in results:
            route_name = row['route_name']
            
            # Format the document based on our agreed schema
            stats_document = {
                "route_name": route_name,
                "min_duration": row['min_duration'],
                "max_duration": row['max_duration'],
                "avg_duration": float(row['avg_duration']), 
                "total_trips": row['total_trips'],
                "last_updated": time.strftime('%Y-%m-%dT%H:%M:%SZ')
            }
            
            # Upsert ensures we update existing routes or create new ones
            collection.update_one(
                {"route_name": route_name},
                {"$set": stats_document},
                upsert=True
            )
            print(f"Updated stats for route: {route_name}")

    except mysql.connector.Error as err:
        print(f"MySQL Error: {err}")
    except Exception as e:
        print(f"Error processing analytics: {e}")
    finally:
        # Ensure connections are closed properly
        if 'cursor' in locals() and cursor is not None:
            cursor.close()
        if 'mysql_conn' in locals() and mysql_conn.is_connected():
            mysql_conn.close()

if __name__ == "__main__":
    print("Analytics service started. Waiting for databases to initialize...")
    time.sleep(10) # Brief pause on startup to allow MySQL/Mongo to become fully ready
    
    print("Beginning polling loop...")
    while True:
        calculate_and_store_analytics()
        time.sleep(15) # Poll every 15 seconds