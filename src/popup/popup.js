document.addEventListener('DOMContentLoaded', function () {
  // Defensive checks: get all required DOM elements
  const statusElement = document.getElementById('status');
  const timestampElement = document.getElementById('timestamp');
  const refreshButton = document.getElementById('refresh-btn');

  if (!statusElement || !timestampElement || !refreshButton) {
    console.error('Popup: Required DOM elements not found');
    return;
  }

  // Function to update timestamp display
  function updateTimestamp() {
    const now = new Date();
    const formattedTime = now.toLocaleString();
    timestampElement.textContent = formattedTime;
    timestampElement.setAttribute('datetime', now.toISOString());
  }

  // Initial render: set status and display current timestamp
  statusElement.textContent = 'Popup loaded';
  updateTimestamp();

  // Wire Refresh button using addEventListener
  refreshButton.addEventListener('click', function () {
    updateTimestamp();
    statusElement.textContent = 'Refreshed';
  });
});
