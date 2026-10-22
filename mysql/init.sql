USE commute_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS commute_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  route_name VARCHAR(100) NOT NULL,
  mode ENUM('car','bus','bike','walk') NOT NULL,
  duration_minutes INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_duration CHECK (duration_minutes BETWEEN 1 AND 600)
);