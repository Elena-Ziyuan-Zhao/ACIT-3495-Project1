USE commute_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS routes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  origin VARCHAR(50) NOT NULL,
  destination VARCHAR(50) NOT NULL,
  UNIQUE KEY uq_route (origin, destination)
);

INSERT INTO routes (origin, destination) VALUES
  ('Burnaby', 'BCIT'),
  ('Vancouver', 'BCIT'),
  ('Richmond', 'BCIT'),
  ('Surrey', 'BCIT'),
  ('Coquitlam', 'Downtown');

CREATE TABLE IF NOT EXISTS commute_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL,
  route_id INT NOT NULL,
  duration_minutes INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_duration CHECK (duration_minutes BETWEEN 1 AND 600),
  CONSTRAINT fk_user  FOREIGN KEY (username) REFERENCES users(username),
  CONSTRAINT fk_route FOREIGN KEY (route_id) REFERENCES routes(id)
);