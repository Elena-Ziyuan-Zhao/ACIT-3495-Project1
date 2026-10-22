// Creates analytics_db, a least-privilege app user, and the route_stats collection.
// Document shape follows the team plan (analytics_db.route_stats).
const dbName = process.env.MONGO_INITDB_DATABASE || 'analytics_db';
const appDb = db.getSiblingDB(dbName);

appDb.createUser({
  user: process.env.MONGO_APP_USER,
  pwd: process.env.MONGO_APP_PASSWORD,
  roles: [{ role: 'readWrite', db: dbName }],
});

appDb.createCollection('route_stats', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['route_name', 'min_duration', 'max_duration', 'avg_duration', 'total_trips', 'last_updated'],
      properties: {
        route_name:   { bsonType: 'string' },
        min_duration: { bsonType: ['int', 'long', 'double'] },
        max_duration: { bsonType: ['int', 'long', 'double'] },
        avg_duration: { bsonType: ['int', 'long', 'double'] },
        total_trips:  { bsonType: ['int', 'long'] },
        last_updated: { bsonType: 'date' },
      },
    },
  },
});

// One document per route: fast upserts, no duplicates
appDb.getCollection('route_stats').createIndex({ route_name: 1 }, { unique: true });

print(`Initialized "${dbName}" with app user "${process.env.MONGO_APP_USER}"`);
