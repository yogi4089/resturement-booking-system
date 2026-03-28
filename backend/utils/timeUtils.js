function formatTime(date) {
  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit"
  });
}

function parseBookingDateTime(bookingDate, bookingTime) {
  if (!bookingDate || !bookingTime) {
    return new Date();
  }

  const dateTime = new Date(`${bookingDate}T${bookingTime}:00`);
  if (Number.isNaN(dateTime.getTime())) {
    return new Date();
  }

  return dateTime;
}

module.exports = {
  formatTime,
  parseBookingDateTime
};
