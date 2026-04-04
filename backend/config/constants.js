const AVG_DINING_TIME = 45;

const PRIORITY_MAP = {
  STANDARD: 1,
  ELDERLY: 2,
  VIP: 3
};

const NIGHT_START_HOUR = 19;
const NIGHT_END_HOUR = 23;

const GRACE_WINDOW_MINUTES = 15;
const RESET_BUFFER_MINUTES = 2;

const DURATION_PROFILES = {
  LUNCH: 30,
  DINNER: 45,
  WEEKEND_DINNER: 60,
  DEFAULT: AVG_DINING_TIME
};

const WAIT_PROFILES = {
  LOW: { label: "LOW", multiplier: 1.0 },
  MEDIUM: { label: "MEDIUM", multiplier: 1.35 },
  HIGH: { label: "HIGH", multiplier: 1.65 },
  HIGHEST: { label: "HIGHEST", multiplier: 1.95 }
};

module.exports = {
  AVG_DINING_TIME,
  PRIORITY_MAP,
  NIGHT_END_HOUR,
  NIGHT_START_HOUR,
  WAIT_PROFILES,
  GRACE_WINDOW_MINUTES,
  RESET_BUFFER_MINUTES,
  DURATION_PROFILES
};
